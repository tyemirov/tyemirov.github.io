// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const run = (program, args, cwd) => spawnSync(program, args, { cwd, encoding: "utf8", timeout: 60000 });

test("media activation validates a candidate and preserves the selected index on failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-activation-"));
  try {
    const binary = join(directory, "music-media");
    const build = run("go", ["build", "-o", binary, "./cmd/music-media"], resolve("services/music-stream"));
    assert.equal(build.status, 0, build.stderr);
    const source = join(directory, "tone.wav"), mediaRoot = join(directory, "media");
    assert.equal(run("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "13", source]).status, 0);
    const preparation = run(process.execPath, ["scripts/music/prepare.mjs", "--source", source, "--media-root", mediaRoot, "--track-id", "test-tone"]);
    assert.equal(preparation.status, 0, preparation.stderr);
    const receipt = JSON.parse(preparation.stdout);
    const receiptPath = join(directory, "receipt.json"), allowlist = join(directory, "allowlist.json"), index = join(directory, "selected.json");
    await writeFile(receiptPath, preparation.stdout);
    await writeFile(allowlist, JSON.stringify({ tracks: [{ id: receipt.trackId, playback: { kind: "hls", durationMs: receipt.durationMs } }] }));
    const common = ["--media-root", mediaRoot, "--allowlist", allowlist];
    const candidate = run(binary, ["candidate", ...common, "--receipt", receiptPath]);
    assert.equal(candidate.status, 0, candidate.stderr);
    const candidatePath = JSON.parse(candidate.stdout).indexPath;
    assert.match(candidatePath, /indexes\/[a-f0-9]{64}\.json$/);
    assert.equal(run(binary, ["validate", ...common, "--index", candidatePath]).status, 0);
    const activated = run(binary, ["activate", ...common, "--candidate", candidatePath, "--index", index]);
    assert.equal(activated.status, 0, activated.stderr);
    const selected = await readFile(index, "utf8");
    assert.deepEqual(JSON.parse(selected).tracks[receipt.trackId], Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "trackId")));
    const segment = join(mediaRoot, "packages", receipt.assetId, "seg-00000.m4s");
    const original = `${segment}.original`;
    await rename(segment, original);
    await symlink(original, segment);
    const rejected = run(binary, ["activate", ...common, "--candidate", candidatePath, "--index", index]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /symbolic links/);
    assert.equal(await readFile(index, "utf8"), selected);
    await rm(segment); await rename(original, segment);
    await writeFile(allowlist, JSON.stringify({ tracks: [{ id: receipt.trackId, playback: { kind: "external" } }] }));
    await writeFile(segment, "truncated audio");
    assert.notEqual(run(binary, ["activate", ...common, "--candidate", candidatePath, "--index", index]).status, 0);
    assert.equal(await readFile(index, "utf8"), selected);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
