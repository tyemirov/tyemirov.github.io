// @ts-check
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import * as yaml from 'js-yaml';
import { validateSourceCatalog, publishCatalog } from '../../assets/js/catalog.js';
import { siteRuntime } from '../../assets/js/generated/validators.js';
import { renderMarkdown } from '../../assets/js/markdown.js';

const root = resolve(import.meta.dirname, '../..');
const output = process.argv[2];
if (!output) throw new Error('Supply the static output directory.');
const source = validateSourceCatalog(JSON.parse(await readFile(process.argv[3] || join(root, 'data/site.json'), 'utf8')));
const site = publishCatalog(source);
const resources = yaml.load(await readFile(join(root, '.mprlab/deploy/resources.yml'), 'utf8')).mprlab_resources.resources;
const origins = resources.filter(resource => resource.kind === 'caddy_route' && resource.handlers.some(handler => handler.upstream === 'tyemirov-site.music-http') && resource.handlers.some(handler => handler.upstream === 'tyemirov-site.gallery-http')).map(resource => `https://${resource.hostname}`);
if (origins.length !== 1) throw new Error('Select exactly one shared application API route.');
const config = { apiOrigin: origins[0] };
if (!siteRuntime(config)) throw new Error('Invalid generated public API origin.');
const uiConfig = JSON.parse(await readFile(join(root, 'config-ui.yaml'), 'utf8'));
const tenant = resources.find(resource => resource.kind === 'tauth_tenant' && resource.id === 'gallery-auth').tenant;
if (uiConfig.environments.length !== 1 || uiConfig.environments[0].auth.tauthUrl !== config.apiOrigin || uiConfig.environments[0].auth.tenantId !== tenant.id || JSON.stringify(uiConfig.environments[0].origins) !== JSON.stringify(tenant.origins)) throw new Error('The shared authentication configuration must match the selected tenant and API origin.');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const routes = new Map();
async function file(path, body) {
  await mkdir(resolve(output, path, '..'), { recursive: true });
  await writeFile(join(output, path), body);
}
function withNavigation(path, html) {
  const parent = path.startsWith('/music/') && path !== '/music/' ? ['Music','/music/']
    : path.startsWith('/gallery/') && path !== '/gallery/' ? ['Gallery','/gallery/']
    : path.startsWith('/articles/') && path !== '/articles/' ? ['Articles','/articles/'] : null;
  const navigation = `<nav slot="brand" class="site-navigation" aria-label="Page hierarchy"><a href="/" aria-label="Home" title="Home">^</a>${parent ? `<a href="${parent[1]}">${parent[0]}</a>` : ''}</nav>`;
  return html.replace(/<mpr-header\b[^>]*>[\s\S]*?<\/mpr-header>/, header => {
    const sourceLink = header.match(/brand-href="(https:[^"]+)"/);
    const companion = sourceLink && !html.replace(header,'').includes(sourceLink[1])
      ? `<a slot="nav-right" class="site-companion" href="${sourceLink[1]}" target="_blank" rel="noopener noreferrer">Read companion article</a>` : '';
    return header.replace('</mpr-header>',navigation+companion+'</mpr-header>');
  }).replace('</head>', '<link rel="stylesheet" href="/assets/css/navigation.css">\n</head>');
}
async function page(path, html) {
  if (routes.has(path)) throw new Error(`Duplicate page route: ${path}`);
  const target = `${path.slice(1)}index.html`;
  routes.set(path, target);
  await file(target, withNavigation(path, html));
}
function document(path, title, description, content) {
  return `<!doctype html>
<html lang="en"><head>
<script defer src="https://loopaware.mprlab.com/pixel.js?site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b&api_origin=https%3A%2F%2Floopaware-api.mprlab.com"></script>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} | Vadym Tyemirov</title><meta name="description" content="${escape(description)}">
<link rel="canonical" href="${new URL(path, site.site.canonical).href}">
<link rel="icon" type="image/png" href="/favicon.png"><link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/mpr-ui.css">
<script defer src="https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/mpr-ui.js"></script>
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/articles/style.css"><link rel="stylesheet" href="/assets/css/footer.css">
<script type="module" src="/articles/articles.js"></script>
</head><body><a class="skip-link" href="#main">Skip to content</a>
<mpr-header brand-label="Vadym Tyemirov · Writings" brand-href="/" settings="false"></mpr-header>
<main id="main" class="article-shell">${content}</main>
<mpr-footer sticky="false" id="site-footer" class="site-footer"></mpr-footer></body></html>\n`;
}
for (const path of ['/', '/music/', '/gallery/order/', '/gallery/studio/']) await page(path, await readFile(join(root, path, 'index.html'), 'utf8'));
for (const project of site.projects.filter(project => project.kind === 'tool')) await page(project.href, await readFile(join(root,project.href,'index.html'),'utf8'));
const articles = source.articles.items.filter(item => item.status === 'live').sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
await page('/articles/', document('/articles/', site.articles.title, 'Complete articles by Vadym Tyemirov.', `<h1>${escape(site.articles.title)}</h1><nav id="article-filters" aria-label="Filter articles"></nav><div id="article-list">${articles.map(article => `<article class="article-summary" data-kicker="${escape(article.kicker)}" data-source="${escape(article.source.label)}"><h2><a href="/articles/${article.slug}/">${escape(article.title)}</a></h2><p>${escape(article.summary)}</p></article>`).join('')}</div>`));
for (const article of articles) {
  const body = renderMarkdown(article.body.text);
  const images = new Set([...body.matchAll(/<img src="([^"]+)"/g)].map(match => match[1]));
  if (article.image) images.add(article.image.src);
  for (const path of images) {
    if (!/^\/articles\/images\/[a-z0-9-]+\.(png|jpg|jpeg|webp)$/.test(path)) throw new Error(`Invalid article image: ${path}`);
    await mkdir(join(output, 'articles/images'), { recursive: true });
    await copyFile(join(root, path), join(output, path));
  }
  const path = `/articles/${article.slug}/`;
  await page(path, document(path, article.title, article.summary, `<article class="article-body"><header><p class="eyebrow">${escape(article.kicker)}</p><h1>${escape(article.title)}</h1>${article.publishedAt ? `<time datetime="${article.publishedAt}">${article.publishedAt.slice(0, 10)}</time>` : ''}<p class="article-source"><a href="${escape(article.source.url)}">Read the original on ${escape(article.source.label)}</a></p></header>${body}</article>`));
}
let gallery = await readFile(join(root, 'gallery/index.html'), 'utf8');
// Every deep page uses site-absolute assets and a real static file.
gallery = gallery.replaceAll('href="assets/', 'href="/gallery/assets/').replaceAll('src="js/', 'src="/gallery/js/').replaceAll('href="images/', 'href="/gallery/images/');
for (const [path, title, description] of [
  ['/gallery/', site.gallery.brand, site.gallery.description],
  ['/gallery/about/', 'About the gallery', site.gallery.description],
  ['/gallery/cart/', 'Basket', site.gallery.description],
  ...['artworks', 'collections', 'exhibits'].flatMap(kind => site.gallery[kind].map(item => [`/gallery/${kind}/${item.id}/`, item.title, kind === 'artworks' ? item.description : item.introduction])),
]) {
  await page(path, gallery.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`).replace(/(<link rel="canonical" href=")[^"]*/, `$1${new URL(path, site.site.canonical).href}`).replace(/(<meta name="description" content=")[^"]*/, `$1${escape(description)}`));
}
for (const album of site.music.items) {
  const path = `/music/${album.slug}/`;
  const template = await readFile(join(root, 'scripts/site/templates/album.html'), 'utf8');
  await page(path, template.replace(/<title>[^<]*<\/title>/, `<title>${escape(album.title)} | Vadym Tyemirov</title><meta name="description" content="${escape(album.shortDescription)}"><link rel="canonical" href="${new URL(path,site.site.canonical).href}">`));
  await access(join(root, album.coverImage));
}
await file('data/site.json', JSON.stringify(site, null, 2) + '\n');
await file('config-site.json', JSON.stringify(config, null, 2) + '\n');
await file('config-ui.yaml', JSON.stringify(uiConfig, null, 2) + '\n');
await file('data/routes.json', JSON.stringify([...routes].map(([path, file]) => ({ path, file })), null, 2) + '\n');
await file('404.html', withNavigation('/404.html', document('/404.html', 'Page not found', 'The requested page does not exist.', '<h1>Page not found</h1>')));

await file('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + [...routes.keys()].filter(path=>!['/gallery/order/','/gallery/cart/','/gallery/studio/'].includes(path)).map(path=>`  <url><loc>${escape(new URL(path,site.site.canonical).href)}</loc></url>`).join('\n') + '\n</urlset>\n');
