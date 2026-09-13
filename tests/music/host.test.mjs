// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");
const gateway = resolve("../mprlab-gateway");
const serviceImage = "music-stream:f001-host";
const preparationImage = "music-prepare:f001-host";
const container = "music-host-qualification";
const volumeName = "tyemirov-site-music-media";
const proxyContainer = "music-host-caddy";
const proxyVolume = "music-host-caddy-data";
const proxyImage = "docker.io/library/caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648";
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

function run(program, args, options = {}) {
  return spawnSync(program, args, { cwd: root, encoding: "utf8", timeout: 180000, maxBuffer: 8000000, ...options });
}
function success(result) {
  assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

test("Gateway creates a retained volume and the declared AMD64 music service uses its private media on an isolated host", { timeout: 360000 }, async () => {
  const config = process.env.MUSIC_QUALIFICATION_SSH_CONFIG;
  const host = process.env.MUSIC_QUALIFICATION_HOST;
  assert.ok(config && host, "Set MUSIC_QUALIFICATION_SSH_CONFIG and MUSIC_QUALIFICATION_HOST to the isolated test host");
  assert.ok(process.env.ANSIBLE_PLAYBOOK, "Set ANSIBLE_PLAYBOOK to the Gateway toolchain");
  const ssh = (command, input) => run("ssh", ["-F", config, host, command], { input });
  const remoteDocker = (args, input) => ssh(["docker", ...args].map(quote).join(" "), input);
  const directory = await mkdtemp(join(tmpdir(), "music-host-"));
  let ownsVolume = false, ownsContainer = false, ownsServiceImage = false, ownsPreparationImage = false;
  let ownsProxy = false, ownsProxyVolume = false;
  try {
    assert.equal(success(remoteDocker(["ps", "--all", "--filter", `name=^/${container}$`, "--format", "{{.Names}}"])), "", "The test container must be absent before qualification");
    assert.equal(success(remoteDocker(["volume", "ls", "--quiet", "--filter", `name=^${volumeName}$`])), "", "The selected test volume must be absent before qualification");
    for (const image of [serviceImage, preparationImage]) assert.equal(success(remoteDocker(["image", "ls", "--quiet", image])), "", "The test image must be absent before qualification");
    assert.equal(success(remoteDocker(["ps", "--all", "--filter", `name=^/${proxyContainer}$`, "--format", "{{.Names}}"])), "", "The proxy test container must be absent");
    assert.equal(success(remoteDocker(["volume", "ls", "--quiet", "--filter", `name=^${proxyVolume}$`])), "", "The proxy test volume must be absent");
    assert.equal(success(ssh("ss -H -ltn '( sport = :80 or sport = :443 )'")), "", "The isolated host must have free HTTP and HTTPS listener ports");
    const sshSettings = Object.fromEntries(success(run("ssh", ["-G", "-F", config, host])).split("\n").map((line) => {
      const space = line.indexOf(" "); return [line.slice(0, space), line.slice(space + 1)];
    }));
    const inventory = join(directory, "inventory.json"), selected = join(directory, "selected.json");
    await writeFile(inventory, JSON.stringify({ all: { hosts: { fixture: {
      ansible_host: sshSettings.hostname, ansible_port: Number(sshSettings.port), ansible_user: sshSettings.user,
      ansible_ssh_private_key_file: sshSettings.identityfile, ansible_ssh_common_args: `-F ${quote(config)}`,
    } } } }));
    const variables = join(directory, "vars.json"), caddyConfig = join(directory, "Caddyfile");
    await writeFile(variables, JSON.stringify({ application_manifest: join(root, ".mprlab/deploy/resources.yml"), gateway_root: gateway, selected_contract: selected, selected_caddy_config: caddyConfig, expected_volume: volumeName }));
    const logs = join(root, "output/playwright/host"); await mkdir(logs, { recursive: true });
    async function reconcile(label) {
      const result = run(process.env.ANSIBLE_PLAYBOOK, ["-i", inventory, "tests/music/host-volume.yml", "--extra-vars", `@${variables}`]);
      await writeFile(join(logs, `${label}.log`), result.stdout + result.stderr);
      success(result);
    }
    ownsVolume = true;
    await reconcile("volume-create");
    const contract = JSON.parse(await readFile(selected, "utf8"));
    assert.equal(contract.volume, volumeName);
    const volume = JSON.parse(success(remoteDocker(["volume", "inspect", contract.volume])))[0];
    assert.equal(volume.Labels["com.mprlab.owner"], contract.owner);
    assert.equal(volume.Labels["com.mprlab.retention"], "retain");

    success(run("docker", ["build", "-q", "--platform", "linux/amd64", "-t", serviceImage, "services/music-stream"]));
    success(run("docker", ["build", "-q", "-t", preparationImage, "-f", "scripts/music/Dockerfile", "scripts/music"]));
    for (const [image, file] of [[serviceImage, "service.tar"], [preparationImage, "preparation.tar"]]) {
      const archive = join(directory, file);
      success(run("docker", ["image", "save", "-o", archive, image]));
      if (image === serviceImage) ownsServiceImage = true; else ownsPreparationImage = true;
      success(remoteDocker(["image", "load"], await readFile(archive)));
    }
    assert.equal(success(remoteDocker(["image", "inspect", serviceImage, "--format", "{{.Architecture}}"])), "amd64");
    success(remoteDocker(["run", "--rm", "--network", "none", "--platform", "linux/amd64", serviceImage, "--help"]));
    const source = join(directory, "tone.wav"), mediaRoot = join(directory, "media");
    success(run("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "13", source]));
    const receipt = JSON.parse(success(run(process.execPath, ["scripts/music/prepare.mjs", "--source", source, "--media-root", mediaRoot, "--track-id", "test-tone"])));
    const { trackId, ...record } = receipt;
    await writeFile(join(mediaRoot, "selected.json"), JSON.stringify({ tracks: { [trackId]: record } }));
    await writeFile(join(mediaRoot, "allowlist.json"), JSON.stringify({ tracks: [{ id: trackId, playback: { kind: "hls", durationMs: record.durationMs } }] }));
    const mediaArchive = join(directory, "media.tar.gz");
    success(run("tar", ["-czf", mediaArchive, "-C", mediaRoot, "."]));
    const mount = ["--mount", `type=volume,src=${contract.volume},dst=/media`];
    success(remoteDocker(["run", "--rm", "-i", "--network", "none", ...mount, "--entrypoint", "tar", preparationImage, "-xzf", "-", "-C", "/media"], await readFile(mediaArchive)));
    const validate = () => success(remoteDocker(["run", "--rm", "--network", "none", "--platform", "linux/amd64", ...mount, "--entrypoint", "/music-media", serviceImage,
      "validate", "--media-root", "/media", "--index", "/media/selected.json", "--allowlist", "/media/allowlist.json"]));
    validate();
    const client = `
      const origin = 'http://127.0.0.1:8092';
      const check = (actual, expected) => { if (actual !== expected) throw new Error('HTTP status ' + actual + ', expected ' + expected); };
      check((await fetch(origin + '/music/readyz')).status, 200);
      const response = await fetch(origin + '/music/playback-grants', {method:'POST', headers:{Origin:'https://tyemirov.net','Content-Type':'application/json','X-Forwarded-For':'203.0.113.1'}, body:JSON.stringify({trackId:'test-tone'})});
      check(response.status, 201);
      const cookie = response.headers.getSetCookie()[0].split(';')[0];
      const grant = await response.json(), playlist = new URL(grant.playlistUrl);
      if (playlist.origin !== 'https://api.tyemirov.net') throw new Error('Incorrect declared media origin');
      for (const name of ['index.m3u8','init.mp4','seg-00000.m4s']) {
        const path = new URL(name, playlist).pathname;
        check((await fetch(origin + path)).status, 401);
        const media = await fetch(origin + path, {headers:{Cookie:cookie}});
        check(media.status, 200);
        if (!(await media.arrayBuffer()).byteLength) throw new Error('Empty media response');
      }
      check((await fetch(origin + '/music/playback-grants/' + grant.grantId, {method:'DELETE',headers:{Origin:'https://tyemirov.net',Cookie:cookie}})).status, 204);
      process.stdout.write('readiness, declared origins, protected media, and grant removal passed\\n');
    `;
    async function startAndCheck(environment = []) {
      ownsContainer = true;
      success(remoteDocker(["run", "-d", "--name", container, "--platform", "linux/amd64", "--read-only",
        "--mount", `type=volume,src=${contract.volume},dst=/media,readonly`, "-p", "127.0.0.1:8092:8092", ...environment, serviceImage, ...contract.service.command]));
      const deadline = performance.now() + 10000;
      while (true) {
        const result = remoteDocker(["logs", container]);
        assert.equal(result.status, 0, result.stderr);
        const output = result.stdout + result.stderr;
        if (output.includes('"msg":"music_service_ready"')) break;
        assert.equal(success(remoteDocker(["inspect", container, "--format", "{{.State.Running}}"])), "true", output);
        assert.ok(performance.now() < deadline, "Service readiness event absent");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return success(remoteDocker(["run", "--rm", "-i", "--network", "host", "--entrypoint", "node", preparationImage, "--input-type=module", "-"], client));
    }
    await startAndCheck();
    success(remoteDocker(["rm", "-f", container])); ownsContainer = false;
    await reconcile("volume-retain");
    validate();
    const result = await startAndCheck();

    success(remoteDocker(["rm", "-f", container])); ownsContainer = false;
    const proxyPeer = success(remoteDocker(["network", "inspect", "bridge", "--format", "{{(index .IPAM.Config 0).Gateway}}"]));
    assert.match(proxyPeer, /^\d+\.\d+\.\d+\.\d+$/);
    const binding = contract.service.environment.MUSIC_TRUSTED_PROXIES;
    assert.equal(binding.resource, "private");
    assert.equal(binding.output, "trusted-proxies");
    await startAndCheck(["--env", `MUSIC_TRUSTED_PROXIES=${proxyPeer}/32`]);
    success(remoteDocker(["pull", proxyImage]));
    ownsProxyVolume = true;
    success(remoteDocker(["volume", "create", proxyVolume]));
    const proxyMount = ["--mount", `type=volume,src=${proxyVolume},dst=/data`];
    const configArchive = join(directory, "caddy.tar.gz");
    success(run("tar", ["-czf", configArchive, "-C", directory, "Caddyfile"]));
    success(remoteDocker(["run", "--rm", "-i", "--network", "none", ...proxyMount, "--entrypoint", "tar", preparationImage, "-xzf", "-", "-C", "/data"], await readFile(configArchive)));
    const proxyArguments = [...proxyMount, "--env", "ADMIN_EMAIL=fixture@example.invalid", proxyImage];
    success(remoteDocker(["run", "--rm", "--network", "none", ...proxyArguments, "caddy", "validate", "--config", "/data/Caddyfile", "--adapter", "caddyfile"]));
    ownsProxy = true;
    success(remoteDocker(["run", "-d", "--name", proxyContainer, "--network", "host", ...proxyArguments, "caddy", "run", "--config", "/data/Caddyfile", "--adapter", "caddyfile"]));
    const proxyDeadline = performance.now() + 15000;
    while (true) {
      const logs = remoteDocker(["logs", proxyContainer]);
      assert.equal(logs.status, 0, logs.stderr);
      if (logs.stderr.includes('"msg":"certificate obtained successfully"') && logs.stderr.includes('"msg":"server running"')) break;
      assert.equal(success(remoteDocker(["inspect", proxyContainer, "--format", "{{.State.Running}}"])), "true", logs.stderr);
      assert.ok(performance.now() < proxyDeadline, `Proxy certificate readiness absent: ${logs.stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const proxyResult = JSON.parse(success(remoteDocker(["run", "--rm", "-i", "--network", "host", "--mount", `type=volume,src=${proxyVolume},dst=/data,readonly`, "--entrypoint", "node", preparationImage, "--input-type=module", "-"], await readFile("tests/music/host-proxy-client.mjs", "utf8"))));
    const proxyLogs = remoteDocker(["logs", proxyContainer]);
    assert.equal(proxyLogs.status, 0, proxyLogs.stderr);
    assert.ok(!(proxyLogs.stdout + proxyLogs.stderr).includes("__Secure-music-session="), "Proxy logs must exclude cookies");
    assert.ok(!(proxyLogs.stdout + proxyLogs.stderr).includes("/hls/"), "Proxy logs must exclude authorized media URLs");
    await writeFile(join(logs, "proxy.log"), proxyLogs.stdout + proxyLogs.stderr);
    const evidence = { passed: true, host, kernel: success(ssh("uname -srmo")), serviceArchitecture: "amd64", source: "generated-tone",
      volumeCreation: "Gateway retained-volume task", mediaTransfer: "private archive over SSH", containerReplacement: "media retained", runtime: result,
      proxy: { image: proxyImage, configuration: "Gateway Caddy template with the declared media route", ...proxyResult } };
    await writeFile(join(logs, "host-results.json"), JSON.stringify(evidence, null, 2) + "\n");
    process.stdout.write(JSON.stringify(evidence) + "\n");
  } finally {
    if (ownsProxy && success(remoteDocker(["ps", "--all", "--quiet", "--filter", `name=^/${proxyContainer}$`]))) success(remoteDocker(["rm", "-f", proxyContainer]));
    if (ownsProxyVolume && success(remoteDocker(["volume", "ls", "--quiet", "--filter", `name=^${proxyVolume}$`]))) success(remoteDocker(["volume", "rm", proxyVolume]));
    if (ownsContainer && success(remoteDocker(["ps", "--all", "--quiet", "--filter", `name=^/${container}$`]))) success(remoteDocker(["rm", "-f", container]));
    if (ownsVolume && success(remoteDocker(["volume", "ls", "--quiet", "--filter", `name=^${volumeName}$`]))) success(remoteDocker(["volume", "rm", volumeName]));
    if (ownsServiceImage && success(remoteDocker(["image", "ls", "--quiet", serviceImage]))) success(remoteDocker(["image", "rm", serviceImage]));
    if (ownsPreparationImage && success(remoteDocker(["image", "ls", "--quiet", preparationImage]))) success(remoteDocker(["image", "rm", preparationImage]));
    await rm(directory, { recursive: true, force: true });
  }
});
