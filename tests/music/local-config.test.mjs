// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

test("local Compose uses the production artifacts, storage layout, and separate origins", () => {
  const result = spawnSync("docker", ["compose", "-p", "personal-site-config-test", "-f", "compose.local.yml", "config", "--format", "json"], {
    env: { ...process.env, GALLERY_GOOGLE_WEB_CLIENT_ID: "fixture.apps.googleusercontent.com", UP_PORT: "18443", API_PORT: "18444", PAYMENT_PORT: "18447", MUSIC_LOCAL_ROOT: "/tmp/private-media", LOCAL_SITE_ROOT: "/tmp/local-site", LOCAL_GALLERY_ENV: "/tmp/local-gallery-config-test.env", LOCAL_MAIL_ENV: "/tmp/local-mail-config-test.env", LOCAL_PAYMENT_ENV: "/tmp/local-payment-config-test.env", LOCAL_PAYMENT_CERT_ROOT: "/tmp/local-payment-certificates" }, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const { services, volumes } = JSON.parse(result.stdout);
  assert.ok(services.music.command.includes("--public-origin=http://localhost:18444"));
  assert.ok(services.music.command.includes("--allowed-origins=http://localhost:18443"));
  assert.ok(services.music.command.includes("--index=/media/catalog.json"));
  assert.ok(services.music.command.includes("--allowlist=/media/allowlist.json"));
  assert.equal(services.music.build.dockerfile, "services/music-stream/Dockerfile");
  assert.equal(services.music.volumes[0].type, "volume");
  assert.equal(services.music.volumes[0].source, "media");
  assert.equal(services.music.volumes[0].read_only, true);
  assert.ok(volumes.media);
  assert.match(services.website.image, /^ghcr\.io\/tyemirov\/ghttp@sha256:[a-f0-9]{64}$/);
  assert.equal(services.website.ports[0].host_ip, "127.0.0.1");
  assert.equal(services.website.ports[0].published, "18443");
  assert.equal(services.website.ports[0].target, 8000);
  assert.equal(services.website.depends_on["media-init"].condition, "service_completed_successfully");
  assert.equal(services["media-init"].environment.LOCAL_WEBSITE_ORIGIN, "http://localhost:18443");
  assert.equal(services["media-init"].environment.LOCAL_API_ORIGIN, "http://localhost:18444");
  assert.equal(services.website.volumes.length, 1);
  assert.ok(services.website.volumes.some(volume => volume.type === "bind" && volume.source === "/tmp/local-site" && volume.target === "/site" && volume.read_only));
  assert.ok(services.gallery, "The local stack must start the gallery API.");
  assert.ok(services.gallery.command.includes("--database=/data/gallery.db"));
  assert.ok(services.gallery.command.includes("--public-root=/site"));
  assert.ok(services.gallery.command.includes("--allowed-origin=http://localhost:18443"));
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
  assert.equal(services.tauth.environment.STUDIO_WEBSITE_ORIGIN,"http://localhost:18443");
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
  assert.deepEqual(Object.keys(services).sort(), ["gallery", "gallery-mail", "gallery-payment", "media-init", "music", "tauth", "website"]);
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


test("static container serves only the prepared website with local response headers", { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "site-container-test-"));
  const site = join(directory, "site");
  await mkdir(site);
  await writeFile(join(site, "styles.css"), "body { color: teal; }\n");
  await writeFile(join(directory, "private.txt"), "private fixture");
  const project = `site-container-test-${process.pid}`;
  const environment = { ...process.env, UP_PORT: "0", MUSIC_LOCAL_ROOT: directory, LOCAL_SITE_ROOT: site, LOCAL_GALLERY_ENV: join(directory, "gallery.env"), LOCAL_MAIL_ENV: join(directory, "mail.env"), LOCAL_PAYMENT_ENV: join(directory, "payment.env"), LOCAL_PAYMENT_CERT_ROOT: directory, GALLERY_GOOGLE_WEB_CLIENT_ID: "fixture.apps.googleusercontent.com" };
  const compose = (...args) => {
    const result = spawnSync("docker", ["compose", "-p", project, "-f", "compose.local.yml", ...args], { env: environment, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout.trim();
  };
  t.after(async () => {
    try { compose("down"); } finally { await rm(directory, { recursive: true, force: true }); }
  });
  compose("up", "--no-deps", "--detach", "website");
  const origin = `http://${compose("port", "website", "8000")}`;
  const asset = async (url) => {
    const deadline = Date.now() + 10000;
    for (;;) {
      try { return await fetch(url + "/styles.css"); }
      catch (error) { if (Date.now() >= deadline) throw error; await delay(100); }
    }
  };
  const response = await asset(origin);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer-when-downgrade");
  assert.equal(await response.text(), "body { color: teal; }\n");
  assert.equal((await fetch(origin + "/private.txt")).status, 404);
  assert.equal((await fetch(origin + "/")).status, 403, "Directory listings must be disabled.");
  await writeFile(join(site, "styles.css"), "body { color: copper; }\n");
  compose("up", "--no-deps", "--detach", "--force-recreate", "website");
  const rebuiltOrigin = `http://${compose("port", "website", "8000")}`;
  assert.equal(await (await asset(rebuiltOrigin)).text(), "body { color: copper; }\n");
  compose("down");
  await assert.rejects(fetch(rebuiltOrigin + "/styles.css"));
});
