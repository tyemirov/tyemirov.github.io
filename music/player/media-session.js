// @ts-check

/** Connect supported operating-system media actions to the document controller. */
export function connectMediaSession(controller) {
  if (!("mediaSession" in navigator)) return () => {};
  const session = navigator.mediaSession;
  const registered = [];
  const actions = {
    play: () => { void controller.resume(); }, pause: () => controller.pause(),
    previoustrack: () => controller.previous(), nexttrack: () => controller.next(),
    seekto: ({ seekTime }) => controller.seek(seekTime),
    seekbackward: ({ seekOffset = 10 }) => controller.seek(controller.audio.currentTime - seekOffset),
    seekforward: ({ seekOffset = 10 }) => controller.seek(controller.audio.currentTime + seekOffset),
  };
  for (const [action, handler] of Object.entries(actions)) {
    try { session.setActionHandler(action, (details) => { if (controller.track && controller.audio.readyState >= 1) handler(details); }); registered.push(action); }
    catch (error) { if (error.name !== "NotSupportedError") throw error; }
  }
  let track = null;
  const update = () => {
    const state = controller.snapshot();
    if (state.track !== track) {
      track = state.track;
      if (typeof MediaMetadata !== "undefined") session.metadata = track ? new MediaMetadata({
        title: track.title, album: state.album.displayTitle ?? state.album.title,
        artist: "Vadym Tyemirov", artwork: [{ src: new URL(state.album.coverImage, location.origin).href }],
      }) : null;
    }
    session.playbackState = ["playing", "buffering"].includes(state.phase) ? "playing" : track ? "paused" : "none";
    if (typeof session.setPositionState === "function" && state.duration > 0) session.setPositionState({
      duration: state.duration, playbackRate: controller.audio.playbackRate,
      position: Math.max(0, Math.min(state.position, state.duration)),
    });
  };
  controller.addEventListener("change", update);
  return () => {
    controller.removeEventListener("change", update);
    for (const action of registered) session.setActionHandler(action, null);
    session.metadata = null;
    session.playbackState = "none";
    if (typeof session.setPositionState === "function") session.setPositionState();
  };
}
