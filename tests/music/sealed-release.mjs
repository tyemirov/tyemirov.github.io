// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, symlink, copyFile, cp } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const application = "/workspace", gateway = "/mprlab-gateway", evidence = "/evidence";
const builder = "music-release-qualification";
function run(program, args, cwd = application, options = {}) {
  const result = spawnSync(program, args, { cwd, encoding: "utf8", timeout: 900000, maxBuffer: 16000000, ...options });
  if (program === "make") writeFileSync(join(evidence, "release-current.log"), result.stdout + result.stderr);
  assert.equal(result.status, 0, `${program} ${args.join(" ")}\n${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

await mkdir("/origins");
await mkdir("/provider");
await mkdir(evidence, { recursive: true });
run("git", ["clone", "--quiet", "/gateway.bundle", gateway]);
for (const [name, value] of [["user.name", "Music Lifecycle Qualification"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"]]) run("git", ["config", "--global", name, value]);
run("git", ["commit", "--quiet", "-m", "Current application qualification source"]);
for (const [root, id, canonical] of [[application, "application", "git@github.com:tyemirov/tyemirov.github.io.git"], [gateway, "gateway", "git@github.com:example/gateway-fixture.git"]]) {
  run("git", id === "gateway" ? ["switch", "-c", "master"] : ["branch", "-M", "master"], root);
  const origin = `/origins/${id}.git`;
  run("git", ["init", "--bare", "--quiet", "--initial-branch=master", origin], root);
  if (id === "application") run("git", ["remote", "add", "origin", origin], root);
  else run("git", ["remote", "set-url", "origin", origin], root);
  run("git", ["push", "--quiet", "-u", "origin", "master"], root);
  run("git", ["remote", "set-head", "origin", "master"], root);
  run("git", ["remote", "set-url", "origin", canonical], root);
  run("git", ["config", `url.file://${origin}.insteadOf`, canonical], root);
}
await copyFile(join(gateway, "deploy/ansible/inventory/hosts.example.yml"), join(gateway, "deploy/ansible/inventory/hosts.yml"));
await writeFile(join(application, ".mprlab/deploy/.env"), "MUSIC_TRUSTED_PROXIES=127.0.0.1/32\n");
run("go", ["build", "-o", "/provider/gix", "./internal/lifecycle/testdata/provider-helper"], gateway);
await symlink("/provider/gix", "/provider/gh");
process.env.PATH = `/provider:${process.env.PATH}`;
process.env.MPRLAB_PROVIDER_HELPER_MODE = "application";
process.env.MPRLAB_PROVIDER_HELPER_STATE = "/provider/state";
await mkdir(process.env.MPRLAB_PROVIDER_HELPER_STATE);
const applicationCommit = run("git", ["rev-parse", "HEAD"]);
const gatewayCommit = run("git", ["rev-parse", "HEAD"], gateway);
const receiptPath = join(application, ".git/mprlab-lifecycle/releases", applicationCommit, "receipt.json");
const argumentsForRelease = ["--no-print-directory", "release", "ANSIBLE_PLAYBOOK=/opt/ansible/bin/ansible-playbook", "ANSIBLE_INVENTORY_BIN=/opt/ansible/bin/ansible-inventory"];
run("docker", ["buildx", "create", "--name", builder, "--driver", "docker-container", "--use"]);
try {
  process.stdout.write("Run the real application release and its canonical CI.\n");
  const output = run("make", argumentsForRelease);
  await writeFile(join(evidence, "release.log"), output);
  const before = await readFile(receiptPath);
  const receipt = JSON.parse(before.toString());
  assert.equal(receipt.application.commit, applicationCommit);
  assert.equal(receipt.gateway.commit, gatewayCommit);
  assert.equal(receipt.artifacts.length, 2);
  for (const artifact of receipt.artifacts) {
    const payload = await readFile(join(receiptPath, "..", artifact.path));
    assert.equal(`sha256:${createHash("sha256").update(payload).digest("hex")}`, artifact.sha256);
    assert.equal(payload.length, artifact.size);
  }
  await writeFile(join(evidence, "release-receipt.json"), before);
  process.stdout.write("Retry the same release and verify its sealed receipt is unchanged.\n");
  await writeFile(join(evidence, "release-retry.log"), run("make", argumentsForRelease));
  assert.deepEqual(await readFile(receiptPath), before);
  const archiveRoot = join(evidence, applicationCommit);
  await mkdir(archiveRoot);
  await cp(join(receiptPath, ".."), join(archiveRoot, "release"), { recursive: true });
  await copyFile(join(application, ".git/mprlab-lifecycle/ci", `${applicationCommit}.json`), join(archiveRoot, "ci.json"));
  await copyFile("/gateway.bundle", join(archiveRoot, "gateway.bundle"));
  run("git", ["bundle", "create", join(archiveRoot, "application.bundle"), "--all"]);
  const result = { passed: true, applicationCommit, gatewayCommit, version: receipt.version, artifacts: receipt.artifacts.map(({ kind, resource_id, id, size }) => ({ kind, resource_id, id, size })), exactRetry: "unchanged sealed receipt", versionProvider: "Gateway fixture", containerBuilder: "real Docker on isolated SSH host", archive: applicationCommit };
  await writeFile(join(evidence, "release-results.json"), JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(JSON.stringify(result) + "\n");
} finally {
  run("docker", ["buildx", "rm", "--force", builder]);
}
