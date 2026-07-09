const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const distFlagIndex = args.indexOf("--dist");
const distDir = distFlagIndex >= 0 && args[distFlagIndex + 1]
  ? path.resolve(process.cwd(), args[distFlagIndex + 1])
  : path.join(root, "dist-web");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productName = packageJson.build?.productName || "LoopCAT";
const artifactName = `${productName} Web ${packageJson.version}.zip`;
const artifactPath = path.join(distDir, artifactName);
const checksumPath = path.join(distDir, "SHA256SUMS.txt");

const WEB_ASSETS = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "service-worker.js",
  "icons/loopcat-icon.svg",
  "icons/loopcat-icon.png",
  "storage.js",
  "workspace-storage.js",
  "docx.js",
  "tm.js",
  "termbase.js",
  "tmx.js",
  "tbx.js",
  "encoding.js",
  "xliff.js",
  "localization.js",
  "qa.js",
  "validation.js",
  "analysis.js",
  "quality.js",
  "ai.js",
  "worker-client.js",
  "cat-worker.js",
  "project.js",
  "i18n.js",
  "i18n/source.en-US.js",
  "i18n/locales/ca-ES.js",
  "i18n/locales/en-US.js",
  "i18n/locales/tr-TR.js",
  "app.js",
  "package.json",
  "scripts/opus-cat-web-bridge.cjs",
  "README.md",
  "LICENSE",
  "NOTICE"
];

function runNodeScript(scriptName) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", scriptName)], {
    cwd: root,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${scriptName} failed.`);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date("2026-01-01T00:00:00Z")) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCSeconds() >> 1) | (date.getUTCMinutes() << 5) | (date.getUTCHours() << 11),
    date: date.getUTCDate() | ((date.getUTCMonth() + 1) << 5) | ((year - 1980) << 9)
  };
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function localHeader(entry) {
  return Buffer.concat([
    uint32(0x04034b50),
    uint16(20),
    uint16(0x0800),
    uint16(0),
    uint16(entry.time),
    uint16(entry.date),
    uint32(entry.crc),
    uint32(entry.data.length),
    uint32(entry.data.length),
    uint16(entry.name.length),
    uint16(0),
    entry.name
  ]);
}

function centralHeader(entry) {
  return Buffer.concat([
    uint32(0x02014b50),
    uint16(20),
    uint16(20),
    uint16(0x0800),
    uint16(0),
    uint16(entry.time),
    uint16(entry.date),
    uint32(entry.crc),
    uint32(entry.data.length),
    uint32(entry.data.length),
    uint16(entry.name.length),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(0),
    uint32(entry.offset),
    entry.name
  ]);
}

function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  return Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entryCount),
    uint16(entryCount),
    uint32(centralSize),
    uint32(centralOffset),
    uint16(0)
  ]);
}

function assertAssetPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes(":") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe web asset path: ${relativePath}`);
  }
  const resolved = path.resolve(root, normalized);
  const rootWithSeparator = `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSeparator)) {
    throw new Error(`Web asset escapes project root: ${relativePath}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Missing web asset: ${relativePath}`);
  }
  return { normalized, resolved };
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

runNodeScript("i18n-validate.cjs");
runNodeScript("i18n-compile.cjs");

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const entries = WEB_ASSETS
  .map(assertAssetPath)
  .sort((a, b) => a.normalized.localeCompare(b.normalized))
  .map(({ normalized, resolved }) => {
    const data = fs.readFileSync(resolved);
    const stamp = dosDateTime();
    return {
      path: normalized,
      name: Buffer.from(normalized, "utf8"),
      data,
      crc: crc32(data),
      ...stamp,
      offset: 0
    };
  });

const chunks = [];
let offset = 0;
for (const entry of entries) {
  entry.offset = offset;
  const header = localHeader(entry);
  chunks.push(header, entry.data);
  offset += header.length + entry.data.length;
}

const centralOffset = offset;
const centralChunks = entries.map(centralHeader);
const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
const zipBuffer = Buffer.concat([
  ...chunks,
  ...centralChunks,
  endOfCentralDirectory(entries.length, centralSize, centralOffset)
]);

fs.writeFileSync(artifactPath, zipBuffer);
fs.writeFileSync(checksumPath, `${sha256(artifactPath)}  ${artifactName}\n`, "utf8");
console.log(`Wrote ${path.relative(root, artifactPath)} with ${entries.length} static web assets.`);
console.log(`Wrote ${path.relative(root, checksumPath)}.`);
