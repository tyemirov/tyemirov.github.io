// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { load } from "js-yaml";

const run = (args) => spawnSync("docker", args, { encoding: "utf8", timeout: 240000, maxBuffer: 8000000 });
const success = (result) => { assert.equal(result.status, 0, result.stderr + result.stdout); return result.stdout.trim(); };

test("the declared music image starts with empty retained storage and survives container replacement", { timeout: 360000 }, async () => {
  const manifest = load(await readFile(".mprlab/deploy/resources.yml", "utf8")).mprlab_resources;
  const project = manifest.resources.find(resource => resource.id === "music");
  const service = project.services.find(service => service.id === "stream");
  const build = project.images.find(image => image.id === service.image).build;
  const image = `music-deployment:b010-${process.pid}`;
  const name = `music-deployment-b010-${process.pid}`;
  const volume = `${name}-media`;
  let ownsVolume = false;
  try {
    success(run(["build", "-q", "--platform", build.platforms[0], "-t", image, "-f", build.dockerfile, build.context]));
    assert.equal(success(run(["volume", "ls", "-q", "--filter", `name=^${volume}$`])), "");
    success(run(["volume", "create", volume])); ownsVolume = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      success(run(["run", "-d", "--name", name, "--read-only", "--mount", `type=volume,src=${volume},dst=${service.mounts[0].target},readonly`, "-p", `127.0.0.1::${service.readiness.port}`, image, ...service.command]));
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
      const site = JSON.parse(await readFile("data/site.json", "utf8"));
      const external = site.music.items.flatMap(album => album.tracks).find(track => track.playback.kind === "external");
      assert.ok(external);
      const grant = await fetch(origin + "/music/playback-grants", { method: "POST", headers: { Origin: "https://tyemirov.net", "Content-Type": "application/json" }, body: JSON.stringify({ trackId: external.id }) });
      assert.equal(grant.status, 404, "External tracks must not become playable HLS tracks.");
      success(run(["rm", "-f", name]));
    }
  } finally {
    run(["rm", "-f", name]);
    if (ownsVolume) success(run(["volume", "rm", volume]));
    run(["image", "rm", image]);
  }
});
