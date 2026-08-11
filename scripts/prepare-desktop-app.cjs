const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const stageRoot = path.join(root, ".cache", "desktop-app");
const rendererRoot = path.join(root, ".cache", "renderer", "production");
const generatedProductionAssetsPath = path.join(rendererRoot, "config", "production-assets.js");
const generatedProductionAssets = require(generatedProductionAssetsPath);
const webOnlyRendererAssets = new Set(["app-file.js", "bootstrap.js"]);
const desktopProductionAssets = {
  ...generatedProductionAssets,
  runtimeAssets: generatedProductionAssets.runtimeAssets.filter((asset) => !webOnlyRendererAssets.has(asset)),
  offlineAssets: generatedProductionAssets.offlineAssets.filter((asset) => !webOnlyRendererAssets.has(asset)),
  webDistributionAssets: generatedProductionAssets.webDistributionAssets.filter(
    (asset) => !webOnlyRendererAssets.has(asset)
  )
};
const rendererAssets = new Set([
  "index.html",
  "config/production-assets.js",
  ...JSON.parse(fs.readFileSync(path.join(rendererRoot, "assets.json"), "utf8"))
]);

function assertInsideStage(target) {
  const resolved = path.resolve(target);
  const stagePrefix = `${path.resolve(stageRoot)}${path.sep}`;
  if (resolved !== path.resolve(stageRoot) && !resolved.startsWith(stagePrefix)) {
    throw new Error(`Desktop staging target escapes .cache/desktop-app: ${target}`);
  }
  return resolved;
}

function copyFile(relativePath, sourcePath = path.join(root, relativePath)) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes(":") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe desktop staging path: ${relativePath}`);
  }
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(`Missing desktop staging source: ${path.relative(root, sourcePath)}`);
  }
  const target = assertInsideStage(path.join(stageRoot, normalized));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(sourcePath, target);
}

function copyDirectory(relativePath) {
  const sourceRoot = path.join(root, relativePath);
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const child = path.posix.join(relativePath.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) copyDirectory(child);
    else if (entry.isFile()) copyFile(child);
  }
}

fs.rmSync(assertInsideStage(stageRoot), { recursive: true, force: true });
fs.mkdirSync(stageRoot, { recursive: true });

for (const asset of desktopProductionAssets.runtimeAssets) {
  const rendererSource =
    asset === "index.html" ? path.join(rendererRoot, "desktop-index.html") : path.join(rendererRoot, asset);
  const source = rendererAssets.has(asset) ? rendererSource : path.join(root, asset);
  copyFile(asset, source);
}
fs.writeFileSync(
  assertInsideStage(path.join(stageRoot, "config", "production-assets.js")),
  `(function publishLoopCatProductionAssets(manifest) {
  const frozen = Object.freeze({
    ...manifest,
    runtimeAssets: Object.freeze(manifest.runtimeAssets),
    offlineAssets: Object.freeze(manifest.offlineAssets),
    webDistributionAssets: Object.freeze(manifest.webDistributionAssets)
  });
  if (typeof module === "object" && module?.exports) module.exports = frozen;
  if (typeof self === "object") self.LoopCATProductionAssets = frozen;
})(${JSON.stringify(desktopProductionAssets, null, 2)});\n`
);
for (const directory of ["desktop", "docs", "icons"]) copyDirectory(directory);
for (const file of ["README.md", "LICENSE", "NOTICE"]) copyFile(file);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const stagedPackage = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  homepage: packageJson.homepage,
  main: packageJson.main,
  author: packageJson.author,
  license: packageJson.license
};
fs.writeFileSync(
  assertInsideStage(path.join(stageRoot, "package.json")),
  `${JSON.stringify(stagedPackage, null, 2)}\n`
);

console.log(`Prepared production-only desktop app in ${path.relative(root, stageRoot)}.`);
