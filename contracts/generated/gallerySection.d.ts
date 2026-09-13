// Generated from contracts/*.schema.json. Do not edit.

export interface GallerySection {
  id: string;
  title: string;
  /**
   * @minItems 1
   * @maxItems 10000
   */
  artworkIds: [string, ...string[]];
}
