// @ts-check
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { createServer, get } from "node:https";
import { once } from "node:events";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "../..");
const temporary = await mkdtemp(join(tmpdir(), "music-browser-"));
let media;
let website;
let stopping = false;

async function run(program, args, cwd = root, env = process.env) {
  const child = spawn(program, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
  let stdout = "", stderr = "";
  child.stdout.on("data", (value) => { stdout += value; });
  child.stderr.on("data", (value) => { stderr += value; });
  const [code] = await once(child, "close");
  if (code !== 0) throw new Error(`${program} failed (${code}): ${stderr}`);
  return stdout;
}

async function stop() {
  if (stopping) return;
  stopping = true;
  if (website) { website.closeAllConnections(); await new Promise((resolve) => website.close(resolve)); }
  if (media && media.exitCode === null && media.signalCode === null) { media.kill("SIGTERM"); await once(media, "close"); }
  await rm(temporary, { recursive: true, force: true });
}
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { stop().catch((error) => { process.stderr.write(`${error}\n`); process.exitCode = 1; }); });

try {
  const siteRoot = join(temporary, "site");
  await run("bash", ["scripts/build-pages-artifact.sh"], root, { ...process.env, PAGES_DIST_DIR: siteRoot });
  const source = join(temporary, "tone.wav");
  const mediaRoot = join(temporary, "media");
  await run("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "13", source]);
  const { trackId, ...record } = JSON.parse(await run(process.execPath, ["scripts/music/prepare.mjs", "--source", source, "--media-root", mediaRoot, "--track-id", "test-tone"]));
  const fixtureTracks = [trackId, "soliloquies-vol-i-01", "soliloquies-vol-i-02"];
  const index = join(temporary, "index.json"), allowlist = join(temporary, "allowlist.json");
  await writeFile(index, JSON.stringify({ tracks: Object.fromEntries(fixtureTracks.map((id) => [id, record])) }));
  await writeFile(allowlist, JSON.stringify({ tracks: fixtureTracks.map((id) => ({ id, playback: { kind: "hls", durationMs: record.durationMs } })) }));
  const certificate = join(temporary, "localhost.pem"), key = join(temporary, "localhost-key.pem");
  await run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", certificate, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"]);
  const binary = join(temporary, "music-stream");
  await run("go", ["build", "-o", binary, "./cmd/music-stream"], join(root, "services/music-stream"));
  const bundle = await build({ entryPoints: [join(root, "tests/music/fixture-entry.mjs")], bundle: true, format: "esm", write: false, logLevel: "silent" });
  async function startMedia() {
  media = spawn(binary, ["--listen", "127.0.0.1:18444", "--media-root", mediaRoot, "--index", index, "--allowlist", allowlist, "--public-origin", "https://localhost:18444", "--allowed-origins", "https://localhost:18443", "--tls-cert", certificate, "--tls-key", key], { stdio: ["ignore", "ignore", "pipe"] });
  let mediaLog = "";
  media.stderr.on("data", (value) => { mediaLog = (mediaLog + value).slice(-20000); });
  const deadline = Date.now() + 10000;
  while (true) {
    const ready = await new Promise((resolve) => {
      const request = get("https://127.0.0.1:18444/readyz", { rejectUnauthorized: false, timeout: 1000 }, (response) => { response.resume(); resolve(response.statusCode === 200); });
      request.on("error", () => resolve(false)); request.on("timeout", () => request.destroy());
    });
    if (ready) break;
    if (media.exitCode !== null || Date.now() >= deadline) throw new Error(`Media fixture did not start: ${mediaLog}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  }
  await startMedia();
  const html = `<!doctype html><html lang="en"><head><script defer src="https://loopaware.mprlab.com/pixel.js?site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b&api_origin=https%3A%2F%2Floopaware-api.mprlab.com"></script><meta charset="utf-8"><title>Private HLS acceptance fixture</title><link rel="icon" href="/favicon.png"></head><body><main><h1>Private HLS acceptance fixture</h1><p>Generated 13-second test tone.</p><button id="play">Play test tone</button><button id="renew" disabled>Renew access</button><audio controls preload="none"></audio><p role="status">Ready</p><p>Engine: <output id="engine"></output></p><output id="playlist"></output></main><script type="module" src="/fixture.js"></script></body></html>`;
  website = createServer({ cert: await readFile(certificate), key: await readFile(key) }, async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "POST" && request.url === "/fixture-control/restart") {
      try {
        media.kill("SIGTERM"); await once(media, "close"); await startMedia();
        response.writeHead(204); response.end();
      } catch (error) { response.writeHead(500); response.end("Fixture restart failed"); process.stderr.write(`${error}\n`); }
      return;
    }
    if (request.url === "/healthz") { response.end("ok"); return; }
    if (request.url === "/fixture-media.json") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ tracks: fixtureTracks.slice(1), durationMs: record.durationMs })); return; }
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return; }
    if (request.url === "/fixture/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return; }
    const pathname = new URL(request.url, "https://localhost:18443").pathname;
    const file = resolve(siteRoot, "." + pathname, extname(pathname) === "" ? "index.html" : "");
    if (pathname.includes("%") || !file.startsWith(siteRoot + "/")) { response.writeHead(404); response.end(); return; }
    try {
      const bytes = await readFile(file);
      const type = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon" }[extname(file)];
      if (!type) { response.writeHead(404); response.end(); return; }
      response.setHeader("Content-Type", type); response.end(bytes);
    } catch (error) {
      if (error.code !== "ENOENT") process.stderr.write(`Fixture read failed: ${error.message}\n`);
      response.writeHead(error.code === "ENOENT" ? 404 : 500); response.end();
    }
  });
  website.listen(18443, "127.0.0.1");
  await once(website, "listening");
  process.stdout.write("Music browser fixture ready at https://localhost:18443\n");
} catch (error) {
  await stop(); process.stderr.write(`${error.stack}\n`); process.exitCode = 1;
}
