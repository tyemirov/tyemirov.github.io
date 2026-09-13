// @ts-check
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { build } from "esbuild";
import { validateMusic, playbackAllowlist } from "../../music/catalog.js";

const root = resolve(import.meta.dirname, "../..");
const output = process.argv[2];
if (!output) throw new Error("Supply the Pages output directory.");
const site = JSON.parse(await readFile(join(output, "data/site.json"), "utf8"));
const music = validateMusic(site.music);
await mkdir(join(output, "music/covers"), { recursive: true });
for (const album of music.items) {
  await copyFile(join(root, album.coverImage), join(output, album.coverImage));
}
await mkdir(join(output, "music/dist"), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: { site: "site.js", "music/music": "music/music.js", "music/album": "music/album.js", "articles/articles": "articles/articles.js" },
  outdir: output, bundle: true, splitting: true, format: "esm", target: ["es2022"],
  chunkNames: "music/dist/[name]-[hash]", minify: true, legalComments: "linked", logLevel: "silent",
});
await writeFile(join(output, "music/playback-allowlist.json"), JSON.stringify(playbackAllowlist(music), null, 2) + "\n");
await copyFile(join(root, "music/player.css"), join(output, "music/player.css"));
await copyFile(join(root, "node_modules/hls.js/LICENSE"), join(output, "music/dist/hls.LICENSE"));
