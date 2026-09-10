// @ts-check
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { access, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:https";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const project = process.env.LOCAL_PROJECT;
if (!project || !/^[a-z0-9][a-z0-9_-]*$/.test(project)) throw new Error("Supply a valid LOCAL_PROJECT through make.");
const state = join(root, ".local/runtime", project);
const site = join(state, "site");
const certificates = resolve(process.env.LOCAL_CERT_ROOT);
const socketPath = join(tmpdir(), `site-${createHash("sha256").update(root + project).digest("hex").slice(0, 20)}.sock`);
const composeArgs = ["compose", "-p", project, "-f", join(root, "compose.local.yml")];
const environment = { ...process.env, LOCAL_SITE_ROOT: site };
const origins = [process.env.UP_PORT, process.env.MUSIC_PORT].map((port) => {
  if (!port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("Supply valid UP_PORT and MUSIC_PORT through make.");
  return `https://localhost:${port}`;
});
if (origins[0] === origins[1]) throw new Error("UP_PORT and MUSIC_PORT must differ.");

/** Run the local project's Compose command. */
function compose(args, capture = false) {
  return execFileSync("docker", [...composeArgs, ...args], { cwd: root, env: environment, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
}

/** Stop the supervisor through its project-specific control socket. */
async function stop() {
  await new Promise((resolve, reject) => {
    const connection = createConnection(socketPath);
    let result = "";
    connection.on("data", (chunk) => { result += chunk; });
    connection.once("end", () => result === "stopped" ? resolve(undefined) : reject(new Error(result || "Local supervisor closed without shutdown confirmation.")));
    connection.once("error", (error) => ["ENOENT", "ECONNREFUSED"].includes(error.code) ? resolve(undefined) : reject(error));
    connection.once("connect", () => connection.write("stop\n"));
    connection.setTimeout(30000, () => connection.destroy(new Error("Local shutdown timed out.")));
  });
  await rm(socketPath, { force: true });
}

/** Verify the local HTTPS endpoint against the CA created by gHTTP. */
async function ready(url) {
  const ca = await readFile(join(certificates, "ca.pem"));
  await new Promise((resolve, reject) => {
    const probe = request(url, { ca, agent: false }, (response) => {
      response.resume();
      response.on("end", () => response.statusCode === 200 ? resolve(undefined) : reject(new Error(`${url}: HTTP ${response.statusCode}`)));
    });
    probe.on("error", reject);
    probe.setTimeout(2000, () => probe.destroy(new Error(`${url}: readiness timed out`)));
    probe.end();
  });
}

/** Reject occupied public ports before containers or certificates are created. */
async function checkPorts() {
  for (const origin of origins) {
    const listener = createServer();
    listener.listen(Number(new URL(origin).port), "127.0.0.1");
    await once(listener, "listening");
    await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve(undefined)));
  }
}

/** Own both gHTTP processes, their shared certificate, and graceful shutdown. */
async function supervise() {
  const children = [];
  let shutdown;
  const server = createServer((connection) => {
    connection.once("data", (command) => {
      if (command.toString() !== "stop\n") return connection.end("Unknown local command.");
      finish().then(() => connection.end("stopped"), (error) => connection.end(error.message));
    });
  });
  const finish = () => shutdown ??= (async () => {
    const failures = [];
    for (const { child, exited } of [...children].reverse()) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      const result = await exited;
      if (result !== 0) failures.push(`gHTTP exited with status ${result}. See ${join(state, "ghttp.log")}.`);
    }
    server.close();
    await rm(socketPath, { force: true });
    if (failures.length) throw new Error(failures.join("\n"));
  })();
  const start = async (args, url) => {
    const child = spawn(process.env.GHTTP, args, {
      cwd: root, stdio: "inherit",
      env: { ...process.env, GHTTP_HTTPS_CERTIFICATE_DIRECTORY: certificates, GHTTPD_DISABLE_DIR_INDEX: "1" },
    });
    const exited = new Promise((resolve) => {
      child.once("exit", (code) => resolve(code));
      child.once("error", (error) => { console.error(error); resolve(1); });
    });
    children.push({ child, exited });
    exited.then(() => {
      if (!shutdown) {
        console.error("A local gHTTP process stopped.");
        finish().catch(console.error);
      }
    });
    const deadline = Date.now() + 30000;
    for (;;) {
      if (shutdown) throw new Error("gHTTP stopped during startup.");
      try { await ready(url); return; }
      catch (error) {
        if (Date.now() >= deadline) throw new Error(`gHTTP did not become ready at ${url}; check certificate installation in ghttp.log.`, { cause: error });
        await delay(100);
      }
    }
  };
  try {
    server.listen(socketPath);
    await once(server, "listening");
    for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => finish().catch(console.error));
    await start([process.env.UP_PORT, "--bind", "127.0.0.1", "--directory", site, "--no-md", "--https", "--https-persist", "--response-header", "/=Cache-Control:no-store"], origins[0] + "/");
    await start([process.env.MUSIC_PORT, "--bind", "127.0.0.1", "--directory", site, "--no-md", "--tls-cert", join(certificates, "localhost.pem"), "--tls-key", join(certificates, "localhost.key"), "--proxy", `/=${process.env.LOCAL_MUSIC_BACKEND}`], origins[1] + "/readyz");
    process.send({ ready: true });
    process.disconnect();
  } catch (error) {
    console.error(error);
    await finish().catch(console.error);
    if (process.connected) { process.send({ error: error.message }); process.disconnect(); }
    process.exitCode = 1;
  }
}

const command = process.argv[2];
if (command === "supervise") {
  await supervise();
} else if (command === "down") {
  await stop();
  compose(["down"]);
} else if (command === "up") {
  await access(join(process.env.MUSIC_LOCAL_ROOT, "selected.json"));
  execFileSync(process.env.GHTTP, ["--help"], { stdio: "ignore" });
  await stop();
  await mkdir(site, { recursive: true });
  try {
    await checkPorts();
    compose(["up", "--build", "--force-recreate", "--detach", "--wait", "--wait-timeout", "60"]);
    await writeFile(join(site, "music/player-config.json"), JSON.stringify({ apiOrigin: origins[1] }) + "\n");
    const backend = compose(["port", "music", "8092"], true).trim();
    console.log("Starting gHTTP with persistent local HTTPS certificates.");
    const log = await open(join(state, "ghttp.log"), "w");
    const worker = spawn(process.execPath, [import.meta.filename, "supervise"], {
      cwd: root, detached: true, stdio: ["ignore", log.fd, log.fd, "ipc"],
      env: { ...environment, LOCAL_MUSIC_BACKEND: `http://${backend}` },
    });
    await log.close();
    await new Promise((resolve, reject) => {
      worker.once("message", (message) => message.ready ? resolve(undefined) : reject(new Error(message.error)));
      worker.once("error", reject);
      worker.once("exit", (code) => reject(new Error(`Local supervisor exited (${code}).`)));
    });
    worker.unref();
    console.log(`Local site: ${origins[0]}\nLocal audio: ${origins[1]}/readyz`);
  } catch (error) {
    await stop();
    compose(["down"]);
    throw new Error(`Local startup failed. See ${join(state, "ghttp.log")}.`, { cause: error });
  }
} else {
  throw new Error("Use make up or make down.");
}
