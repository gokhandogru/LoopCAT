const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const platformArg = args.find((arg) => !arg.startsWith("--"));
const platformAliases = {
  win32: "win",
  windows: "win",
  darwin: "mac",
  macos: "mac",
  linux: "linux",
  win: "win",
  mac: "mac"
};
const platform = platformAliases[(platformArg || process.platform).toLowerCase()] || platformArg;
const distFlagIndex = args.indexOf("--dist");
const distDir = distFlagIndex >= 0 && args[distFlagIndex + 1]
  ? path.resolve(process.cwd(), args[distFlagIndex + 1])
  : path.join(root, "dist");
const artifactSelectionOnly = args.includes("--artifact-selection-only");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const failures = [];
const productName = packageJson.build?.productName || packageJson.name || "LoopCAT";
const escapedProductName = regexEscape(productName);
const escapedPackageName = regexEscape(packageJson.name || productName.toLowerCase());
const escapedVersion = regexEscape(packageJson.version);

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

function isDisallowedPublicArtifactName(name) {
  return /(?:^|[._\s-])(?:source|src|symbols|debug)(?:[._\s-]|$)/i.test(name);
}

const platformArtifactRules = {
  win: [
    {
      label: "Windows NSIS installer",
      publicExtensions: new Set([".exe"]),
      match: (file) => file.ext === ".exe" && exactFile(`${productName} Setup ${packageJson.version}.exe`).test(file.name)
    },
    {
      label: "Windows portable executable",
      publicExtensions: new Set([".exe"]),
      match: (file) => file.ext === ".exe" && exactFile(`${productName} ${packageJson.version}.exe`).test(file.name)
    }
  ],
  mac: [
    {
      label: "macOS DMG",
      publicExtensions: new Set([".dmg"]),
      match: (file) => file.ext === ".dmg" && productVersionFile("dmg").test(file.name)
    },
    {
      label: "macOS ZIP",
      publicExtensions: new Set([".zip"]),
      match: (file) => file.ext === ".zip" && productVersionFile("zip").test(file.name)
    }
  ],
  linux: [
    {
      label: "Linux AppImage",
      publicExtensions: new Set([".appimage"]),
      match: (file) => file.ext === ".appimage" && productVersionFile("AppImage").test(file.name)
    },
    {
      label: "Linux DEB",
      publicExtensions: new Set([".deb"]),
      match: (file) => file.ext === ".deb" && debFile().test(file.name)
    }
  ]
};

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

function walkDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  const dirs = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    dirs.push(filePath);
    dirs.push(...walkDirs(filePath));
  }
  return dirs;
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function run(command, commandArgs, label, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    ...options
  });
  if (result.error) {
    fail(`${label} could not start: ${result.error.message}`);
    return result;
  }
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    fail(`${label} failed${output ? `: ${output}` : "."}`);
  }
  return result;
}

function ensureHost(expectedPlatform, label) {
  if (process.platform !== expectedPlatform) {
    fail(`${label} must run on ${expectedPlatform}; current platform is ${process.platform}.`);
    return false;
  }
  return true;
}

function downloadCandidates() {
  return walkFiles(distDir).filter((filePath) => {
    const rel = path.relative(distDir, filePath).replaceAll("\\", "/");
    if (rel.split("/").some((part) => /(?:^|-)unpacked$/i.test(part))) return false;
    if (/\.blockmap$/i.test(rel)) return false;
    if (/^builder-(debug|effective-config)\.ya?ml$/i.test(rel)) return false;
    return true;
  }).map((filePath) => ({
    filePath,
    relativePath: path.relative(distDir, filePath).replaceAll("\\", "/"),
    name: path.basename(filePath),
    ext: path.extname(filePath).toLowerCase()
  }));
}

function expectedPlatformArtifacts(platformName) {
  const rules = platformArtifactRules[platformName];
  const candidates = downloadCandidates();
  const expected = [];
  const publicExtensions = new Set(rules.flatMap((rule) => Array.from(rule.publicExtensions)));
  const unexpected = candidates.filter((file) => publicExtensions.has(file.ext) && (
    isDisallowedPublicArtifactName(file.name) || !rules.some((rule) => rule.match(file))
  ));
  for (const artifact of unexpected) {
    fail(`${artifact.relativePath} is not an expected ${productName} ${platformName} public download artifact filename.`);
  }

  for (const rule of rules) {
    const matches = candidates.filter((file) => !isDisallowedPublicArtifactName(file.name) && rule.match(file));
    if (!matches.length) {
      fail(`${rule.label} is missing from ${path.relative(root, distDir) || distDir}.`);
      continue;
    }
    if (matches.length > 1) {
      fail(`${rule.label} has multiple matching artifacts in ${path.relative(root, distDir) || distDir}: ${matches.map((artifact) => artifact.relativePath).join(", ")}.`);
    }
    expected.push(...matches);
  }
  return expected;
}

function verifyWindows() {
  if (!artifactSelectionOnly && !ensureHost("win32", "Windows signature verification")) return;
  const exeFiles = expectedPlatformArtifacts("win");
  if (artifactSelectionOnly) return;
  for (const artifact of exeFiles) {
    const filePath = artifact.filePath;
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$signature = Get-AuthenticodeSignature -LiteralPath ${JSON.stringify(filePath)}`,
      "$status = [string]$signature.Status",
      "if ($status -eq 'NotSigned') { [Console]::Error.WriteLine(\"Authenticode status NotSigned for $($signature.Path): file is not digitally signed.\"); exit 1 }",
      "$statusMessage = [string]$signature.StatusMessage",
      "$statusMessage = $statusMessage -replace '\\s+', ' '",
      "if ($status -ne 'Valid') { [Console]::Error.WriteLine(\"Authenticode status $status for $($signature.Path): $statusMessage\"); exit 1 }",
      "if (-not $signature.SignerCertificate) { [Console]::Error.WriteLine(\"Missing signer certificate for $($signature.Path)\"); exit 1 }",
      "Write-Output \"Valid Authenticode signature: $($signature.SignerCertificate.Subject)\""
    ].join("; ");
    run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], `${relative(filePath)} Authenticode signature`);
  }
}

function verifyMacApp(appPath, labelPrefix = relative(appPath)) {
  const display = run("codesign", ["--display", "--verbose=4", appPath], `${labelPrefix} code-signing identity`);
  const displayOutput = `${display.stdout || ""}\n${display.stderr || ""}`;
  if (display.status === 0 && !displayOutput.includes("Developer ID Application")) {
    fail(`${labelPrefix} is not signed with a Developer ID Application certificate.`);
  }
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], `${labelPrefix} code-signature verification`);
  run("xcrun", ["stapler", "validate", appPath], `${labelPrefix} stapled notarization ticket`);
  run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath], `${labelPrefix} Gatekeeper assessment`);
}

function verifyMacZip(zipPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-zip-verify-"));
  try {
    const result = run("ditto", ["-x", "-k", zipPath, tmpDir], `${relative(zipPath)} extraction`);
    if (result.status !== 0) return;
    const apps = walkDirs(tmpDir).filter((dirPath) => dirPath.endsWith(".app"));
    if (!apps.length) {
      fail(`${relative(zipPath)} does not contain a macOS .app bundle.`);
      return;
    }
    for (const appPath of apps) verifyMacApp(appPath, `${relative(zipPath)} embedded ${path.basename(appPath)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function verifyMac() {
  if (!artifactSelectionOnly && !ensureHost("darwin", "macOS signature and notarization verification")) return;
  const macArtifacts = expectedPlatformArtifacts("mac");
  if (artifactSelectionOnly) return;
  const apps = walkDirs(distDir).filter((dirPath) => dirPath.endsWith(".app"));
  const dmgFiles = macArtifacts.filter((artifact) => artifact.ext === ".dmg");
  const zipFiles = macArtifacts.filter((artifact) => artifact.ext === ".zip");

  if (!apps.length) fail("No macOS .app bundle was found under dist/.");

  for (const appPath of apps) verifyMacApp(appPath);
  for (const dmgPath of dmgFiles) {
    run("xcrun", ["stapler", "validate", dmgPath.filePath], `${relative(dmgPath.filePath)} stapled notarization ticket`);
    run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", dmgPath.filePath], `${relative(dmgPath.filePath)} Gatekeeper disk-image assessment`);
  }
  for (const zipPath of zipFiles) verifyMacZip(zipPath.filePath);
}

function verifyLinux() {
  if (!artifactSelectionOnly && process.platform !== "linux") {
    fail(`Linux checksum verification must run on linux; current platform is ${process.platform}.`);
    return;
  }
  expectedPlatformArtifacts("linux");
  if (artifactSelectionOnly) return;
  console.log("Linux public-release authenticity is checksum-based; verify-checksums must run after checksum generation.");
}

if (!["win", "mac", "linux"].includes(platform)) {
  console.error("Usage: node scripts/verify-platform-signatures.cjs <win|mac|linux> [--dist path] [--artifact-selection-only]");
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  fail(`${path.relative(root, distDir) || distDir} does not exist. Build desktop artifacts before verifying signatures.`);
} else if (platform === "win") {
  verifyWindows();
} else if (platform === "mac") {
  verifyMac();
} else {
  verifyLinux();
}

if (failures.length) {
  const label = artifactSelectionOnly ? "Platform signature artifact selection" : "Platform signature verification";
  console.error(`${label} failed for ${platform}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const label = artifactSelectionOnly ? "Platform signature artifact selection" : "Platform signature verification";
console.log(`${label} passed for ${platform}.`);
