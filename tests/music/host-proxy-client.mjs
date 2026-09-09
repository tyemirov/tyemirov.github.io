// @ts-check
import assert from "node:assert/strict";
import { request } from "node:https";
import { readFile } from "node:fs/promises";

const origin = "https://audio.tyemirov.net";
const website = "https://tyemirov.net";
const grantPath = "/api/playback-grants";
const ca = await readFile("/data/caddy/pki/authorities/local/root.crt");

/** @param {string} path @param {{method?: string, headers?: Record<string, string>, body?: string, localAddress?: string}} [options] */
function send(path, options = {}) {
  return new Promise((resolve, reject) => {
    const connection = request(new URL(path, origin), {
      ca, family: 4, agent: false, ...options,
      lookup: (_hostname, _options, callback) => callback(null, "127.0.0.1", 4),
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    connection.setTimeout(10000, () => connection.destroy(new Error("HTTPS request timed out")));
    connection.on("error", reject);
    connection.end(options.body);
  });
}

const creation = { method: "POST", headers: { Origin: website, "Content-Type": "application/json" }, body: JSON.stringify({ trackId: "test-tone" }) };
assert.equal((await send("/readyz")).status, 200);
const preflight = await send(grantPath, { method: "OPTIONS", headers: { Origin: website, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type" } });
assert.equal(preflight.status, 204);
assert.equal(preflight.headers["access-control-allow-origin"], website);
assert.equal(preflight.headers["access-control-allow-credentials"], "true");
assert.equal((await send(grantPath, { ...creation, headers: { ...creation.headers, Origin: "https://untrusted.example" } })).status, 403);

const created = await send(grantPath, creation);
assert.equal(created.status, 201);
const session = created.headers["set-cookie"][0];
assert.match(session, /^__Host-music-session=/);
for (const flag of ["Path=/", "Secure", "HttpOnly", "SameSite=Strict"]) assert.ok(session.includes(flag));
assert.ok(!session.includes("Domain="));
const cookie = session.split(";")[0];
const grant = JSON.parse(created.body.toString());
const playlist = new URL(grant.playlistUrl);
assert.equal(playlist.origin, origin);
let mediaBytes = 0;
for (const name of ["index.m3u8", "init.mp4", "seg-00000.m4s"]) {
  const path = new URL(name, playlist).pathname;
  assert.equal((await send(path)).status, 401);
  const media = await send(path, { headers: { Cookie: cookie, Origin: website } });
  assert.equal(media.status, 200);
  assert.equal(media.headers["access-control-allow-origin"], website);
  assert.equal(media.headers["access-control-allow-credentials"], "true");
  assert.match(media.headers["cache-control"], /no-store/);
  assert.ok(media.body.length > 0);
  mediaBytes += media.body.length;
}
const segment = new URL("seg-00000.m4s", playlist).pathname;
const range = await send(segment, { headers: { Cookie: cookie, Range: "bytes=0-15" } });
assert.equal(range.status, 206);
assert.match(range.headers["content-range"], /^bytes 0-15\/[0-9]+$/);
assert.equal(range.body.length, 16);
const head = await send(segment, { method: "HEAD", headers: { Cookie: cookie } });
assert.equal(head.status, 200);
assert.equal(head.body.length, 0);
assert.equal((await send(`${grantPath}/${grant.grantId}`, { method: "DELETE", headers: { Cookie: cookie, Origin: website } })).status, 204);
assert.equal((await send(segment, { headers: { Cookie: cookie } })).status, 410);

// Caddy must discard caller-supplied forwarding headers. Distinct real peers
// must retain separate address limits through the declared trusted proxy input.
const burst = await Promise.all(Array.from({ length: 30 }, (_, index) => send(grantPath, {
  ...creation, localAddress: "127.0.0.2", headers: { ...creation.headers, "X-Forwarded-For": `198.51.100.${index + 1}` },
})));
const statuses = burst.map((response) => response.status);
assert.ok(statuses.every((status) => status === 201 || status === 429));
assert.ok(statuses.includes(201) && statuses.includes(429), "Forged forwarding headers must not bypass the address limit");
for (const response of burst.filter((response) => response.status === 429)) assert.ok(Number(response.headers["retry-after"]) > 0);
assert.equal((await send(grantPath, { ...creation, localAddress: "127.0.0.3" })).status, 201, "A distinct real peer must have its own address limit");

process.stdout.write(JSON.stringify({ tls: "verified internal CA and declared hostname", mediaBytes, range: "206", revoked: "410", spoofedAddressLimit: "429", distinctPeer: "201" }) + "\n");
