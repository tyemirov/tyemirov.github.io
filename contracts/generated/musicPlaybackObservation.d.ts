// Generated from contracts/*.schema.json. Do not edit.

export interface MusicPlaybackObservation {
  trackId: string;
  outcome: "playing" | "error" | "cancelled";
  action: "start" | "resume";
  browser: "chromium" | "firefox" | "webkit" | "other";
  elapsedMs: number;
  grantMs: number | null;
  readyMs: number | null;
  timeZone: string;
}
