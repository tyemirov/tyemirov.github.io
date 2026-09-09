// @ts-check
export async function installCapabilityScenario(context, testInfo) {
  if (!testInfo.project.metadata.forceHls) return;
  await context.addInitScript(() => {
    const nativeCapability = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) {
      return type === "application/vnd.apple.mpegurl" ? "" : nativeCapability.call(this, type);
    };
  });
  testInfo.annotations.push({ type: "capability-injection", description: "Native HLS unavailable; real hls.js, MSE, codec, and HTTP service." });
}
