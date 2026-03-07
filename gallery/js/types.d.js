/**
 * @typedef {Object} Artwork
 * @property {string} id
 * @property {string} title
 * @property {number} priceUsd
 * @property {string} dimensions
 * @property {string} [preview]
 * @property {string} [image]
 * @property {string} medium
 * @property {string} year
 * @property {string} [profile]
 * @property {string} [dominantHue]
 * @property {string} [fileType]
 * @property {number} [editionSize]
 * @property {number} [editionNumber]
 * @property {string} [sku]
 * @property {string} [specNotes]
 */

/**
 * @typedef {Object} Exhibit
 * @property {string} id
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [blurb]
 * @property {string} start_date
 * @property {string} end_date
 * @property {Artwork[]} artworks
 */

/**
 * @typedef {Object} ExhibitCatalog
 * @property {Exhibit[]} exhibits
 */

/**
 * @typedef {Object} SiteConfig
 * @property {string} brand
 * @property {{ provider: string, paypal_client_id?: string, currency?: string }} payment
 * @property {string[]} routes
 * @property {string} [siteUrl]
 */

/**
 * @typedef {Object} CartItem
 * @property {string} artworkId
 * @property {string} exhibitId
 * @property {string} exhibitTitle
 * @property {string} title
 * @property {number} priceUsd
 * @property {number} quantity
 * @property {string | undefined} preview
 * @property {string | undefined} image
 * @property {string | undefined} editionLabel
 * @property {string | undefined} medium
 */

/**
 * @typedef {Object} GroupedExhibit
 * @property {string} id
 * @property {string} title
 * @property {(Exhibit & { status: string; statusLabel: string; dateRangeText: string; primaryArtwork?: Artwork | undefined })[]} items
 */
