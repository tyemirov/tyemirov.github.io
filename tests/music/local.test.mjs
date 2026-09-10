// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
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
      response.on("end", () => { const bytes = Buffer.concat(chunks); resolve({ status: response.statusCode, headers: response.headers, body: bytes.toString(), bytes }); });
      response.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error(`Timed out: ${url}`)));
    req.end(body);
  });
}

test("make up serves the site, private music, and persistent gallery; make down retains private data", { timeout: 600000 }, async (t) => {
  // Check the public command before the more expensive fixture setup.
  run("make", ["--dry-run", "up"]);
  const directory = await mkdtemp(join(tmpdir(), "personal-site-local-"));
  const portServer = createServer().listen(0, "127.0.0.1");
  await once(portServer, "listening");
  const port = portServer.address().port;
  const mediaPortServer = createServer().listen(0, "127.0.0.1");
  await once(mediaPortServer, "listening");
  const mediaPort = mediaPortServer.address().port;
  const paymentPortServer = createServer().listen(0, "127.0.0.1");
  await once(paymentPortServer, "listening");
  const paymentPort = paymentPortServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  await new Promise((resolve) => mediaPortServer.close(resolve));
  await new Promise((resolve) => paymentPortServer.close(resolve));
  const origin = `https://localhost:${port}`;
  const mediaOrigin = `https://localhost:${mediaPort}`;
  const galleryOrigin = mediaOrigin;
  const paymentOrigin = `https://localhost:${paymentPort}`;
  const project = `personal-site-test-${process.pid}`;
  const mediaRoot = join(directory, ".local/music");
  const args = [`UP_PORT=${port}`, `API_PORT=${mediaPort}`, `PAYMENT_PORT=${paymentPort}`, `LOCAL_PROJECT=${project}`, `MUSIC_LOCAL_ROOT=${mediaRoot}`, `LOCAL_CERT_ROOT=${process.env.LOCAL_CERT_ROOT}`, `GHTTP=${process.env.GHTTP}`];
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
  assert.equal((await https(origin + "/gallery/studio/")).status, 200);
  const authConfig=JSON.parse((await https(origin + '/config-ui.yaml')).body).environments[0];
  assert.deepEqual(authConfig.origins,[origin]);
  assert.equal(authConfig.auth.tauthUrl,mediaOrigin);
  assert.equal(authConfig.auth.tenantId,'tyemirov-gallery-development');
  const nonce=await https(mediaOrigin+'/auth/nonce',{method:'POST',headers:{Origin:origin,'X-TAuth-Tenant':'tyemirov-gallery-development','X-Requested-With':'XMLHttpRequest'}});
  assert.equal(nonce.status,200);
  assert.ok(JSON.parse(nonce.body).nonce);
  assert.equal((await https(mediaOrigin + "/music/readyz")).status, 200);
  assert.equal((await https(galleryOrigin + "/gallery/readyz")).status, 200);
  assert.equal((await https(paymentOrigin + "/readyz")).status, 200);
  assert.equal((await https(paymentOrigin + "/v2/checkout/orders")).status, 404);
  const forgedEvent = JSON.stringify({ id: "LOCAL-FORGED-EVENT", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "FORGEDCAPTURE", status: "COMPLETED", amount: { currency_code: "USD", value: "12.50" }, supplementary_data: { related_ids: { order_id: "FORGEDORDER" } } } });
  const forged = await https(galleryOrigin + "/gallery/payment-events", { method: "POST", headers: { "Content-Type": "application/json", "Paypal-Auth-Algo": "LOCAL-HMAC-SHA256", "Paypal-Cert-Url": "https://gallery-payment:8095/certificate", "Paypal-Transmission-Id": randomUUID(), "Paypal-Transmission-Time": new Date().toISOString(), "Paypal-Transmission-Sig": "forged" } }, forgedEvent);
  assert.equal(forged.status, 400);
  assert.equal(JSON.parse(forged.body).code, "unverified_payment_event");
  const paymentEnvironmentFile = join(directory, ".local/runtime", project, "payment.env");
  const paymentKey = parseEnv(await readFile(paymentEnvironmentFile, "utf8")).GALLERY_PAYPAL_CLIENT_SECRET;
  assert.equal(typeof paymentKey === "string" && /^[A-Za-z0-9_-]{64}$/.test(paymentKey), true);
  const paymentCertificatePath = join(directory, ".local/runtime", project, "payment-certificate/certificate.pem");
  const paymentCertificate = await readFile(paymentCertificatePath);
  assert.deepEqual(JSON.parse((await https(origin + "/config-site.json")).body), { apiOrigin: galleryOrigin });
  assert.equal((await https(galleryOrigin + "/gallery/assets")).status, 401);
  const environmentFile = join(directory, ".local/runtime", project, "gallery.env");
  const mailEnvironmentFile = join(directory, ".local/runtime", project, "mail.env");
  const mailKey = parseEnv(await readFile(mailEnvironmentFile, "utf8")).GALLERY_PINGUIN_API_KEY;
  assert.equal(typeof mailKey === "string" && /^[A-Za-z0-9_-]{64}$/.test(mailKey), true, "Local startup must generate the mail identity.");
  assert.deepEqual(JSON.parse(make("local-receipts")), { notifications: [] });
  const mailContainer = run("docker", ["ps", "--quiet", "--filter", `label=com.docker.compose.project=${project}`, "--filter", "label=com.docker.compose.service=gallery-mail"]);
  const mailAddress = run("docker", ["port", mailContainer, "50051/tcp"]);
  const seeded = spawnSync("go", ["run", "../../tests/gallery/mail-seed/main.go", `--address=${mailAddress}`], {
    cwd: join(directory, "services/gallery"), env: { ...process.env, GALLERY_PINGUIN_API_KEY: mailKey }, encoding: "utf8", timeout: 120000,
  });
  assert.equal(seeded.status, 0, seeded.stderr);
  const mailID = seeded.stdout.trim();
  const receipts = JSON.parse(make("local-receipts")).notifications;
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].notificationId, mailID);
  assert.equal(receipts[0].status, "SENT");
  assert.equal(receipts[0].message, "Keep this local test message across shutdown.");
  const galleryKey = parseEnv(await readFile(environmentFile, "utf8")).GALLERY_TAUTH_SIGNING_KEY;
  assert.equal(typeof galleryKey === "string" && /^[A-Za-z0-9_-]{64}$/.test(galleryKey), true, "Local startup must generate a gallery signing key.");
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: "tauth", tenant_id: "tyemirov-gallery-development", user_id: "local-resource-test", user_email: "vadym@tyemirov.net", iat: now - 60, exp: now + 3600 };
  const tokenBody = [{ alg: "HS256", typ: "JWT" }, claims].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  const ownerCookie = `tyemirov_gallery_development_session=${tokenBody}.${createHmac("sha256", galleryKey).update(tokenBody).digest("base64url")}`;
  const ownerHeaders = { Cookie: ownerCookie, Origin: origin };
  const draftResponse = await https(galleryOrigin + "/gallery/draft", { headers: ownerHeaders });
  assert.equal(draftResponse.status, 200);
  const draft = JSON.parse(draftResponse.body);
  draft.gallery.description = "Saved gallery draft across local shutdown.";
  const savedDraft = await https(galleryOrigin + "/gallery/draft", { method: "PUT", headers: { ...ownerHeaders, "Content-Type": "application/json", "If-Match": draftResponse.headers.etag } }, JSON.stringify(draft));
  assert.equal(savedDraft.status, 200);
  const original = await readFile(join(directory, "gallery/images/full/third-act-01.png"));
  const uploaded = await https(galleryOrigin + "/gallery/assets", { method: "POST", headers: { ...ownerHeaders, "Content-Type": "image/png" } }, original);
  assert.equal(uploaded.status, 201);
  const assetPath = `/gallery/assets/${JSON.parse(uploaded.body).id}/master`;
  const asset = JSON.parse(uploaded.body);
  site.gallery.artworks[0].offer = { id: "local-test-download", priceCents: 1250, currency: "USD", license: "Local test license.", revision: asset.id, file: { label: "Test original", format: "PNG", width: asset.width, height: asset.height }, deliveryTerms: "Local test delivery after verified payment." };
  await writeFile(sitePath, JSON.stringify(site));
  assert.equal((await https(galleryOrigin + assetPath)).status, 401);
  assert.equal((await https(galleryOrigin + "/gallery/draft", { headers: { ...ownerHeaders, Origin: "https://untrusted.example.test" } })).status, 403);
  assert.deepEqual(JSON.parse((await https(origin + "/config-site.json")).body), { apiOrigin: mediaOrigin });
  for (const path of ["/.git/config", "/.local/music/selected.json", "/services/music-stream/go.mod", "/services/gallery/go.mod", `/.local/runtime/${project}/gallery.env`, `/.local/runtime/${project}/mail.env`, `/.local/runtime/${project}/payment.env`, `/.local/runtime/${project}/payment-certificate/key.pem`, "/gallery.db", "/mail.db", "/payments.db"]) {
    assert.equal((await https(origin + path)).status, 404, path);
  }
  const grantResponse = await https(mediaOrigin + "/music/playback-grants", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" } }, JSON.stringify({ trackId: tracks[0].id }));
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
  assert.equal((await http(mediaOrigin + "/music/readyz", { ca: refreshedCA })).status, 200);
  const afterRebuild = await https(galleryOrigin + "/gallery/draft", { headers: ownerHeaders });
  assert.equal(afterRebuild.status, 200);
  assert.equal(afterRebuild.headers.etag, savedDraft.headers.etag);
  assert.equal(JSON.parse(afterRebuild.body).gallery.description, draft.gallery.description);
  const purchaseBrowser = await chromium.launch({ headless: true });
  let purchasePath;
  let purchaseAccess;
  try {
    const context = await purchaseBrowser.newContext();
    await installSharedUIAssets(context);
    await context.route(/loopaware\.mprlab\.com/, route => route.abort());
    const page = await context.newPage();
    await page.goto(`${origin}/gallery/artworks/${site.gallery.artworks[0].id}/`);
    await page.getByRole("button", { name: "Add to Basket", exact: true }).click();
    await page.getByRole("link", { name: /Basket/ }).click();
    await page.getByRole("link", { name: "Checkout", exact: true }).click();
    await page.getByLabel("Receipt email", { exact: true }).fill("buyer@example.test");
    await page.getByRole("button", { name: "Create order", exact: true }).click();
    await expect(page.getByLabel("Save this access code", { exact: true })).toBeVisible();
    purchaseAccess = await page.getByLabel("Save this access code", { exact: true }).inputValue();
    purchasePath = "/gallery/orders/" + new URL(page.url()).searchParams.get("order");
    await page.getByLabel("I saved my access code and accept this order", { exact: true }).check();
    const popupEvent = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Continue to PayPal", exact: true }).click();
    const popup = await popupEvent;
    await expect(popup).toHaveURL(new RegExp(`^${paymentOrigin}/checkoutnow`));
    await popup.setViewportSize({ width: 390, height: 844 });
    assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "The local approval page must fit a phone viewport.");
    await popup.screenshot({ path: join(root, "output/playwright/homepage-gallery-progress/local-payment-approval.png"), fullPage: true });
    const approvalRequest = popup.waitForRequest(request => request.method() === "POST");
    await popup.getByRole("button", { name: "Approve test payment", exact: true }).focus();
    await popup.getByRole("button", { name: "Approve test payment", exact: true }).press("Enter");
    assert.equal((await approvalRequest).headers().origin, paymentOrigin);
    await expect(popup).toHaveURL(new RegExp(`/gallery/order/\\?order=${purchasePath.slice(16)}$`));
    await popup.close();
    await page.getByRole("button", { name: "Complete approved payment", exact: true }).click();
    await expect.poll(async () => JSON.parse((await https(galleryOrigin + purchasePath, { headers: { Authorization: "Bearer " + purchaseAccess } })).body).status, { timeout: 15000 }).toBe("complete");
    await page.getByRole("button", { name: "Check payment status", exact: true }).click();
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download original", exact: true }).click();
    assert.equal((await readFile(await (await downloaded).path())).equals(original), true, "Local checkout must deliver the purchased original.");
    await expect.poll(async () => JSON.parse((await https(galleryOrigin + purchasePath, { headers: { Authorization: "Bearer " + purchaseAccess } })).body).receipt?.status, { timeout: 45000 }).toBe("sent");
    const messages = JSON.parse(make("local-receipts")).notifications;
    assert.equal(messages.length, 2);
    assert.equal(messages.some(message => message.message.includes("Access code: " + purchaseAccess)), true, "The local mail sink must receive the purchase receipt.");
  } finally { await purchaseBrowser.close(); }
  const pendingResponse = await https(galleryOrigin + "/gallery/orders", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": randomUUID() } }, JSON.stringify({ offerIds: ["local-test-download"], email: "second-buyer@example.test", catalogDigest: createHash("sha256").update((await https(origin + "/data/site.json")).bytes).digest("hex") }));
  assert.equal(pendingResponse.status, 201);
  const pendingPurchase = JSON.parse(pendingResponse.body);
  const pendingProviderID = new URL(pendingPurchase.order.approvalUrl).searchParams.get("token");
  assert.equal((await https(`${paymentOrigin}/local-orders/${pendingProviderID}/approvals`, { method: "POST", headers: { Origin: "https://untrusted.example.test" } })).status, 403);
  const pendingApproval = await https(`${paymentOrigin}/local-orders/${pendingProviderID}/approvals`, { method: "POST", headers: { Origin: paymentOrigin } });
  assert.equal(pendingApproval.status, 303);
  make("down");
  await assert.rejects(https(origin + "/"));
  await assert.rejects(https(mediaOrigin + "/music/readyz"));
  await assert.rejects(https(galleryOrigin + "/gallery/readyz"));
  await assert.rejects(https(paymentOrigin + "/readyz"));
  const volumes = run("docker", ["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
  assert.ok(volumes.includes(`${project}_media`));
  assert.ok(volumes.includes(`${project}_gallery-data`));
  assert.ok(volumes.includes(`${project}_gallery-mail-data`));
  assert.ok(volumes.includes(`${project}_gallery-payment-data`));
  assert.equal(parseEnv(await readFile(mailEnvironmentFile, "utf8")).GALLERY_PINGUIN_API_KEY === mailKey, true, "Shutdown must keep the local mail identity.");
  assert.equal(parseEnv(await readFile(paymentEnvironmentFile, "utf8")).GALLERY_PAYPAL_CLIENT_SECRET === paymentKey, true, "Shutdown must keep the local payment identity.");
  assert.equal((await readFile(paymentCertificatePath)).equals(paymentCertificate), true, "Shutdown must keep the private provider certificate.");
  assert.equal(parseEnv(await readFile(environmentFile, "utf8")).GALLERY_TAUTH_SIGNING_KEY === galleryKey, true, "Shutdown must retain the local gallery identity.");
  assert.deepEqual(await readFile(certificatePath), ca);
  make("up");
  assert.equal(JSON.parse(make("local-receipts")).notifications.some(message => JSON.stringify(message) === JSON.stringify(receipts[0])), true);
  const retainedOrder = JSON.parse((await https(galleryOrigin + purchasePath, { headers: { Authorization: "Bearer " + purchaseAccess } })).body);
  assert.equal(retainedOrder.status, "complete");
  assert.equal(retainedOrder.receipt.status, "sent");
  const pendingPath = "/gallery/orders/" + pendingPurchase.order.id;
  const pendingHeaders = { Origin: origin, "Content-Type": "application/json", Authorization: "Bearer " + pendingPurchase.accessSecret };
  const resumedCapture = await https(galleryOrigin + pendingPath + "/captures", { method: "POST", headers: pendingHeaders }, "{}");
  assert.equal([200,202].includes(resumedCapture.status), true, "An approved local provider order must survive restart.");
  await expect.poll(async () => JSON.parse((await https(galleryOrigin + pendingPath, { headers: pendingHeaders })).body).status, { timeout: 15000 }).toBe("complete");
  const restoredDraft = await https(galleryOrigin + "/gallery/draft", { headers: ownerHeaders });
  assert.equal(restoredDraft.status, 200);
  assert.equal(restoredDraft.headers.etag, savedDraft.headers.etag);
  assert.equal(JSON.parse(restoredDraft.body).gallery.description, draft.gallery.description);
  const restoredMaster = await https(galleryOrigin + assetPath, { headers: ownerHeaders });
  assert.equal(restoredMaster.status, 200);
  assert.equal(restoredMaster.bytes.equals(original), true, "The retained gallery volume must keep exact private image bytes.");
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
