// @ts-check
import { createServer } from "node:https";
import { readFile, appendFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const server = createServer({ key: await readFile("/provider/pages.key"), cert: await readFile("/provider/pages.crt") }, async (request, response) => {
  try {
    const url = new URL(request.url, "https://tyemirov.net");
    await appendFile("/evidence/pages-http.jsonl", JSON.stringify({ method: request.method, path: url.pathname }) + "\n");
    const state = JSON.parse(await readFile("/provider/pages.json", "utf8"));
    if (!state.deployment || !["GET", "HEAD"].includes(request.method)) { response.writeHead(404); response.end(); return; }
    const path = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
    const result = spawnSync("git", ["--git-dir=/origins/application.git", "show", `refs/heads/gh-pages:${path.slice(1)}`], { maxBuffer: 20000000 });
    if (result.status !== 0) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": path.endsWith(".json") ? "application/json" : "text/html", "Content-Length": result.stdout.length });
    response.end(request.method === "HEAD" ? undefined : result.stdout);
  } catch (error) { process.stderr.write(`${error.stack}\n`); response.writeHead(500); response.end(); }
});
server.listen(443, "127.0.0.3", () => process.send?.("ready"));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
