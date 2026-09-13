// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync, fork } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, cp } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { get, request } from "node:https";
import { createHmac } from "node:crypto";
import { assertReleaseArtifacts, serviceImages } from "./release-contract.mjs";

const application = "/selected-app", gateway = "/mprlab-gateway", evidence = "/evidence";
const runtime = "/tmp/music-deployment-qualification";
const volume = "tyemirov-site-music-media";
const galleryVolume = "tyemirov-site-gallery-data";
const gallerySigningKey = "gallery-deployment-fixture-signing-key-never-production";
const galleryOrigin = "https://api.tyemirov.net";
const fixture = "music-publication-fixture";
const inventory = `${gateway}/deploy/ansible/inventory/hosts.yml`;
const caddyImage = "docker.io/temirov/caddy-ratelimit@sha256:b45d6bea1555119a0d2e7f44d1e8ead45c22e5e2af22f328f5a843ec9084f5c9";
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
function run(program, args, cwd = application, options = {}) {
  const result = spawnSync(program, args, { cwd, encoding: "utf8", timeout: 420000, maxBuffer: 16000000, ...options });
  if (program === "make" || program.includes("ansible-playbook")) writeFileSync(join(evidence, "deployment-current.log"), result.stdout + result.stderr);
  assert.equal(result.status, 0, `${program} ${args.join(" ")}\n${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
  return typeof result.stdout === "string" ? result.stdout.trim() : result.stdout;
}
const ssh = (command, options = {}) => run("ssh", [fixture, command], "/", options);
const docker = (args, options = {}) => run("docker", args, "/", options);
await mkdir("/origins"); await mkdir("/provider/base", { recursive: true });
await mkdir(evidence, { recursive: true });
for (const name of ["pages-api.jsonl", "pages-http.jsonl"]) await writeFile(join(evidence, name), "");
const published = JSON.parse(await readFile("/published/publication-results.json", "utf8"));
assert.equal(published.passed, true);
assert.deepEqual(Object.keys(published.images).sort(), serviceImages.map(image => image.resourceID).sort());
const release = JSON.parse(await readFile("/input/release/receipt.json", "utf8"));
assertReleaseArtifacts(release.artifacts);
for (const { resourceID, repository } of serviceImages) {
  assert.equal(published.images[resourceID], `${repository}@${release.artifacts.find(artifact => artifact.resource_id === resourceID).image_digest}`);
}
run("git", ["clone", "--quiet", "--branch", "master", "/input/application.bundle", application], "/");
run("git", ["clone", "--quiet", "/input/gateway.bundle", gateway], "/");
run("git", ["switch", "-c", "master"], gateway);
for (const [name, value] of [["user.name", "Music Deployment Qualification"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"]]) run("git", ["config", "--global", name, value]);
run("git", ["clone", "--bare", "--quiet", "/published/published-origin.bundle", "/origins/application.git"]);
run("git", ["clone", "--bare", "--quiet", gateway, "/origins/gateway.git"]);
for (const [root, id, canonical] of [[application, "application", "git@github.com:tyemirov/tyemirov.github.io.git"], [gateway, "gateway", "git@github.com:example/gateway-fixture.git"]]) {
  const origin = `/origins/${id}.git`;
  run("git", ["remote", "set-url", "origin", canonical], root);
  run("git", ["config", `url.file://${origin}.insteadOf`, canonical], root);
  // Deployment creates new activation repositories. Keep their exact provider
  // remotes local inside this disposable controller as well.
  run("git", ["config", "--global", `url.file://${origin}.insteadOf`, canonical], root);
  run("git", ["fetch", "--quiet", "origin"], root);
  run("git", ["remote", "set-head", "origin", "master"], root);
}
process.env.GIT_SSH_COMMAND = "/bin/false";
const applicationCommit = run("git", ["rev-parse", "HEAD"]);
const gatewayCommit = run("git", ["rev-parse", "HEAD"], gateway);
assert.equal(applicationCommit, published.applicationCommit);
assert.equal(gatewayCommit, published.gatewayCommit);
const lifecycle = join(application, ".git/mprlab-lifecycle");
await cp("/published/lifecycle", lifecycle, { recursive: true });
await cp("/published/provider", "/provider/state", { recursive: true });
process.env.MPRLAB_PROVIDER_HELPER_MODE = "application";
process.env.MPRLAB_PROVIDER_HELPER_STATE = "/provider/state";
run("go", ["build", "-o", "/provider/base/gh", "./internal/lifecycle/testdata/provider-helper"], gateway);
await writeFile("/provider/launcher.go", `package main
import ("os"; "os/exec"; "fmt")
func main() {
 command := exec.Command("node", append([]string{"/workspace/tests/music/pages-provider.mjs"}, os.Args[1:]...)...)
 command.Stdin, command.Stdout, command.Stderr = os.Stdin, os.Stdout, os.Stderr
 if err := command.Run(); err != nil { if status, ok := err.(*exec.ExitError); ok { os.Exit(status.ExitCode()) }; fmt.Fprintln(os.Stderr, err); os.Exit(1) }
}
`);
run("go", ["build", "-o", "/provider/gh", "/provider/launcher.go"], "/");
process.env.PATH = `/provider:${process.env.PATH}`;
await writeFile("/provider/pages.json", JSON.stringify({ configuration: null, deployment: null }));
run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-noenc", "-keyout", "/provider/pages.key", "-out", "/provider/pages.crt", "-days", "1", "-subj", "/CN=tyemirov.net", "-addext", "subjectAltName=DNS:tyemirov.net"], "/");
await copyFile("/provider/pages.crt", "/usr/local/share/ca-certificates/music-pages.crt");
run("update-ca-certificates", [], "/");
const settings = Object.fromEntries(run("ssh", ["-G", fixture], "/").split("\n").map((line) => { const space = line.indexOf(" "); return [line.slice(0, space), line.slice(space + 1)]; }));
const address = JSON.parse(ssh("ip -j -4 route get 1.1.1.1"))[0].prefsrc;
assert.match(address, /^10\.[0-9.]+$|^192\.168\.[0-9.]+$|^172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+$/);
ssh(`test ! -e ${quote(runtime)}`);
assert.equal(ssh("ss -H -ltn '( sport = :18880 or sport = :18443 or sport = :8092 or sport = :8093 )'"), "");
const target = {
  ansible_host: address, ansible_port: Number(settings.port), ansible_user: settings.user, ansible_connection: "ssh", ansible_become: false, ansible_become_method: "sudo",
  ansible_ssh_private_key_file: "/qualification/ssh-key",
  ansible_ssh_common_args: `-o HostName=${settings.hostname} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`,
  mprlab_docker_cli: "/usr/bin/docker", mprlab_docker_context: "default", mprlab_runtime_root: runtime,
  mprlab_operator_secret_files: {}, mprlab_operator_secret_values: {},
  mprlab_caddy_validation_image: caddyImage, mprlab_caddy_admin_email: "fixture@example.invalid", mprlab_caddy_automatic_tls_issuer: "internal",
  mprlab_caddy_operator_certificates: {}, mprlab_caddy_compose_project_name: "mprlab-caddy", mprlab_caddy_service_name: "caddy",
  mprlab_caddy_config_path: "/etc/caddy/Caddyfile", mprlab_caddy_data_volume_name: "mprlab-caddy-data", mprlab_caddy_config_volume_name: "mprlab-caddy-config",
  mprlab_caddy_http_host_port: 18880, mprlab_caddy_https_host_port: 18443, mprlab_caddy_listener_bindings: [],
};
await writeFile(inventory, JSON.stringify({ all: { hosts: { fixture: target }, children: { gateway: { hosts: { fixture: {} } }, computercat: { hosts: { fixture: {} } } } } }));
await mkdir(join(gateway, "configs"), { recursive: true });
await writeFile(join(gateway, "configs/.env.caddy"), "");
await writeFile("/provider/cleanup.json", JSON.stringify({ mprlab_cleanup_target_profiles: { qualification: {
  inventory_groups: { gateway: ["fixture"], computercat: ["fixture"] }, targets: { fixture: {
    ansible_host: address, ansible_port: target.ansible_port, ansible_user: settings.user, ansible_connection: "ssh", ansible_become: false, ansible_become_method: "sudo",
    docker_cli: "/usr/bin/docker", docker_context: "default", runtime_root: runtime, cleanup_runtime_roots: [runtime],
  } },
} } }));
const ansible = "/opt/ansible/bin/ansible-playbook";
process.env.ANSIBLE_CONFIG = `${gateway}/deploy/ansible/ansible.cfg`;
const makeArgs = ["--no-print-directory", "deploy", `ANSIBLE_PLAYBOOK=${ansible}`, "ANSIBLE_INVENTORY_BIN=/opt/ansible/bin/ansible-inventory"];
const cleanup = async (label) => {
  process.stdout.write(`Run Gateway cleanup: ${label}.\n`);
  await writeFile(join(evidence, `${label}.log`), run(ansible, ["-i", inventory, `${gateway}/deploy/ansible/playbooks/cleanup-production-runtime.yml`, "--extra-vars", "@/provider/cleanup.json"], gateway));
};
const tunnel = spawn("ssh", ["-N", "-o", "ExitOnForwardFailure=yes", "-L", "127.0.0.2:443:127.0.0.1:443", "-L", "127.0.0.4:443:127.0.0.1:18443", fixture], { stdio: ["ignore", "ignore", "inherit"] });
const tunnelExit = new Promise((resolve) => tunnel.once("exit", resolve));
const pages = fork("/workspace/tests/music/pages-server.mjs", [], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
const pagesExit = new Promise((resolve) => pages.once("exit", resolve));
let runtimeOwned = false, cleaned = false;
const failures = [];
try {
  await new Promise((resolve, reject) => { pages.once("message", resolve); pages.once("error", reject); pages.once("exit", () => reject(new Error("Pages fixture exited before readiness"))); });
  const ca = await readFile("/usr/local/share/ca-certificates/music-registry.crt");
  const deadline = performance.now() + 10000;
  while (true) {
    const status = await new Promise((resolve, reject) => {
      const request = get("https://ghcr.io/v2/", { ca }, (response) => { response.resume(); resolve(response.statusCode); });
      request.on("error", reject); request.setTimeout(2000, () => request.destroy(new Error("Registry probe timed out")));
    }).catch((error) => { assert.ok(tunnel.exitCode === null && performance.now() < deadline, error.message); return null; });
    if (status !== null) { assert.equal(status, 200); break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const image of Object.values(published.images)) docker(["pull", image]);
  runtimeOwned = true;
  for (const label of ["foundation", "foundation-retry"]) {
    process.stdout.write(`Run the real Gateway command: ${label}.\n`);
    await writeFile(join(evidence, `${label}.log`), run("make", makeArgs, gateway));
  }
  const caddy = docker(["ps", "--quiet", "--filter", "label=com.docker.compose.project=mprlab-caddy"]);
  assert.match(caddy, /^[0-9a-f]+$/);
  const networks = JSON.parse(docker(["inspect", caddy]))[0].NetworkSettings.Networks;
  const peers = Object.values(networks).map((network) => `${network.IPAddress}/32`);
  assert.ok(peers.length > 0);
  await writeFile(join(application, ".mprlab/deploy/.env"), `MUSIC_TRUSTED_PROXIES=${peers.join(",")}\nGALLERY_TAUTH_SIGNING_KEY=${gallerySigningKey}\nGALLERY_GOOGLE_WEB_CLIENT_ID=fixture.apps.googleusercontent.com\n`);
  const variables = { application_manifest: `${application}/.mprlab/deploy/resources.yml`, gateway_root: gateway, selected_contract: "/provider/selected.json", selected_caddy_config: "/provider/Caddyfile", expected_volume: volume };
  await writeFile("/provider/volume.json", JSON.stringify(variables));
  await writeFile(join(evidence, "media-volume.log"), run(ansible, ["-i", inventory, "/workspace/tests/music/host-volume.yml", "--extra-vars", "@/provider/volume.json"], gateway));
  run("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "13", "/provider/tone.wav"], "/");
  const { trackId, ...record } = JSON.parse(run("node", ["scripts/music/prepare.mjs", "--source", "/provider/tone.wav", "--media-root", "/provider/media", "--track-id", "test-tone"]));
  await writeFile("/provider/media/selected.json", JSON.stringify({ tracks: { [trackId]: record } }));
  await writeFile("/provider/media/allowlist.json", JSON.stringify({ tracks: [{ id: trackId, playback: { kind: "hls", durationMs: record.durationMs } }] }));
  run("tar", ["-cf", "/provider/media.tar", "-C", "/provider/media", "."], "/");
  docker(["create", "--name", "music-deployment-transfer", "--mount", `type=volume,src=${volume},dst=/media`, published.images.music]);
  try { docker(["cp", "-", "music-deployment-transfer:/media"], { input: await readFile("/provider/media.tar") }); }
  finally { docker(["rm", "music-deployment-transfer"]); }
  docker(["run", "--rm", "--network", "none", "--platform", "linux/amd64", "--mount", `type=volume,src=${volume},dst=/media,readonly`, "--entrypoint", "/music-media", published.images.music, "validate", "--media-root", "/media", "--index", "/media/selected.json", "--allowlist", "/media/allowlist.json"]);
  const deploymentReceipts = [];
  const serviceIdentities = [];
  const desiredStates = [];
  for (const label of ["application", "application-retry"]) {
    process.stdout.write(`Run the real application command: ${label}.\n`);
    await writeFile(join(evidence, `${label}.log`), run("make", makeArgs));
    deploymentReceipts.push(await readFile("/provider/pages.json", "utf8"));
    assert.equal(run("git", ["rev-parse", "refs/heads/gh-pages"], "/origins/application.git"), published.pagesCommit);
    serviceIdentities.push(docker(["ps", "--quiet", "--filter", "label=com.mprlab.owner=tyemirov-site"]).split("\n").sort().join("\n"));
    const stateBytes = ssh(`cat ${quote(runtime + "/state/active-resources.json")}`);
    await writeFile(join(evidence, `${label}-state.json`), stateBytes);
    const state = JSON.parse(stateBytes);
    assert.deepEqual(state.observed.filter(entry => entry.owner === "tyemirov-site").map(entry => entry.resource.id).sort(),
      ["api-route", "gallery", "gallery-auth", "gallery-http", "gallery-public", "music", "music-http", "music-public", "private", "website"]);
    assert.ok(state.observed.every((entry) => entry.status === "verified"));
    desiredStates.push(state.desired);
  }
  assert.equal(deploymentReceipts[0], deploymentReceipts[1], "The exact retry must retain the Pages deployment");
  assert.equal(serviceIdentities[0], serviceIdentities[1], "The exact retry must retain the service container");
  assert.deepEqual(desiredStates[0], desiredStates[1], "The exact retry must retain the desired resource generation");
  const service = docker(["ps", "--quiet", "--filter", "label=com.mprlab.owner=tyemirov-site", "--filter", "label=com.mprlab.resource=music", "--filter", "label=com.docker.compose.service=stream"]);
  assert.match(service, /^[0-9a-f]+$/);
  const inspection = JSON.parse(docker(["inspect", service]))[0];
  assert.equal(inspection.Config.Image, published.images.music);
  assert.equal(inspection.State.Running, true);
  assert.equal(inspection.Mounts.find((mount) => mount.Destination === "/media").RW, false);
  const galleryService = docker(["ps", "--quiet", "--filter", "label=com.mprlab.owner=tyemirov-site", "--filter", "label=com.mprlab.resource=gallery", "--filter", "label=com.docker.compose.service=api"]);
  assert.match(galleryService, /^[0-9a-f]+$/);
  const galleryInspection = JSON.parse(docker(["inspect", galleryService]))[0];
  assert.equal(galleryInspection.Config.Image, published.images.gallery);
  assert.equal(galleryInspection.State.Running, true);
  const dataMount = galleryInspection.Mounts.find(mount => mount.Destination === "/data");
  assert.equal(dataMount.Name, galleryVolume);
  assert.equal(dataMount.RW, true);
  const audioCA = docker(["exec", caddy, "cat", "/data/caddy/pki/authorities/local/root.crt"]);
  async function send(path, options = {}, origin = "https://api.tyemirov.net") {
    return new Promise((resolve, reject) => {
      const connection = request(new URL(path, origin), { ca: audioCA, family: 4, agent: false, ...options,
        lookup: (_host, _options, callback) => callback(null, "127.0.0.4", 4),
      }, (response) => {
        const chunks = []; response.on("data", (chunk) => chunks.push(chunk)); response.on("error", reject);
        response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      });
      connection.on("error", reject); connection.setTimeout(10000, () => connection.destroy(new Error("Service HTTPS probe timed out")));
      connection.end(options.body);
    });
  }
  assert.equal((await send("/music/readyz")).status, 200);
  const created = await send("/music/playback-grants", { method: "POST", headers: { Origin: "https://tyemirov.net", "Content-Type": "application/json" }, body: JSON.stringify({ trackId: "test-tone" }) });
  assert.equal(created.status, 201, created.body.toString());
  const cookie = created.headers["set-cookie"][0].split(";")[0];
  const grant = JSON.parse(created.body.toString());
  assert.equal(new URL(grant.playlistUrl).origin, "https://api.tyemirov.net");
  for (const name of ["index.m3u8", "init.mp4", "seg-00000.m4s"]) {
    const path = new URL(name, grant.playlistUrl).pathname;
    assert.equal((await send(path)).status, 401);
    const media = await send(path, { headers: { Cookie: cookie, Origin: "https://tyemirov.net" } });
    assert.equal(media.status, 200); assert.ok(media.body.length > 0);
    assert.equal(media.headers["access-control-allow-origin"], "https://tyemirov.net");
  }
  const segment = new URL("seg-00000.m4s", grant.playlistUrl).pathname;
  const ranged = await send(segment, { headers: { Cookie: cookie, Range: "bytes=0-15" } });
  assert.equal(ranged.status, 206); assert.equal(ranged.body.length, 16);
  assert.equal((await send(`/music/playback-grants/${grant.grantId}`, { method: "DELETE", headers: { Cookie: cookie, Origin: "https://tyemirov.net" } })).status, 204);
  assert.equal((await send(segment, { headers: { Cookie: cookie } })).status, 410);
  const gallerySend = (path, options = {}) => send(path, options, galleryOrigin);
  function ownerCookie(email) {
    const now = Math.floor(Date.now() / 1000);
    const token = [{ alg: "HS256", typ: "JWT" }, { iss: "tauth", user_id: "deployment-test-owner", user_email: email, tenant_id: "tyemirov-gallery", iat: now - 60, exp: now + 3600 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
    return `tyemirov_gallery_session=${token}.${createHmac("sha256", gallerySigningKey).update(token).digest("base64url")}`;
  }
  const ownerHeaders = { Cookie: ownerCookie("vadym@tyemirov.net"), Origin: "https://tyemirov.net" };
  assert.equal((await gallerySend("/gallery/readyz")).status, 200);
  assert.equal((await gallerySend("/gallery/draft")).status, 401);
  assert.equal((await gallerySend("/gallery/draft", { headers: { ...ownerHeaders, Cookie: ownerCookie("other@example.invalid") } })).status, 403);
  const draftResponse = await gallerySend("/gallery/draft", { headers: ownerHeaders });
  assert.equal(draftResponse.status, 200);
  assert.equal(draftResponse.headers["access-control-allow-origin"], "https://tyemirov.net");
  const draft = JSON.parse(draftResponse.body.toString());
  const publishedCatalog = JSON.parse(run("git", ["show", `${published.pagesCommit}:data/site.json`], "/origins/application.git"));
  assert.deepEqual(draft.gallery, publishedCatalog.gallery, "The deployed gallery image must use the catalog from the published Pages artifact.");
  const publicationResponse = await gallerySend("/gallery/publications", { method: "POST", headers: { ...ownerHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ draftEtag: draftResponse.headers.etag, baseCatalogDigest: (await gallerySend("/gallery/readyz")).headers["x-catalog-digest"] }) });
  assert.equal(publicationResponse.status, 201);
  const publication = JSON.parse(publicationResponse.body.toString());
  assert.equal((await gallerySend(publication.archiveUrl)).status, 401);
  const archive = await gallerySend(publication.archiveUrl, { headers: ownerHeaders });
  assert.equal(archive.status, 200);
  draft.gallery.description = "The deployed gallery keeps this owner draft after restart.";
  const saved = await gallerySend("/gallery/draft", { method: "PUT", headers: { ...ownerHeaders, "Content-Type": "application/json", "If-Match": draftResponse.headers.etag }, body: JSON.stringify(draft) });
  assert.equal(saved.status, 200);
  docker(["restart", galleryService]);
  const galleryDeadline = performance.now() + 10000;
  while ((await gallerySend("/gallery/readyz")).status !== 200) {
    assert.equal(docker(["inspect", galleryService, "--format", "{{.State.Running}}"]), "true");
    assert.ok(performance.now() < galleryDeadline, "The deployed gallery did not become ready after restart.");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const restoredDraft = await gallerySend("/gallery/draft", { headers: ownerHeaders });
  assert.equal(restoredDraft.status, 200);
  assert.equal(restoredDraft.headers.etag, saved.headers.etag);
  assert.deepEqual(JSON.parse(restoredDraft.body.toString()), draft);
  const restoredArchive = await gallerySend(publication.archiveUrl, { headers: ownerHeaders });
  assert.equal(restoredArchive.status, 200);
  assert.equal(restoredArchive.body.equals(archive.body), true, "Restart and draft changes must preserve the publication archive.");
  await writeFile(join(evidence, "http-results.json"), JSON.stringify({ tls: "verified internal CA and declared hostnames", music: { readiness: 200, grant: 201, anonymousMedia: 401, authorizedMedia: 200, range: 206, revokedMedia: 410 }, gallery: { readiness: 200, anonymousDraft: 401, otherOwner: 403, ownerDraft: 200, publishedCatalog: "matches deployed image", publication: 201, savedDraftAndArchive: "unchanged after restart", auth: "controlled TAuth claims; login not qualified" } }) + "\n");
  await writeFile(join(evidence, "service.log"), docker(["logs", service]));
  await writeFile(join(evidence, "gallery-service.log"), docker(["logs", galleryService]));
  await cp(lifecycle, join(evidence, "lifecycle"), { recursive: true });
  await copyFile("/provider/pages.json", join(evidence, "pages-provider.json"));
  const pagesCA = await readFile("/provider/pages.crt");
  const markerResponse = await new Promise((resolve, reject) => {
    const request = get("https://tyemirov.net/.mprlab-release.json", { ca: pagesCA }, (response) => {
      let body = ""; response.on("data", (chunk) => { body += chunk; }); response.on("end", () => resolve({ status: response.statusCode, body })); response.on("error", reject);
    });
    request.on("error", reject); request.setTimeout(10000, () => request.destroy(new Error("Pages HTTPS probe timed out")));
  });
  assert.equal(markerResponse.status, 200);
  const marker = JSON.parse(markerResponse.body);
  assert.equal(marker.source_commit, applicationCommit);
  const calls = (await readFile(join(evidence, "pages-api.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(calls.filter((call) => call.method === "POST" && call.endpoint.endsWith("/pages/builds")).length, 1, "The exact deployment retry must reuse the Pages build");
  await cleanup("cleanup"); await cleanup("cleanup-retry"); cleaned = true;
  assert.equal(docker(["ps", "--all", "--quiet", "--filter", "label=com.mprlab.owner=tyemirov-site"]), "");
  assert.equal(docker(["ps", "--all", "--quiet", "--filter", "label=com.docker.compose.project=mprlab-caddy"]), "");
  ssh(`test ! -e ${quote(runtime)}`);
  const result = { passed: true, applicationCommit, gatewayCommit, images: published.images, pagesCommit: published.pagesCommit, foundation: "actual Gateway deploy and retry", application: "actual application deploy and retry", cleanup: "Gateway cleanup playbook and retry", topology: "one isolated Linux host in gateway and computercat groups", github: "local Pages API and HTTPS Git artifact fixture" };
  await writeFile(join(evidence, "deployment-results.json"), JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) { failures.push(error); }
finally {
  if (runtimeOwned && !cleaned) { try { await cleanup("cleanup-after-failure"); } catch (error) { failures.push(error); } }
  pages.kill("SIGTERM"); tunnel.kill("SIGTERM");
  await Promise.all([pagesExit, tunnelExit]);
}
if (failures.length) throw new AggregateError(failures, "Deployment qualification or cleanup failed");
