// @ts-check
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { hostname, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const GRANTS = "/music/playback-grants";
const PUBLIC_ORIGIN = "https://music-load.example.invalid";
const WEBSITE_ORIGIN = "https://website.example.invalid";
const TRACK = "load-noise";
const REQUEST_KINDS = ["grant", "playlist", "initialization", "segment", "seek", "revoke"];
/** @typedef {{cookie: string, address: string}} Session */
/** @typedef {{session: Session, id: string, playlistPath: string, segments: Array<{path: string, seconds: number}>}} Listener */

function run(program, args, cwd = resolve(".")) {
  const result = spawnSync(program, args, { cwd, encoding: "utf8", timeout: 60000, maxBuffer: 4000000 });
  if (result.error || result.status !== 0) throw new Error(`Load fixture ${program} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}

function integer(value, name, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  return number;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : 0;
}

async function main() {
  const { values } = parseArgs({ strict: true, options: {
    listeners: { type: "string", default: "100" }, seconds: { type: "string", default: "900" },
    "seek-every": { type: "string", default: "60" }, report: { type: "string", default: "output/playwright/load-results.json" },
  } });
  const listeners = integer(values.listeners, "listeners", 2, 200);
  if (listeners % 2 !== 0) throw new Error("listeners must be even for two tabs per session");
  const seconds = integer(values.seconds, "seconds", 1, 900);
  const seekEvery = integer(values["seek-every"], "seek-every", 6, 900);
  const reportPath = resolve(values.report);
  const directory = await mkdtemp(join(tmpdir(), "music-load-"));
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  let service;
  let sampleTimer;
  let progressTimer;
  let serviceClosed;
  try {
    const source = join(directory, "noise.wav"), mediaRoot = join(directory, "media");
    run("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "anoisesrc=sample_rate=48000:amplitude=0.1:seed=1", "-t", "180", source]);
    const receipt = JSON.parse(run(process.execPath, ["scripts/music/prepare.mjs", "--source", source, "--media-root", mediaRoot, "--track-id", TRACK]));
    const { trackId, ...record } = receipt;
    const index = join(directory, "index.json"), allowlist = join(directory, "allowlist.json"), binary = join(directory, "music-stream");
    await writeFile(index, JSON.stringify({ tracks: { [trackId]: record } }));
    await writeFile(allowlist, JSON.stringify({ tracks: [{ id: trackId, playback: { kind: "hls", durationMs: record.durationMs } }] }));
    run("go", ["build", "-o", binary, "./cmd/music-stream"], resolve("services/music-stream"));
    service = spawn(binary, ["--listen", "127.0.0.1:0", "--media-root", mediaRoot, "--index", index, "--allowlist", allowlist,
      "--public-origin", PUBLIC_ORIGIN, "--allowed-origins", WEBSITE_ORIGIN],
    { env: { ...process.env, MUSIC_TRUSTED_PROXIES: "127.0.0.1/32" }, stdio: ["ignore", "ignore", "pipe"] });
    serviceClosed = once(service, "close");
    const address = await new Promise((resolveReady, reject) => {
      let pending = "";
      const timer = setTimeout(() => reject(new Error("Load service startup timed out")), 10000);
      service.once("error", (error) => { clearTimeout(timer); reject(error); });
      service.once("exit", () => { clearTimeout(timer); reject(new Error("Load service exited before readiness")); });
      service.stderr.on("data", (chunk) => {
        pending += chunk;
        let newline;
        while ((newline = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
          const entry = JSON.parse(line);
          if (entry.msg === "music_service_ready") { clearTimeout(timer); resolveReady(entry.address); }
        }
      });
    });
    if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error("Load service returned an invalid loopback address");
    const origin = `http://${address}`;
    const statistics = Object.fromEntries(REQUEST_KINDS.map((kind) => [kind, { count: 0, statuses: {}, milliseconds: [] }]));
    let unexpectedResponses = 0, networkErrors = 0, mediaBytes = 0, completedListeners = 0;
    const failures = [];
    async function request(kind, path, session, method = "GET", body) {
      const stats = statistics[kind]; stats.count++;
      const started = performance.now();
      let response, bytes;
      try {
        response = await fetch(origin + path, { method, redirect: "error", signal: AbortSignal.timeout(10000),
          headers: { Origin: WEBSITE_ORIGIN, "X-Forwarded-For": session.address, ...(session.cookie ? { Cookie: session.cookie } : {}),
            ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        bytes = Buffer.from(await response.arrayBuffer());
      } catch {
        networkErrors++;
        throw new Error(`${kind} transport failed`);
      } finally { stats.milliseconds.push(performance.now() - started); }
      stats.statuses[response.status] = (stats.statuses[response.status] ?? 0) + 1;
      const expected = kind === "grant" ? 201 : kind === "revoke" ? 204 : 200;
      if (response.status !== expected) { unexpectedResponses++; throw new Error(`${kind} returned HTTP ${response.status}`); }
      if (["initialization", "segment", "seek"].includes(kind)) mediaBytes += bytes.length;
      return { response, bytes };
    }
    function mediaPath(url) {
      const parsed = new URL(url);
      if (parsed.origin !== PUBLIC_ORIGIN || parsed.search || parsed.hash || !/^\/music\/hls\/[A-Za-z0-9_-]{22}\/[a-f0-9]{64}\/(index\.m3u8|init\.mp4|seg-\d{5}\.m4s)$/.test(parsed.pathname)) throw new Error("Invalid load media reference");
      return parsed.pathname;
    }
    /** @type {Listener[]} */
    const active = [];
    async function startListener(session) {
      const { response, bytes } = await request("grant", GRANTS, session, "POST", { trackId: TRACK });
      if (!session.cookie) {
        const cookies = response.headers.getSetCookie();
        if (cookies.length !== 1 || !cookies[0].startsWith("__Secure-music-session=")) throw new Error("Load session cookie is absent");
        session.cookie = cookies[0].split(";")[0];
      }
      const grant = JSON.parse(bytes.toString());
      const playlistPath = mediaPath(grant.playlistUrl);
      if (!/^[A-Za-z0-9_-]{22}$/.test(grant.grantId) || !playlistPath.startsWith(`/music/hls/${grant.grantId}/`)) throw new Error("Invalid load grant identity");
      const listener = { session, id: grant.grantId, playlistPath, segments: [] };
      active.push(listener);
      const playlist = (await request("playlist", playlistPath, session)).bytes.toString();
      const lines = playlist.trim().split(/\r?\n/);
      if (!lines.includes('#EXT-X-MAP:URI="init.mp4"') || lines.at(-1) !== "#EXT-X-ENDLIST") throw new Error("Invalid load playlist");
      for (let position = 0; position < lines.length; position++) {
        if (!lines[position].startsWith("#EXTINF:")) continue;
        const duration = Number(lines[position].slice(8).replace(/,$/, ""));
        if (!Number.isFinite(duration) || duration <= 0 || duration > 7) throw new Error("Invalid load segment duration");
        listener.segments.push({ path: mediaPath(new URL(lines[position + 1], grant.playlistUrl).href), seconds: duration });
      }
      if (!listener.segments.length) throw new Error("Load playlist has no segments");
      await request("initialization", mediaPath(new URL("init.mp4", grant.playlistUrl).href), session);
    }
    const starts = await Promise.allSettled(Array.from({ length: listeners / 2 }, async (_, index) => {
      const session = { cookie: "", address: `198.18.0.${index + 1}` };
      await startListener(session); await startListener(session);
    }));
    for (const result of starts) if (result.status === "rejected") failures.push(result.reason.message);

    const resourceSamples = [];
    const ticks = platform() === "linux" ? Number(run("getconf", ["CLK_TCK"]).trim()) : null;
    async function sampleResources() {
      if (ticks === null) return;
      const base = `/proc/${service.pid}`;
      const [stat, status, io] = await Promise.all([readFile(`${base}/stat`, "utf8"), readFile(`${base}/status`, "utf8"), readFile(`${base}/io`, "utf8")]);
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const field = (text, name) => Number(text.match(new RegExp(`^${name}:\\s+(\\d+)`, "m"))[1]);
      resourceSamples.push({ time: performance.now(), cpuSeconds: (Number(fields[11]) + Number(fields[12])) / ticks,
        rssBytes: field(status, "VmRSS") * 1024, diskReadBytes: field(io, "read_bytes"), diskWriteBytes: field(io, "write_bytes") });
    }
    await sampleResources();
    sampleTimer = setInterval(() => sampleResources().catch(() => { failures.push("Service resource sampling failed"); cancel(); }), 5000);
    const started = performance.now(), end = started + seconds * 1000;
    progressTimer = setInterval(() => process.stdout.write(JSON.stringify({ loadProgress: true, elapsedSeconds: Math.floor((performance.now() - started) / 1000), mediaBytes, unexpectedResponses, networkErrors }) + "\n"), 30000);
    if (!failures.length) {
      const runs = await Promise.allSettled(active.map(async (listener) => {
        let position = 0, due = started, nextSeek = started + seekEvery * 1000;
        while (performance.now() < end && !cancellation.signal.aborted) {
          if (performance.now() >= nextSeek) {
            position = (position + Math.floor(listener.segments.length / 2)) % listener.segments.length;
            await Promise.all([0, 1].map((offset) => request("seek", listener.segments[(position + offset) % listener.segments.length].path, listener.session)));
            nextSeek += seekEvery * 1000;
          }
          const segment = listener.segments[position];
          await request("segment", segment.path, listener.session);
          position = (position + 1) % listener.segments.length;
          due += segment.seconds * 1000;
          await sleep(Math.max(0, Math.min(due, end) - performance.now()), undefined, { signal: cancellation.signal });
        }
        if (cancellation.signal.aborted) throw new Error("Load run cancelled");
        completedListeners++;
      }));
      for (const result of runs) if (result.status === "rejected") failures.push(result.reason.message);
    }
    const durationMs = performance.now() - started;
    clearInterval(sampleTimer); clearInterval(progressTimer);
    await sampleResources();
    const revocations = await Promise.allSettled(active.map((listener) => request("revoke", `${GRANTS}/${listener.id}`, listener.session, "DELETE")));
    for (const result of revocations) if (result.status === "rejected") failures.push(result.reason.message);
    const requestCount = Object.values(statistics).reduce((sum, entry) => sum + entry.count, 0);
    const errorFraction = (unexpectedResponses + networkErrors) / requestCount;
    const first = resourceSamples[0], last = resourceSamples.at(-1);
    const resources = first ? { scope: "service-process", samples: resourceSamples.length, cpuSeconds: last.cpuSeconds - first.cpuSeconds,
      meanCPUPercentOfOneCore: 100000 * (last.cpuSeconds - first.cpuSeconds) / (last.time - first.time),
      peakRSSBytes: Math.max(...resourceSamples.map((sample) => sample.rssBytes)),
      diskReadBytes: last.diskReadBytes - first.diskReadBytes, diskWriteBytes: last.diskWriteBytes - first.diskWriteBytes } : null;
    const report = { passed: !failures.length && completedListeners === listeners && errorFraction < 0.001 && percentile(statistics.grant.milliseconds, 0.95) < 250,
      host: { hostname: hostname(), platform: platform(), architecture: process.arch }, transport: "loopback-http", consumers: "simulated-segment-clients",
      source: { kind: "generated-noise", durationMs: record.durationMs, assetId: record.assetId }, listeners, sessions: listeners / 2, completedListeners,
      requestedSeconds: seconds, seekEverySeconds: seekEvery, durationMs, mediaBytes, meanMediaMbps: mediaBytes * 8 / durationMs / 1000,
      unexpectedResponses, networkErrors, errorFraction, failures: [...new Set(failures)], resources,
      requests: Object.fromEntries(Object.entries(statistics).map(([kind, stats]) => [kind, { count: stats.count, statuses: stats.statuses,
        p50Ms: percentile(stats.milliseconds, 0.5), p95Ms: percentile(stats.milliseconds, 0.95), maxMs: Math.max(0, ...stats.milliseconds) }])) };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ loadComplete: true, passed: report.passed, report: reportPath }) + "\n");
    if (!report.passed) process.exitCode = 1;
  } finally {
    clearInterval(sampleTimer); clearInterval(progressTimer);
    if (service && service.exitCode === null && service.signalCode === null) { service.kill("SIGTERM"); await serviceClosed; }
    await rm(directory, { recursive: true, force: true });
    process.off("SIGINT", cancel); process.off("SIGTERM", cancel);
  }
}

main().catch((error) => { process.stderr.write(`Music load failed: ${error.message}\n`); process.exitCode = 1; });
