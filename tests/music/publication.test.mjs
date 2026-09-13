// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir, platform } from "node:os";
import { assertReleaseArtifacts, serviceImages } from "./release-contract.mjs";

const root = resolve(".");
const phase = process.env.MUSIC_QUALIFICATION_PHASE ?? "publication";
assert.ok(["publication", "deployment"].includes(phase), "Select publication or deployment qualification");
const controller = "music-publication-controller", registry = "music-publication-registry";
const registryImage = "registry:3.1.1@sha256:1be55279f18a2fe1a74edf2664cac61c1bea305b7b4642dab412e7affdcb3e33";
const volumes = ["music-publication-registry-data", "music-publication-registry-tls"];
const certDirectory = "/etc/docker/certs.d/ghcr.io";
const hostEntry = "127.0.0.1 ghcr.io # music-publication-qualification\n";
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
function run(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", timeout: 600000, maxBuffer: 16000000, ...options });
  assert.equal(result.status, 0, `${program} ${args.join(" ")}\n${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

test(`Gateway ${phase} uses the exact sealed release and isolated providers`, { timeout: 1800000 }, async () => {
  const selected = JSON.parse(await readFile("output/playwright/release/release-results.json", "utf8"));
  assert.equal(selected.passed, true);
  assert.match(selected.applicationCommit, /^[0-9a-f]{40}$/);
  assert.equal(selected.archive, selected.applicationCommit);
  const source = join(root, "output/playwright/release", selected.archive);
  const release = JSON.parse(await readFile(join(source, "release/receipt.json"), "utf8"));
  assert.equal(release.application.commit, selected.applicationCommit);
  assertReleaseArtifacts(release.artifacts);
  const config = process.env.MUSIC_QUALIFICATION_SSH_CONFIG, host = process.env.MUSIC_QUALIFICATION_HOST;
  assert.ok(config && host, "Select the dedicated isolated SSH host through MUSIC_QUALIFICATION_SSH_CONFIG and MUSIC_QUALIFICATION_HOST");
  const published = join(root, "output/playwright/publication", selected.applicationCommit);
  const evidence = join(root, "output/playwright", phase, selected.applicationCommit);
  if (phase === "deployment") assert.equal(JSON.parse(await readFile(join(published, "publication-results.json"), "utf8")).passed, true);
  await mkdir(evidence, { recursive: true });
  await rm(join(evidence, `${phase}-results.json`), { force: true });
  const directory = await mkdtemp(join(tmpdir(), "music-publication-"));
  const ssh = (command, options = {}) => run("ssh", ["-F", config, host, command], options);
  const remoteDocker = (args, options = {}) => ssh(["docker", ...args].map(quote).join(" "), options);
  let ownsController = false, ownsRegistry = false, ownsVolumes = false, ownsTrust = false, ownsHostEntry = false;
  const failures = [];
  try {
    assert.equal(run("docker", ["ps", "--all", "--filter", `name=^/${controller}$`, "--format", "{{.Names}}"]).trim(), "", "The test controller must be absent");
    assert.equal(remoteDocker(["ps", "--all", "--format", "{{.Names}}"]).trim(), "", "The registry fixture requires a dedicated empty Docker host");
    assert.equal(remoteDocker(["volume", "ls", "--quiet"]).trim(), "", "The registry fixture requires an empty volume set");
    for (const { repository } of serviceImages) assert.equal(remoteDocker(["image", "ls", "--quiet", repository]).trim(), "", "The selected image must be absent before publication");
    assert.equal(ssh("ss -H -ltn '( sport = :443 )'").trim(), "", "The isolated registry HTTPS port must be free");
    ssh(`test ! -e ${quote(certDirectory)}`);
    const originalHosts = ssh("cat /etc/hosts");
    assert.ok(originalHosts.endsWith("\n"), "The isolated hosts file must end with a newline");
    assert.ok(!originalHosts.split("\n").some((line) => line.split("#")[0].trim().split(/\s+/).includes("ghcr.io")), "The isolated host must not have a registry override");
    const settings = Object.fromEntries(run("ssh", ["-G", "-F", config, host]).trim().split("\n").map((line) => { const space = line.indexOf(" "); return [line.slice(0, space), line.slice(space + 1)]; }));
    const controllerNetwork = platform() === "linux" ? ["--network", "host"] : [];
    const sshHostname = settings.hostname === "127.0.0.1" && platform() !== "linux" ? "host.docker.internal" : settings.hostname;
    const tools = join(directory, "tools"); await mkdir(tools);
    const toolsArchive = join(directory, "docker-tools.tar.gz");
    await writeFile(toolsArchive, ssh("tar -czf - -C /usr/bin docker -C /usr/libexec/docker/cli-plugins docker-buildx docker-compose", { encoding: null, maxBuffer: 200000000 }));
    run("tar", ["-xzf", toolsArchive, "-C", tools]);
    const dockerConfig = join(directory, "docker-config"); await mkdir(dockerConfig);
    await writeFile(join(dockerConfig, "config.json"), JSON.stringify({ cliPluginsExtraDirs: ["/qualification/tools"] }));
    const sshConfig = join(directory, "ssh-config");
    await writeFile(sshConfig, `Host music-publication-fixture\n  HostName ${sshHostname}\n  Port ${settings.port}\n  User ${settings.user}\n  IdentityFile /qualification/ssh-key\n  IdentitiesOnly yes\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n`);
    const certificate = join(directory, "registry.crt"), key = join(directory, "registry.key");
    run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-noenc", "-keyout", key, "-out", certificate, "-days", "1", "-subj", "/CN=ghcr.io", "-addext", "subjectAltName=DNS:ghcr.io"]);
    const certificateArchive = join(directory, "registry-certs.tar");
    run("tar", ["--format=ustar", "-cf", certificateArchive, "-C", directory, "registry.crt", "registry.key"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
    remoteDocker(["pull", registryImage]);
    ownsVolumes = true;
    for (const volume of volumes) remoteDocker(["volume", "create", volume]);
    ownsRegistry = true;
    remoteDocker(["create", "--name", registry, "--mount", `type=volume,src=${volumes[0]},dst=/var/lib/registry`, "--mount", `type=volume,src=${volumes[1]},dst=/certs`,
      "--publish", "127.0.0.1:443:5000", "--env", "REGISTRY_HTTP_TLS_CERTIFICATE=/certs/registry.crt", "--env", "REGISTRY_HTTP_TLS_KEY=/certs/registry.key", registryImage]);
    remoteDocker(["cp", "-", `${registry}:/certs`], { input: await readFile(certificateArchive) });
    if (phase === "deployment") remoteDocker(["cp", "-", `${registry}:/var/lib/registry`], { input: await readFile(join(published, "registry-state.tar")) });
    ownsTrust = true;
    ssh(`sudo -n mkdir -p /etc/docker/certs.d && sudo -n mkdir ${quote(certDirectory)}`);
    ssh(`sudo -n tee ${quote(certDirectory + "/ca.crt")} >/dev/null`, { input: await readFile(certificate) });
    ownsHostEntry = true;
    ssh("sudo -n tee /etc/hosts >/dev/null", { input: originalHosts + hostEntry });
    remoteDocker(["start", registry]);
    run("docker", ["build", "-q", "-t", "music-ci:local", "-f", "tests/music/Dockerfile.ci", "."]);
    ownsController = true;
    run("docker", ["run", "--rm", "--name", controller, "--init", ...controllerNetwork, "--add-host", "ghcr.io:127.0.0.2", "--add-host", "tyemirov.net:127.0.0.3",
      "--mount", `type=bind,src=${tools},dst=/qualification/tools,readonly`,
      "--mount", `type=bind,src=${join(tools, "docker")},dst=/usr/local/bin/docker,readonly`,
      "--mount", `type=bind,src=${dockerConfig},dst=/root/.docker`,
      "--mount", `type=bind,src=${sshConfig},dst=/root/.ssh/config,readonly`,
      "--mount", `type=bind,src=${settings.identityfile},dst=/qualification/ssh-key,readonly`,
      "--mount", `type=bind,src=${certificate},dst=/usr/local/share/ca-certificates/music-registry.crt,readonly`,
      "--mount", `type=bind,src=${source},dst=/input,readonly`, "--mount", `type=bind,src=${evidence},dst=/evidence`,
      ...(phase === "deployment" ? ["--mount", `type=bind,src=${published},dst=/published,readonly`] : []),
      "--env", "DOCKER_HOST=ssh://music-publication-fixture", "music-ci:local", "node", `tests/music/sealed-${phase}.mjs`], { stdio: "inherit", timeout: 1700000 });
    await writeFile(join(evidence, "registry-state.tar"), remoteDocker(["cp", `${registry}:/var/lib/registry/.`, "-"], { encoding: null, maxBuffer: 100000000 }));
    await writeFile(join(evidence, "registry.log"), remoteDocker(["logs", registry]));
  } catch (error) { failures.push(error); }
  finally {
    async function cleanup(action) { try { await action(); } catch (error) { failures.push(error); } }
    await cleanup(() => { if (ownsController && run("docker", ["ps", "--all", "--quiet", "--filter", `name=^/${controller}$`]).trim()) run("docker", ["rm", "-f", controller]); });
    await cleanup(() => { if (ownsRegistry && remoteDocker(["ps", "--all", "--quiet", "--filter", `name=^/${registry}$`]).trim()) remoteDocker(["rm", "-f", registry]); });
    if (ownsVolumes) for (const volume of volumes) await cleanup(() => { if (remoteDocker(["volume", "ls", "--quiet", "--filter", `name=^${volume}$`]).trim()) remoteDocker(["volume", "rm", volume]); });
    if (ownsRegistry) for (const { repository } of serviceImages) await cleanup(() => {
      const references = remoteDocker(["image", "ls", "--format", "{{.Repository}}:{{.Tag}}", repository]).trim().split("\n").filter((reference) => reference && !reference.endsWith(":<none>"));
      for (const reference of references) remoteDocker(["image", "rm", reference]);
      const identities = remoteDocker(["image", "ls", "--digests", "--format", "{{.Repository}}@{{.Digest}}", repository]).trim().split("\n").filter((identity) => identity && !identity.endsWith("@<none>"));
      for (const identity of identities) remoteDocker(["image", "rm", identity]);
    });
    if (ownsHostEntry) await cleanup(() => {
      const currentHosts = ssh("cat /etc/hosts");
      assert.ok(currentHosts.includes(hostEntry), "The owned registry mapping must remain identifiable during cleanup");
      ssh("sudo -n tee /etc/hosts >/dev/null", { input: currentHosts.replace(hostEntry, "") });
    });
    if (ownsTrust) await cleanup(() => ssh(`sudo -n rm -rf ${quote(certDirectory)}`));
    await cleanup(() => rm(directory, { recursive: true, force: true }));
  }
  if (failures.length) throw new AggregateError(failures, `${phase} qualification or cleanup failed`);
});
