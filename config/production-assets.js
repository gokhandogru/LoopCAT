(function publishLoopCatProductionAssets(factory) {
  const manifest = factory();
  if (typeof module === "object" && module?.exports) module.exports = manifest;
  if (typeof self === "object") self.LoopCATProductionAssets = manifest;
})(function createLoopCatProductionAssets() {
  const runtimeAssets = Object.freeze([
    "index.html",
    "docs/beginner-guide/index.html",
    "docs/beginner-guide/ar.html",
    "docs/beginner-guide/guide.css",
    "styles.css",
    "liquid-glass/styles.css",
    "src/ui/tokens.css",
    "src/ui/themes.css",
    "src/ui/base.css",
    "src/ui/components.css",
    "src/ui/layouts.css",
    "src/ui/exchange.css",
    "src/ui/exchange-workflows.css",
    "src/ui/exchange-catalog.css",
    "src/ui/workspace-shell.css",
    "src/ui/editor-workbench.css",
    "src/ui/workspace-tools.css",
    "manifest.webmanifest",
    "service-worker.js",
    "config/production-assets.js",
    "icons/loopcat-icon.svg",
    "icons/loopcat-loopbird-mono.svg",
    "icons/loopcat-icon.png",
    "cat-worker.js",
    "protected-tags.js",
    "linguistic-core.js",
    "statistics-core.js",
    "source-update-core.js",
    "regex-worker.js",
    "app.js"
  ]);
  const offlineAssets = Object.freeze([...runtimeAssets, "LICENSE", "NOTICE", "docs/mediabunny-LICENSE.txt"]);
  const webDistributionAssets = Object.freeze([
    ...offlineAssets,
    "docs/beginner-guide/LoopCAT-Beginners-Guide.docx",
    "og.png",
    "package.json",
    "scripts/opus-cat-web-bridge.cjs",
    "README.md"
  ]);

  return Object.freeze({
    appVersion: "0.0.4-dev.20261127.1",
    contractVersion: 1,
    runtimeAssets,
    offlineAssets,
    webDistributionAssets
  });
});
