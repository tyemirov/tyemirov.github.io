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
const capabilities = ['tyemirov-site.gallery-http', 'tyemirov-site.music-http'];
const apiRoutes = resources.filter(resource => resource.kind === 'caddy_route' && resource.handlers.some(handler => capabilities.includes(handler.upstream)));
if (apiRoutes.length !== 1 || !capabilities.every(capability => apiRoutes[0].handlers.some(handler => handler.upstream === capability))) throw new Error('Select one API route for Gallery and music.');
const config = { apiOrigin: `https://${apiRoutes[0].hostname}` };
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
function parentFor(path) {
  if (site.projects.some(project => project.kind === 'model' && project.href === path)) return { label: 'Articles', path: '/articles/' };
  for (const [prefix, label] of [['/music/', 'Music'], ['/gallery/', 'Gallery'], ['/articles/', 'Articles']]) {
    if (path.startsWith(prefix) && path !== prefix) return { label, path: prefix };
  }
  return null;
}
function withNavigation(path, html) {
  const parent = parentFor(path);
  const navigation = `<nav slot="brand" class="site-navigation" aria-label="Page hierarchy"><a href="/" aria-label="Home" title="Home">^</a>${parent ? `<a href="${parent.path}">${parent.label}</a>` : ''}</nav>`;
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
function document(path, title, description, content, options = {}) {
  const canonical = new URL(path, site.site.canonical).href;
  const ogType = options.ogType || 'website';
  const imageUrl = options.image ? new URL(options.image, site.site.canonical).href : null;
  const imageTags = imageUrl
    ? `<meta property="og:image" content="${imageUrl}">\n<meta name="twitter:image" content="${imageUrl}">\n<meta name="twitter:card" content="summary_large_image">`
    : '<meta name="twitter:card" content="summary">';
  const schemaTag = options.schema ? `\n<script type="application/ld+json">\n${JSON.stringify(options.schema, null, 2)}\n</script>` : '';

  return `<!doctype html>
<html lang="en"><head>
<script defer src="https://loopaware.mprlab.com/pixel.js?site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b&api_origin=https%3A%2F%2Floopaware-api.mprlab.com"></script>
<meta name="author" content="Vadym Tyemirov"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} | Vadym Tyemirov</title><meta name="description" content="${escape(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="Vadym Tyemirov">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${escape(title)} | Vadym Tyemirov">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${canonical}">
${imageTags}
<meta name="twitter:title" content="${escape(title)} | Vadym Tyemirov">
<meta name="twitter:description" content="${escape(description)}">
<link rel="icon" type="image/png" href="/favicon.png"><link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/mpr-ui.css">
<script defer src="https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/mpr-ui.js"></script>
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/articles/style.css"><link rel="stylesheet" href="/assets/css/footer.css">
<script type="module" src="/articles/articles.js"></script>${schemaTag}
</head><body class="content-page"><a class="skip-link" href="#main">Skip to content</a>
<mpr-header brand-label="Vadym Tyemirov" brand-href="/" settings="false"></mpr-header>
<main id="main" class="article-shell">${content}</main>
<mpr-footer sticky="false" id="site-footer" class="site-footer"></mpr-footer></body></html>\n`;
}
for (const path of ['/', '/music/', '/gallery/order/', '/gallery/studio/']) await page(path, await readFile(join(root, path, 'index.html'), 'utf8'));
for (const project of site.projects.filter(project => project.kind === 'model')) await page(project.href, await readFile(join(root,project.href,'index.html'),'utf8'));
const articles = source.articles.items.filter(item => item.status === 'live').sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

const articleCards = articles.map(article => `  <article class="project-card">
    <div class="card-tags"><button type="button" class="card-kicker-tag" data-filter-tag="${escape(article.kicker)}">${escape(article.kicker)}</button></div>
    <h2><a href="/articles/${escape(article.slug)}/">${escape(article.title)}</a></h2>
    <p class="card-body">${escape(article.summary || '')}</p>
    <div class="project-actions">
      <a href="/articles/${escape(article.slug)}/" class="button button-primary">Read article</a>
      <a href="${escape(article.source.url)}" class="button button-secondary" target="_blank" rel="noopener noreferrer">Read on ${escape(article.source.label)}</a>
    </div>
  </article>`).join('\n');

const projectCards = site.projects.filter(p => p.kind === 'model').sort((a, b) => a.order - b.order).map(project => `  <article class="project-card" data-theme="${escape(project.theme || 'slate')}">
    <div class="card-tags"><button type="button" class="card-kicker-tag" data-filter-tag="${escape(project.kicker)}">${escape(project.kicker)}</button></div>
    <h2><a href="${escape(project.href)}">${escape(project.title)}</a></h2>
    <p class="card-body">${escape(project.summary || '')}</p>
    <div class="project-actions">
      <a href="${escape(project.href)}" class="button button-primary">Open model</a>
      ${project.sourceUrl ? `<a href="${escape(project.sourceUrl)}" class="button button-secondary" target="_blank" rel="noopener noreferrer">Read companion article</a>` : ''}
    </div>
  </article>`).join('\n');

const articlesHubSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "name": `${site.articles.title} | Vadym Tyemirov`,
      "url": new URL('/articles/', site.site.canonical).href,
      "description": "Complete articles by Vadym Tyemirov."
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": site.site.canonical },
        { "@type": "ListItem", "position": 2, "name": "Articles", "item": new URL('/articles/', site.site.canonical).href }
      ]
    }
  ]
};

await page('/articles/', document(
  '/articles/',
  site.articles.title,
  'Complete articles by Vadym Tyemirov.',
  `<h1>${escape(site.articles.title)}</h1><nav id="article-filters" aria-label="Filter articles"></nav><p class="topic-empty" hidden>No items match this topic.</p><div id="article-list" class="article-list">\n${articleCards}\n${projectCards}\n</div>`,
  { schema: articlesHubSchema }
));

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
  const canonicalUrl = new URL(path, site.site.canonical).href;
  const articleSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": article.title,
        "description": article.summary,
        "url": canonicalUrl,
        "datePublished": article.publishedAt,
        "dateModified": article.updatedAt || article.publishedAt,
        "author": {
          "@type": "Person",
          "name": "Vadym Tyemirov",
          "url": site.site.canonical
        },
        "publisher": {
          "@type": "Person",
          "name": "Vadym Tyemirov",
          "url": site.site.canonical
        },
        ...(article.image ? { "image": new URL(article.image.src, site.site.canonical).href } : {}),
        "mainEntityOfPage": canonicalUrl
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": site.site.canonical },
          { "@type": "ListItem", "position": 2, "name": "Articles", "item": new URL('/articles/', site.site.canonical).href },
          { "@type": "ListItem", "position": 3, "name": article.title, "item": canonicalUrl }
        ]
      }
    ]
  };
  await page(path, document(
    path,
    article.title,
    article.summary,
    `<article class="article-body"><header><p class="eyebrow">${escape(article.kicker)}</p><h1>${escape(article.title)}</h1>${article.publishedAt ? `<time datetime="${article.publishedAt}">${article.publishedAt.slice(0, 10)}</time>` : ''}<p class="article-source"><a href="${escape(article.source.url)}">Read the original on ${escape(article.source.label)}</a></p></header>${body}</article>`,
    {
      ogType: 'article',
      image: article.image ? article.image.src : undefined,
      schema: articleSchema
    }
  ));
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
  const canonicalUrl = new URL(path, site.site.canonical).href;
  const coverUrl = new URL(album.coverImage, site.site.canonical).href;
  const translitName = album.slug === 'singing-pasternak' ? 'Poyushchiy Pasternak' : (album.slug === 'february-get-ink-and-weep' ? 'Fevral. Dostat chernil i plakat' : undefined);
  const albumSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "MusicAlbum",
        "name": album.title,
        ...(translitName || album.translation ? { "alternateName": translitName || album.translation } : {}),
        "description": album.shortDescription,
        "url": canonicalUrl,
        "image": coverUrl,
        "byArtist": {
          "@type": "Person",
          "name": "Vadym Tyemirov",
          "url": site.site.canonical
        },
        "numTracks": album.tracks.length,
        "track": album.tracks.map((t, idx) => ({
          "@type": "MusicRecording",
          "name": t.title,
          "position": idx + 1
        }))
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": site.site.canonical },
          { "@type": "ListItem", "position": 2, "name": "Music", "item": new URL('/music/', site.site.canonical).href },
          { "@type": "ListItem", "position": 3, "name": album.title, "item": canonicalUrl }
        ]
      }
    ]
  };
  const template = await readFile(join(root, 'scripts/site/templates/album.html'), 'utf8');
  const albumHead = `<title>${escape(album.title)} | Vadym Tyemirov</title>
<meta name="description" content="${escape(album.shortDescription)}">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:site_name" content="Vadym Tyemirov">
<meta property="og:type" content="music.album">
<meta property="og:title" content="${escape(album.title)} | Vadym Tyemirov">
<meta property="og:description" content="${escape(album.shortDescription)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:image" content="${coverUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(album.title)} | Vadym Tyemirov">
<meta name="twitter:description" content="${escape(album.shortDescription)}">
<meta name="twitter:image" content="${coverUrl}">
<script type="application/ld+json">
${JSON.stringify(albumSchema, null, 2)}
</script>`;
  await page(path, template.replace(/<title>[^<]*<\/title>/, albumHead));
  await access(join(root, album.coverImage));
}
await file('data/site.json', JSON.stringify(site, null, 2) + '\n');
await file('config-site.json', JSON.stringify(config, null, 2) + '\n');
await file('config-ui.yaml', JSON.stringify(uiConfig, null, 2) + '\n');
await file('data/routes.json', JSON.stringify([...routes].map(([path, file]) => ({ path, file, parent: parentFor(path) })), null, 2) + '\n');
await file('404.html', withNavigation('/404.html', document('/404.html', 'Page not found', 'The requested page does not exist.', '<h1>Page not found</h1>')));

function lastmodFor(path) {
  if (path.startsWith('/articles/')) {
    const slug = path.split('/')[2];
    if (!slug) {
      const dates = articles.map(a => a.updatedAt || a.publishedAt).filter(Boolean);
      return dates.length ? dates.sort().pop().slice(0, 10) : null;
    }
    const article = articles.find(a => a.slug === slug);
    if (article) return (article.updatedAt || article.publishedAt || '').slice(0, 10) || null;
  }
  if (path.startsWith('/gallery/exhibits/')) {
    const id = path.split('/')[3];
    const exhibit = site.gallery.exhibits.find(e => e.id === id);
    if (exhibit?.startDate) return exhibit.startDate;
  }
  if (path.startsWith('/gallery/artworks/')) {
    const id = path.split('/')[3];
    const artwork = site.gallery.artworks.find(a => a.id === id);
    if (artwork?.year) return `${artwork.year}-01-01`;
  }
  if (path.startsWith('/gallery/collections/')) {
    return '2025-10-01';
  }
  if (path.startsWith('/music/')) {
    const slug = path.split('/')[2];
    if (!slug) return '2026-01-01';
    const album = site.music.items.find(a => a.slug === slug);
    if (album?.releaseDate?.value) {
      return album.releaseDate.value.length === 4 ? `${album.releaseDate.value}-01-01` : album.releaseDate.value;
    }
  }
  return null;
}

await file('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + [...routes.keys()].filter(path=>!['/gallery/order/','/gallery/cart/','/gallery/studio/'].includes(path)).map(path=>{
  const lastmod = lastmodFor(path);
  return `  <url><loc>${escape(new URL(path,site.site.canonical).href)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
}).join('\n') + '\n</urlset>\n');
