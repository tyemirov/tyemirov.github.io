// @ts-check
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { validateSourceCatalog, publishCatalog } from "../../assets/js/catalog.js";

if (process.argv.length !== 4) throw new Error("Usage: package-public.mjs SOURCE NEW_OUTPUT");
const source = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const catalogPath = "data/site.json";
const site = publishCatalog(validateSourceCatalog(JSON.parse(await readFile(join(source, catalogPath), "utf8"))));
const gallery = site.gallery;
const files = new Set([...gallery.artworks.flatMap(work => [work.image.cardUrl.slice(1), work.image.lightboxUrl.slice(1)])]);
await mkdir(output);
for (const file of files) {
  const destination = join(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(source, file), destination);
}

await mkdir(join(output, "data"), { recursive: true });
await writeFile(join(output, catalogPath), JSON.stringify(site, null, 2) + "\n");
