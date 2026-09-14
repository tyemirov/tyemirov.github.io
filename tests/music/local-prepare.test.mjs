// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "../..");
function run(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", timeout: 60000, ...options });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}

test("local preparation enables the real catalog against private media without changing publication content", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "local-media-prepare-"));
  try {
    const publicSite = join(temporary, "public"), source = join(temporary, "source"), site = join(temporary, "site"), media = join(temporary, "media");
    run("bash", ["scripts/build-pages-artifact.sh"], { env: { ...process.env, PAGES_DIST_DIR: publicSite } });
    const original = await readFile(join(publicSite, "data/site.json"), "utf8");
    const tracks = JSON.parse(original).music.items.flatMap((album) => album.tracks);
    const tone = join(temporary, "tone.wav");
    run("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "13", tone]);
    const { trackId, ...record } = JSON.parse(run(process.execPath, ["scripts/music/prepare.mjs", "--source", tone, "--media-root", source, "--track-id", "test-tone"]));
    await writeFile(join(source, "catalog.json"), JSON.stringify({ tracks: Object.fromEntries(tracks.map((track) => [track.id, record])) }));
    const environment = { ...process.env, LOCAL_WEBSITE_ORIGIN: "http://localhost:18080", LOCAL_API_ORIGIN: "http://localhost:18082" };
    const originalUI = await readFile(join(publicSite, "config-ui.yaml"), "utf8");
    const originalAPI = await readFile(join(publicSite, "config-site.json"), "utf8");
    const prepare = () => run(process.execPath, ["local/prepare.mjs", publicSite, source, site, media], { env: environment });
    const assertLocalConfig = async () => {
      assert.deepEqual(JSON.parse(await readFile(join(site, "config-site.json"), "utf8")), { apiOrigin: environment.LOCAL_API_ORIGIN });
      const expectedUI = JSON.parse(originalUI);
      Object.assign(expectedUI.environments[0], { description: "Local", origins: [environment.LOCAL_WEBSITE_ORIGIN] });
      Object.assign(expectedUI.environments[0].auth, { tauthUrl: environment.LOCAL_API_ORIGIN, tenantId: "tyemirov-gallery-development" });
      assert.deepEqual(JSON.parse(await readFile(join(site, "config-ui.yaml"), "utf8")), expectedUI);
      assert.equal(await readFile(join(publicSite, "config-ui.yaml"), "utf8"), originalUI);
      assert.equal(await readFile(join(publicSite, "config-site.json"), "utf8"), originalAPI);
    };
    prepare();
    await assertLocalConfig();
    const local = JSON.parse(await readFile(join(site, "data/site.json"), "utf8"));
    assert.deepEqual(local.music.items.flatMap((album) => album.tracks).map((track) => track.playback), tracks.map(() => ({ kind: "hls", durationMs: record.durationMs })));
    assert.equal(await readFile(join(publicSite, "data/site.json"), "utf8"), original);
    run("go", ["run", "./cmd/music-media", "validate", "--media-root", media, "--index", join(media, "catalog.json"), "--allowlist", join(media, "allowlist.json")], { cwd: join(root, "services/music-stream") });
    await writeFile(join(site, "obsolete.txt"), "old site file");
    await mkdir(join(media, "packages", "retained-package"));
    environment.LOCAL_WEBSITE_ORIGIN = "http://localhost:18081";
    environment.LOCAL_API_ORIGIN = "http://localhost:18083";
    prepare();
    await assertLocalConfig();
    await assert.rejects(readFile(join(site, "obsolete.txt")), { code: "ENOENT" });
    assert.ok((await stat(join(media, "packages", "retained-package"))).isDirectory());
    await writeFile(join(source, "catalog.json"), '{"tracks":{}}');
    const invalid = spawnSync(process.execPath, ["local/prepare.mjs", publicSite, source, site, media], { cwd: root, env: environment, encoding: "utf8" });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /missing local media/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
