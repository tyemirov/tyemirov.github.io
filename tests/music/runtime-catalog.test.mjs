// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { playbackAllowlist, validateMusic } from "../../music/catalog.js";

test("runtime catalog generation supplies the declared external tracks and rejects unprovisioned HLS", async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-runtime-catalog-"));
  try {
    const site = JSON.parse(await readFile("data/site.json", "utf8"));
    const input = join(directory, "site.json"), output = join(directory, "runtime");
    await writeFile(input, JSON.stringify(site));
    const generate = () => spawnSync(process.execPath, ["scripts/music/runtime-catalog.mjs", input, output], { encoding: "utf8" });
    const result = generate();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(output, "catalog.json"), "utf8")), { tracks: {} });
    assert.deepEqual(JSON.parse(await readFile(join(output, "allowlist.json"), "utf8")), playbackAllowlist(validateMusic(site.music)));
    site.music.items.find(album => album.status === "live").tracks[0].playback = { kind: "hls", durationMs: 13000 };
    await writeFile(input, JSON.stringify(site));
    const rejected = generate();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /HLS.*prepared media/);
    // A rejected generation must not replace the valid runtime metadata.
    const unchanged = JSON.parse(await readFile(join(output, "allowlist.json"), "utf8"));
    assert.ok(unchanged.tracks.every(track => track.playback.kind === "external"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
