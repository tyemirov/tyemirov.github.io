// @ts-check
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, realpath, readdir, symlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const applicationSource = resolve(".");
const sourceBranch = "master";
const gatewayCommand = process.env.MPRLAB_GATEWAY_EXECUTABLE || "mprlab-gateway";
const run = (program, args, cwd, env = {}) => spawnSync(program, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout: 180000, maxBuffer: 8000000 });
function success(result) { assert.equal(result.status, 0, (result.stderr + result.stdout).slice(-6000)); return result.stdout; }

async function initialize(root, origin, canonicalOrigin) {
  success(run("git", ["init", "-q", `--initial-branch=${sourceBranch}`], root));
  for (const [name, value] of [["user.name", "Lifecycle Test"], ["user.email", "lifecycle@example.invalid"], ["commit.gpgsign", "false"]]) success(run("git", ["config", name, value], root));
  success(run("git", ["add", "."], root));
  success(run("git", ["commit", "-qm", "Test source snapshot"], root));
  success(run("git", ["init", "-q", "--bare", `--initial-branch=${sourceBranch}`, origin], root));
  success(run("git", ["remote", "add", "origin", origin], root));
  success(run("git", ["push", "-q", "-u", "origin", sourceBranch], root));
  success(run("git", ["remote", "set-head", "origin", sourceBranch], root));
  success(run("git", ["remote", "set-url", "origin", canonicalOrigin], root));
  success(run("git", ["config", `url.file://${origin}.insteadOf`, canonicalOrigin], root));
}

test("the CI bootstrap preserves an existing selected environment file", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "music-ci-environment-")));
  try {
    success(run("git", ["init", "-q"], directory));
    await mkdir(join(directory, ".mprlab/deploy"), { recursive: true });
    const environmentPath = join(directory, ".mprlab/deploy/.env");
    const existingInput = "GALLERY_TAUTH_SIGNING_KEY=existing-fixture-input\n";
    await writeFile(environmentPath, existingInput);
    const result = run("bash", [join(applicationSource, "tests/music/run-ci.sh")], directory, { TMPDIR: directory });
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(environmentPath, "utf8"), existingInput);
    assert.deepEqual((await readdir(directory)).sort(), [".git", ".mprlab"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("the selected application Gateway contract", { concurrency: false }, () => {
  let directory, application, gateway, gatewayEnvironment, operatorRoot;
  const gallerySigningFixture = "gallery-lifecycle-fixture-signing-key-not-for-production";

  after(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  }, { timeout: 180000 });

  before(async () => {
    await readFile(".mprlab/deploy/resources.yml", "utf8");
    directory = await realpath(await mkdtemp(join(tmpdir(), "music-lifecycle-")));
    application = join(directory, "application with spaces");
    operatorRoot = join(directory, "operator");
    gateway = await realpath(success(run("sh", ["-c", 'command -v "$1"', "gateway", gatewayCommand], directory)).trim());
    const gatewayIdentity = JSON.parse(success(run(gateway, ["version", "--json"], directory)));
    const versionRoot = resolve(dirname(gateway), "../..");
    assert.equal(gateway, join(versionRoot, "runtime/bin/mprlab-gateway"), "select the physical packaged Gateway executable");
    assert.equal(basename(versionRoot), gatewayIdentity.platform);
    assert.equal(basename(dirname(versionRoot)), gatewayIdentity.version);
    const providerBin = join(directory, "provider-bin");
    const providerFixture = join(directory, "github-provider.cjs");
    await mkdir(providerBin);
    await symlink(process.execPath, join(providerBin, "gh"));
    await writeFile(providerFixture, `
      const assert = require("node:assert/strict");
      const path = require("node:path");
      const requestArguments = [path.basename(process.argv[1]), ...process.argv.slice(2)];
      if (JSON.stringify(requestArguments) === JSON.stringify([
        "release", "view", "--repo", "tyemirov/tyemirov.github.io", "--json", "tagName,isDraft,isPrerelease,publishedAt",
      ])) {
        process.stderr.write("release not found\\n");
        process.exit(1);
      }
      assert.deepEqual(requestArguments, [
        "api", "--method", "GET", "repos/tyemirov/tyemirov.github.io", "--jq", ".full_name",
      ]);
      process.stdout.write("tyemirov/tyemirov.github.io\\n");
      process.exit(0);
    `);
    gatewayEnvironment = {
      MPRLAB_GATEWAY_OPERATOR_ROOT: operatorRoot,
      MPRLAB_GATEWAY_EXECUTABLE: gateway,
      PATH: `${providerBin}:${process.env.PATH}`,
      NODE_OPTIONS: `--require=${providerFixture}`,
    };
    await mkdir(application); await mkdir(join(operatorRoot, "inventory"), { recursive: true });
    await writeFile(join(operatorRoot, "inventory/hosts.yml"), `all:
  children:
    gateway:
      hosts:
        gateway-host:
          ansible_connection: ssh
          ansible_host: gateway.example.invalid
          ansible_user: operator
          mprlab_docker_cli: /usr/bin/docker
          mprlab_docker_context: default
          mprlab_runtime_root: /srv/mprlab-runtime
    computercat:
      hosts:
        computercat-host:
          ansible_connection: ssh
          ansible_host: computercat.example.invalid
          ansible_user: operator
          mprlab_docker_cli: /usr/bin/docker
          mprlab_docker_context: default
          mprlab_runtime_root: /srv/mprlab-runtime
`);
    const paths = success(run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], applicationSource)).split("\0").filter(Boolean);
    for (const path of paths) {
      const target = join(application, path);
      await mkdir(dirname(target), { recursive: true });
      try { await copyFile(join(applicationSource, path), target); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    await initialize(application, join(directory, "application-origin.git"), "git@github.com:tyemirov/tyemirov.github.io.git");
    await writeFile(join(application, ".mprlab/deploy/.env"), `GALLERY_TAUTH_SIGNING_KEY=${gallerySigningFixture}\nGALLERY_GOOGLE_WEB_CLIENT_ID=fixture.apps.googleusercontent.com\nDEPLOY_SUDO_PASSWORD_TUTOSH=lifecycle-fixture-sudo-not-for-production\nMPRLAB_TAUTH_MANAGEMENT_URL=http://127.0.0.1:9\nMPRLAB_TAUTH_PROVISIONING_CREDENTIALS='{"tyemirov-site":{"gallery-auth":"tauthp_fixture"}}'\n`);
  }, { timeout: 360000 });

  test("all public lifecycle commands reject non-default source and a missing runtime", { timeout: 360000 }, () => {
    success(run("git", ["switch", "-qc", "feature/source-rejection"], application));
    try {
      for (const phase of ["release", "publish", "deploy"]) {
        const rejected = run("make", ["--no-print-directory", phase, `MPRLAB_GATEWAY_EXECUTABLE=${gateway}`], application, gatewayEnvironment);
        assert.notEqual(rejected.status, 0);
        assert.ok((rejected.stderr + rejected.stdout).includes(`repository lifecycle source must be on default branch ${sourceBranch}`), rejected.stderr + rejected.stdout);
        const missing = join(directory, "missing-gateway");
        const unavailable = run("make", ["--no-print-directory", phase, `MPRLAB_GATEWAY_EXECUTABLE=${missing}`], application, gatewayEnvironment);
        assert.notEqual(unavailable.status, 0);
        assert.ok((unavailable.stderr + unavailable.stdout).includes(`Gateway runtime is unavailable: ${missing}`));
      }
    } finally {
      success(run("git", ["switch", "-q", sourceBranch], application));
    }
  });

  for (const phase of ["deploy", "release", "publish"]) {
    test(`the selected declaration validates ${phase} prerequisites through the public Gateway command`, { timeout: 180000 }, async () => {
      const result = run(gateway, [`app-plan-${phase}`, "--app-root", application], application, gatewayEnvironment);
      const logs = join(applicationSource, "output/playwright/lifecycle");
      await mkdir(logs, { recursive: true });
      await writeFile(join(logs, `app-plan-${phase}.log`), result.stderr + result.stdout);
      const output = result.stderr + result.stdout;
      if (phase === "release") {
        success(result);
        const planLine = output.split("\n").find((line) => line.trim().startsWith('"msg": "MPRLAB_APP_LIFECYCLE_PLAN '));
        assert.ok(planLine, "Gateway must emit the validated release plan");
        const planMessage = JSON.parse(planLine.slice(planLine.indexOf(":") + 1).trim().replace(/,$/, ""));
        const plan = JSON.parse(planMessage.slice("MPRLAB_APP_LIFECYCLE_PLAN ".length));
        assert.deepEqual(plan.resources.filter((resource) => ["gallery", "music"].includes(resource.id))
          .flatMap((resource) => resource.services.map((service) => [resource.id, service.id, service.placement.group])),
        [["gallery", "api", "computercat"], ["music", "stream", "computercat"]]);
        const inventory = JSON.parse(success(run(gateway, [
          "bootstrap-run", "--repo-root", application, "--operation", "app-plan-release", "--",
          resolve(dirname(gateway), "../../toolchain/bin/ansible-inventory"),
          "--inventory", join(operatorRoot, "inventory/hosts.yml"), "--list",
        ], application, gatewayEnvironment)));
        assert.deepEqual(inventory.computercat.hosts, ["computercat-host"]);
        assert.equal(inventory._meta.hostvars["computercat-host"].ansible_connection, "ssh");
      } else {
        assert.notEqual(result.status, 0);
        assert.match(output, phase === "deploy"
          ? /read selected published release:.*release not found/
          : /sealed release receipt is absent; run make release/);
      }
      assert.ok(!output.includes("lifecycle-fixture-sudo-not-for-production"), "lifecycle output must exclude the sudo input");
      assert.ok(!output.includes("tauthp_fixture"), "lifecycle output must exclude provisioning credentials");
      assert.match(output, new RegExp(`MPRLAB_APP_LIFECYCLE_END entrypoint=plan operation=${phase} status=${phase === "release" ? 0 : 2}`));
      if (phase === "deploy") {
        assert.ok(!output.includes(gallerySigningFixture), "lifecycle output must exclude the gallery signing key");
        for (const resource of ["gallery", "gallery-http", "api-route", "gallery-public", "gallery-auth"]) {
          assert.ok(output.includes(`item=${resource})`), `Gateway must validate ${resource}.`);
        }
      }
    });
  }
});
