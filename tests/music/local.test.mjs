// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { request } from "node:https";
import { createServer } from "node:net";
import { once } from "node:events";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium, expect } from "@playwright/test";
import { installSharedUIAssets } from "./shared-ui-assets.mjs";

const root = resolve(import.meta.dirname, "../..");
const certificatePath = join(process.env.LOCAL_CERT_ROOT, "ca.pem");
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 300000, maxBuffer: 4000000 });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function http(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = request(url, { agent: false, ...options }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
      response.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error(`Timed out: ${url}`)));
    req.end(body);
  });
}

test("make up serves the site and private music; make down stops the stack", { timeout: 600000 }, async (t) => {
  // Check the public command before the more expensive fixture setup.
  run("make", ["--dry-run", "up"]);
  const directory = await mkdtemp(join(tmpdir(), "personal-site-local-"));
  const portServer = createServer().listen(0, "127.0.0.1");
  await once(portServer, "listening");
  const port = portServer.address().port;
  const mediaPortServer = createServer().listen(0, "127.0.0.1");
  await once(mediaPortServer, "listening");
  const mediaPort = mediaPortServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  await new Promise((resolve) => mediaPortServer.close(resolve));
  const origin = `https://localhost:${port}`;
  const mediaOrigin = `https://localhost:${mediaPort}`;
  const project = `personal-site-test-${process.pid}`;
  const mediaRoot = join(directory, ".local/music");
  const args = [`UP_PORT=${port}`, `MUSIC_PORT=${mediaPort}`, `LOCAL_PROJECT=${project}`, `MUSIC_LOCAL_ROOT=${mediaRoot}`, `LOCAL_CERT_ROOT=${process.env.LOCAL_CERT_ROOT}`, `GHTTP=${process.env.GHTTP}`];
  const make = (target) => run("make", [target, ...args], directory);
  t.after(async () => {
    try {
      const log = await readFile(join(directory, ".local/runtime", project, "ghttp.log"), "utf8").catch((error) => error.message);
      t.diagnostic(log);
      make("down");
      const volumes = run("docker", ["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]).split("\n").filter(Boolean);
      if (volumes.length) run("docker", ["volume", "rm", ...volumes]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  const files = run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  const deleted = new Set(run("git", ["diff", "--name-only", "--diff-filter=D", "-z"]).split("\0"));
  for (const file of files.filter((file) => !deleted.has(file))) {
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await copyFile(join(root, file), join(directory, file));
  }
  await mkdir(mediaRoot, { recursive: true });
  const source = join(directory, "tone.wav");
  run("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "13", source]);
  const { trackId, ...record } = JSON.parse(run(process.execPath, ["scripts/music/prepare.mjs", "--source", source, "--media-root", mediaRoot, "--track-id", "test-tone"]));
  const sitePath = join(directory, "data/site.json");
  const site = JSON.parse(await readFile(sitePath, "utf8"));
  const tracks = site.music.items.flatMap((album) => album.tracks);
  await writeFile(join(mediaRoot, "selected.json"), JSON.stringify({ tracks: Object.fromEntries(tracks.map((track) => [track.id, record])) }));
  run("git", ["init", "-q"], directory);
  run("git", ["add", "."], directory);
  make("up");
  const ca = await readFile(certificatePath);
  const https = (url, options = {}, body) => http(url, { ca, ...options }, body);
  assert.equal((await https(origin + "/")).status, 200);
  assert.equal((await https(origin + "/gallery/")).status, 200);
  assert.equal((await https(mediaOrigin + "/readyz")).status, 200);
  assert.deepEqual(JSON.parse((await https(origin + "/music/player-config.json")).body), { apiOrigin: mediaOrigin });
  for (const path of ["/.git/config", "/.local/music/selected.json", "/services/music-stream/go.mod"]) {
    assert.equal((await https(origin + path)).status, 404, path);
  }
  const grantResponse = await https(mediaOrigin + "/api/playback-grants", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" } }, JSON.stringify({ trackId: tracks[0].id }));
  assert.equal(grantResponse.status, 201, grantResponse.body);
  assert.equal(grantResponse.headers["access-control-allow-origin"], origin);
  const grant = JSON.parse(grantResponse.body);
  assert.equal(new URL(grant.playlistUrl).origin, mediaOrigin);
  assert.equal((await https(grant.playlistUrl)).status, 401);
  const cookie = grantResponse.headers["set-cookie"][0].split(";")[0];
  const playlist = await https(grant.playlistUrl, { headers: { Cookie: cookie } });
  assert.equal(playlist.status, 200);
  assert.match(playlist.body, /#EXT-X-ENDLIST/);
  const segment = await https(grant.playlistUrl.replace("index.m3u8", "seg-00000.m4s"), { headers: { Cookie: cookie, Range: "bytes=0-31" } });
  assert.equal(segment.status, 206);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await installSharedUIAssets(context);
    await context.route(/loopaware\.mprlab\.com/, (route) => route.abort());
    await context.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) { this.muted = true; return play.apply(this, args); };
    });
    const page = await context.newPage();
    await page.goto(origin + "/music/soliloquies-vol-i/");
    await page.locator(".track-play").first().click();
    const player = page.getByRole("region", { name: "Music player" });
    const audio = player.locator("audio");
    await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(1);
    await player.getByRole("button", { name: "Pause", exact: true }).click();
    await expect.poll(() => audio.evaluate((element) => element.paused)).toBe(true);
    await player.getByLabel("Seek").fill("7");
    await player.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(7);
  } finally { await browser.close(); }
  const stylesPath = join(directory, "styles.css");
  await writeFile(stylesPath, await readFile(stylesPath, "utf8") + "\n/* local-rebuild-check */\n");
  make("up");
  const refreshedCA = await readFile(certificatePath);
  assert.deepEqual(refreshedCA, ca);
  assert.match((await http(origin + "/styles.css", { ca: refreshedCA })).body, /local-rebuild-check/);
  assert.equal((await http(mediaOrigin + "/readyz", { ca: refreshedCA })).status, 200);
  make("down");
  await assert.rejects(https(origin + "/"));
  await assert.rejects(https(mediaOrigin + "/readyz"));
  const volumes = run("docker", ["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
  assert.ok(volumes.includes(`${project}_media`));
  assert.deepEqual(await readFile(certificatePath), ca);
  make("down");
  const occupied = createServer().listen(mediaPort, "127.0.0.1");
  await once(occupied, "listening");
  try {
    const failure = spawnSync("make", ["up", ...args], { cwd: directory, encoding: "utf8", timeout: 300000 });
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /Local startup failed/);
    await assert.rejects(https(origin + "/"));
    assert.deepEqual(await readFile(certificatePath), ca);
    const containers = run("docker", ["ps", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
    assert.equal(containers, "");
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
  make("down");
});
