// @ts-check
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const FFMPEG_VERSION = "8.1.2";
const PROFILE = "aac-lc-192k-48khz-stereo-fmp4-6s";
const TRACK_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MEDIA_FILE = /^(?:index\.m3u8|init\.mp4|seg-\d{5}\.m4s)$/;
const CODEC = "mp4a.40.2";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileDigest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function execute(program, args, timeout = 30000) {
  const result = spawnSync(program, args, { encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${program} failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return result.stdout;
}

function probe(path) {
  return JSON.parse(execute("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,profile,sample_rate,channels:format=duration,format_name", "-of", "json", path]));
}

async function inspectFiles(directory, playlist) {
  const lines = playlist.trim().split(/\r?\n/);
  if (lines[0] !== "#EXTM3U" || lines.at(-1) !== "#EXT-X-ENDLIST" || !lines.includes("#EXT-X-PLAYLIST-TYPE:VOD")) {
    throw new Error("The HLS playlist must be completed VOD.");
  }
  if (!lines.includes('#EXT-X-MAP:URI="init.mp4"')) throw new Error("The HLS initialization reference is invalid.");
  const target = Number(lines.find(line => line.startsWith("#EXT-X-TARGETDURATION:"))?.split(":")[1]);
  if (!Number.isFinite(target) || target < 1) throw new Error("The HLS target duration is invalid.");
  const segments = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith("#EXTINF:")) {
      const duration = Number(line.slice(8).replace(/,$/, ""));
      const name = lines[index + 1];
      if (!Number.isFinite(duration) || duration <= 0 || Math.round(duration) > target || !/^seg-\d{5}\.m4s$/.test(name)) {
        throw new Error("The HLS segment reference or duration is invalid.");
      }
      segments.push({ name, duration });
    } else if (!line.startsWith("#") && !/^seg-\d{5}\.m4s$/.test(line)) {
      throw new Error("The HLS playlist contains an invalid reference.");
    }
  }
  if (!segments.length || new Set(segments.map(segment => segment.name)).size !== segments.length) {
    throw new Error("The HLS segment list is empty or duplicated.");
  }
  const filenames = ["index.m3u8", "init.mp4", ...segments.map(segment => segment.name)].sort();
  if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(filenames)) throw new Error("The package contains unexpected files.");
  const files = [];
  for (const name of filenames) {
    if (!MEDIA_FILE.test(name) || await realpath(join(directory, name)) !== join(await realpath(directory), name)) {
      throw new Error("The package contains an invalid file or symbolic link.");
    }
    const bytes = await readFile(join(directory, name));
    if (!bytes.length) throw new Error(`The media file ${name} is empty.`);
    files.push({ name, bytes: bytes.length, sha256: digest(bytes) });
  }
  const sizes = new Map(files.map(file => [file.name, file.bytes]));
  return {
    files,
    durationMs: Math.round(segments.reduce((total, segment) => total + segment.duration, 0) * 1000),
    peakBitrate: Math.ceil(Math.max(...segments.map(segment => sizes.get(segment.name) * 8 / segment.duration)))
  };
}

async function prepare() {
  const { values } = parseArgs({ options: {
    source: { type: "string" }, "media-root": { type: "string" }, "track-id": { type: "string" }
  }, strict: true });
  if (!values["track-id"] || !TRACK_ID.test(values["track-id"])) throw new Error("The track ID is invalid.");
  if (!values.source || !values["media-root"]) throw new Error("Supply --source and --media-root.");
  const version = execute("ffmpeg", ["-version"]).split("\n")[0];
  if (!version.startsWith(`ffmpeg version ${FFMPEG_VERSION} `)) throw new Error(`Use FFmpeg ${FFMPEG_VERSION}.`);
  const probeVersion = execute("ffprobe", ["-version"]).split("\n")[0];
  if (!probeVersion.startsWith(`ffprobe version ${FFMPEG_VERSION} `)) throw new Error(`Use FFprobe ${FFMPEG_VERSION}.`);
  const source = resolve(values.source);
  const sourceFacts = probe(source);
  const sourceDuration = Number(sourceFacts.format?.duration);
  if (!sourceFacts.streams?.length || !Number.isFinite(sourceDuration) || sourceDuration < 1 || sourceDuration > 7200) {
    throw new Error("The source must contain audio from one second through two hours.");
  }
  const root = resolve(values["media-root"]);
  const stagingRoot = join(root, "staging");
  const packagesRoot = join(root, "packages");
  await mkdir(stagingRoot, { recursive: true });
  await mkdir(packagesRoot, { recursive: true });
  const stage = await mkdtemp(join(stagingRoot, "package-"));
  try {
    execute("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", source,
      "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1",
      "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "192k", "-ar", "48000", "-ac", "2",
      "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_list_size", "0",
      "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4",
      "-hls_segment_filename", join(stage, "seg-%05d.m4s"), join(stage, "index.m3u8")], 600000);
    const facts = await inspectFiles(stage, await readFile(join(stage, "index.m3u8"), "utf8"));
    const audio = probe(join(stage, "index.m3u8")).streams[0];
    if (audio.codec_name !== "aac" || audio.profile !== "LC" || audio.sample_rate !== "48000" || audio.channels !== 2) {
      throw new Error("The encoded audio does not match the selected profile.");
    }
    if (Math.abs(facts.durationMs - sourceDuration * 1000) > 250) throw new Error("The encoded duration differs from the source.");
    execute("ffmpeg", ["-nostdin", "-v", "error", "-xerror", "-i", join(stage, "index.m3u8"), "-f", "null", "-"], 600000);
    const identity = facts.files.map(file => `${file.name}\t${file.sha256}\n`).join("");
    const assetId = digest(identity);
    const metadata = { ...facts, codec: CODEC, sampleRateHz: 48000, channels: 2,
      preparation: { profile: PROFILE, ffmpegVersion: FFMPEG_VERSION, ffprobeVersion: FFMPEG_VERSION, sourceFormat: sourceFacts.format.format_name, sourceCodec: sourceFacts.streams[0].codec_name, sourceSHA256: await fileDigest(source) } };
    await writeFile(join(stage, "package.json"), JSON.stringify(metadata, null, 2) + "\n");
    const destination = join(packagesRoot, assetId);
    try {
      await rename(stage, destination);
    } catch (error) {
      if (error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error;
      for (const file of facts.files) {
        if (digest(await readFile(join(destination, file.name))) !== file.sha256) throw new Error("An existing immutable package is corrupt.");
      }
      const existing = JSON.parse(await readFile(join(destination, "package.json"), "utf8"));
      if (JSON.stringify(existing) !== JSON.stringify(metadata)) throw new Error("An existing package has different preparation metadata.");
    }
    process.stdout.write(JSON.stringify({ trackId: values["track-id"], assetId, durationMs: facts.durationMs,
      playlist: "index.m3u8", codec: CODEC, sampleRateHz: 48000, channels: 2 }) + "\n");
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

try {
  await prepare();
} catch (error) {
  process.stderr.write(`Music preparation failed: ${error.message}\n`);
  process.exitCode = 1;
}
