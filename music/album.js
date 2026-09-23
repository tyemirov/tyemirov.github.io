// @ts-check
import { initializePage } from "/assets/js/navigation.js";
import { hydrateMusicPage } from "../site.js";

export async function mountPage() {
await hydrateMusicPage("album");
}

initializePage(mountPage);
