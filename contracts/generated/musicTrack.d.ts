// Generated from contracts/*.schema.json. Do not edit.

export interface MusicTrack {
  id: string;
  slug: string;
  title: string;
  playback:
    | {
        kind: "external";
      }
    | {
        kind: "file";
        durationMs: number;
      };
}
