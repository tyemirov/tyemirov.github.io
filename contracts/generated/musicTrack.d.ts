// Generated from contracts/*.schema.json. Do not edit.

export interface MusicTrack {
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
}
