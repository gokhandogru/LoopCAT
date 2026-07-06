const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const args = process.argv.slice(2);
const platformArg = args.find((arg) => !arg.startsWith("--"));
const allPlatforms = args.includes("--all") || ["all", "bundle", "public"].includes(String(platformArg || "").toLowerCase());
const platform = allPlatforms ? "all" : (platformArg || process.platform).toLowerCase();
const distFlagIndex = args.indexOf("--dist");
const distDir = distFlagIndex >= 0 && args[distFlagIndex + 1]
  ? path.resolve(process.cwd(), args[distFlagIndex + 1])
  : path.join(root, "dist");
const failures = [];

const aliases = {
  win32: "win",
  windows: "win",
  darwin: "mac",
  macos: "mac",
  linux: "linux",
  win: "win",
  mac: "mac"
};

const normalizedPlatform = aliases[platform] || platform;
const productName = packageJson.build?.productName || packageJson.name || "LoopCAT";
const escapedProductName = regexEscape(productName);
const escapedPackageName = regexEscape(packageJson.name || productName.toLowerCase());
const escapedVersion = regexEscape(packageJson.version);
const MIN_PUBLIC_DOWNLOAD_BYTES = 1024 * 1024;

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function productVersionFile(extension) {
  return new RegExp(`^${escapedProductName}[\\s_-]+${escapedVersion}(?:[\\s_-].*)?\\.${regexEscape(extension)}$`, "i");
}

function exactFile(name) {
  return new RegExp(`^${regexEscape(name)}$`, "i");
}

function debFile() {
  return new RegExp(`^${escapedPackageName}_${escapedVersion}_[a-z0-9.+~-]+\\.deb$`, "i");
}

const artifactRules = {
  win: [
    {
      label: "Windows NSIS installer",
      match: (file) => file.ext === ".exe" && exactFile(`${productName} Setup ${packageJson.version}.exe`).test(file.name)
    },
    {
      label: "Windows portable executable",
      match: (file) => file.ext === ".exe" && exactFile(`${productName} ${packageJson.version}.exe`).test(file.name)
    }
  ],
  mac: [
    {
      label: "macOS DMG",
      match: (file) => file.ext === ".dmg" && productVersionFile("dmg").test(file.name)
    },
    {
      label: "macOS ZIP",
      match: (file) => file.ext === ".zip" && productVersionFile("zip").test(file.name)
    }
  ],
  linux: [
    {
      label: "Linux AppImage",
      match: (file) => /\.appimage$/i.test(file.name) && productVersionFile("AppImage").test(file.name)
    },
    {
      label: "Linux DEB",
      match: (file) => file.ext === ".deb" && debFile().test(file.name)
    }
  ]
};
const platformsToVerify = allPlatforms ? Object.keys(artifactRules) : [normalizedPlatform];
const publicDownloadPatterns = [
  /\.exe$/i,
  /\.dmg$/i,
  /\.zip$/i,
  /\.appimage$/i,
  /\.deb$/i
];

function fail(message) {
  failures.push(message);
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(filePath));
      continue;
    }
    if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function isDownloadCandidate(relativePath) {
  const parts = relativePath.split("/");
  if (parts.some((part) => /(?:^|-)unpacked$/i.test(part))) return false;
  if (/\.blockmap$/i.test(relativePath)) return false;
  if (/^builder-(debug|effective-config)\.ya?ml$/i.test(relativePath)) return false;
  return true;
}

function isPublicDownloadArtifact(file) {
  return publicDownloadPatterns.some((pattern) => pattern.test(file.name));
}

function isExpectedPublicDownloadArtifact(file) {
  if (/(?:^|[._\s-])(?:source|src|symbols|debug)(?:[._\s-]|$)/i.test(file.name)) return false;
  return Object.values(artifactRules).some((rules) => rules.some((rule) => rule.match(file)));
}

function artifactInfo(filePath) {
  const relativePath = path.relative(distDir, filePath).replaceAll("\\", "/");
  return {
    filePath,
    relativePath,
    name: path.basename(filePath),
    ext: path.extname(filePath).toLowerCase(),
    size: fs.statSync(filePath).size
  };
}

if (!platformsToVerify.every((item) => artifactRules[item])) {
  console.error("Usage: node scripts/verify-download-artifacts.cjs <win|mac|linux|all> [--all] [--dist path]");
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  fail(`${path.relative(root, distDir) || distDir} does not exist. Build desktop artifacts before verifying downloads.`);
} else {
  const version = packageJson.version;
  const candidates = walkFiles(distDir)
    .map(artifactInfo)
    .filter((file) => isDownloadCandidate(file.relativePath));
  const unexpectedPublicDownloads = candidates
    .filter(isPublicDownloadArtifact)
    .filter((file) => !isExpectedPublicDownloadArtifact(file));
  for (const artifact of unexpectedPublicDownloads) {
    fail(`${artifact.relativePath} is not an expected LoopCAT public download artifact filename.`);
  }

  for (const platformName of platformsToVerify) {
    for (const rule of artifactRules[platformName]) {
      const matches = candidates.filter(rule.match);
      if (!matches.length) {
        fail(`${rule.label} is missing from ${path.relative(root, distDir) || distDir}.`);
        continue;
      }
      if (matches.length > 1) {
        fail(`${rule.label} has multiple matching artifacts in ${path.relative(root, distDir) || distDir}: ${matches.map((artifact) => artifact.relativePath).join(", ")}.`);
      }

      for (const artifact of matches) {
        if (!artifact.name.includes(version)) {
          fail(`${rule.label} ${artifact.relativePath} does not include package.json version ${version} in the filename.`);
        }
        if (artifact.size < MIN_PUBLIC_DOWNLOAD_BYTES) {
          fail(`${rule.label} ${artifact.relativePath} is smaller than the minimum public download size (${MIN_PUBLIC_DOWNLOAD_BYTES} bytes). Rebuild before publishing.`);
        }
      }
    }
  }
}

if (failures.length) {
  console.error(`Download artifact verification failed for ${allPlatforms ? "all platforms" : normalizedPlatform}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Download artifact verification passed for ${allPlatforms ? "all platforms" : normalizedPlatform}.`);
