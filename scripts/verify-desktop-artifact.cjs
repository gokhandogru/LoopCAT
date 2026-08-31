const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createBuildIdentity, assertSameIdentity } = require("./repository-build-identity.cjs");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const failures = [];
const sourcePackageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const rendererRoot = path.join(root, ".cache", "renderer", "production");
const generatedAssetsPath = path.join(rendererRoot, "config", "production-assets.js");
const productionAssetsPath = fs.existsSync(generatedAssetsPath)
  ? generatedAssetsPath
  : path.join(root, "config", "production-assets.js");
const productionAssets = require(productionAssetsPath);
const webOnlyRendererAssets = new Set(["app-file.js", "bootstrap.js"]);
const offlineAssets = productionAssets.offlineAssets.filter((asset) => !webOnlyRendererAssets.has(asset));
const expectedDesktopProtocolFiles = productionAssets.runtimeAssets.filter(
  (asset) => !webOnlyRendererAssets.has(asset)
);
const rendererFiles = new Set(
  fs.existsSync(path.join(rendererRoot, "assets.json"))
    ? [
        "index.html",
        "config/production-assets.js",
        ...JSON.parse(fs.readFileSync(path.join(rendererRoot, "assets.json"), "utf8"))
      ]
    : ["index.html", "app.js"]
);

const requiredFiles = [
  "README.md",
  "LICENSE",
  "NOTICE",
  "package.json",
  ...expectedDesktopProtocolFiles,
  "desktop/main.cjs",
  "docs/desktop-packaging.md",
  "docs/loopcat-package-format-v1.md",
  "docs/release-smoke-evidence-template.md"
];

const sourceMirrorFiles = requiredFiles.filter(
  (relativePath) => relativePath !== "package.json" && !rendererFiles.has(relativePath)
);

const forbiddenPatterns = [
  /(^|\/)(test-runner|security-policy-test|smoke-test|regression-test|offline-shell-test|workspace-storage-test|package-roundtrip-test|large-project-test)\.html$/i,
  /^test-artifacts\//i,
  /^node_modules\//i,
  /^dist\//i,
  /^\.git\//i,
  /^\.cache\//i,
  /^pnpm-lock\.yaml$/i
];

function fail(message) {
  failures.push(message);
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(filePath));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function findAsarFiles() {
  return walkFiles(distDir).filter((filePath) => path.basename(filePath) === "app.asar");
}

function readAsar(asarPath) {
  const bytes = fs.readFileSync(asarPath);
  if (bytes.length < 16) throw new Error("asar file is too small.");
  const headerSize = bytes.readUInt32LE(12);
  const headerStart = 16;
  const headerEnd = headerStart + headerSize;
  if (headerEnd > bytes.length) throw new Error("asar header exceeds archive size.");
  const header = JSON.parse(bytes.slice(headerStart, headerEnd).toString("utf8"));
  const padding = (4 - (headerSize % 4)) % 4;
  return { bytes, header, dataStart: headerEnd + padding };
}

function walkAsarEntries(files, prefix = "") {
  const out = [];
  for (const [name, entry] of Object.entries(files || {})) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (entry.files) out.push(...walkAsarEntries(entry.files, relativePath));
    else out.push({ relativePath, entry });
  }
  return out;
}

function normalizeLocalAsset(value) {
  const cleaned = String(value || "")
    .split("#")[0]
    .split("?")[0];
  if (!cleaned || cleaned === "." || cleaned === "./") return "";
  if (cleaned.startsWith("data:") || /^[a-z]+:/i.test(cleaned) || cleaned.startsWith("//")) return "";
  return cleaned.replace(/^\.\//, "").replace(/^\/+/, "");
}

function localAssetsFromIndex(html) {
  const assets = [];
  const assetPattern = /<(script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = assetPattern.exec(html))) {
    const asset = normalizeLocalAsset(match[2]);
    if (asset) assets.push(asset);
  }
  return assets;
}

function serviceWorkerCoreAssets(serviceWorker) {
  return serviceWorker.includes('importScripts("./config/production-assets.js")') ? offlineAssets : [];
}

function desktopProtocolAllowlist(desktopMain, packagedProductionAssets) {
  if (desktopMain.includes('require("../config/production-assets.js")')) {
    return packagedProductionAssets.runtimeAssets || [];
  }
  const match = /const\s+ALLOWED_APP_FILES\s*=\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\);/m.exec(desktopMain);
  if (!match) return [];
  return Array.from(match[1].matchAll(/["']([^"']+)["']/g)).map((item) => item[1]);
}

function parseProductionAssetsSource(source) {
  const match = /\}\)\((\{[\s\S]*\})\);\s*$/.exec(source);
  if (!match) throw new Error("production asset manifest wrapper could not be parsed");
  return JSON.parse(match[1]);
}

function readAsarFile(archive, item) {
  const offset = Number(item.entry.offset);
  const size = Number(item.entry.size);
  if (!Number.isFinite(offset) || !Number.isFinite(size))
    throw new Error(`${item.relativePath} has invalid size or offset.`);
  const start = archive.dataStart + offset;
  const end = start + size;
  if (start < archive.dataStart || end > archive.bytes.length)
    throw new Error(`${item.relativePath} points outside the asar payload.`);
  return archive.bytes.slice(start, end);
}

function verifyIntegrity(archive, item) {
  const expected = item.entry.integrity?.hash;
  if (!expected) return;
  const hash = crypto.createHash("sha256").update(readAsarFile(archive, item)).digest("hex");
  if (hash !== expected) fail(`${item.relativePath} hash does not match its asar integrity metadata.`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function textFile(archive, byPath, relativePath) {
  const item = byPath.get(relativePath);
  if (!item) return "";
  return readAsarFile(archive, item).toString("utf8");
}

function verifyArchive(asarPath) {
  let archive;
  try {
    archive = readAsar(asarPath);
  } catch (error) {
    fail(`${path.relative(root, asarPath)} could not be read: ${error.message}`);
    return;
  }

  const items = walkAsarEntries(archive.header.files);
  const byPath = new Map(items.map((item) => [item.relativePath, item]));
  for (const required of requiredFiles) {
    if (!byPath.has(required)) fail(`${path.relative(root, asarPath)} is missing ${required}.`);
  }
  for (const relativePath of sourceMirrorFiles) {
    const item = byPath.get(relativePath);
    const sourcePath = path.join(root, relativePath);
    if (!item || !fs.existsSync(sourcePath)) continue;
    const packagedHash = sha256(readAsarFile(archive, item));
    const sourceHash = sha256(fs.readFileSync(sourcePath));
    if (packagedHash !== sourceHash) {
      fail(
        `${path.relative(root, asarPath)} ${relativePath} does not match current source file. Rebuild desktop artifacts before publishing.`
      );
    }
  }
  for (const relativePath of rendererFiles) {
    const item = byPath.get(relativePath);
    if (relativePath === "config/production-assets.js") continue;
    const builtRelativePath = relativePath === "index.html" ? "desktop-index.html" : relativePath;
    const builtPath = path.join(root, ".cache", "renderer", "production", builtRelativePath);
    if (!item || !fs.existsSync(builtPath)) continue;
    if (sha256(readAsarFile(archive, item)) !== sha256(fs.readFileSync(builtPath))) {
      fail(`${path.relative(root, asarPath)} ${relativePath} does not match the production renderer build.`);
    }
  }
  for (const item of items) {
    if (forbiddenPatterns.some((pattern) => pattern.test(item.relativePath))) {
      fail(`${path.relative(root, asarPath)} contains non-release file ${item.relativePath}.`);
    }
    try {
      verifyIntegrity(archive, item);
    } catch (error) {
      fail(`${item.relativePath} failed integrity verification: ${error.message}`);
    }
  }

  const packagedPackageJson = textFile(archive, byPath, "package.json");
  try {
    assertSameIdentity(
      JSON.parse(textFile(archive, byPath, "build-info.json") || "{}"),
      createBuildIdentity(root),
      "Packaged desktop build identity"
    );
  } catch (error) {
    fail(error.message);
  }
  const manifest = JSON.parse(textFile(archive, byPath, "manifest.webmanifest") || "{}");
  const indexHtml = textFile(archive, byPath, "index.html");
  const serviceWorker = textFile(archive, byPath, "service-worker.js");
  const desktopMain = textFile(archive, byPath, "desktop/main.cjs");
  const productionApp = textFile(archive, byPath, "app.js");
  const productionAssetsSource = textFile(archive, byPath, "config/production-assets.js");
  let packagedProductionAssets = { runtimeAssets: [], offlineAssets: [], webDistributionAssets: [] };
  try {
    packagedProductionAssets = parseProductionAssetsSource(productionAssetsSource);
  } catch (error) {
    fail(`${path.relative(root, asarPath)} packaged production asset manifest is invalid: ${error.message}.`);
  }
  const expectedProtocolSet = new Set(expectedDesktopProtocolFiles);

  if (JSON.stringify(packagedProductionAssets.runtimeAssets) !== JSON.stringify(expectedDesktopProtocolFiles)) {
    fail(`${path.relative(root, asarPath)} packaged runtime asset manifest does not match the desktop boundary.`);
  }
  if (JSON.stringify(packagedProductionAssets.offlineAssets) !== JSON.stringify(offlineAssets)) {
    fail(`${path.relative(root, asarPath)} packaged offline asset manifest does not match the desktop boundary.`);
  }
  for (const asset of webOnlyRendererAssets) {
    if (
      packagedProductionAssets.runtimeAssets.includes(asset) ||
      packagedProductionAssets.offlineAssets.includes(asset)
    ) {
      fail(`${path.relative(root, asarPath)} packaged desktop manifest includes web-only asset ${asset}.`);
    }
  }

  if (!packagedPackageJson.includes(`"name": "loopcat"`))
    fail(`${path.relative(root, asarPath)} package.json has the wrong app package name.`);
  if (!packagedPackageJson.includes(`"version": "${sourcePackageJson.version}"`))
    fail(`${path.relative(root, asarPath)} package.json version does not match the source release version.`);
  for (const marker of ["runAppWorkflowTest", "app-workflow-test", "_TEST_FLAG", "Simulated autosave save failure"]) {
    if (productionApp.includes(marker))
      fail(`${path.relative(root, asarPath)} production renderer contains test-only marker ${marker}.`);
  }
  if (manifest.version !== sourcePackageJson.version)
    fail(`${path.relative(root, asarPath)} manifest version does not match source package.json.`);
  if (!indexHtml.includes(`http-equiv="Content-Security-Policy"`))
    fail(`${path.relative(root, asarPath)} packaged index.html has no CSP.`);
  if (/<(script|link)\b[^>]+(?:src|href)=["']https?:\/\//i.test(indexHtml))
    fail(`${path.relative(root, asarPath)} packaged index.html loads a remote script or style.`);
  if (!serviceWorker.includes(`const APP_VERSION = "${sourcePackageJson.version}"`))
    fail(`${path.relative(root, asarPath)} service worker version does not match source package.json.`);
  if (
    !desktopMain.includes("nodeIntegration: false") ||
    !desktopMain.includes("contextIsolation: true") ||
    !desktopMain.includes("DESKTOP_RENDERER_SANDBOX_DEFAULT") ||
    !desktopMain.includes("app.enableSandbox()") ||
    !desktopMain.includes("sandbox: DESKTOP_RENDERER_SANDBOX_DEFAULT")
  ) {
    fail(`${path.relative(root, asarPath)} desktop wrapper is missing renderer isolation settings.`);
  }
  if (desktopMain.includes("retryWithoutRendererSandbox") || desktopMain.includes("LOOPCAT_DESKTOP_NO_SANDBOX")) {
    fail(`${path.relative(root, asarPath)} desktop wrapper contains an automatic renderer sandbox fallback.`);
  }
  if (
    !desktopMain.includes("webRequest.onBeforeRequest") ||
    !desktopMain.includes("isAllowedNetworkRequest(details.url)")
  ) {
    fail(`${path.relative(root, asarPath)} desktop wrapper is missing the renderer network request gate.`);
  }
  if (
    !desktopMain.includes("isAllowedAppNavigationUrl(url)") ||
    !desktopMain.includes('relativePath === "index.html"')
  ) {
    fail(`${path.relative(root, asarPath)} desktop wrapper must restrict top-level app navigation to index.html.`);
  }
  if (!desktopMain.includes("setWindowOpenHandler") || !desktopMain.includes('return { action: "deny" }')) {
    fail(`${path.relative(root, asarPath)} desktop wrapper must deny renderer-created popup windows.`);
  }
  if (!desktopMain.includes("isExternalHttpsUrl(url)") || !desktopMain.includes('parsed.protocol === "https:"')) {
    fail(`${path.relative(root, asarPath)} desktop wrapper must restrict external link handling to HTTPS URLs.`);
  }
  if (!indexHtml.includes(`connect-src 'self' https://api.openai.com/v1/responses`)) {
    fail(
      `${path.relative(root, asarPath)} packaged index.html does not narrow connect-src to the OpenAI Responses endpoint.`
    );
  }
  if (!indexHtml.includes(`https://api.openai.com/v1/models`)) {
    fail(
      `${path.relative(root, asarPath)} packaged index.html does not allow the exact OpenAI Models endpoint for model refresh.`
    );
  }
  const hostedAiOrigins = [
    "https://generativelanguage.googleapis.com",
    "https://api.anthropic.com",
    "https://api.cohere.com",
    "https://ollama.com",
    "https://api.deepseek.com",
    "https://api.mistral.ai",
    "https://api.x.ai",
    "https://api.perplexity.ai",
    "https://api.groq.com",
    "https://api.together.ai",
    "https://openrouter.ai",
    "https://router.huggingface.co",
    "https://api.deepinfra.com",
    "https://api.fireworks.ai"
  ];
  const missingHostedAiOrigins = hostedAiOrigins.filter((origin) => !indexHtml.includes(origin));
  if (missingHostedAiOrigins.length) {
    fail(
      `${path.relative(root, asarPath)} packaged index.html does not allow hosted AI provider origins: ${missingHostedAiOrigins.join(", ")}.`
    );
  }
  const hostedAiHosts = hostedAiOrigins.map((origin) => new URL(origin).hostname);
  const missingDesktopHostedAiHosts = hostedAiHosts.filter((host) => !desktopMain.includes(`"${host}"`));
  if (missingDesktopHostedAiHosts.length) {
    fail(
      `${path.relative(root, asarPath)} desktop wrapper does not allow hosted AI provider hosts: ${missingDesktopHostedAiHosts.join(", ")}.`
    );
  }
  if (!indexHtml.includes(`https://*.openai.azure.com`) || !indexHtml.includes(`https://*.services.ai.azure.com`)) {
    fail(`${path.relative(root, asarPath)} packaged index.html does not allow Azure OpenAI resource domains.`);
  }
  if (!desktopMain.includes(`".openai.azure.com"`) || !desktopMain.includes(`".services.ai.azure.com"`)) {
    fail(`${path.relative(root, asarPath)} desktop wrapper does not allow Azure OpenAI resource domains.`);
  }
  if (
    !indexHtml.includes(`http://localhost:11434`) ||
    !indexHtml.includes(`http://127.0.0.1:1234`) ||
    !indexHtml.includes(`http://localhost:8500`) ||
    !indexHtml.includes(`http://127.0.0.1:8502`)
  ) {
    fail(`${path.relative(root, asarPath)} packaged index.html does not allow explicit local AI loopback endpoints.`);
  }

  for (const asset of localAssetsFromIndex(indexHtml)) {
    if (!byPath.has(asset))
      fail(`${path.relative(root, asarPath)} packaged index.html references missing asset ${asset}.`);
  }
  for (const icon of manifest.icons || []) {
    const asset = normalizeLocalAsset(icon.src);
    if (asset && !byPath.has(asset))
      fail(`${path.relative(root, asarPath)} packaged manifest references missing icon ${asset}.`);
  }
  for (const asset of serviceWorkerCoreAssets(serviceWorker)) {
    if (!byPath.has(asset))
      fail(`${path.relative(root, asarPath)} packaged service worker caches missing asset ${asset}.`);
  }

  const allowlist = desktopProtocolAllowlist(desktopMain, packagedProductionAssets);
  if (!allowlist.length) fail(`${path.relative(root, asarPath)} desktop protocol allowlist could not be parsed.`);
  for (const asset of expectedDesktopProtocolFiles) {
    if (!allowlist.includes(asset))
      fail(`${path.relative(root, asarPath)} desktop protocol allowlist is missing runtime file ${asset}.`);
  }
  for (const asset of allowlist) {
    if (!expectedProtocolSet.has(asset))
      fail(`${path.relative(root, asarPath)} desktop protocol allowlist exposes unexpected file ${asset}.`);
    if (!byPath.has(asset))
      fail(`${path.relative(root, asarPath)} desktop protocol allowlist references missing asset ${asset}.`);
  }
}

const asarFiles = findAsarFiles();
if (!asarFiles.length) fail("No app.asar desktop payload was found under dist/. Build desktop artifacts first.");
for (const asarPath of asarFiles) verifyArchive(asarPath);

if (failures.length) {
  console.error("Desktop artifact verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Desktop artifact verification passed for ${asarFiles.length} app.asar payload${asarFiles.length === 1 ? "" : "s"}.`
);
