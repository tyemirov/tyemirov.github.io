// @ts-check
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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

describe("the selected application Gateway contract", { concurrency: false }, () => {
  let directory, application, gateway, gatewayEnvironment;
  const gallerySigningFixture = "gallery-lifecycle-fixture-signing-key-not-for-production";

  after(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  }, { timeout: 180000 });

  before(async () => {
    await readFile(".mprlab/deploy/resources.yml", "utf8");
    directory = await realpath(await mkdtemp(join(tmpdir(), "music-lifecycle-")));
    application = join(directory, "application with spaces");
    const operatorRoot = join(directory, "operator");
    gateway = await realpath(success(run("sh", ["-c", 'command -v "$1"', "gateway", gatewayCommand], directory)).trim());
    gatewayEnvironment = { MPRLAB_GATEWAY_OPERATOR_ROOT: operatorRoot, MPRLAB_GATEWAY_EXECUTABLE: gateway };
    await mkdir(application); await mkdir(join(operatorRoot, "inventory"), { recursive: true });
    await writeFile(join(operatorRoot, "inventory/hosts.yml"), `all:
  children:
    gateway:
      hosts:
        gateway-host:
          ansible_host: gateway.example.invalid
          ansible_user: operator
          mprlab_docker_cli: /usr/bin/docker
          mprlab_docker_context: default
          mprlab_runtime_root: /srv/mprlab-runtime
    computercat:
      hosts:
        computercat-host:
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
    await writeFile(join(application, ".mprlab/deploy/.env"), `GALLERY_TAUTH_SIGNING_KEY=${gallerySigningFixture}\nGALLERY_GOOGLE_WEB_CLIENT_ID=fixture.apps.googleusercontent.com\n`);
  }, { timeout: 360000 });

  test("all public lifecycle commands reject non-default source and a missing runtime", { timeout: 360000 }, () => {
    success(run("git", ["switch", "-qc", "feature/source-rejection"], application));
    try {
      for (const phase of ["release", "publish", "deploy"]) {
        const rejected = run("make", ["--no-print-directory", phase, `MPRLAB_GATEWAY_EXECUTABLE=${gateway}`], application, gatewayEnvironment);
        assert.notEqual(rejected.status, 0);
        assert.ok((rejected.stderr + rejected.stdout).includes(`repository lifecycle source must be on ${sourceBranch}`), rejected.stderr + rejected.stdout);
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
    test(`the selected declaration plans ${phase} through the public Gateway command`, { timeout: 180000 }, async () => {
      const result = run(gateway, [`app-plan-${phase}`, "--app-root", application], application, gatewayEnvironment);
      const logs = join(applicationSource, "output/playwright/lifecycle");
      await mkdir(logs, { recursive: true });
      await writeFile(join(logs, `app-plan-${phase}.log`), result.stderr + result.stdout);
      const output = success(result);
      assert.match(output, new RegExp(`MPRLAB_APP_LIFECYCLE_END entrypoint=plan operation=${phase} status=0`));
      if (phase === "deploy") {
        assert.ok(!output.includes(gallerySigningFixture), "lifecycle output must exclude the gallery signing key");
        assert.match(output, /computercat-host/);
        for (const resource of ["gallery", "gallery-http", "api-route", "gallery-public", "gallery-auth"]) {
          assert.ok(output.includes(`item=${resource})`), `Gateway must validate ${resource}.`);
        }
      }
    });
  }
});
