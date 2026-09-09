// @ts-check
import { test, expect } from "./test-fixtures.mjs";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { resolve } from "node:path";

const api = await SwaggerParser.validate(resolve(import.meta.dirname, "../../services/music-stream/openapi.json"));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

test("the real HTTP lifecycle conforms to the canonical OpenAPI contract", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The HTTP schema contract is independent of browser engines.");
  const origin = "https://localhost:18444", headers = { Origin: "https://localhost:18443" };
  async function verify(response, path, method) {
    const contract = api.paths[path][method].responses[String(response.status())];
    expect(contract, `${method} ${path} ${response.status()}`).toBeTruthy();
    const schema = contract.content?.["application/json"]?.schema;
    if (schema) {
      expect(response.headers()["content-type"]).toContain("application/json");
      const value = await response.json(), validate = ajv.compile(schema);
      expect(validate(value), ajv.errorsText(validate.errors)).toBe(true);
      return value;
    }
    return null;
  }
  const collection = "/api/playback-grants", item = `${collection}/{grantId}`;
  const created = await request.post(origin + collection, { headers, data: { trackId: "test-tone" } });
  expect(created.status()).toBe(201);
  const grant = await verify(created, collection, "post");
  expect(created.headers().location).toBe(`${collection}/${grant.grantId}`);
  const path = `${collection}/${grant.grantId}`;
  const read = await request.get(origin + path, { headers });
  expect(read.status()).toBe(200); await verify(read, item, "get");
  const renewed = await request.put(origin + path + "/expiration", { headers, data: { expiresAt: grant.expiresAt } });
  expect(renewed.status()).toBe(200); await verify(renewed, item + "/expiration", "put");
  const removed = await request.delete(origin + path, { headers });
  expect(removed.status()).toBe(204); await verify(removed, item, "delete");
  const revoked = await request.get(origin + path, { headers });
  expect(revoked.status()).toBe(410); await verify(revoked, item, "get");
  const invalid = await request.post(origin + collection, { headers, data: { trackId: "../invalid" } });
  expect(invalid.status()).toBe(400); await verify(invalid, collection, "post");
});
