const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const distFlagIndex = args.indexOf("--dist");
const distDir = distFlagIndex >= 0 && args[distFlagIndex + 1]
  ? path.resolve(process.cwd(), args[distFlagIndex + 1])
  : path.join(root, "dist");
const checksumFile = path.join(distDir, "SHA256SUMS.txt");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productName = packageJson.build?.productName || packageJson.name || "LoopCAT";
const escapedProductName = regexEscape(productName);
const escapedPackageName = regexEscape(packageJson.name || productName.toLowerCase());
const escapedVersion = regexEscape(packageJson.version);
const MIN_PUBLIC_DOWNLOAD_BYTES = 1024 * 1024;
const failures = [];

const publicDownloadPatterns = [
  /\.exe$/i,
  /\.dmg$/i,
  /\.zip$/i,
  /\.appimage$/i,
  /\.deb$/i
];

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function productVersionFile(extension) {
  return new RegExp(`^${escapedProductName}[\\s_-]+${escapedVersion}(?:[\\s_-].*)?\\.${regexEscape(extension)}$`, "i");
}

function exactFile(name) {
  return new RegExp(`^${regexEscape(name)}$`, "i");
}

function isExpectedPublicDownloadArtifactName(name) {
  if (/(?:^|[._\s-])(?:source|src|symbols|debug)(?:[._\s-]|$)/i.test(name)) return false;
  return exactFile(`${productName} Setup ${packageJson.version}.exe`).test(name) ||
    exactFile(`${productName} ${packageJson.version}.exe`).test(name) ||
    productVersionFile("dmg").test(name) ||
    productVersionFile("zip").test(name) ||
    productVersionFile("AppImage").test(name) ||
    new RegExp(`^${escapedPackageName}_${escapedVersion}_[a-z0-9.+~-]+\\.deb$`, "i").test(name);
}

function walkFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(filePath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (path.resolve(filePath) === checksumFile) continue;
    files.push(filePath);
  }
  return files;
}

function isPublicDownloadArtifact(filePath) {
  const relativePath = path.relative(distDir, filePath).replaceAll("\\", "/");
  if (relativePath.split("/").some((part) => /(?:^|-)unpacked$/i.test(part))) return false;
  if (/\.blockmap$/i.test(relativePath)) return false;
  if (/^builder-(debug|effective-config)\.ya?ml$/i.test(relativePath)) return false;
  return publicDownloadPatterns.some((pattern) => pattern.test(path.basename(filePath)));
}

function hasCurrentVersionInFilename(relativePath) {
  return path.basename(relativePath).includes(packageJson.version);
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function fail(message) {
  failures.push(message);
}

function isNestedChecksumSidecar(filePath) {
  return path.basename(filePath).toLowerCase() === "sha256sums.txt" && path.resolve(filePath) !== checksumFile;
}

if (!fs.existsSync(distDir)) {
  fail("dist/ does not exist. Build desktop artifacts before verifying checksums.");
} else if (!fs.existsSync(checksumFile)) {
  fail("dist/SHA256SUMS.txt does not exist. Generate checksums before verification.");
}

const allFiles = fs.existsSync(distDir) ? walkFiles(distDir) : [];

for (const filePath of allFiles.filter(isNestedChecksumSidecar)) {
  fail(`Nested checksum sidecar ${path.relative(distDir, filePath).replaceAll("\\", "/")} must be removed before publishing. Regenerate combined checksums for the release bundle.`);
}

const expectedFiles = fs.existsSync(distDir)
  ? allFiles
    .filter(isPublicDownloadArtifact)
    .filter((filePath) => isExpectedPublicDownloadArtifactName(path.basename(filePath)))
    .map((filePath) => path.relative(distDir, filePath).replaceAll("\\", "/"))
    .sort((a, b) => a.localeCompare(b))
  : [];

const unexpectedFiles = fs.existsSync(distDir)
  ? allFiles
    .filter(isPublicDownloadArtifact)
    .filter((filePath) => !isExpectedPublicDownloadArtifactName(path.basename(filePath)))
    .map((filePath) => path.relative(distDir, filePath).replaceAll("\\", "/"))
    .sort((a, b) => a.localeCompare(b))
  : [];

for (const relativePath of unexpectedFiles) {
  fail(`${relativePath} is not an expected LoopCAT public download artifact filename.`);
}

if (fs.existsSync(distDir) && !expectedFiles.length) {
  fail("dist/ contains no public download artifacts to verify.");
}

for (const relativePath of expectedFiles) {
  if (!hasCurrentVersionInFilename(relativePath)) {
    fail(`${relativePath} filename does not include package.json version ${packageJson.version}.`);
  }
  const filePath = path.join(distDir, relativePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size < MIN_PUBLIC_DOWNLOAD_BYTES) {
    fail(`${relativePath} is smaller than the minimum public download size (${MIN_PUBLIC_DOWNLOAD_BYTES} bytes). Rebuild before publishing.`);
  }
}

const pathsByArtifactName = new Map();
for (const relativePath of expectedFiles) {
  const key = path.basename(relativePath).toLowerCase();
  const paths = pathsByArtifactName.get(key) || [];
  paths.push(relativePath);
  pathsByArtifactName.set(key, paths);
}
for (const paths of pathsByArtifactName.values()) {
  if (paths.length > 1) fail(`Duplicate public download artifact filename: ${paths.join(", ")}.`);
}

const checksumEntries = new Map();
if (fs.existsSync(checksumFile)) {
  const lines = fs.readFileSync(checksumFile, "utf8").split(/\r?\n/).filter(Boolean);
  lines.forEach((line, index) => {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/i);
    if (!match) {
      fail(`SHA256SUMS.txt line ${index + 1} is not in "<hash>  <path>" format.`);
      return;
    }
    const hash = match[1].toLowerCase();
    const relativePath = match[2].replaceAll("\\", "/");
    if (path.isAbsolute(relativePath) || relativePath.split("/").includes("..")) {
      fail(`SHA256SUMS.txt line ${index + 1} has an unsafe path: ${relativePath}.`);
      return;
    }
    if (!hasCurrentVersionInFilename(relativePath)) {
      fail(`SHA256SUMS.txt line ${index + 1} references an artifact filename without package.json version ${packageJson.version}: ${relativePath}.`);
    }
    if (publicDownloadPatterns.some((pattern) => pattern.test(path.basename(relativePath))) && !isExpectedPublicDownloadArtifactName(path.basename(relativePath))) {
      fail(`SHA256SUMS.txt line ${index + 1} references an unexpected public download artifact filename: ${relativePath}.`);
    }
    if (checksumEntries.has(relativePath)) fail(`SHA256SUMS.txt contains duplicate entry for ${relativePath}.`);
    checksumEntries.set(relativePath, hash);
  });
}

const expectedSet = new Set(expectedFiles);
for (const relativePath of expectedFiles) {
  const expectedHash = checksumEntries.get(relativePath);
  if (!expectedHash) {
    fail(`SHA256SUMS.txt is missing ${relativePath}.`);
    continue;
  }
  const actualHash = sha256(path.join(distDir, relativePath));
  if (actualHash !== expectedHash) fail(`${relativePath} checksum does not match SHA256SUMS.txt.`);
}

for (const relativePath of checksumEntries.keys()) {
  if (!expectedSet.has(relativePath)) fail(`SHA256SUMS.txt includes missing artifact ${relativePath}.`);
}

if (failures.length) {
  console.error("Checksum verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Checksum verification passed for ${expectedFiles.length} public download artifact${expectedFiles.length === 1 ? "" : "s"}.`);
