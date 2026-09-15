// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { load } from "js-yaml";

const run = (args) => spawnSync("docker", args, { encoding: "utf8", timeout: 240000, maxBuffer: 8000000 });
const success = (result) => { assert.equal(result.status, 0, result.stderr + result.stdout); return result.stdout.trim(); };

test("the declared music image serves every recording without a volume after container replacement", { timeout: 360000 }, async () => {
  const manifest = load(await readFile(".mprlab/deploy/resources.yml", "utf8")).mprlab_resources;
  const project = manifest.resources.find(resource => resource.id === "music");
  const service = project.services.find(service => service.id === "stream");
  assert.equal(service.mounts, undefined, "The production service must use the audio in its image.");
  const build = project.images.find(image => image.id === service.image).build;
  const image = `music-deployment:b010-${process.pid}`;
  const name = `music-deployment-b010-${process.pid}`;
  const site = JSON.parse(await readFile("data/site.json", "utf8"));
  const tracks = site.music.items.flatMap(album => album.tracks);
  assert.equal(tracks.length, 50);
  assert.ok(tracks.every(track => track.playback.kind === "hls"));
  try {
    success(run(["build", "-q", "--platform", build.platforms[0], "-t", image, "-f", build.dockerfile, build.context]));
    for (let attempt = 0; attempt < 2; attempt++) {
      success(run(["run", "-d", "--name", name, "--read-only", "-p", `127.0.0.1::${service.readiness.port}`, image, ...service.command]));
      const deadline = performance.now() + 10000;
      while (true) {
        const logs = run(["logs", name]);
        const output = logs.stdout + logs.stderr;
        if (output.includes('"msg":"music_service_ready"')) break;
        assert.equal(success(run(["inspect", name, "--format", "{{.State.Running}}"])), "true", output);
        assert.ok(performance.now() < deadline, output);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const port = success(run(["port", name, `${service.readiness.port}/tcp`])).split(":").at(-1);
      const origin = `http://127.0.0.1:${port}`;
      const response = await fetch(origin + service.readiness.path, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, service.readiness.expected_status);
      for (const track of tracks) {
        const response = await fetch(origin + "/music/playback-grants", { method: "POST", headers: { Origin: "https://tyemirov.net", "Content-Type": "application/json" }, body: JSON.stringify({ trackId: track.id }) });
        assert.equal(response.status, 201, `Create grant for ${track.id}`);
        const grant = await response.json();
        assert.equal(grant.durationMs, track.playback.durationMs);
        const cookie = response.headers.getSetCookie()[0].split(";")[0];
        const path = new URL(grant.playlistUrl).pathname;
        assert.equal((await fetch(origin + path)).status, 401);
        const playlist = await fetch(origin + path, { headers: { Cookie: cookie } });
        assert.equal(playlist.status, 200);
        const text = await playlist.text();
        const segment = text.split("\n").find(line => line.endsWith(".m4s"));
        assert.ok(segment);
        const segmentPath = new URL(segment, grant.playlistUrl).pathname;
        const audio = await fetch(origin + segmentPath, { headers: { Cookie: cookie } });
        assert.equal(audio.status, 200);
        assert.ok((await audio.arrayBuffer()).byteLength > 1000);
        const revoked = await fetch(origin + `/music/playback-grants/${grant.grantId}`, { method: "DELETE", headers: { Cookie: cookie, Origin: "https://tyemirov.net" } });
        assert.equal(revoked.status, 204);
      }
      success(run(["rm", "-f", name]));
    }
  } finally {
    run(["rm", "-f", name]);
    run(["image", "rm", image]);
  }
});
