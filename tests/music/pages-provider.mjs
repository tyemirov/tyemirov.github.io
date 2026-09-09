// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, appendFile } from "node:fs/promises";

const args = process.argv.slice(2);
const statePath = "/provider/pages.json";
const repository = "repos/tyemirov/tyemirov.github.io";
const api = `https://api.github.com/${repository}`;
const site = "https://tyemirov.net/";
const getCommit = () => {
  const result = spawnSync("git", ["--git-dir=/origins/application.git", "rev-parse", "refs/heads/gh-pages"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

if (args[0] !== "api" || args[1] !== "--method") {
  assert.ok(args[0] === "release" || args.join(" ") === "auth token" || args.join(" ") === "api user --jq .login", `Unsupported provider command: ${args.join(" ")}`);
  const result = spawnSync("/provider/base/gh", args, { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

const [, , method, endpoint, ...fields] = args;
assert.ok(["GET", "POST", "PUT"].includes(method));
assert.ok(endpoint === repository || endpoint.startsWith(`${repository}/`));
await appendFile("/evidence/pages-api.jsonl", JSON.stringify({ method, endpoint, fields }) + "\n");
const state = JSON.parse(await readFile(statePath, "utf8"));
let response;
if (endpoint === `${repository}/git/ref/heads/gh-pages` && method === "GET") {
  assert.deepEqual(fields, ["--jq", ".object.sha"]);
  process.stdout.write(getCommit() + "\n");
  process.exit(0);
} else if (endpoint === repository && method === "GET") {
  assert.deepEqual(fields, []);
  response = { id: 1, full_name: "tyemirov/tyemirov.github.io", url: api };
} else if (endpoint === `${repository}/pages`) {
  if (method === "GET") {
    assert.deepEqual(fields, []);
    if (!state.configuration) { process.stderr.write("HTTP 404: Pages site absent\n"); process.exit(1); }
  } else if (method === "POST") {
    assert.equal(state.configuration, null);
    assert.deepEqual(fields, ["--raw-field", "build_type=legacy", "--raw-field", "source[branch]=gh-pages", "--raw-field", "source[path]=/"]);
    state.configuration = { build_type: "legacy", source: { branch: "gh-pages", path: "/" }, cname: null, https_enforced: false, html_url: site };
  } else if (fields.includes("https_enforced=true")) {
    assert.deepEqual(fields, ["--field", "https_enforced=true"]);
    assert.equal(state.configuration.cname, "tyemirov.net");
    state.configuration.https_enforced = true;
  } else {
    assert.deepEqual(fields, ["--raw-field", "cname=tyemirov.net", "--raw-field", "build_type=legacy", "--raw-field", "source[branch]=gh-pages", "--raw-field", "source[path]=/"]);
    state.configuration.cname = "tyemirov.net";
  }
  response = state.configuration;
} else if (endpoint === `${repository}/pages/builds` && method === "POST") {
  assert.deepEqual(fields, []);
  assert.equal(state.configuration.https_enforced, true);
  assert.equal(state.deployment, null);
  state.deployment = { id: 1, sha: getCommit(), ref: "gh-pages", task: "deploy", environment: "github-pages", url: `${api}/deployments/1`, repository_url: api, statuses_url: `${api}/deployments/1/statuses` };
  response = { status: "queued", url: `${api}/pages/builds/latest` };
} else if (endpoint === `${repository}/deployments` && method === "GET") {
  assert.deepEqual(fields, ["-f", `sha=${getCommit()}`, "-f", "environment=github-pages", "-F", "per_page=100"]);
  response = state.deployment ? [state.deployment] : [];
} else if (endpoint === `${repository}/deployments/1/statuses` && method === "GET") {
  assert.deepEqual(fields, ["-F", "per_page=100"]);
  assert.equal(state.deployment.sha, getCommit());
  response = [{ id: 1, state: "success", environment: "github-pages", deployment_url: state.deployment.url, repository_url: api, environment_url: site }];
} else {
  throw new Error(`Unsupported Pages API request: ${args.join(" ")}`);
}
await writeFile(statePath, JSON.stringify(state));
process.stdout.write(JSON.stringify(response) + "\n");
