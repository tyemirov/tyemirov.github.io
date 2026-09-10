// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, cp, readdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { get } from "node:https";
import { assertReleaseArtifacts, serviceImages } from "./release-contract.mjs";

const application = "/selected-app", gateway = "/mprlab-gateway", evidence = "/evidence";
function run(program, args, cwd = application, options = {}) {
  const result = spawnSync(program, args, { cwd, encoding: "utf8", timeout: 300000, maxBuffer: 16000000, ...options });
  if (program === "make") writeFileSync(join(evidence, "publication-current.log"), result.stdout + result.stderr);
  assert.equal(result.status, 0, `${program} ${args.join(" ")}\n${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}
await mkdir("/origins"); await mkdir("/provider");
await mkdir(evidence, { recursive: true });
run("update-ca-certificates", [], "/");
run("git", ["clone", "--quiet", "--branch", "master", "/input/application.bundle", application], "/");
run("git", ["clone", "--quiet", "/input/gateway.bundle", gateway], "/");
run("git", ["switch", "-c", "master"], gateway);
for (const [name, value] of [["user.name", "Music Publication Qualification"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"]]) run("git", ["config", "--global", name, value]);
for (const [root, id, canonical] of [[application, "application", "git@github.com:tyemirov/tyemirov.github.io.git"], [gateway, "gateway", "git@github.com:example/gateway-fixture.git"]]) {
  const origin = `/origins/${id}.git`;
  run("git", ["init", "--bare", "--quiet", "--initial-branch=master", origin], root);
  run("git", ["remote", "set-url", "origin", origin], root);
  run("git", ["push", "--quiet", "-u", "origin", "master"], root);
  run("git", ["remote", "set-head", "origin", "master"], root);
  run("git", ["remote", "set-url", "origin", canonical], root);
  run("git", ["config", `url.file://${origin}.insteadOf`, canonical], root);
}
const applicationCommit = run("git", ["rev-parse", "HEAD"]);
const gatewayCommit = run("git", ["rev-parse", "HEAD"], gateway);
const releaseBytes = await readFile("/input/release/receipt.json");
const release = JSON.parse(releaseBytes.toString());
assertReleaseArtifacts(release.artifacts);
assert.equal(applicationCommit, release.application.commit);
assert.equal(gatewayCommit, release.gateway.commit);
const lifecycle = join(application, ".git/mprlab-lifecycle");
const releaseRoot = join(lifecycle, "releases", applicationCommit);
await cp("/input/release", releaseRoot, { recursive: true });
await mkdir(join(lifecycle, "ci"));
await copyFile("/input/ci.json", join(lifecycle, "ci", `${applicationCommit}.json`));
await copyFile(join(gateway, "deploy/ansible/inventory/hosts.example.yml"), join(gateway, "deploy/ansible/inventory/hosts.yml"));
await writeFile(join(application, ".mprlab/deploy/.env"), "MUSIC_TRUSTED_PROXIES=127.0.0.1/32\n");
run("go", ["build", "-o", "/provider/gh", "./internal/lifecycle/testdata/provider-helper"], gateway);
process.env.PATH = `/provider:${process.env.PATH}`;
process.env.MPRLAB_PROVIDER_HELPER_MODE = "application";
process.env.MPRLAB_PROVIDER_HELPER_STATE = "/provider/state";
await mkdir(process.env.MPRLAB_PROVIDER_HELPER_STATE);

const tunnel = spawn("ssh", ["-N", "-o", "ExitOnForwardFailure=yes", "-L", "127.0.0.2:443:127.0.0.1:443", "music-publication-fixture"], { stdio: ["ignore", "ignore", "inherit"] });
const tunnelExit = new Promise((resolve) => tunnel.once("exit", resolve));
const ca = await readFile("/usr/local/share/ca-certificates/music-registry.crt");
try {
  const deadline = performance.now() + 10000;
  while (true) {
    const status = await new Promise((resolve, reject) => {
      const request = get("https://ghcr.io/v2/", { ca }, (response) => { response.resume(); resolve(response.statusCode); });
      request.on("error", reject);
      request.setTimeout(2000, () => request.destroy(new Error("Registry probe timed out")));
    }).catch((error) => {
      assert.ok(tunnel.exitCode === null && performance.now() < deadline, `Registry connection failed: ${error.message}`);
      return null;
    });
    if (status !== null) { assert.equal(status, 200); break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const argumentsForPublication = ["--no-print-directory", "publish", "ANSIBLE_PLAYBOOK=/opt/ansible/bin/ansible-playbook", "ANSIBLE_INVENTORY_BIN=/opt/ansible/bin/ansible-inventory"];
  process.stdout.write("Publish the exported sealed artifacts through the real application command.\n");
  await writeFile(join(evidence, "publication.log"), run("make", argumentsForPublication));
  const publicationsRoot = join(lifecycle, "publications", applicationCommit, "releases");
  const publications = await readdir(publicationsRoot);
  assert.equal(publications.length, 1);
  const publicationRoot = join(publicationsRoot, publications[0]);
  const before = await readFile(join(publicationRoot, "receipt.json"));
  const publication = JSON.parse(before.toString());
  assert.equal(publication.application.commit, applicationCommit);
  /** @type {Record<string, string>} */
  const images = {};
  for (const { resourceID } of serviceImages) {
    assert.equal(publication.published_artifacts[resourceID].length, 1);
    const image = publication.published_artifacts[resourceID][0].identity;
    const sealedImage = release.artifacts.find((artifact) => artifact.resource_id === resourceID);
    assert.equal(image, `${sealedImage.repository}@${sealedImage.image_digest}`);
    const manifest = run("docker", ["buildx", "imagetools", "inspect", "--raw", image]);
    assert.equal(`sha256:${createHash("sha256").update(manifest).digest("hex")}`, sealedImage.image_digest);
    run("docker", ["image", "pull", image]);
    images[resourceID] = image;
  }
  const pagesCommit = publication.published_artifacts.website[0].identity;
  const pagesReference = `refs/tags/mprlab-pages-website-${release.version}`;
  assert.equal(run("git", ["rev-parse", pagesReference], "/origins/application.git"), pagesCommit);
  const marker = JSON.parse(run("git", ["show", `${pagesCommit}:.mprlab-release.json`], "/origins/application.git"));
  assert.equal(marker.source_commit, applicationCommit);
  assert.equal(marker.version, release.version);
  assert.equal(run("git", ["show", `${pagesCommit}:CNAME`], "/origins/application.git"), "tyemirov.net");
  process.stdout.write("Retry publication and verify the immutable receipt and artifact identities.\n");
  await writeFile(join(evidence, "publication-retry.log"), run("make", argumentsForPublication));
  assert.deepEqual(await readFile(join(publicationRoot, "receipt.json")), before);
  assert.deepEqual(await readFile(join(releaseRoot, "receipt.json")), releaseBytes);
  await cp(lifecycle, join(evidence, "lifecycle"), { recursive: true });
  await cp("/provider/state", join(evidence, "provider"), { recursive: true });
  run("git", ["bundle", "create", join(evidence, "published-origin.bundle"), "--all"], "/origins/application.git");
  const result = { passed: true, applicationCommit, gatewayCommit, version: publication.version, images, pagesCommit, exactRetry: "unchanged publication receipt", registry: "real isolated TLS registry", github: "local provider and Git fixtures" };
  await writeFile(join(evidence, "publication-results.json"), JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(JSON.stringify(result) + "\n");
} finally {
  tunnel.kill("SIGTERM");
  await tunnelExit;
}
