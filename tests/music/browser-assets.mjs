// @ts-check
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const fixtureRoot = new URL('./fixtures/browser-assets/', import.meta.url);
const yamlVersion = '5.4.1';
const yamlURL = `https://cdn.jsdelivr.net/npm/js-yaml@${yamlVersion}/dist/browser/js-yaml.umd.min.js`;
let preparation;

/** Only the captured browser dependencies belong to this fixture. */
export function isBrowserDependency(url) {
  return ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
    || (url.hostname === 'cdn.jsdelivr.net' && /^\/(?:gh\/MarcoPoloResearchLab\/mpr-ui@|npm\/(?:js-yaml|bootstrap|d3)(?:@|\/))/.test(url.pathname));
}

async function readCapturedFile(asset) {
  const body = await readFile(new URL(asset.file, fixtureRoot));
  if (createHash('sha256').update(body).digest('hex') !== asset.sha256) {
    throw new Error(`browser_asset_hash_mismatch:${asset.file}`);
  }
  return { ...asset, body };
}

async function prepareAssets() {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', fixtureRoot), 'utf8'));
  const assets = await Promise.all(manifest.assets.map(readCapturedFile));
  await Promise.all(manifest.licenses.map(readCapturedFile));
  const installed = JSON.parse(await readFile(new URL('../../node_modules/js-yaml/package.json', import.meta.url), 'utf8'));
  if (installed.version !== yamlVersion) throw new Error('browser_yaml_version_mismatch');
  assets.push({ url: yamlURL, contentType: 'application/javascript',
    body: await readFile(new URL('../../node_modules/js-yaml/dist/browser/js-yaml.umd.min.js', import.meta.url)) });
  return assets;
}

/** Serve qualified dependency bytes without a live provider request. */
export async function installBrowserAssets(context) {
  preparation ??= prepareAssets();
  const assets = await preparation;
  await context.route(isBrowserDependency, async route => {
    await route.abort('failed');
    throw new Error(`uncaptured_browser_dependency:${route.request().url()}`);
  });
  for (const asset of assets) {
    const fulfill = route => route.fulfill({
      body: asset.body, contentType: asset.contentType, headers: { 'Access-Control-Allow-Origin': '*' },
    });
    await context.route(url => url.href === asset.url, fulfill);
    if (asset.pattern) await context.route(asset.pattern, fulfill);
  }
}
