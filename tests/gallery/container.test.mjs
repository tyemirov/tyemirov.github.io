// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { publishCatalog } from "../../assets/js/catalog.js";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const signingKey = "gallery-container-fixture-signing-key-never-production";
const websiteOrigin = "https://tyemirov.net";
const ownerEmail = "vadym@tyemirov.net";
const tenantID = "tyemirov-gallery";
const cookieName = "tyemirov_gallery_session";
function run(args, timeout = 300000) {
  return spawnSync("docker", args, { encoding: "utf8", timeout, maxBuffer: 4000000, env: { ...process.env, GALLERY_TAUTH_SIGNING_KEY: signingKey } });
}
function success(result) { assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); }
function ownerCookie(email = ownerEmail) {
  const now = Math.floor(Date.now() / 1000);
  const token = [{ alg: "HS256", typ: "JWT" }, { iss: "tauth", user_id: "container-test-owner", user_email: email, tenant_id: tenantID, iat: now - 60, exp: now + 3600 }].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  return `${cookieName}=${token}.${createHmac("sha256", signingKey).update(token).digest("base64url")}`;
}

test("the production gallery image includes its public catalog and keeps private drafts across replacement", { timeout: 600000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "gallery-container-"));
  const name = `gallery-production-test-${process.pid}`;
  const volume = `${name}-data`;
  const image = `gallery-production:f002-test-${process.pid}`;
  let containerCreated = false;
  let volumeCreated = false;
  try {
    success(run(["build", "-q", "--platform", "linux/amd64", "-t", image, "-f", "services/gallery/Dockerfile", "."]));
    assert.equal(success(run(["image", "inspect", image, "--format", "{{.Architecture}}"])), "amd64");
    success(run(["volume", "create", volume])); volumeCreated = true;
    async function start() {
      success(run(["run", "-d", "--name", name, "--read-only", "--env", "GALLERY_TAUTH_SIGNING_KEY", "--mount", `type=volume,src=${volume},dst=/data`, "-p", "127.0.0.1::8093", image,
        "--listen=0.0.0.0:8093", "--database=/data/gallery.db", "--public-root=/site", `--allowed-origin=${websiteOrigin}`, `--cookie-name=${cookieName}`, `--tenant-id=${tenantID}`, `--owner-email=${ownerEmail}`, "--payments=disabled", "--receipts=disabled"]));
      containerCreated = true;
      const deadline = performance.now() + 10000;
      while (true) {
        const logs = run(["logs", name]);
        const text = logs.stdout + logs.stderr;
        if (text.includes("gallery ready")) break;
        assert.equal(success(run(["inspect", name, "--format", "{{.State.Running}}"])), "true", text);
        assert(performance.now() < deadline, "Gallery readiness event absent.");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return `http://127.0.0.1:${success(run(["port", name, "8093/tcp"])).split(":").at(-1)}`;
    }
    let apiOrigin = await start();
    const headers = { Cookie: ownerCookie(), Origin: websiteOrigin };
    assert.equal((await fetch(apiOrigin + "/gallery/readyz")).status, 200);
    assert.equal((await fetch(apiOrigin + "/gallery/draft")).status, 401);
    assert.equal((await fetch(apiOrigin + "/gallery/draft", { headers: { ...headers, Cookie: ownerCookie("other@example.test") } })).status, 403);
    const response = await fetch(apiOrigin + "/gallery/draft", { headers });
    assert.equal(response.status, 200);
    const draft = await response.json();
    const site = JSON.parse(await readFile("data/site.json", "utf8"));
    assert.deepEqual(draft.gallery, site.gallery);
    const publicationResponse = await fetch(apiOrigin + "/gallery/publications", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ draftEtag: response.headers.get("etag"), baseCatalogDigest: (await fetch(apiOrigin+"/gallery/readyz")).headers.get("X-Catalog-Digest") }) });
    assert.equal(publicationResponse.status, 201);
    const publication = await publicationResponse.json();
    const archiveResponse = await fetch(apiOrigin + publication.archiveUrl, { headers });
    assert.equal(archiveResponse.status, 200);
    const archive = join(directory, "publication.zip");
    await writeFile(archive, Buffer.from(await archiveResponse.arrayBuffer()));
    const images = new Set(site.gallery.artworks.flatMap(work => [work.image.cardUrl.slice(1), work.image.lightboxUrl.slice(1)]));
    for (const path of images) {
      const extracted = spawnSync("unzip", ["-p", archive, path], { maxBuffer: 20000000 });
      assert.equal(extracted.status, 0);
      assert.equal(extracted.stdout.equals(await readFile(path)), true, "The publication must keep the packaged public image bytes.");
    }
    const packagedCatalog = join(directory, "site.json");
    success(run(["cp", `${name}:/site/data/site.json`, packagedCatalog]));
    assert.equal(await readFile(packagedCatalog,"utf8"), JSON.stringify(publishCatalog(site),null,2)+"\n");
    for (const path of ["/site/.mprlab/deploy/.env", "/source", "/site/services", "/site/gallery/images/purchased", "/site/.local"]) {
      assert.notEqual(run(["cp", `${name}:${path}`, join(directory, "private-file")]).status, 0, `The image must exclude ${path}.`);
    }
    draft.gallery.description = "Container replacement keeps this owner draft.";
    const saved = await fetch(apiOrigin + "/gallery/draft", { method: "PUT", headers: { ...headers, "Content-Type": "application/json", "If-Match": response.headers.get("etag") }, body: JSON.stringify(draft) });
    assert.equal(saved.status, 200);
    success(run(["stop", name]));
    success(run(["rm", name])); containerCreated = false;
    apiOrigin = await start();
    const restored = await fetch(apiOrigin + "/gallery/draft", { headers });
    assert.equal(restored.headers.get("etag"), saved.headers.get("etag"));
    assert.equal((await restored.json()).gallery.description, draft.gallery.description);
    assert.equal((await fetch(apiOrigin + publication.archiveUrl, { headers })).status, 200);
  } finally {
    if (containerCreated) success(run(["rm", "-f", name]));
    if (volumeCreated) success(run(["volume", "rm", volume]));
    await rm(directory, { recursive: true, force: true });
  }
});
