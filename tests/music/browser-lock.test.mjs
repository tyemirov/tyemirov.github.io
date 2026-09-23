// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";

const wrapper = "scripts/music/with-browser-lock.sh";

test("browser fixture commands run one at a time", async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-browser-lock-test-"));
  const output = join(directory, "events.txt");
  const lock = join(directory, "fixture.lock");
  const script = `const fs=require('fs'); const [file,name]=process.argv.slice(1); fs.appendFileSync(file,name+'-start\\n'); setTimeout(()=>{fs.appendFileSync(file,name+'-end\\n')},400)`;
  const children = [];
  try {
    const start = name => {
      const child = spawn("bash", [wrapper, process.execPath, "-e", script, output, name], {
        env: { ...process.env, MUSIC_BROWSER_LOCK_FILE: lock }, stdio: ["ignore", "pipe", "pipe"],
      });
      children.push(child);
      let errors = "";
      child.stderr.on("data", chunk => { errors += chunk; });
      return { child, done: once(child, "close").then(([code]) => ({ code, errors })) };
    };
    const first = start("first");
    const deadline = Date.now() + 5000;
    let started = false;
    while (Date.now() < deadline && first.child.exitCode === null) {
      try { started = (await readFile(output, "utf8")).includes("first-start"); } catch {}
      if (started) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!started) assert.fail((await first.done).errors || "first command did not start");
    assert.equal(first.child.exitCode, null);
    const second = start("second");
    const results = await Promise.all([first.done, second.done]);
    for (const result of results) assert.equal(result.code, 0, result.errors);
    assert.deepEqual((await readFile(output, "utf8")).trim().split("\n"), ["first-start", "first-end", "second-start", "second-end"]);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
