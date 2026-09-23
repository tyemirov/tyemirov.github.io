// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { playbackAllowlist, validateMusic } from "../../music/catalog.js";

test("runtime generation connects published tracks to bundled audio and rejects missing recordings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-runtime-catalog-"));
  try {
    const site = JSON.parse(await readFile("data/site.json", "utf8"));
    const tracks = site.music.items.flatMap(album => album.tracks);
    assert.equal(tracks.length, 60);
    assert.ok(tracks.every(track => track.playback.kind === "file"), "Every published recording must be playable.");
    const index = JSON.parse(await readFile("assets/music/catalog.json", "utf8"));
    const input = join(directory, "catalog.json"), output = join(directory, "runtime");
    await writeFile(input, JSON.stringify(index));
    const generate = () => spawnSync(process.execPath, ["scripts/music/runtime-catalog.mjs", "data/site.json", input, output], { encoding: "utf8" });
    const result = generate();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(output, "catalog.json"), "utf8")), index);
    assert.deepEqual(JSON.parse(await readFile(join(output, "allowlist.json"), "utf8")), playbackAllowlist(validateMusic(site.music)));
    delete index.tracks[tracks[0].id];
    await writeFile(input, JSON.stringify(index));
    const rejected = generate();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /missing prepared media/);
    // A rejected generation must not replace the valid runtime metadata.
    const unchanged = JSON.parse(await readFile(join(output, "catalog.json"), "utf8"));
    assert.ok(unchanged.tracks[tracks[0].id]);
    index.tracks[tracks[0].id] = { ...unchanged.tracks[tracks[0].id], durationMs: 1000 };
    await writeFile(input, JSON.stringify(index));
    const mismatch = generate();
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /prepared duration differs/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("the media CLI validates the bundled recordings and rejects a damaged recording", async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-bundled-validation-"));
  try {
    const metadata = join(directory, "runtime");
    const generated = spawnSync(process.execPath, ["scripts/music/runtime-catalog.mjs", "data/site.json", "assets/music/catalog.json", metadata], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
    const binary = join(directory, "music-media");
    const build = spawnSync("go", ["build", "-o", binary, "./cmd/music-media"], { cwd: "services/music-stream", encoding: "utf8" });
    assert.equal(build.status, 0, build.stderr);
    const validate = root => spawnSync(binary, ["validate", "--media-root", root, "--index", join(metadata, "catalog.json"), "--allowlist", join(metadata, "allowlist.json")], { encoding: "utf8" });
    const valid = validate(resolve("assets/music"));
    assert.equal(valid.status, 0, valid.stderr);
    const index = JSON.parse(await readFile(join(metadata, "catalog.json"), "utf8"));
    const [id, record] = Object.entries(index.tracks)[0];
    const packagePath = record.file;
    await cp(join("assets/music", packagePath), join(directory, packagePath), { recursive: true });
    await writeFile(join(metadata, "catalog.json"), JSON.stringify({ tracks: { [id]: record } }));
    await writeFile(join(metadata, "allowlist.json"), JSON.stringify({ tracks: [{ id, playback: { kind: "file", durationMs: record.durationMs } }] }));
    const damaged = await readFile(join(directory, packagePath));
    damaged[damaged.length - 1] ^= 1;
    await writeFile(join(directory, packagePath), damaged);
    const rejected = validate(directory);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /media checksum mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
