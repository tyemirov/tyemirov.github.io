// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("local Compose uses the production artifacts, storage layout, and separate origins", () => {
  const result = spawnSync("docker", ["compose", "-p", "personal-site-config-test", "-f", "compose.local.yml", "config", "--format", "json"], {
    env: { ...process.env, GALLERY_GOOGLE_WEB_CLIENT_ID: "fixture.apps.googleusercontent.com", UP_PORT: "18443", API_PORT: "18444", PAYMENT_PORT: "18447", MUSIC_LOCAL_ROOT: "/tmp/private-media", LOCAL_SITE_ROOT: "/tmp/local-site", LOCAL_GALLERY_ENV: "/tmp/local-gallery-config-test.env", LOCAL_MAIL_ENV: "/tmp/local-mail-config-test.env", LOCAL_PAYMENT_ENV: "/tmp/local-payment-config-test.env", LOCAL_PAYMENT_CERT_ROOT: "/tmp/local-payment-certificates" }, encoding: "utf8",
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
  assert.equal(services.website, undefined);
  assert.ok(services.gallery, "The local stack must start the gallery API.");
  assert.ok(services.gallery.command.includes("--database=/data/gallery.db"));
  assert.ok(services.gallery.command.includes("--public-root=/site"));
  assert.ok(services.gallery.command.includes("--allowed-origin=https://localhost:18443"));
  assert.ok(services.gallery.command.includes("--tenant-id=tyemirov-gallery-development"));
  assert.ok(services.gallery.command.includes("--owner-email=vadym@tyemirov.net"));
  assert.ok(services.gallery.command.includes("--cookie-name=tyemirov_gallery_development_session"));
  assert.equal(services.gallery.build.context, services["media-init"].build.context);
  assert.equal(services.gallery.build.dockerfile, "services/gallery/Dockerfile");
  assert.equal(services.gallery.ports[0].host_ip, "127.0.0.1");
  assert.equal(services.gallery.ports[0].target, 8093);
  assert.ok(services.gallery.volumes.some(volume => volume.type === "volume" && volume.source === "gallery-data" && volume.target === "/data"));
  assert.ok(services.gallery.volumes.some(volume => volume.type === "bind" && volume.source === "/tmp/local-site" && volume.target === "/site" && volume.read_only));
  assert.ok(volumes["gallery-data"]);
  assert.ok(volumes["tauth-data"]);
  assert.equal(services.tauth.environment.STUDIO_WEBSITE_ORIGIN,"https://localhost:18443");
  assert.equal(services.tauth.environment.GALLERY_GOOGLE_WEB_CLIENT_ID,"fixture.apps.googleusercontent.com");
  assert.ok(services.gallery.command.includes("--receipts=pinguin"));
  assert.ok(services.gallery.command.includes("--pinguin-grpc-address=gallery-mail:50051"));
  assert.equal(services["gallery-mail"].build.target, "mail-sink");
  assert.ok(services["gallery-mail"].volumes.some(volume => volume.source === "gallery-mail-data" && volume.target === "/data"));
  assert.equal(services["gallery-mail"].ports[0].host_ip, "127.0.0.1");
  assert.ok(volumes["gallery-mail-data"]);
  assert.ok(services.gallery.command.includes("--payments=paypal"));
  assert.ok(services.gallery.command.includes("--paypal-api-origin=https://gallery-payment:8095"));
  assert.equal(services["gallery-payment"].ports[0].host_ip, "127.0.0.1");
  assert.ok(volumes["gallery-payment-data"]);
  assert.deepEqual(Object.keys(services).sort(), ["gallery", "gallery-mail", "gallery-payment", "media-init", "music", "tauth"]);
  assert.equal(services.music.ports[0].host_ip, "127.0.0.1");
  assert.equal(services.music.ports[0].target, 8092);
  assert.equal(services["media-init"].volumes[2].source, "/tmp/local-site");
  assert.equal(services["media-init"].volumes[0].source, "/tmp/private-media");
});

test("local startup rejects an API port shared with another public origin", () => {
  const result = spawnSync("make", ["up", "UP_PORT=18443", "API_PORT=18443", "LOCAL_PROJECT=gallery-port-contract-test"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UP_PORT, API_PORT, and PAYMENT_PORT must differ/);
});
