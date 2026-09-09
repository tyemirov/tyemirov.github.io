// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const command = resolve("scripts/music/prepare.mjs");

function run(program, args) {
  return spawnSync(program, args, { encoding: "utf8", timeout: 30000 });
}

test("the preparation CLI creates an immutable, decodable private HLS package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-package-test-"));
  try {
    const source = join(directory, "source.wav");
    const mediaRoot = join(directory, "private-media");
    const tone = run("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "13", source]);
    assert.equal(tone.status, 0, tone.stderr);
    const args = [command, "--source", source, "--media-root", mediaRoot, "--track-id", "test-tone"];
    const preparation = run(process.execPath, args);
    assert.equal(preparation.status, 0, preparation.stderr);
    const receipt = JSON.parse(preparation.stdout);
    assert.match(receipt.assetId, /^[a-f0-9]{64}$/);
    assert.equal(receipt.trackId, "test-tone");
    assert.ok(Math.abs(receipt.durationMs - 13000) < 250);
    const packageRoot = join(mediaRoot, "packages", receipt.assetId);
    const playlist = await readFile(join(packageRoot, "index.m3u8"), "utf8");
    assert.match(playlist, /#EXT-X-PLAYLIST-TYPE:VOD/);
    assert.match(playlist, /#EXT-X-MAP:URI="init.mp4"/);
    assert.match(playlist, /#EXT-X-ENDLIST/);
    assert.equal(run("ffmpeg", ["-nostdin", "-v", "error", "-i", join(packageRoot, "index.m3u8"), "-f", "null", "-"]).status, 0);
    const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    assert.equal(metadata.preparation.sourceFormat, "wav");
    assert.equal(metadata.preparation.sourceCodec, "pcm_s16le");
    assert.equal(metadata.preparation.ffprobeVersion, "8.1.2");
    assert.equal(metadata.codec, "mp4a.40.2");
    assert.equal(metadata.sampleRateHz, 48000);
    assert.equal(metadata.channels, 2);
    assert.equal(metadata.files.length, 5);
    assert.ok(metadata.peakBitrate > 0);
    assert.ok(!JSON.stringify(metadata).includes(source));
    const second = run(process.execPath, args);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).assetId, receipt.assetId);
    assert.equal((await readdir(join(mediaRoot, "packages"))).length, 1);
    assert.deepEqual(await readdir(join(mediaRoot, "staging")), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the preparation CLI rejects invalid track IDs before creating output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-package-invalid-"));
  try {
    const result = run(process.execPath, [command, "--source", "missing.wav", "--media-root", join(directory, "media"), "--track-id", "../bad"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /track ID/);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid and short audio leave no published package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-source-invalid-"));
  try {
    const source = join(directory, "short.wav"), mediaRoot = join(directory, "media");
    assert.equal(run("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.1", source]).status, 0);
    for (const path of [source, join(directory, "missing.wav")]) {
      const result = run(process.execPath, [command, "--source", path, "--media-root", mediaRoot, "--track-id", "test-tone"]);
      assert.notEqual(result.status, 0);
    }
    assert.deepEqual(await readdir(directory), ["short.wav"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
