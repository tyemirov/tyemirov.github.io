// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("the load command exercises paced media, shared sessions, and seek bursts through the real service", async () => {
  const directory = await mkdtemp(join(tmpdir(), "music-load-test-"));
  try {
    const report = join(directory, "report.json");
    const result = spawnSync(process.execPath, ["tests/music/load.mjs", "--listeners", "4", "--seconds", "7", "--seek-every", "6", "--report", report], { encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
    const evidence = JSON.parse(await readFile(report, "utf8"));
    assert.equal(evidence.passed, true);
    assert.equal(evidence.listeners, 4);
    assert.equal(evidence.sessions, 2);
    assert.equal(evidence.completedListeners, 4);
    assert.ok(evidence.durationMs >= 7000);
    assert.equal(evidence.requests.grant.count, 4);
    assert.equal(evidence.requests.revoke.count, 4);
    assert.ok(evidence.requests.segment.count >= 8);
    assert.ok(evidence.requests.seek.count >= 8);
    assert.ok(evidence.mediaBytes > 1000000);
    assert.equal(evidence.unexpectedResponses, 0);
    assert.equal(evidence.networkErrors, 0);
    assert.equal(evidence.source.kind, "generated-noise");
    assert.ok(evidence.source.durationMs >= 180000);
    assert.doesNotMatch(JSON.stringify(evidence), /__Host-music-session|\/hls\/|playlistUrl|grantId/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
