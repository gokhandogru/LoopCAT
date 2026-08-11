const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const rendererRoot = path.join(root, ".cache", "renderer");
const productionAssets = JSON.parse(fs.readFileSync(path.join(rendererRoot, "production", "assets.json"), "utf8"));
const testAssets = JSON.parse(fs.readFileSync(path.join(rendererRoot, "test", "assets.json"), "utf8"));
const readGraph = (variant, assets) =>
  assets.map((asset) => fs.readFileSync(path.join(rendererRoot, variant, asset), "utf8")).join("\n");
const production = readGraph("production", productionAssets);
const test = readGraph("test", testAssets);
const productionIndex = fs.readFileSync(path.join(rendererRoot, "production", "index.html"), "utf8");
const desktopIndex = fs.readFileSync(path.join(rendererRoot, "production", "desktop-index.html"), "utf8");
const testIndex = fs.readFileSync(path.join(rendererRoot, "test", "index.html"), "utf8");
const forbiddenProductionMarkers = [
  "runAppWorkflowTest",
  "app-workflow-test",
  "_TEST_FLAG",
  "Simulated autosave save failure",
  "Simulated AI apply save failure",
  "APP WORKFLOW TEST"
];

const failures = [];
for (const marker of forbiddenProductionMarkers) {
  if (production.includes(marker)) failures.push(`Production renderer contains test-only marker: ${marker}`);
}
if (!test.includes("app-workflow-test")) failures.push("Test renderer is missing the workflow-test route.");
if (!test.includes("runAppWorkflowTest"))
  failures.push("Test renderer is missing the workflow characterization driver.");
if (!productionIndex.includes('<script src="./bootstrap.js"></script>'))
  failures.push("Production index does not load the protocol-aware renderer bootstrap.");
if (!desktopIndex.includes('<script type="module" src="./app.js"></script>'))
  failures.push("Desktop index does not load the proven static ES-module renderer entry.");
if (desktopIndex.includes('<script src="./bootstrap.js"></script>'))
  failures.push("Desktop index must not use the file-protocol bootstrap.");
if (productionIndex.includes('storage.js"></script>'))
  failures.push("Production index still loads the legacy renderer script graph.");
if (!testIndex.includes('<script type="module" src="/renderer-test/app.js"></script>'))
  failures.push("Test index does not load the isolated test renderer entry.");
if (!productionAssets.some((asset) => asset.startsWith("chunks/") && asset.endsWith(".js")))
  failures.push("Production renderer is missing lazy ES-module chunks.");
for (const requiredAsset of ["app.js", "app-file.js", "bootstrap.js"]) {
  if (!productionAssets.includes(requiredAsset)) failures.push(`Production renderer is missing ${requiredAsset}.`);
}
if (!production.includes("loopcat-bootstrap"))
  failures.push("Production renderer is missing the allowlisted Trusted Types bootstrap policy.");
if (!productionAssets.every((asset) => fs.existsSync(path.join(rendererRoot, "production", asset))))
  failures.push("Production renderer asset manifest contains a missing file.");

if (failures.length) {
  console.error("Renderer build verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Renderer build verification passed (production graph ${Buffer.byteLength(production)} bytes across ${productionAssets.length} modules; test graph ${Buffer.byteLength(test)} bytes across ${testAssets.length} modules).`
);
