// @ts-check
import { readFile, readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validatePublicCatalog } from "../../assets/js/catalog.js";
import { validateMusic, playbackAllowlist } from "../../music/catalog.js";
import { validateGallery } from "../../gallery/js/core/catalog.js";
import { ORDER_CONFIG_PATH, validateOrderConfig } from "../../gallery/js/core/orders.js";
import { createPlaybackAPI } from "../../music/player/api.js";

const output = process.argv[2];
if (!output) throw new Error("Supply the Pages output directory.");
const root = resolve(output);
const forbidden = /(?:^|\/)(?:services|scripts|tests|node_modules|packages|indexes|staging|\.git|\.env(?:\.[^/]*)?)(?:\/|$)|\.(?:wav|flac|mp3|aac|m4a|m4s|m3u8|mp4|pem|key)$/i;
async function inspect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink() || forbidden.test(path) || path === "music/package.json" || path === "data/music.json") throw new Error(`Pages artifact contains private media or an excluded path: ${path}`);
    if (entry.isDirectory()) await inspect(join(directory, entry.name), path + "/");
  }
}
await inspect(root);
for (const path of ["site.js", "music/album.js", "music/music.js", "music/player.css", "music/dist/hls.LICENSE"]) await access(join(root, path));
for (const path of ["gallery/order/index.html", "gallery/js/order.js", "gallery/js/core/orders.js", "gallery/js/ui/orderView.js", "gallery/js/ui/checkoutView.js", "gallery/assets/css/order.css"]) await access(join(root, path));
validateOrderConfig(JSON.parse(await readFile(join(root, ORDER_CONFIG_PATH.slice(1)), "utf8")));
const site = validatePublicCatalog(JSON.parse(await readFile(join(root, "data/site.json"), "utf8")));
const routes=JSON.parse(await readFile(join(root,"data/routes.json"),"utf8"));
const paths=new Set();
for(const route of routes) {
 if(paths.has(route.path) || route.file!==route.path.slice(1)+"index.html") throw new Error("Invalid generated route manifest.");
 paths.add(route.path);
 const html=await readFile(join(root,route.file),'utf8');
 const pixel='https://loopaware.mprlab.com/pixel.js?site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b&api_origin=https%3A%2F%2Floopaware-api.mprlab.com';
 if(html.split(pixel).length!==2 || !html.match(/<head>\s*<script defer src="https:\/\/loopaware/)) throw new Error(`Invalid tracking head: ${route.path}`);
}
for(const path of ["/","/music/","/articles/","/gallery/","/gallery/order/"]) if(!paths.has(path)) throw new Error(`Missing public route: ${path}`);
const gallery = validateGallery(site.gallery);
const galleryImages = new Set(gallery.artworks.flatMap(artwork => [artwork.image.cardUrl, artwork.image.lightboxUrl]).map(path => path.slice(1)));
async function inspectGalleryImages(directory, prefix) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await inspectGalleryImages(join(directory, entry.name), path);
    else if (!galleryImages.has(path)) throw new Error(`Pages artifact contains an unreferenced gallery image: ${path}`);
  }
}
await inspectGalleryImages(join(root, "gallery/images"), "gallery/images");
for (const path of galleryImages) await access(join(root, path));
const expected = playbackAllowlist(validateMusic(site.music));
const actual = JSON.parse(await readFile(join(root, "music/playback-allowlist.json"), "utf8"));
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Published playback allowlist differs from the catalog.");
createPlaybackAPI(JSON.parse(await readFile(join(root, "config-site.json"), "utf8")));
process.stdout.write("Pages music artifact validated.\n");
