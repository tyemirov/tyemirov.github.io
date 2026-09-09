// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

test("the Pages artifact contains the player and rejects private audio", async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-artifact-")), output = join(directory, "site");
  try {
    const build = spawnSync("bash", ["scripts/build-pages-artifact.sh"], { env: { ...process.env, PAGES_DIST_DIR: output }, encoding: "utf8", timeout: 60000 });
    assert.equal(build.status, 0, build.stderr);
    const validate = () => spawnSync(process.execPath, ["scripts/music/validate-artifact.mjs", output], { encoding: "utf8", timeout: 10000 });
    const valid = validate(); assert.equal(valid.status, 0, valid.stderr);
    const files = await readdir(output);
    for (const reserved of ["CNAME", ".nojekyll", ".mprlab-release.json", ".git"]) assert.equal(files.includes(reserved), false, `${reserved} belongs to Gateway`);
    await writeFile(join(output, "music", "original.wav"), "PRIVATE AUDIO");
    const invalid = validate(); assert.notEqual(invalid.status, 0); assert.match(invalid.stderr, /private media/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
