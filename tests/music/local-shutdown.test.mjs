// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { access, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const stack = join(root, "local/stack.mjs");

// Test double compiled twice: as `fake-ghttp` it serves the supervisor
// readiness probes, as `docker` it records compose invocations. A compiled
// binary keeps this hermetic without touching file modes.
const fakeSource = `
#include <netinet/in.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

static volatile sig_atomic_t term = 0;
static pid_t tls_child = -1;

static void on_term(int sig) {
  const char message[] = "received signal signal=\\"terminated\\"\\n";
  (void)sig;
  (void)write(STDERR_FILENO, message, sizeof(message) - 1);
  term = 1;
  if (tls_child > 0) kill(tls_child, SIGTERM);
}

static int http_mode(int port) {
  int server = socket(AF_INET, SOCK_STREAM, 0);
  if (server < 0) return 1;
  int reuse = 1;
  setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  address.sin_port = htons((unsigned short)port);
  if (bind(server, (struct sockaddr *)&address, sizeof(address)) != 0) return 1;
  if (listen(server, 16) != 0) return 1;
  static const char response[] = "HTTP/1.1 200 OK\\r\\nContent-Length: 2\\r\\nConnection: close\\r\\nContent-Type: text/plain\\r\\n\\r\\nok";
  while (!term) {
    fd_set readable;
    FD_ZERO(&readable);
    FD_SET(server, &readable);
    struct timeval timeout = {0, 200000};
    int ready = select(server + 1, &readable, NULL, NULL, &timeout);
    if (ready <= 0) continue;
    int connection = accept(server, NULL, NULL);
    if (connection < 0) continue;
    char request[4096];
    (void)read(connection, request, sizeof(request));
    size_t sent = 0;
    while (sent < sizeof(response) - 1) {
      ssize_t count = write(connection, response + sent, sizeof(response) - 1 - sent);
      if (count <= 0) break;
      sent += (size_t)count;
    }
    close(connection);
  }
  close(server);
  return 0;
}

static int https_mode(const char *port, const char *directory) {
  char certificate[4096], key[4096], endpoint[64];
  snprintf(certificate, sizeof(certificate), "%s/cert.pem", directory);
  snprintf(key, sizeof(key), "%s/key.pem", directory);
  snprintf(endpoint, sizeof(endpoint), "127.0.0.1:%s", port);
  pid_t child = fork();
  if (child < 0) return 1;
  if (child == 0) {
    execlp("openssl", "openssl", "s_server", "-accept", endpoint,
           "-cert", certificate, "-key", key, "-www", (char *)NULL);
    _exit(127);
  }
  tls_child = child;
  for (;;) {
    if (term) break;
    int status = 0;
    pid_t done = waitpid(child, &status, WNOHANG);
    if (done == child) return 1;
    usleep(100000);
  }
  int status = 0;
  (void)waitpid(child, &status, 0);
  return 1;
}

int main(int argc, char **argv) {
  const char *base = strrchr(argv[0], '/');
  base = base ? base + 1 : argv[0];
  if (strcmp(base, "docker") == 0) {
    const char *log = getenv("FAKE_DOCKER_LOG");
    FILE *file = log ? fopen(log, "a") : NULL;
    if (!file) return 1;
    for (int index = 0; index < argc; index++) fprintf(file, "%s%s", index ? " " : "", argv[index]);
    fputs("\\n", file);
    fclose(file);
    return 0;
  }
  struct sigaction action;
  memset(&action, 0, sizeof(action));
  action.sa_handler = on_term;
  sigaction(SIGTERM, &action, NULL);
  int tls = 0;
  for (int index = 1; index < argc; index++) {
    if (strcmp(argv[index], "--https") == 0) tls = 1;
  }
  if (argc < 2) return 1;
  // Mirror the observed incident: the plain-HTTP child stops cleanly while
  // the TLS child misses its shutdown deadline and exits 1 on SIGTERM.
  if (tls) return https_mode(argv[1], getenv("FAKE_GHTTP_CERT_DIR") ? getenv("FAKE_GHTTP_CERT_DIR") : "");
  return http_mode(atoi(argv[1]));
}
`;

function socketPath(project) {
  return join(tmpdir(), `site-${createHash("sha256").update(root + project).digest("hex").slice(0, 20)}.sock`);
}

async function freePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

function compile(temporary) {
  const source = join(temporary, "fake-bin.c");
  return writeFile(source, fakeSource).then(() => {
    for (const name of ["fake-ghttp", "docker"]) {
      try {
        execFileSync("cc", ["-O2", "-o", join(temporary, name), source], { stdio: "pipe" });
      } catch (error) {
        assert.fail(`Cannot compile the ${name} test double: ${error.stderr ?? error.message}`);
      }
    }
  });
}

function makeCertificates(directory) {
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "3650",
      "-keyout", join(directory, "key.pem"), "-out", join(directory, "cert.pem"),
      "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "pipe" });
  } catch (error) {
    assert.fail(`Cannot create the test TLS identity: ${error.stderr ?? error.message}`);
  }
  return copyFile(join(directory, "cert.pem"), join(directory, "ca.pem"));
}

test("supervisor stop reports stopped after a child exits nonzero on SIGTERM", { timeout: 120000 }, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "local-shutdown-"));
  t.after(async () => { await rm(temporary, { recursive: true, force: true }); });
  const project = `shutdown-stop-${process.pid}`;
  await rm(socketPath(project), { force: true });
  await compile(temporary);
  await makeCertificates(temporary);
  const environment = {
    ...process.env,
    LOCAL_PROJECT: project,
    UP_PORT: String(await freePort()),
    API_PORT: String(await freePort()),
    PAYMENT_PORT: String(await freePort()),
    GHTTP: join(temporary, "fake-ghttp"),
    LOCAL_CERT_ROOT: temporary,
    FAKE_GHTTP_CERT_DIR: temporary,
    LOCAL_MUSIC_BACKEND: "http://127.0.0.1:9",
    LOCAL_GALLERY_BACKEND: "http://127.0.0.1:9",
    LOCAL_PAYMENT_BACKEND: "http://127.0.0.1:9",
    LOCAL_TAUTH_BACKEND: "http://127.0.0.1:9",
  };
  const supervisor = spawn(process.execPath, [stack, "supervise"], { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  t.after(() => { if (supervisor.exitCode === null && supervisor.signalCode === null) supervisor.kill("SIGKILL"); });
  let stderr = "";
  supervisor.stderr.on("data", (chunk) => { stderr += chunk; });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Supervisor did not become ready: ${stderr}`)), 60000);
    supervisor.once("message", (message) => { clearTimeout(timer); message.ready ? resolve(true) : reject(new Error(message.error)); });
    supervisor.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Supervisor exited (${code}): ${stderr}`)); });
    supervisor.once("error", reject);
  });
  assert.equal(ready, true);
  const reply = await new Promise((resolve, reject) => {
    const connection = createConnection(socketPath(project));
    let result = "";
    connection.on("data", (chunk) => { result += chunk; });
    connection.once("end", () => resolve(result));
    connection.once("error", reject);
    connection.once("connect", () => connection.write("stop\n"));
    connection.setTimeout(30000, () => connection.destroy(new Error("Stop timed out.")));
  });
  assert.equal(reply, "stopped");
  if (supervisor.exitCode === null) await once(supervisor, "exit");
  assert.equal(supervisor.exitCode, 0);
  await assert.rejects(access(socketPath(project)), { code: "ENOENT" });
  assert.match(stderr, /exited with status 1 during shutdown/);
});

test("down runs compose down even when supervisor stop fails", { timeout: 60000 }, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "local-shutdown-"));
  t.after(async () => { await rm(temporary, { recursive: true, force: true }); });
  const project = `shutdown-down-${process.pid}`;
  await rm(socketPath(project), { force: true });
  await compile(temporary);
  const server = createServer((connection) => {
    connection.once("data", () => connection.end("boom"));
  });
  server.listen(socketPath(project));
  await once(server, "listening");
  t.after(() => server.close());
  const log = join(temporary, "docker.log");
  // Run `down` asynchronously: the stub supervisor above shares this event
  // loop and must accept the stop connection while `down` runs.
  const child = spawn(process.execPath, [stack, "down"], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      LOCAL_PROJECT: project,
      UP_PORT: String(await freePort()),
      API_PORT: String(await freePort()),
      PAYMENT_PORT: String(await freePort()),
      LOCAL_CERT_ROOT: temporary,
      FAKE_DOCKER_LOG: log,
      PATH: `${temporary}${delimiter}${process.env.PATH}`,
    },
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const guard = setTimeout(() => child.kill("SIGKILL"), 45000);
  const [code] = await once(child, "exit");
  clearTimeout(guard);
  assert.notEqual(code, 0);
  assert.match(stderr, /boom/);
  const recorded = await readFile(log, "utf8").catch(() => "");
  assert.match(recorded, new RegExp(`compose -p ${project} .* down`));
});
