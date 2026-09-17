// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publishCatalog, validateSourceCatalog } from "../../assets/js/catalog.js";

test("the browser catalog fixture matches the published music catalog", async () => {
  const source = validateSourceCatalog(JSON.parse(await readFile("data/site.json", "utf8")));
  const expected = JSON.parse(await readFile("tests/music/catalog.expected.json", "utf8"));
  assert.deepEqual(publishCatalog(source).music, expected);
});
