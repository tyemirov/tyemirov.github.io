// @ts-check
import { createPlaybackEngine } from "../../music/player/engine.js";

const audio = document.querySelector("audio");
const status = document.querySelector('[role="status"]');
const play = document.querySelector("#play");
const renew = document.querySelector("#renew");
const origin = "https://localhost:18444";
let grant;
let receivedAt;
const engine = createPlaybackEngine(audio, (error) => { status.textContent = error.message; });
document.querySelector("#engine").textContent = engine.kind;

async function request(path, options) {
  const response = await fetch(origin + path, { ...options, credentials: "include" });
  if (!response.ok) throw new Error(`Playback request failed: ${response.status}`);
  return response.json();
}

play.addEventListener("click", async () => {
  try {
    status.textContent = "Loading";
    grant = await request("/api/playback-grants", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: "test-tone" }),
    });
    receivedAt = performance.now();
    document.querySelector("#playlist").textContent = grant.playlistUrl;
    await engine.load(grant.playlistUrl);
    await audio.play();
    status.textContent = "Playing";
    renew.disabled = false;
  } catch (error) { status.textContent = error.message; }
});

renew.addEventListener("click", async () => {
  try {
    const expiresAt = new Date(Date.parse(grant.serverTime) + performance.now() - receivedAt + Math.max(1800000, grant.durationMs + 900000)).toISOString();
    const renewed = await request(`/api/playback-grants/${grant.grantId}/expiration`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresAt }) });
    if (renewed.playlistUrl !== grant.playlistUrl) throw new Error("Renewal changed the playlist URL.");
    grant = renewed;
    receivedAt = performance.now();
    status.textContent = "Access renewed";
  } catch (error) { status.textContent = error.message; }
});
window.addEventListener("pagehide", () => engine.destroy(), { once: true });
