// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const run = (args, timeout = 180000) => spawnSync("docker", args, { encoding: "utf8", timeout, maxBuffer: 4000000 });
const success = (result) => { assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };

test("the Pages container exports public content without Gateway metadata", { timeout: 180000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-pages-container-"));
  try {
    success(run(["buildx", "build", "-q", "-f", "Dockerfile.pages", "--output", `type=local,dest=${directory}`, "."]));
    const validation = spawnSync(process.execPath, ["scripts/music/validate-artifact.mjs", directory], { encoding: "utf8", timeout: 10000 });
    assert.equal(validation.status, 0, validation.stderr);
    const files = await readdir(directory);
    for (const reserved of ["CNAME", ".nojekyll", ".mprlab-release.json", ".git", "node_modules", "services"]) assert.equal(files.includes(reserved), false, reserved);
    const site = JSON.parse(await readFile(join(directory, "data/site.json"), "utf8"));
    assert.equal(site.music.items.length, 6);
    assert.equal(site.music.items.flatMap((album) => album.tracks).length, 50);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("the pinned Linux images prepare audio and serve authorized media", { timeout: 360000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-container-"));
  const name = `music-test-${process.pid}`;
  try {
    success(run(["build", "-q", "-t", "music-prepare:f001-test", "-f", "scripts/music/Dockerfile", "scripts/music"]));
    success(run(["build", "-q", "--platform", "linux/amd64", "-t", "music-stream:f001-test", "services/music-stream"]));
    assert.equal(success(run(["image", "inspect", "music-stream:f001-test", "--format", "{{.Architecture}}"])), "amd64");
    const mount = ["--mount", `type=bind,src=${directory},dst=/work`];
    success(run(["run", "--rm", "--network", "none", ...mount, "--entrypoint", "ffmpeg", "music-prepare:f001-test", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "13", "/work/tone.wav"]));
    const receipt = JSON.parse(success(run(["run", "--rm", "--network", "none", ...mount, "music-prepare:f001-test", "--source", "/work/tone.wav", "--media-root", "/work/media", "--track-id", "test-tone"])));
    const { trackId, ...record } = receipt;
    await writeFile(join(directory, "index.json"), JSON.stringify({ tracks: { [trackId]: record } }));
    await writeFile(join(directory, "allowlist.json"), JSON.stringify({ tracks: [{ id: trackId, playback: { kind: "hls", durationMs: record.durationMs } }] }));
    const config = ["--media-root", "/work/media", "--index", "/work/index.json", "--allowlist", "/work/allowlist.json"];
    success(run(["run", "--rm", "--network", "none", ...mount, "--entrypoint", "/music-media", "music-stream:f001-test", "validate", ...config]));
    const invalidProxy = run(["run", "--rm", "--name", `${name}-invalid`, "--env", "MUSIC_TRUSTED_PROXIES=invalid", ...mount, "music-stream:f001-test", ...config, "--public-origin", "https://audio.example.test", "--allowed-origins", "https://example.test"], 5000);
    assert.notEqual(invalidProxy.status, 0);
    assert.match(invalidProxy.stderr, /configure trusted proxy/);
    success(run(["run", "-d", "--name", name, "--read-only", "--mount", `type=bind,src=${directory},dst=/work,readonly`, "-p", "127.0.0.1::8092", "music-stream:f001-test", ...config, "--listen", "0.0.0.0:8092", "--public-origin", "https://audio.example.test", "--allowed-origins", "https://example.test"]));
    const startupDeadline = performance.now() + 5000;
    while (true) {
      const logs = run(["logs", name]);
      assert.equal(logs.status, 0, logs.stderr);
      const output = logs.stdout + logs.stderr;
      if (output.includes('"msg":"music_service_ready"')) break;
      assert.equal(success(run(["inspect", name, "--format", "{{.State.Running}}"])), "true", output);
      assert.ok(performance.now() < startupDeadline, `Service readiness event absent: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const port = success(run(["port", name, "8092/tcp"])).split(":").at(-1);
    const origin = `http://127.0.0.1:${port}`;
    const ready = await fetch(origin + "/readyz", { signal: AbortSignal.timeout(5000) });
    assert.equal(ready.status, 200);
    const response = await fetch(origin + "/api/playback-grants", { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json" }, body: JSON.stringify({ trackId }) });
    assert.equal(response.status, 201);
    const grant = await response.json(), path = new URL(grant.playlistUrl).pathname;
    const cookie = response.headers.getSetCookie()[0].split(";")[0];
    assert.equal((await fetch(origin + path)).status, 401);
    const media = await fetch(origin + path, { headers: { Cookie: cookie } });
    assert.equal(media.status, 200);
    assert.match(await media.text(), /#EXT-X-ENDLIST/);
    const segment = path.replace("index.m3u8", "seg-00000.m4s");
    const started = performance.now();
    const transfers = await Promise.all(Array.from({ length: 8 }, async () => {
      const response = await fetch(origin + segment, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200); return (await response.arrayBuffer()).byteLength;
    }));
    process.stdout.write(JSON.stringify({ linuxSmoke: true, concurrentTransfers: 8, bytes: transfers.reduce((a, b) => a + b), elapsedMs: Math.round(performance.now() - started) }) + "\n");
  } finally {
    const invalidRemoved = run(["rm", "-f", `${name}-invalid`]);
    if (invalidRemoved.status !== 0 && !invalidRemoved.stderr.includes("No such container")) throw new Error(invalidRemoved.stderr);
    const removed = run(["rm", "-f", name]);
    if (removed.status !== 0 && !removed.stderr.includes("No such container")) throw new Error(removed.stderr);
    await rm(directory, { recursive: true, force: true });
  }
});
