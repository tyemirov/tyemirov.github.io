// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryAsset {
  id: string;
  checksum: string;
  width: number;
  height: number;
  format: "PNG" | "JPEG" | "WebP";
  createdAt: string;
}
