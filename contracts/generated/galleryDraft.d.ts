// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryDraft {
  gallery: {
    label: string;
    title: string;
    brand: string;
    description: string;
    /**
     * @minItems 0
     * @maxItems 10000
     */
    artworks: {
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
    }[];
    /**
     * @minItems 0
     * @maxItems 10000
     */
    collections: {
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
    }[];
    /**
     * @minItems 0
     * @maxItems 10000
     */
    exhibits: {
      id: string;
      title: string;
      subtitle: string;
      introduction: string;
      startDate: string;
      endDate: string;
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
      sections: [
        {
          id: string;
          title: string;
          /**
           * @minItems 1
           * @maxItems 10000
           */
          artworkIds: [string, ...string[]];
        },
        ...{
          id: string;
          title: string;
          /**
           * @minItems 1
           * @maxItems 10000
           */
          artworkIds: [string, ...string[]];
        }[]
      ];
    }[];
  };
  masters: {
    [k: string]: string;
  };
}
