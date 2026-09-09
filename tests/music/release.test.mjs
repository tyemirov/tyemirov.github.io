// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir, platform } from "node:os";

const root = resolve(".");
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
function run(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", timeout: 1200000, maxBuffer: 16000000, ...options });
  assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

test("the real application release seals its actual artifacts and reuses them on an isolated Docker host", { timeout: 1500000 }, async () => {
  const config = process.env.MUSIC_QUALIFICATION_SSH_CONFIG, host = process.env.MUSIC_QUALIFICATION_HOST;
  assert.ok(config && host, "Select the isolated Linux SSH host through MUSIC_QUALIFICATION_SSH_CONFIG and MUSIC_QUALIFICATION_HOST");
  const directory = await mkdtemp(join(tmpdir(), "music-release-"));
  const container = "music-release-controller";
  const ssh = (command, options = {}) => run("ssh", ["-F", config, host, command], options);
  const remoteDocker = (args) => ssh(["docker", ...args].map(quote).join(" ")).trim();
  let ownsController = false;
  try {
    assert.equal(run("docker", ["ps", "--all", "--filter", `name=^/${container}$`, "--format", "{{.Names}}"]).trim(), "", "The test controller must be absent");
    assert.equal(remoteDocker(["ps", "--all", "--filter", "name=^/buildx_buildkit_music-release-qualification0$", "--format", "{{.Names}}"]), "", "The test builder must be absent");
    const settings = Object.fromEntries(run("ssh", ["-G", "-F", config, host]).trim().split("\n").map((line) => { const space = line.indexOf(" "); return [line.slice(0, space), line.slice(space + 1)]; }));
    const controllerNetwork = platform() === "linux" ? ["--network", "host"] : [];
    const sshHostname = settings.hostname === "127.0.0.1" && platform() !== "linux" ? "host.docker.internal" : settings.hostname;
    const tools = join(directory, "tools"); await mkdir(tools);
    const archive = join(directory, "docker-tools.tar.gz");
    await writeFile(archive, ssh("tar -czf - -C /usr/bin docker -C /usr/libexec/docker/cli-plugins docker-buildx docker-compose", { encoding: null, maxBuffer: 200000000 }));
    run("tar", ["-xzf", archive, "-C", tools]);
    const dockerConfig = join(directory, "docker-config"); await mkdir(dockerConfig);
    await writeFile(join(dockerConfig, "config.json"), JSON.stringify({ cliPluginsExtraDirs: ["/qualification/tools"] }));
    const sshConfig = join(directory, "ssh-config");
    await writeFile(sshConfig, `Host music-release-fixture\n  HostName ${sshHostname}\n  Port ${settings.port}\n  User ${settings.user}\n  IdentityFile /qualification/ssh-key\n  IdentitiesOnly yes\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n`);
    const evidence = join(root, "output/playwright/release"); await mkdir(evidence, { recursive: true });
    await mkdir(join(evidence, "ci"), { recursive: true });
    const bundle = join(directory, "gateway.bundle");
    run("git", ["-C", "../mprlab-gateway", "bundle", "create", bundle, "HEAD"]);
    run("docker", ["build", "-q", "-t", "music-ci:local", "-f", "tests/music/Dockerfile.ci", "."]);
    ownsController = true;
    run("docker", ["run", "--rm", "--name", container, "--init", "--shm-size=1g", ...controllerNetwork,
      "--mount", `type=bind,src=${tools},dst=/qualification/tools,readonly`,
      "--mount", `type=bind,src=${join(tools, "docker")},dst=/usr/local/bin/docker,readonly`,
      "--mount", `type=bind,src=${dockerConfig},dst=/root/.docker`,
      "--mount", `type=bind,src=${sshConfig},dst=/root/.ssh/config,readonly`,
      "--mount", `type=bind,src=${settings.identityfile},dst=/qualification/ssh-key,readonly`,
      "--mount", `type=bind,src=${bundle},dst=/gateway.bundle,readonly`,
      "--mount", `type=bind,src=${evidence},dst=/evidence`,
      "--mount", `type=bind,src=${join(evidence, "ci")},dst=/workspace/output/playwright`,
      "--env", "DOCKER_HOST=ssh://music-release-fixture", "music-ci:local", "node", "tests/music/sealed-release.mjs"], { stdio: "inherit" });
  } finally {
    if (ownsController && run("docker", ["ps", "--all", "--quiet", "--filter", `name=^/${container}$`]).trim()) run("docker", ["rm", "-f", container]);
    if (ownsController && remoteDocker(["ps", "--all", "--quiet", "--filter", "name=^/buildx_buildkit_music-release-qualification0$"])) remoteDocker(["rm", "-f", "buildx_buildkit_music-release-qualification0"]);
    await rm(directory, { recursive: true, force: true });
  }
});
