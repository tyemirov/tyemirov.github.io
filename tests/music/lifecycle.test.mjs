// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const applicationSource = resolve(".");
const gatewaySource = resolve("../mprlab-gateway");
const run = (program, args, cwd, env = {}) => spawnSync(program, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout: 180000, maxBuffer: 8000000 });
function success(result) { assert.equal(result.status, 0, (result.stderr + result.stdout).slice(-6000)); return result.stdout; }

async function initialize(root, origin, canonicalOrigin) {
  success(run("git", ["init", "-q", "--initial-branch=main"], root));
  for (const [name, value] of [["user.name", "Lifecycle Test"], ["user.email", "lifecycle@example.invalid"], ["commit.gpgsign", "false"]]) success(run("git", ["config", name, value], root));
  success(run("git", ["add", "."], root));
  success(run("git", ["commit", "-qm", "Test source snapshot"], root));
  success(run("git", ["init", "-q", "--bare", "--initial-branch=main", origin], root));
  success(run("git", ["remote", "add", "origin", origin], root));
  success(run("git", ["push", "-q", "-u", "origin", "main"], root));
  success(run("git", ["remote", "set-head", "origin", "main"], root));
  success(run("git", ["remote", "set-url", "origin", canonicalOrigin], root));
  success(run("git", ["config", `url.file://${origin}.insteadOf`, canonicalOrigin], root));
}

test("the selected application plans through Gateway and its public lifecycle commands enforce source rules", { timeout: 360000 }, async () => {
  await readFile(".mprlab/deploy/resources.yml", "utf8");
  const directory = await realpath(await mkdtemp(join(tmpdir(), "music-lifecycle-")));
  const application = join(directory, "application"), gateway = join(directory, "mprlab-gateway");
  try {
    await mkdir(application); await mkdir(gateway);
    const paths = success(run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], applicationSource)).split("\0").filter(Boolean);
    for (const path of paths) {
      const target = join(application, path);
      await mkdir(dirname(target), { recursive: true });
      try { await copyFile(join(applicationSource, path), target); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    const archive = join(directory, "gateway.tar");
    success(run("git", ["archive", "--format=tar", `--output=${archive}`, "HEAD"], gatewaySource));
    success(run("tar", ["-xf", archive, "-C", gateway], directory));
    await copyFile(join(gateway, "deploy/ansible/inventory/hosts.example.yml"), join(gateway, "deploy/ansible/inventory/hosts.yml"));
    await initialize(gateway, join(directory, "gateway-origin.git"), "git@github.com:example/gateway-fixture.git");
    await initialize(application, join(directory, "application-origin.git"), "git@github.com:tyemirov/tyemirov.github.io.git");
    const gallerySigningFixture = "gallery-lifecycle-fixture-signing-key-not-for-production";
    await writeFile(join(application, ".mprlab/deploy/.env"), `MUSIC_TRUSTED_PROXIES=127.0.0.1/32\nGALLERY_TAUTH_SIGNING_KEY=${gallerySigningFixture}\nGALLERY_GOOGLE_WEB_CLIENT_ID=fixture.apps.googleusercontent.com\n`);
    const toolArgs = [`ANSIBLE_PLAYBOOK=${process.env.ANSIBLE_PLAYBOOK}`, `ANSIBLE_INVENTORY_BIN=${process.env.ANSIBLE_INVENTORY_BIN}`];
    const logs = join(applicationSource, "output/playwright/lifecycle"); await mkdir(logs, { recursive: true });
    async function plan(target) {
      const result = run("make", ["--no-print-directory", target, `MPRLAB_APP_ROOT=${application}`, ...toolArgs], gateway);
      await writeFile(join(logs, `${target}.log`), result.stderr + result.stdout);
      return success(result);
    }
    const proof = await plan("verify-selected-manifest-isolation");
    assert.ok(!proof.includes(gallerySigningFixture), "lifecycle output must exclude the gallery signing key");
    assert.match(proof, /MPRLAB_APP_LIFECYCLE_END entrypoint=plan operation=deploy status=0/);
    assert.match(proof, /computercat-host/);
    for (const resource of ["gallery", "gallery-http", "api-route", "gallery-public", "gallery-auth"]) assert.ok(proof.includes(`item=${resource})`), `Gateway must validate ${resource}.`);
    for (const phase of ["release", "publish"]) {
      const output = await plan(`plan-app-${phase}`);
      assert.match(output, new RegExp(`MPRLAB_APP_LIFECYCLE_END entrypoint=plan operation=${phase} status=0`));
    }
    success(run("git", ["switch", "-qc", "feature/source-rejection"], application));
    for (const phase of ["release", "publish", "deploy"]) {
      const rejected = run("make", ["--no-print-directory", phase, ...toolArgs], application);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr + rejected.stdout, /repository lifecycle source must be on default branch main/);
    }
    process.stdout.write("Gateway plans accepted the selected declaration; all three public lifecycle commands rejected non-default source.\n");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
