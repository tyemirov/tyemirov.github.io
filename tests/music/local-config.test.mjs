// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("local Compose uses the production artifacts, storage layout, and separate origins", () => {
  const result = spawnSync("docker", ["compose", "-p", "personal-site-config-test", "-f", "compose.local.yml", "config", "--format", "json"], {
    env: { ...process.env, UP_PORT: "18443", MUSIC_PORT: "18444", MUSIC_LOCAL_ROOT: "/tmp/private-media" }, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const { services, volumes } = JSON.parse(result.stdout);
  assert.ok(services.music.command.includes("--public-origin=https://localhost:18444"));
  assert.ok(services.music.command.includes("--allowed-origins=https://localhost:18443"));
  assert.ok(services.music.command.includes("--index=/media/selected.json"));
  assert.ok(services.music.command.includes("--allowlist=/media/allowlist.json"));
  assert.equal(services.music.build.context.endsWith("/services/music-stream"), true);
  assert.equal(services.music.volumes[0].type, "volume");
  assert.equal(services.music.volumes[0].source, "media");
  assert.equal(services.music.volumes[0].read_only, true);
  assert.ok(volumes.media);
  assert.equal(services.website.build.dockerfile, "Dockerfile.pages");
  assert.equal(services.website.build.target, "local");
  assert.deepEqual(services.website.ports.map((port) => [port.host_ip, port.published]), [["127.0.0.1", "18443"], ["127.0.0.1", "18444"]]);
  assert.equal(services.music.ports, undefined);
  assert.equal(services["media-init"].volumes[0].source, "/tmp/private-media");
});
