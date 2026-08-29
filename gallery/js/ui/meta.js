// @ts-check
import { STRINGS } from '../constants.js';

const metaNodes = {
  description: /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="description"]')),
  ogTitle: /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[property="og:title"]')),
  ogDescription: /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[property="og:description"]')),
  ogImage: /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[property="og:image"]')),
  ogUrl: /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[property="og:url"]')),
  twitterTitle: /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="twitter:title"]')),
  twitterDescription: /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="twitter:description"]')),
  twitterImage: /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="twitter:image"]')),
  canonical: /** @type {HTMLLinkElement | null} */ (document.querySelector('link[rel="canonical"]')),
  structuredData: /** @type {HTMLScriptElement | null} */ (document.getElementById('structured-data'))
};

const defaults = {
  title: document.title,
  description: metaNodes.description?.getAttribute('content') || STRINGS.galleryDescription,
  image: metaNodes.ogImage?.getAttribute('content') || '',
  url: metaNodes.ogUrl?.getAttribute('content') || window.location.href,
  canonical: metaNodes.canonical?.getAttribute('href') || window.location.href
};

/**
 * @param {HTMLMetaElement | HTMLLinkElement | null} element
 * @param {string} value
 */
function setContent(element, value) {
  if (!element) {
    return;
  }
  if (element.tagName === 'LINK') {
    element.setAttribute('href', value);
  } else {
    element.setAttribute('content', value);
  }
}

/**
 * @param {string} value
 */
function setStructuredData(value) {
  if (!metaNodes.structuredData) {
    return;
  }
  metaNodes.structuredData.textContent = value;
}

/**
 * @param {string} path
 * @param {string} siteUrl
 * @returns {string}
 */
function toAbsoluteUrl(path, siteUrl) {
  if (!path) {
    return siteUrl;
  }
  try {
    const url = new URL(path, siteUrl);
    return url.toString();
  } catch (_error) {
    return path;
  }
}

/**
 * @param {import('../types.d.js').Artwork} artwork
 * @returns {string}
 */
function buildMuseumLabel(artwork) {
  const profile = artwork.profile || 'sRGB';
  return `${artwork.medium} · ${artwork.year} · ${artwork.dimensions} · ${profile}`;
}

/**
 * @param {import('../types.d.js').Artwork} artwork
 * @param {string} canonicalUrl
 * @param {string} siteUrl
 * @param {string} currency
 * @returns {Record<string, unknown>}
 */
function buildArtworkJsonLd(artwork, canonicalUrl, siteUrl, currency) {
  const artworkUrl = `${canonicalUrl}#${artwork.id}`;
  const imageUrl = toAbsoluteUrl(artwork.image || artwork.preview || '', siteUrl);
  return {
    '@type': 'VisualArtwork',
    '@id': artworkUrl,
    name: artwork.title,
    artMedium: artwork.medium,
    artform: 'Digital art',
    artEdition: artwork.editionSize ? `Edition of ${artwork.editionSize}` : undefined,
    artWorkSurface: 'Digital canvas',
    productionYear: artwork.year,
    description: buildMuseumLabel(artwork),
    image: imageUrl,
    url: artworkUrl,
    offers: {
      '@type': 'Offer',
      price: artwork.priceUsd.toFixed(2),
      priceCurrency: currency,
      availability: 'https://schema.org/InStock'
    }
  };
}

/**
 * @param {import('../types.d.js').GroupedExhibit[0]['items'][0]} exhibit
 * @param {{
 *  siteUrl: string;
 *  currency: string;
 *  brand: string;
 * }} options
 */
export function applyExhibitMetadata(exhibit, options) {
  const { siteUrl, currency, brand } = options;
  const canonicalUrl = `${siteUrl.replace(/\/?$/, '')}/#/exhibits/${encodeURIComponent(exhibit.id)}`;
  const description = exhibit.blurb || `${brand} presents limited digital editions.`;
  const primaryImage = exhibit.primaryArtwork?.image || exhibit.primaryArtwork?.preview || defaults.image;
  const absoluteImage = toAbsoluteUrl(primaryImage, siteUrl);

  document.title = `${exhibit.title} · ${brand}`;
  setContent(metaNodes.description, description);
  setContent(metaNodes.ogTitle, document.title);
  setContent(metaNodes.twitterTitle, document.title);
  setContent(metaNodes.ogDescription, description);
  setContent(metaNodes.twitterDescription, description);
  setContent(metaNodes.ogImage, absoluteImage);
  setContent(metaNodes.twitterImage, absoluteImage);
  setContent(metaNodes.ogUrl, canonicalUrl);
  setContent(metaNodes.canonical, canonicalUrl);

  const structuredGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ExhibitionEvent',
        name: exhibit.title,
        description,
        startDate: exhibit.start_date,
        endDate: exhibit.end_date,
        image: absoluteImage,
        url: canonicalUrl,
        location: {
          '@type': 'VirtualLocation',
          url: canonicalUrl
        },
        workFeatured: Array.isArray(exhibit.artworks)
          ? exhibit.artworks.map((artwork) => buildArtworkJsonLd(artwork, canonicalUrl, siteUrl, currency))
          : []
      }
    ]
  };

  setStructuredData(JSON.stringify(structuredGraph, null, 2));
}

/**
 * @param {{ brand: string; siteUrl: string }} options
 */
export function applyDefaultMetadata(options) {
  const { brand, siteUrl } = options;
  const normalisedSiteUrl = siteUrl.replace(/\/$/, '') || defaults.url;
  const canonicalUrl = `${normalisedSiteUrl}/`;
  document.title = brand;
  setContent(metaNodes.description, defaults.description);
  setContent(metaNodes.ogTitle, brand);
  setContent(metaNodes.twitterTitle, brand);
  setContent(metaNodes.ogDescription, defaults.description);
  setContent(metaNodes.twitterDescription, defaults.description);
  setContent(metaNodes.ogImage, defaults.image);
  setContent(metaNodes.twitterImage, defaults.image);
  setContent(metaNodes.ogUrl, canonicalUrl);
  setContent(metaNodes.canonical, canonicalUrl);

  const galleryStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'ArtGallery',
    name: brand,
    url: canonicalUrl,
    description: STRINGS.galleryDescription
  };
  setStructuredData(JSON.stringify(galleryStructuredData, null, 2));
}
