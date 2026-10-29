// @ts-check
import { routes } from '../../assets/js/generated/routes.js';
import { musicPlaybackObservation } from '../../assets/js/generated/validators.js';

const MAX_TIMING_MS = 300000;
const elapsed = start => Math.min(MAX_TIMING_MS, Math.max(0, Math.round(performance.now() - start)));
const browserFamily = () => {
  const agent = navigator.userAgent;
  if (/Firefox\//.test(agent)) return 'firefox';
  if (/Chrom(?:e|ium)\//.test(agent)) return 'chromium';
  if (/AppleWebKit\//.test(agent)) return 'webkit';
  return 'other';
};

/** One bounded observation per playback attempt; delivery never blocks playback. */
export class PlaybackTiming {
  constructor(apiOrigin) { this.apiOrigin = apiOrigin; this.attempt = null; }
  begin(trackId, action) {
    this.finish('cancelled');
    this.attempt = { start: performance.now(), trackId, action, grantMs: null, readyMs: null };
  }
  authorize(trackId) {
    if (!this.attempt) this.begin(trackId, 'start');
    this.attempt.grantMs = null;
    this.attempt.readyMs = null;
  }
  mark(field) { if (this.attempt) this.attempt[field] = elapsed(this.attempt.start); }
  finish(outcome) {
    const attempt = this.attempt;
    if (!attempt) return;
    this.attempt = null;
    const report = { trackId: attempt.trackId, action: attempt.action, outcome, browser: browserFamily(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      elapsedMs: elapsed(attempt.start), grantMs: attempt.grantMs, readyMs: attempt.readyMs };
    if (!musicPlaybackObservation(report)) throw new Error('Invalid playback observation.');
    void fetch(this.apiOrigin + routes.music.createPlaybackObservation.path, {
      method: 'POST', credentials: 'include', redirect: 'error', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report), signal: AbortSignal.timeout(5000),
    }).then(response => { if (response.status !== 204) console.warn('Playback timing report rejected.', response.status); })
      .catch(() => console.warn('Playback timing report could not be delivered.'));
  }
}
