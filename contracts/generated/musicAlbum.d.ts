// Generated from contracts/*.schema.json. Do not edit.

export interface MusicAlbum {
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
}
