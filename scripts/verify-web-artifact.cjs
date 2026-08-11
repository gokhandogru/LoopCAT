const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const distFlagIndex = args.indexOf("--dist");
const distDir =
  distFlagIndex >= 0 && args[distFlagIndex + 1]
    ? path.resolve(process.cwd(), args[distFlagIndex + 1])
    : path.join(root, "dist-web");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productName = packageJson.build?.productName || "LoopCAT";
const artifactName = `${productName} Web ${packageJson.version}.zip`;
const artifactPath = path.join(distDir, artifactName);
const checksumPath = path.join(distDir, "SHA256SUMS.txt");
const failures = [];

function runNodeScript(scriptName) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", scriptName)], {
    cwd: root,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${scriptName} failed.`);
}

function fail(message) {
  failures.push(message);
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function readUInt16(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function parseZipEntries(buffer) {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 0xffff - 22); offset -= 1) {
    if (readUInt32(buffer, offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("ZIP end-of-central-directory record is missing.");
  const entryCount = readUInt16(buffer, eocdOffset + 10);
  const centralSize = readUInt32(buffer, eocdOffset + 12);
  const centralOffset = readUInt32(buffer, eocdOffset + 16);
  if (centralOffset + centralSize > buffer.length) throw new Error("ZIP central directory points outside the file.");
  const entries = new Map();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) throw new Error("ZIP central directory entry is malformed.");
    const method = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const uncompressedSize = readUInt32(buffer, offset + 24);
    const nameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localOffset = readUInt32(buffer, offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (method !== 0) throw new Error(`${name} uses unsupported ZIP compression method ${method}.`);
    if (!name || name.startsWith("/") || name.includes("\\") || name.includes(":") || name.split("/").includes("..")) {
      throw new Error(`ZIP entry has unsafe path: ${name}`);
    }
    if (entries.has(name)) throw new Error(`ZIP entry is duplicated: ${name}`);
    if (readUInt32(buffer, localOffset) !== 0x04034b50) throw new Error(`${name} local header is malformed.`);
    const localNameLength = readUInt16(buffer, localOffset + 26);
    const localExtraLength = readUInt16(buffer, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error(`${name} content points outside the file.`);
    const data = buffer.slice(dataStart, dataEnd);
    if (data.length !== uncompressedSize) throw new Error(`${name} stored size is inconsistent.`);
    entries.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function indexLocalAssets(text) {
  const assets = [];
  const assetPattern = /<(script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = assetPattern.exec(text))) {
    const asset = String(match[2] || "")
      .split("#")[0]
      .split("?")[0];
    if (!asset || asset.startsWith("data:") || /^[a-z]+:/i.test(asset) || asset.startsWith("//")) continue;
    assets.push(asset.replace(/^\.\//, "").replace(/^\/+/, ""));
  }
  return assets;
}

if (!fs.existsSync(artifactPath)) fail(`Missing static web artifact: ${path.relative(root, artifactPath)}`);
if (!fs.existsSync(checksumPath)) fail(`Missing static web checksum file: ${path.relative(root, checksumPath)}`);

let entries = new Map();
runNodeScript("build-renderer.cjs");
runNodeScript("verify-renderer-build.cjs");
const rendererRoot = path.join(root, ".cache", "renderer", "production");
const generatedManifestPath = path.join(rendererRoot, "config", "production-assets.js");
delete require.cache[require.resolve(generatedManifestPath)];
const { offlineAssets: OFFLINE_ASSETS, webDistributionAssets: REQUIRED_WEB_ASSETS } = require(generatedManifestPath);
const rendererAssets = new Set([
  "index.html",
  "config/production-assets.js",
  ...JSON.parse(fs.readFileSync(path.join(rendererRoot, "assets.json"), "utf8"))
]);
if (fs.existsSync(artifactPath)) {
  try {
    entries = parseZipEntries(fs.readFileSync(artifactPath));
  } catch (error) {
    fail(error.message || String(error));
  }
}

if (!artifactName.includes(packageJson.version)) {
  fail(`Static web artifact filename must include package.json version ${packageJson.version}.`);
}

for (const asset of REQUIRED_WEB_ASSETS) {
  const sourcePath = rendererAssets.has(asset) ? path.join(rendererRoot, asset) : path.join(root, asset);
  if (!fs.existsSync(sourcePath)) {
    fail(`Required web source asset is missing: ${asset}`);
    continue;
  }
  const data = entries.get(asset);
  if (!data) {
    fail(`Static web artifact is missing ${asset}.`);
    continue;
  }
  const sourceHash = sha256File(sourcePath);
  const artifactHash = sha256Buffer(data);
  if (sourceHash !== artifactHash) fail(`${asset} inside the static web artifact does not match the workspace source.`);
}

const productionApp = entries.get("app.js")?.toString("utf8") || "";
for (const marker of ["runAppWorkflowTest", "app-workflow-test", "_TEST_FLAG", "Simulated autosave save failure"]) {
  if (productionApp.includes(marker)) fail(`Static web production renderer contains test-only marker: ${marker}`);
}

for (const entry of entries.keys()) {
  const allowedScript = entry === "scripts/opus-cat-web-bridge.cjs";
  if (
    /^(desktop|docs|dist|dist-web|test-artifacts)\//i.test(entry) ||
    (/^scripts\//i.test(entry) && !allowedScript) ||
    /(?:test|runner|fixture)\.html$/i.test(entry)
  ) {
    fail(`Static web artifact includes non-runtime file: ${entry}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
if (manifest.version !== packageJson.version) fail("manifest.webmanifest version does not match package.json.");

const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
if (!serviceWorker.includes(`const APP_VERSION = "${packageJson.version}"`)) {
  fail("service-worker.js APP_VERSION does not match package.json.");
}

const expectedAssets = new Set([
  ...indexLocalAssets(fs.readFileSync(path.join(root, ".cache", "renderer", "production", "index.html"), "utf8")),
  ...OFFLINE_ASSETS
]);
for (const asset of expectedAssets) {
  if (!entries.has(asset)) fail(`Static web artifact is missing referenced app-shell asset ${asset}.`);
}

if (fs.existsSync(checksumPath) && fs.existsSync(artifactPath)) {
  const checksumText = fs.readFileSync(checksumPath, "utf8").trim();
  const expectedLine = `${sha256File(artifactPath)}  ${artifactName}`;
  if (checksumText !== expectedLine) fail("dist-web/SHA256SUMS.txt does not match the static web artifact.");
}

if (failures.length) {
  console.error("Static web artifact verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Static web artifact verification passed for ${artifactName}.`);
