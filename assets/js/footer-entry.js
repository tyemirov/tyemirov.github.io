// @ts-check
import { initializePage } from "/assets/js/navigation.js";
import { initializeSiteFooter } from './footer.js';

export async function mountPage() {
await initializeSiteFooter();
}

initializePage(mountPage);
