// @ts-check
import { sourceCatalog, publicCatalog } from './generated/validators.js';

function unique(records, key, subject) {
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record[key])) throw new Error(`Validate catalog ${subject}: duplicate ${record[key]}`);
    ids.add(record[key]);
  }
  return ids;
}

export function validateReferences(value) {
  const articleIds = unique(value.articles.items, 'id', 'article ID');
  unique(value.articles.items, 'slug', 'article slug');
  unique(value.projects, 'id', 'project ID');
  unique(value.projects, 'slug', 'project slug');
  const articles = new Map(value.articles.items.map(item => [item.id, item]));
  for (const project of value.projects) {
    if (project.kind !== 'series') continue;
    for (const { articleId } of project.parts) {
      if (!articleIds.has(articleId) || (project.status === 'live' && articles.get(articleId).status !== 'live')) {
        throw new Error(`Validate catalog series ${project.id}: unresolved public article ${articleId}`);
      }
    }
  }
  unique(value.music.items, 'slug', 'album');
  unique(value.music.items.flatMap(album => album.tracks), 'id', 'track');
  validateGalleryReferences(value.gallery);
}

export function validateGalleryReferences(gallery) {
  const artworks = unique(gallery.artworks, 'id', 'artwork');
  unique(gallery.collections, 'id', 'collection'); unique(gallery.exhibits, 'id', 'exhibit');
  unique(gallery.artworks.flatMap(artwork => artwork.offer === null ? [] : [artwork.offer]), 'id', 'offer');
  for (const collection of gallery.collections) checkPresentation(collection, collection.artworkIds, artworks);
  for (const exhibit of gallery.exhibits) {
    if (exhibit.endDate < exhibit.startDate) throw new Error(`Validate catalog exhibit ${exhibit.id}: reversed dates`);
    unique(exhibit.sections, 'id', 'section');
    checkPresentation(exhibit, exhibit.sections.flatMap(section => section.artworkIds), artworks);
  }
}

function checkPresentation(value, ids, known) {
  if (new Set(ids).size !== ids.length || !ids.includes(value.coverArtworkId) || ids.some(id => !known.has(id))) {
    throw new Error(`Validate catalog presentation ${value.id}: invalid artwork references`);
  }
}

/** @returns {import('../../contracts/generated/sourceCatalog').SourceCatalog} */
export function validateSourceCatalog(value) {
  if (!sourceCatalog(value)) throw new Error(`Validate catalog source: ${JSON.stringify(sourceCatalog.errors)}`);
  validateReferences(value);
  return value;
}

/** @returns {import('../../contracts/generated/publicCatalog').PublicCatalog} */
export function validatePublicCatalog(value) {
  if (!publicCatalog(value)) throw new Error(`Validate catalog public: ${JSON.stringify(publicCatalog.errors)}`);
  validateReferences(value);
  if (value.articles.items.some(item => item.status !== 'live') || value.projects.some(item => item.status !== 'live') || value.music.items.some(item => item.status !== 'live')) {
    throw new Error('Validate catalog public: draft record');
  }
  return value;
}

export function publishCatalog(source) {
  const value = structuredClone(source);
  value.articles.items = value.articles.items.filter(item => item.status === 'live').map(({ body, ...metadata }) => metadata);
  value.projects = value.projects.filter(item => item.status === 'live');
  value.music.items = value.music.items.filter(item => item.status === 'live');
  return validatePublicCatalog(value);
}
