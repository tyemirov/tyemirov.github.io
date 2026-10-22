// @ts-check
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'tests/music/fixtures/browser-assets');
const uiVersion = '4.3.7';
const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const uiHashes = {
  'mpr-ui-config.js': '3f56fbd212a516d2bd8b0b95f73ae7ad82952c10d8d5f4e6f8b44d3233f01304',
  'mpr-ui.js': '80e6109539f335b11e3caa533b4af9807434a22bf44a1208d7b5edfd02e3758a',
  'mpr-ui.css': 'b6ee455076512890aedddfd249ba8d73ec8e67c69cdfe8ad127fc412dc809db7',
};
/** @param {string | Buffer} bytes */
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** @type {Map<string, Buffer>} */
const files = new Map();

/**
 * @param {string} url
 * @param {string} file
 * @param {string} [expectedHash]
 */
async function capture(url, file, expectedHash) {
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(30000),
      });
      break;
    } catch (error) {
      const code = error?.cause?.code;
      if (attempt === 3 || !['UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'].includes(code)) {
        throw new Error(`Capture ${url}: transport failed on attempt ${attempt}`, { cause: error });
      }
      console.info(`Retry ${url}: ${code} on attempt ${attempt}`);
    }
  }
  if (!response) throw new Error(`Capture ${url}: no response`);
  if (!response.ok) throw new Error(`Capture ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (file.endsWith('.woff2') && bytes.subarray(0, 4).toString('ascii') !== 'wOF2') {
    throw new Error(`Capture ${url}: invalid WOFF2 header`);
  }
  const sha256 = digest(bytes);
  if (expectedHash && sha256 !== expectedHash) {
    throw new Error(`Capture ${url}: SHA-256 ${sha256} differs from ${expectedHash}`);
  }
  const contentType = response.headers.get('content-type');
  if (!contentType) throw new Error(`Capture ${url}: missing Content-Type`);
  files.set(file, bytes);
  return { url, file, contentType, sha256, retrievedAt: new Date().toISOString() };
}

async function main() {
  const assets = [];
  for (const [name, hash] of Object.entries(uiHashes)) {
    const url = `https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@${uiVersion}/${name}`;
    assets.push({
      ...await capture(url, `mpr-ui/${name}`, hash),
      pattern: `https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/${name}*`,
      version: uiVersion,
    });
  }
  const fontUrls = new Set();
  for (const input of ['styles.css', 'civilization/style.css', 'gallery/index.html']) {
    const source = await readFile(path.join(root, input), 'utf8');
    const urls = [...source.matchAll(/https:\/\/fonts\.googleapis\.com\/css2\?[^"\s)]+/g)];
    if (urls.length !== 1) throw new Error(`Capture ${input}: expected exactly one Google Fonts CSS URL`);
    const url = urls[0][0];
    const file = `google-fonts/${digest(url)}.css`;
    assets.push({ ...await capture(url, file), input });
    const css = files.get(file).toString('utf8');
    const references = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)];
    if (!references.length) throw new Error(`Capture ${url}: missing font URLs`);
    for (const reference of references) {
      if (!new URL(reference[1]).pathname.endsWith('.woff2')) {
        throw new Error(`Capture ${url}: expected WOFF2 font, got ${reference[1]}`);
      }
      fontUrls.add(reference[1]);
    }
  }
  const urls = [...fontUrls].sort();
  for (let offset = 0; offset < urls.length; offset += 8) {
    assets.push(...await Promise.all(urls.slice(offset, offset + 8).map((url) =>
      capture(url, `google-fonts/${digest(url)}.woff2`))));
  }
  const licenses = await Promise.all([
    ...['ibmplexmono', 'instrumentserif', 'spacegrotesk', 'inter', 'ebgaramond'].map((family) =>
      capture(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`, `licenses/${family}-OFL.txt`)),
    capture(`https://raw.githubusercontent.com/MarcoPoloResearchLab/mpr-ui/v${uiVersion}/LICENSE`, 'licenses/mpr-ui-LICENSE'),
  ]);
  for (const [file, bytes] of files) {
    const destination = path.join(output, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1, userAgent, uiVersion, retrievedAt: new Date().toISOString(), assets, licenses,
  }, null, 2)}\n`);
  console.info(`Captured ${assets.length} assets and ${licenses.length} licenses (${[...files.values()].reduce((total, bytes) => total + bytes.length, 0)} bytes).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
