// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryAssetPage {
  /**
   * @minItems 0
   * @maxItems 100
   */
  items: {
    id: string;
    checksum: string;
    width: number;
    height: number;
    format: "PNG" | "JPEG" | "WebP";
    createdAt: string;
  }[];
  nextCursor: string | null;
}
