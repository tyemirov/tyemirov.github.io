// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryOrderItem {
  artworkId: string;
  title: string;
  offer: {
    id: string;
    priceCents: number;
    currency: string;
    license: string;
    revision: string;
    file: {
      label: string;
      format: "PNG" | "JPEG" | "WebP";
      width: number;
      height: number;
    };
    deliveryTerms: string;
  };
}
