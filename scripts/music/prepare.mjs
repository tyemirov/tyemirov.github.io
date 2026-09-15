// @ts-check
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const FFMPEG_VERSION = "8.1.2";
const TRACK_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const CODEC = "mp4a.40.2";

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
  await mkdir(root, { recursive: true });
  const stage = await mkdtemp(join(root, ".prepare-"));
  const file = `${values["track-id"]}.m4a`;
  const encoded = join(stage, file);
  try {
    execute("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", source,
      "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1",
      "-c:a", "aac", "-profile:a", "aac_low", "-b:a", "192k", "-ar", "48000", "-ac", "2",
      "-movflags", "+faststart", "-f", "mp4", encoded], 600000);
    const encodedFacts = probe(encoded);
    const audio = encodedFacts.streams[0];
    const durationMs = Math.round(Number(encodedFacts.format.duration) * 1000);
    if (audio.codec_name !== "aac" || audio.profile !== "LC" || audio.sample_rate !== "48000" || audio.channels !== 2) {
      throw new Error("The encoded audio does not match the selected profile.");
    }
    if (Math.abs(durationMs - sourceDuration * 1000) > 250) throw new Error("The encoded duration differs from the source.");
    execute("ffmpeg", ["-nostdin", "-v", "error", "-xerror", "-i", encoded, "-f", "null", "-"], 600000);
    const assetId = await fileDigest(encoded);
    const bytes = (await stat(encoded)).size;
    await rename(encoded, join(root, file));
    process.stdout.write(JSON.stringify({ trackId: values["track-id"], assetId, file, bytes, durationMs,
      codec: CODEC, sampleRateHz: 48000, channels: 2 }) + "\n");
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
