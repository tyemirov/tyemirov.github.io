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

test("the preparation CLI creates one decodable AAC file from the original source", async () => {
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
    assert.equal(receipt.file, "test-tone.m4a");
    const audioPath = join(mediaRoot, receipt.file);
    const bytes = await readFile(audioPath);
    assert.equal(receipt.bytes, bytes.length);
    assert.ok(bytes.indexOf(Buffer.from("moov")) < bytes.indexOf(Buffer.from("mdat")), "metadata precedes audio for progressive playback");
    assert.equal(run("ffmpeg", ["-nostdin", "-v", "error", "-xerror", "-i", audioPath, "-f", "null", "-"]).status, 0);
    const facts = JSON.parse(run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", audioPath]).stdout).streams;
    assert.equal(facts.length, 1);
    assert.equal(facts[0].codec_name, "aac");
    assert.equal(facts[0].profile, "LC");
    assert.equal(facts[0].sample_rate, "48000");
    assert.equal(facts[0].channels, 2);
    assert.deepEqual(await readdir(mediaRoot), ["test-tone.m4a"]);
    const second = run(process.execPath, args);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).assetId, receipt.assetId);
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

test("invalid and short audio leave no published audio", async () => {
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
