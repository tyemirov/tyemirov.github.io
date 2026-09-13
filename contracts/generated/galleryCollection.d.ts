// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryCollection {
  id: string;
  title: string;
  introduction: string;
  coverArtworkId: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  coverPosition: never[];
  /**
   * @minItems 1
   * @maxItems 10000
   */
  artworkIds: [string, ...string[]];
}
