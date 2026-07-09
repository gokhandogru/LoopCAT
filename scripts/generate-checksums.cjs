const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const distFlagIndex = args.indexOf("--dist");
const distDir = distFlagIndex >= 0 && args[distFlagIndex + 1]
  ? path.resolve(process.cwd(), args[distFlagIndex + 1])
  : path.join(root, "dist");
const outputName = "SHA256SUMS.txt";
const outputPath = path.join(distDir, outputName);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productName = packageJson.build?.productName || packageJson.name || "LoopCAT";
const escapedProductName = regexEscape(productName);
const escapedPackageName = regexEscape(packageJson.name || productName.toLowerCase());
const escapedVersion = regexEscape(packageJson.version);
const MIN_PUBLIC_DOWNLOAD_BYTES = 1024 * 1024;

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

function isWindowsInstallerZipName(name) {
  return exactFile(`${productName} Windows Setup ${packageJson.version}.zip`).test(name);
}

function isWindowsPortableZipName(name) {
  return exactFile(`${productName} ${packageJson.version} Portable.zip`).test(name);
}

function isWindowsDesktopZipName(name) {
  return isWindowsInstallerZipName(name) || isWindowsPortableZipName(name);
}

function isExpectedPublicDownloadArtifact(filePath) {
  const name = path.basename(filePath);
  if (/(?:^|[._\s-])(?:source|src|symbols|debug)(?:[._\s-]|$)/i.test(name)) return false;
  return exactFile(`${productName} Setup ${packageJson.version}.exe`).test(name) ||
    exactFile(`${productName} ${packageJson.version}.exe`).test(name) ||
    productVersionFile("dmg").test(name) ||
    isWindowsDesktopZipName(name) ||
    (productVersionFile("zip").test(name) && !isWindowsDesktopZipName(name)) ||
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
    if (path.resolve(filePath) === outputPath) continue;
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

function hasCurrentVersionInFilename(filePath) {
  return path.basename(filePath).includes(packageJson.version);
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function isChecksumSidecar(filePath) {
  return path.basename(filePath).toLowerCase() === outputName.toLowerCase();
}

function removeNestedChecksumSidecars() {
  const sidecars = walkFiles(distDir)
    .filter((filePath) => isChecksumSidecar(filePath) && path.resolve(filePath) !== outputPath)
    .map((filePath) => ({
      filePath,
      relativePath: path.relative(distDir, filePath).replaceAll("\\", "/")
    }));
  for (const sidecar of sidecars) fs.rmSync(sidecar.filePath, { force: true });
  if (sidecars.length) {
    console.log(`Removed ${sidecars.length} nested platform checksum sidecar${sidecars.length === 1 ? "" : "s"} before writing ${outputName}.`);
  }
}

if (!fs.existsSync(distDir)) {
  console.error("dist/ does not exist. Build desktop artifacts before generating checksums.");
  process.exit(1);
}

removeNestedChecksumSidecars();

const files = walkFiles(distDir)
  .filter(isPublicDownloadArtifact)
  .filter(isExpectedPublicDownloadArtifact)
  .sort((a, b) => a.localeCompare(b))
  .map((filePath) => ({
    filePath,
    relativePath: path.relative(distDir, filePath).replaceAll("\\", "/")
  }));

const unexpectedFiles = walkFiles(distDir)
  .filter(isPublicDownloadArtifact)
  .filter((filePath) => !isExpectedPublicDownloadArtifact(filePath))
  .map((filePath) => path.relative(distDir, filePath).replaceAll("\\", "/"))
  .sort((a, b) => a.localeCompare(b));

if (unexpectedFiles.length) {
  console.error("dist/ contains unexpected public download artifact filenames:");
  for (const item of unexpectedFiles) console.error(`- ${item}`);
  process.exit(1);
}

if (!files.length) {
  console.error("dist/ contains no public download artifacts to checksum.");
  process.exit(1);
}

const staleVersionFiles = files.filter(({ filePath }) => !hasCurrentVersionInFilename(filePath));
if (staleVersionFiles.length) {
  console.error(`dist/ contains public download artifacts whose filenames do not include package.json version ${packageJson.version}:`);
  for (const item of staleVersionFiles) console.error(`- ${item.relativePath}`);
  process.exit(1);
}

const pathsByArtifactName = new Map();
for (const item of files) {
  const key = path.basename(item.relativePath).toLowerCase();
  const paths = pathsByArtifactName.get(key) || [];
  paths.push(item.relativePath);
  pathsByArtifactName.set(key, paths);
}
const duplicateNames = Array.from(pathsByArtifactName.entries()).filter(([, paths]) => paths.length > 1);
if (duplicateNames.length) {
  console.error("dist/ contains duplicate public download artifact filenames:");
  for (const [, paths] of duplicateNames) console.error(`- ${paths.join(", ")}`);
  process.exit(1);
}

const undersizedFiles = files.filter(({ filePath }) => fs.statSync(filePath).size < MIN_PUBLIC_DOWNLOAD_BYTES);
if (undersizedFiles.length) {
  console.error(`dist/ contains public download artifacts smaller than the minimum public download size (${MIN_PUBLIC_DOWNLOAD_BYTES} bytes):`);
  for (const item of undersizedFiles) console.error(`- ${item.relativePath}`);
  process.exit(1);
}

const lines = files.map(({ filePath, relativePath }) => `${sha256(filePath)}  ${relativePath}`);
fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${outputName} with ${files.length} public download artifact checksum${files.length === 1 ? "" : "s"}.`);
