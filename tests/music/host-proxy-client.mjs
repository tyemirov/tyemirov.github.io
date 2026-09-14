// @ts-check
import assert from "node:assert/strict";
import { request, Agent } from "node:https";
import { readFile } from "node:fs/promises";

const origin = "https://api.tyemirov.net";
const website = "https://tyemirov.net";
const grantPath = "/music/playback-grants";
const contract = JSON.parse(await readFile("/data/runtime-contract.json", "utf8"));
const musicPolicy = contract.route.handlers.find(handler => handler.id === "music").access;
const { events, window_seconds: windowSeconds } = musicPolicy.rate_limit;
const agent = new Agent({ keepAlive: true, maxSockets: 64 });
const ca = await readFile("/data/caddy/pki/authorities/local/root.crt");

/** @param {string} path @param {{method?: string, headers?: Record<string, string>, body?: string, localAddress?: string}} [options] */
function send(path, options = {}) {
  return new Promise((resolve, reject) => {
    const connection = request(new URL(path, origin), {
      ca, family: 4, agent, ...options,
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
assert.equal((await send("/music/readyz")).status, 200);
const preflight = await send(grantPath, { method: "OPTIONS", headers: { Origin: website, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type" } });
assert.equal(preflight.status, 204);
assert.equal(preflight.headers["access-control-allow-origin"], website);
assert.equal(preflight.headers["access-control-allow-credentials"], "true");
assert.equal((await send(grantPath, { ...creation, headers: { ...creation.headers, Origin: "https://untrusted.example" } })).status, 403);

const created = await send(grantPath, creation);
assert.equal(created.status, 201);
const session = created.headers["set-cookie"][0];
assert.match(session, /^__Secure-music-session=/);
for (const flag of ["Path=/music;", "Secure", "HttpOnly", "SameSite=Strict"]) assert.ok(session.includes(flag));
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

// One hundred listeners behind one address must all obtain grants and media.
const listeners = await Promise.all(Array.from({ length: 100 }, async () => {
  const response = await send(grantPath, { ...creation, localAddress: "127.0.0.4" });
  assert.equal(response.status, 201);
  const cookie = response.headers["set-cookie"][0].split(";")[0];
  const grant = JSON.parse(response.body.toString());
  for (const name of ["index.m3u8", "init.mp4", "seg-00000.m4s", "seg-00001.m4s", "seg-00002.m4s"]) {
    assert.equal((await send(new URL(name, grant.playlistUrl).pathname, { localAddress: "127.0.0.4", headers: { Cookie: cookie } })).status, 200);
  }
  const renewed = await send(`${grantPath}/${grant.grantId}/expiration`, {
    ...creation, method: "PUT", localAddress: "127.0.0.4", headers: { ...creation.headers, Cookie: cookie },
    body: JSON.stringify({ expiresAt: new Date(Date.parse(grant.expiresAt) + 1).toISOString() }),
  });
  assert.equal(renewed.status, 200);
  assert.equal(JSON.parse(renewed.body.toString()).playlistUrl, grant.playlistUrl);
  return grant.grantId;
}));
assert.equal(new Set(listeners).size, 100);

// Gateway's music-path Caddy budget uses the actual connection peer.
// Unique forwarding values must not give requests independent budgets.
const started = performance.now();
const statuses = [];
for (let offset = 0; offset < events + 1; offset += 64) {
  const batch = await Promise.all(Array.from({ length: Math.min(64, events + 1 - offset) }, (_, index) => send("/music/rate-limit-probe", {
    localAddress: "127.0.0.2", headers: { "X-Forwarded-For": `198.51.${Math.floor((offset + index) / 256)}.${(offset + index) % 256}`, Forwarded: `for="fake-${offset + index}"` },
  })));
  statuses.push(...batch.map(response => response.status));
}
assert.ok(performance.now() - started < windowSeconds * 1000, "The flood must fit within one configured window");
assert.equal(statuses.filter(status => status === 404).length, events);
assert.equal(statuses.filter(status => status === 429).length, 1);
const limitedGrant = await send(grantPath, { ...creation, localAddress: "127.0.0.2", headers: { ...creation.headers, "X-Forwarded-For": "203.0.113.99" } });
assert.equal(limitedGrant.status, 429, "The same address budget applies to grant requests");
assert.ok(Number(limitedGrant.headers["retry-after"]) > 0);
assert.equal(limitedGrant.headers["access-control-allow-origin"], website);
assert.equal(limitedGrant.headers["access-control-allow-credentials"], "true");
assert.match(limitedGrant.headers["access-control-expose-headers"], /retry-after/i);
for (const origin of musicPolicy.browser.allowed_origins) {
  const limited = await send(grantPath, { ...creation, localAddress: "127.0.0.2", headers: { ...creation.headers, Origin: origin } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["access-control-allow-origin"], origin);
  assert.equal(limited.headers["access-control-allow-credentials"], "true");
  assert.match(limited.headers["access-control-expose-headers"], /retry-after/i);
}
const forbidden = await send(grantPath, { ...creation, localAddress: "127.0.0.2", headers: { ...creation.headers, Origin: "https://untrusted.example" } });
assert.equal(forbidden.status, 429);
assert.equal(forbidden.headers["access-control-allow-origin"], undefined);
for (const [path, body] of [["/gallery/readyz", "gallery-probe"], ["/auth/session", "auth-probe"]]) {
  const response = await send(path, { localAddress: "127.0.0.2" });
  assert.equal(response.status, 200, "Music exhaustion must preserve unrelated API handlers");
  assert.equal(response.body.toString(), body);
}
assert.equal((await send(grantPath, { ...creation, localAddress: "127.0.0.3" })).status, 201, "A distinct real peer must have its own address limit");
agent.destroy();
process.stdout.write(JSON.stringify({ tls: "verified internal CA and declared hostname", mediaBytes, range: "206", revoked: "410", concurrentListeners: listeners.length,
  renewal: "200 with unchanged playlist", rateLimit: { events, windowSeconds, exhausted: "429", forwardedHeaderBypass: false, distinctPeer: "201", unrelatedHandlers: "Gallery and auth probe upstreams remain available" } }) + "\n");
