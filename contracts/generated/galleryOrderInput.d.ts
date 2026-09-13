// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryOrderInput {
  /**
   * @minItems 1
   * @maxItems 20
   */
  offerIds: [string, ...string[]];
  email: string;
  catalogDigest: string;
}
