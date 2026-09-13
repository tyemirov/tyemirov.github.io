// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryArtwork {
  id: string;
  title: string;
  description: string;
  alt: string;
  medium: string;
  year: string;
  image: {
    cardUrl: string;
    lightboxUrl: string;
    width: number;
    height: number;
    format: "PNG" | "JPEG" | "WebP";
  };
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
  } | null;
}
