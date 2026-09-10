// Generated from contracts/*.schema.json. Do not edit.

export interface PublicCatalog {
  site: {
    title: string;
    description: string;
    canonical: string;
  };
  contact: {
    label: string;
    href: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    summary: string;
    detail: string;
    /**
     * @minItems 0
     * @maxItems 20
     */
    links: {
      label: string;
      href: string;
      style: "primary" | "secondary";
      order: number;
      target?: "_blank";
    }[];
  };
  profile: {
    ariaLabel: string;
    name: string;
    role: string;
    footnote: string;
    alt: string;
    sizes: string;
    image: {
      webp: {
        srcset: string;
        type: "image/webp";
      };
      jpg: {
        src: string;
        srcset: string;
        width: number;
        height: number;
      };
    };
  };
  mprlab: {
    label: string;
    blurb: string;
  };
  /**
   * @minItems 0
   * @maxItems 10000
   */
  projects: (
    | {
        id: string;
        slug: string;
        title: string;
        summary: string;
        kicker: "AI" | "Modeling" | "Decisioning" | "Arts" | "Writings";
        status: "draft" | "live";
        order: number;
        source: string;
        theme: "copper" | "teal" | "olive" | "slate" | "amber" | "indigo" | "violet";
        kind: "tool";
        href: string;
        cta: string;
        sourceUrl: string;
      }
    | {
        id: string;
        slug: string;
        title: string;
        summary: string;
        kicker: "AI" | "Modeling" | "Decisioning" | "Arts" | "Writings";
        status: "draft" | "live";
        order: number;
        source: string;
        theme: "copper" | "teal" | "olive" | "slate" | "amber" | "indigo" | "violet";
        kind: "series";
        /**
         * @minItems 1
         * @maxItems 100
         */
        parts: [
          {
            articleId: string;
          },
          ...{
            articleId: string;
          }[]
        ];
      }
  )[];
  music: {
    label: string;
    title: string;
    /**
     * @minItems 0
     * @maxItems 10000
     */
    items: {
      slug: string;
      title: string;
      displayTitle?: string;
      translation?: string;
      subtitle: string;
      coverImage: string;
      releaseDate:
        | {
            precision: "year";
            value: string;
          }
        | {
            precision: "day";
            value: string;
          };
      status: "draft" | "live";
      latest?: boolean;
      shortDescription: string;
      streamingLinks: {
        spotify?: string;
        apple?: string;
        youtube?: string;
        amazon?: string;
        suno?: string;
      };
      /**
       * @minItems 0
       * @maxItems 10000
       */
      tracks: {
        id: string;
        title: string;
        playback:
          | {
              kind: "external";
            }
          | {
              kind: "hls";
              durationMs: number;
            };
      }[];
      credits: string;
      notes: {
        format: "commonmark";
        text: string;
      };
      order: number;
    }[];
  };
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
  articles: {
    label: string;
    title: string;
    /**
     * @minItems 0
     * @maxItems 10000
     */
    items: {
      id: string;
      slug: string;
      title: string;
      summary: string;
      kicker: "AI" | "Modeling" | "Decisioning" | "Arts" | "Writings";
      status: "draft" | "live";
      order: number;
      publishedAt: string | null;
      updatedAt: string | null;
      source: {
        label: string;
        url: string;
      };
      image: {
        src: string;
        alt: string;
        width: number;
        height: number;
      } | null;
    }[];
  };
}
