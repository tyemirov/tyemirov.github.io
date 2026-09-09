// @ts-check
import { createPlaybackEngine } from "./engine.js";
import { remainingLifetime } from "./api.js";

const RENEW_BEFORE_MS = 600000;
const OBSERVE_EVERY_MS = 60000;
const STABLE_PLAYBACK_MS = 2000;
const LOST_ACCESS = new Set(["session_required", "grant_expired", "not_found"]);

/** One controller owns the document's audio element, selected track, and queue. */
export class PlayerController extends EventTarget {
  constructor(audio, api, album) {
    super();
    this.audio = audio;
    this.api = api;
    this.album = album;
    this.queue = album.tracks.filter((track) => track.playback.kind === "hls");
    this.track = null;
    this.grant = null;
    this.phase = "idle";
    this.message = "";
    this.sequence = 0;
    this.operation = null;
    this.replacements = 0;
    this.recoveryOwner = null;
    this.renewing = false;
    this.accessTimer = null;
    this.retryTimer = null;
    this.blockedUntil = 0;
    this.stableSince = 0;
    this.savedPosition = 0;
    this.resumePosition = 0;
    this.sourceInvalid = false;
    this.events = new AbortController();
    this.engine = createPlaybackEngine(audio, (error) => { void this.recover(error); });
    const on = (name, listener) => audio.addEventListener(name, listener, { signal: this.events.signal });
    on("playing", () => { if (!audio.paused && this.phase !== "error" && this.phase !== "authorizing") this.setPhase("playing", "Playing."); });
    on("pause", () => { if (["playing", "buffering"].includes(this.phase) && !audio.ended) this.setPhase("paused", "Paused."); });
    on("waiting", () => { if (this.phase === "playing") this.setPhase("buffering", "Loading audio."); });
    on("timeupdate", () => {
      if (["playing", "paused"].includes(this.phase) && audio.readyState >= 1) this.resumePosition = audio.currentTime;
      if (this.phase === "playing" && performance.now() - this.stableSince >= STABLE_PLAYBACK_MS) this.replacements = 0;
      this.changed();
    });
    on("volumechange", () => this.changed());
    on("ended", () => {
      const index = this.queue.indexOf(this.track);
      if (index + 1 < this.queue.length) void this.select(this.queue[index + 1].id);
      else this.setPhase("ended", "Album finished.");
    });
  }

  changed() { this.dispatchEvent(new Event("change")); }
  setPhase(phase, message) {
    if (phase === "playing" && this.phase !== "playing") this.stableSince = performance.now();
    this.phase = phase;
    this.message = message;
    if (phase === "playing") {
      if (this.accessTimer === null) this.accessTimer = setInterval(() => { void this.renewIfNeeded(); }, OBSERVE_EVERY_MS);
      void this.renewIfNeeded();
    } else {
      clearInterval(this.accessTimer);
      this.accessTimer = null;
    }
    this.changed();
  }

  retryDelay() { return Math.max(0, Math.ceil((this.blockedUntil - performance.now()) / 1000)); }

  snapshot() {
    const index = this.queue.indexOf(this.track);
    const delay = this.retryDelay();
    return { phase: this.phase, message: this.phase === "error" && delay ? `Playback is busy. Try again in ${delay} seconds.` : this.message, album: this.album, track: this.track,
      retryDelay: delay, renewing: this.renewing,
      position: this.sourceInvalid ? this.resumePosition : this.audio.currentTime, duration: this.track ? this.track.playback.durationMs / 1000 : 0,
      volume: this.audio.volume, previous: index > 0, next: index >= 0 && index + 1 < this.queue.length };
  }

  fail(error) {
    this.savedPosition = this.audio.readyState >= 1 ? this.audio.currentTime : this.resumePosition;
    if (error?.retryAfter) this.blockedUntil = Math.max(this.blockedUntil, performance.now() + error.retryAfter * 1000);
    this.setPhase("error", error?.code === "track_unavailable" ? "This track is unavailable." : "Playback is unavailable. Try again.");
    this.engine.stop();
    if (this.retryDelay() && this.retryTimer === null) {
      this.retryTimer = setInterval(() => {
        if (!this.retryDelay()) { clearInterval(this.retryTimer); this.retryTimer = null; }
        this.changed();
      }, 250);
    }
  }

  async select(id) {
    const track = this.queue.find((item) => item.id === id);
    if (!track) throw new Error("Selected track is outside the playable queue.");
    if (track === this.track && ["playing", "buffering"].includes(this.phase)) return;
    if (track === this.track && this.phase === "paused") { await this.resume(); return; }
    this.replacements = 0;
    this.recoveryOwner = null;
    await this.start(track, 0);
  }

  async start(track, position) {
    const sequence = ++this.sequence;
    this.operation?.abort();
    this.operation = new AbortController();
    this.renewing = false;
    this.resumePosition = position;
    this.sourceInvalid = false;
    const signal = this.operation.signal;
    const previous = this.grant;
    this.track = track;
    this.grant = null;
    this.setPhase("authorizing", "Preparing playback.");
    this.engine.stop();
    if (this.retryDelay()) { this.fail(); return; }
    try {
      const grant = await this.api.create(track, signal);
      if (sequence !== this.sequence) return;
      this.grant = grant;
      this.setPhase("loading", "Loading audio.");
      await this.engine.load(grant.playlistUrl, position);
      if (sequence !== this.sequence) return;
      if (previous) void this.api.revoke(previous).catch((error) => console.warn("Previous playback grant cleanup failed.", error.code));
      await this.audio.play();
      if (sequence !== this.sequence) return;
      this.setPhase(this.audio.paused ? "paused" : "playing", this.audio.paused ? "Paused." : "Playing.");
    } catch (error) {
      if (sequence !== this.sequence || signal.aborted || this.phase === "error") return;
      if (error.name === "NotAllowedError") this.setPhase("paused", "Press Play to start.");
      else await this.recover(error);
    }
  }

  pause() { this.audio.pause(); }

  async resume() {
    if (!this.track || !this.grant) return;
    const sequence = this.sequence;
    const signal = this.operation.signal;
    this.setPhase("authorizing", "Preparing playback.");
    try {
      const grant = await this.api.read(this.grant, this.track, signal);
      if (sequence !== this.sequence) return;
      this.grant = grant;
      if (remainingLifetime(grant) < RENEW_BEFORE_MS) {
        const renewed = await this.api.renew(grant, this.track, signal);
        if (sequence !== this.sequence) return;
        this.grant = renewed;
      }
      if (this.sourceInvalid) {
        const position = this.resumePosition;
        await this.engine.load(this.grant.playlistUrl, position);
        if (sequence !== this.sequence) return;
        this.sourceInvalid = false;
      }
      await this.audio.play();
      if (sequence === this.sequence) this.setPhase(this.audio.paused ? "paused" : "playing", this.audio.paused ? "Paused." : "Playing.");
    } catch (error) {
      if (sequence !== this.sequence || signal.aborted) return;
      if (error.name === "NotAllowedError") this.setPhase("paused", "Press Play to start.");
      else await this.recover(error);
    }
  }

  async renewIfNeeded() {
    if (this.phase !== "playing" || !this.grant || this.renewing || remainingLifetime(this.grant) >= RENEW_BEFORE_MS) return;
    const sequence = this.sequence;
    const signal = this.operation.signal;
    this.renewing = true;
    this.changed();
    try {
      const grant = await this.api.renew(this.grant, this.track, signal);
      if (sequence === this.sequence) this.grant = grant;
    } catch (error) {
      if (sequence === this.sequence && !signal.aborted) await this.recover(error);
    } finally {
      if (sequence === this.sequence) { this.renewing = false; this.changed(); }
    }
  }

  async recover(error) {
    if (this.audio.paused && !["authorizing", "loading", "error"].includes(this.phase) && !error.code) {
      if (this.audio.readyState >= 1) this.resumePosition = this.audio.currentTime;
      this.sourceInvalid = true;
      this.engine.stop();
      this.setPhase("paused", "Press Play to resume.");
      return;
    }
    if (this.phase === "error") return;
    if (!this.grant || this.recoveryOwner !== null) { this.fail(error); return; }
    const sequence = this.sequence;
    const signal = this.operation.signal;
    const position = this.audio.readyState >= 1 ? this.audio.currentTime : this.resumePosition;
    this.recoveryOwner = sequence;
    try {
      let reason = error;
      if (!reason.code) {
        try { await this.api.read(this.grant, this.track, signal); }
        catch (stateError) { reason = stateError; }
      }
      if (sequence !== this.sequence || signal.aborted) return;
      if (LOST_ACCESS.has(reason.code) && this.replacements === 0) {
        this.replacements++;
        await this.start(this.track, position);
      } else this.fail(reason);
    } finally {
      if (this.recoveryOwner === sequence) this.recoveryOwner = null;
    }
  }

  retry() {
    if (this.track && !this.retryDelay()) {
      this.replacements = 0;
      this.recoveryOwner = null;
      void this.start(this.track, this.savedPosition);
    }
  }
  seek(position) { this.resumePosition = Math.max(0, Math.min(position, this.track.playback.durationMs / 1000)); if (!this.sourceInvalid) this.audio.currentTime = this.resumePosition; this.changed(); }
  setVolume(volume) { this.audio.volume = volume; }
  previous() { const index = this.queue.indexOf(this.track); if (index > 0) void this.select(this.queue[index - 1].id); }
  next() { const index = this.queue.indexOf(this.track); if (index + 1 < this.queue.length) void this.select(this.queue[index + 1].id); }

  dispose() {
    this.sequence++;
    this.operation?.abort();
    this.events.abort();
    clearInterval(this.accessTimer);
    clearInterval(this.retryTimer);
    this.engine.destroy();
  }
}
