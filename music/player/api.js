// @ts-check
import { routes } from "../../assets/js/generated/routes.js";
import { musicGrant, musicError, siteRuntime } from "../../assets/js/generated/validators.js";
const GRANTS = routes.music.createGrant.path;
const GRANT_ID = /^[A-Za-z0-9_-]{22}$/;
const ERROR_CODES = new Set(["session_required", "origin_denied", "not_found", "grant_expired", "track_unavailable", "grant_limit", "rate_limited", "media_unavailable", "invalid_request", "json_required", "body_too_large", "method_not_allowed", "headers_denied"]);

export class PlaybackError extends Error {
  constructor(code, status = 0, retryAfter = 0) {
    super(code);
    this.name = "PlaybackError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** @param {string | null | undefined} retryAfter */
export function rateLimitError(retryAfter) {
  const delay = Number(retryAfter);
  if (!Number.isSafeInteger(delay) || delay < 1) return new PlaybackError("invalid_response", 429);
  return new PlaybackError("rate_limited", 429, delay);
}

function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) throw new PlaybackError("invalid_response");
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== value.slice(0, 19)) throw new PlaybackError("invalid_response");
  return time;
}

function validateGrant(value, track, origin) {
  if (!musicGrant(value)) throw new PlaybackError("invalid_response");
  if (!GRANT_ID.test(value.grantId) || value.trackId !== track.id || !Number.isSafeInteger(value.durationMs) || value.durationMs < 1000 || value.durationMs > 7200250 || Math.abs(value.durationMs - track.playback.durationMs) > 250) throw new PlaybackError("invalid_response");
  let url;
  try { url = new URL(value.playlistUrl); } catch { throw new PlaybackError("invalid_response"); }
  const path = new RegExp(`^/music/hls/${value.grantId}/[a-f0-9]{64}/index\\.m3u8$`);
  if (url.origin !== origin || url.username || url.password || url.search || url.hash || !path.test(url.pathname)) throw new PlaybackError("invalid_response");
  const serverTimeMs = timestamp(value.serverTime), expiresAtMs = timestamp(value.expiresAt);
  const lifetime = Math.max(1800000, value.durationMs + 900000);
  if (expiresAtMs <= serverTimeMs || expiresAtMs > serverTimeMs + lifetime) throw new PlaybackError("invalid_response");
  return Object.freeze({ ...value, serverTimeMs, expiresAtMs, receivedAt: performance.now() });
}

export function remainingLifetime(grant) {
  return grant.expiresAtMs - grant.serverTimeMs - (performance.now() - grant.receivedAt);
}

function sameGrant(value, previous) {
  if (value.grantId !== previous.grantId || value.playlistUrl !== previous.playlistUrl || value.durationMs !== previous.durationMs) throw new PlaybackError("invalid_response");
  return value;
}

export function createPlaybackAPI(config) {
  if (!siteRuntime(config)) throw new PlaybackError("invalid_config");
  let url;
  try { url = new URL(config.apiOrigin); } catch { throw new PlaybackError("invalid_config"); }
  if (url.origin !== config.apiOrigin) throw new PlaybackError("invalid_config");
  const origin = url.origin;

  async function request(path, method, body, signal) {
    let response;
    try {
      response = await fetch(origin + path, {
        method, credentials: "include", redirect: "error", keepalive: method === "DELETE",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
        headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new PlaybackError("media_unavailable");
    }
    if (response.status === 204 && method === "DELETE") return null;
    const expectedStatus = method === "POST" ? 201 : method === "DELETE" ? 204 : 200;
    if (response.ok && response.status !== expectedStatus) throw new PlaybackError("invalid_response");
    if (response.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") throw new PlaybackError("invalid_response");
    let value;
    try { value = await response.json(); } catch { throw new PlaybackError("invalid_response"); }
    if (!response.ok) {
      if (!musicError(value) || !ERROR_CODES.has(value.code)) throw new PlaybackError("invalid_response");
      if (response.status === 429) throw rateLimitError(response.headers.get("Retry-After"));
      throw new PlaybackError(value.code, response.status);
    }
    return value;
  }

  return {
    async create(track, signal) { return validateGrant(await request(GRANTS, "POST", { trackId: track.id }, signal), track, origin); },
    async read(grant, track, signal) { return sameGrant(validateGrant(await request(`${GRANTS}/${grant.grantId}`, "GET", undefined, signal), track, origin), grant); },
    async renew(grant, track, signal) {
      const serverNow = grant.serverTimeMs + performance.now() - grant.receivedAt;
      const expiresAt = new Date(Math.floor(serverNow + Math.max(1800000, grant.durationMs + 900000))).toISOString();
      const renewed = sameGrant(validateGrant(await request(`${GRANTS}/${grant.grantId}/expiration`, "PUT", { expiresAt }, signal), track, origin), grant);
      if (renewed.expiresAtMs !== Date.parse(expiresAt)) throw new PlaybackError("invalid_response");
      return renewed;
    },
    async revoke(grant) { await request(`${GRANTS}/${grant.grantId}`, "DELETE"); },
  };
}
