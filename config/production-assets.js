(function publishLoopCatProductionAssets(factory) {
  const manifest = factory();
  if (typeof module === "object" && module?.exports) module.exports = manifest;
  if (typeof self === "object") self.LoopCATProductionAssets = manifest;
})(function createLoopCatProductionAssets() {
  const runtimeAssets = Object.freeze([
    "index.html",
    "styles.css",
    "liquid-glass/styles.css",
    "src/ui/tokens.css",
    "src/ui/themes.css",
    "src/ui/base.css",
    "src/ui/components.css",
    "src/ui/layouts.css",
    "manifest.webmanifest",
    "service-worker.js",
    "config/production-assets.js",
    "icons/loopcat-icon.svg",
    "icons/loopcat-loopbird-mono.svg",
    "icons/loopcat-icon.png",
    "cat-worker.js",
    "app.js"
  ]);
  const offlineAssets = Object.freeze([...runtimeAssets, "LICENSE", "NOTICE"]);
  const webDistributionAssets = Object.freeze([
    ...offlineAssets,
    "package.json",
    "scripts/opus-cat-web-bridge.cjs",
    "README.md"
  ]);

  return Object.freeze({
    appVersion: "0.0.3",
    contractVersion: 1,
    runtimeAssets,
    offlineAssets,
    webDistributionAssets
  });
});
