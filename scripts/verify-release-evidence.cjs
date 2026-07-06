const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
function optionValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

const valueArgIndexes = new Set([
  args.indexOf("--checksum-file") + 1,
  args.indexOf("--dist") + 1
].filter((index) => index > 0));
const explicitEvidencePath = args.find((arg, index) => !arg.startsWith("--") && !valueArgIndexes.has(index));
const templateMode = args.includes("--template") || !explicitEvidencePath;
const evidencePath = explicitEvidencePath
  ? path.resolve(process.cwd(), explicitEvidencePath)
  : path.join(root, "docs", "release-smoke-evidence-template.md");
const checksumFileArg = optionValue("--checksum-file");
const distArg = optionValue("--dist");
const checksumFilePath = checksumFileArg
  ? path.resolve(process.cwd(), checksumFileArg)
  : distArg
    ? path.join(path.resolve(process.cwd(), distArg), "SHA256SUMS.txt")
    : "";
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productName = packageJson.build?.productName || packageJson.name || "LoopCAT";
const packageName = packageJson.name || productName.toLowerCase();
const failures = [];

const requiredSections = [
  "Release Candidate",
  "Automated Gates",
  "Artifact Checksums",
  "Windows Clean-Machine Smoke",
  "macOS Clean-Machine Smoke",
  "Linux Clean-Machine Smoke",
  "Storage Failure Evidence",
  "Signing And Notarization Evidence",
  "Upgrade And Migration Evidence",
  "Release Decision"
];

const platformChecks = [
  "Launches with internet disabled",
  "Creates a project offline",
  "Imports DOCX",
  "Imports IDML",
  "Imports XLIFF",
  "Imports Markdown",
  "Imports CSV/TSV",
  "Imports Android XML",
  "Imports iOS strings",
  "Imports HTML",
  "Saves typed targets after close and reopen",
  "Saves workspace package and clears dirty warning",
  "Shows recovery warning for unsaved workspace package changes",
  "Exports target DOCX",
  "Exports current localization file",
  "Exports XLIFF",
  "Exports bilingual DOCX",
  "Exports normal report",
  "Exports anonymized report",
  "Exports and re-imports project package as copy",
  "Restores browser backup in fresh profile",
  "Blocks delivery export for missing tag fixture",
  "Blocks delivery export for forbidden term fixture",
  "Large project remains usable"
];

const requiredFields = {
  "Release Candidate": [
    "Version",
    "Commit or tag",
    "Date",
    "Tester",
    "Artifact source",
    "Offline test mode"
  ],
  "Windows Clean-Machine Smoke": ["Artifact tested", "Windows version"],
  "macOS Clean-Machine Smoke": ["Artifact tested", "macOS version"],
  "Linux Clean-Machine Smoke": ["Artifact tested", "Distribution and version"],
  "Release Decision": ["Ship / do not ship", "Required follow-up before ship", "Residual risks accepted"]
};

const artifactChecksumFields = [
  "Windows NSIS installer",
  "Windows portable",
  "macOS DMG",
  "macOS ZIP",
  "Linux AppImage",
  "Linux DEB"
];

requiredFields["Artifact Checksums"] = artifactChecksumFields;

const cleanMachineArtifactChoices = {
  "Windows Clean-Machine Smoke": {
    label: "Artifact tested",
    choices: ["NSIS installer", "portable"]
  },
  "macOS Clean-Machine Smoke": {
    label: "Artifact tested",
    choices: ["DMG", "ZIP"]
  },
  "Linux Clean-Machine Smoke": {
    label: "Artifact tested",
    choices: ["AppImage", "DEB"]
  }
};

const requiredChecks = {
  "Automated Gates": [
    "`pnpm install --frozen-lockfile`",
    "Release provenance verified",
    "`pnpm run verify:release`",
    "`pnpm run verify:desktop-wrapper`",
    "`pnpm run verify:browser-runner`",
    "Platform signing environment verified",
    "`pnpm run pack`",
    "Packaged desktop smoke",
    "`pnpm run verify:artifact`",
    "Platform downloadable artifacts verified",
    "All-platform download bundle verified",
    "Platform signatures and notarization verified",
    "Windows artifact build",
    "macOS artifact build",
    "Linux artifact build",
    "Checksums generated for downloadable artifacts",
    "`pnpm run verify:checksums`"
  ],
  "Windows Clean-Machine Smoke": platformChecks,
  "macOS Clean-Machine Smoke": platformChecks,
  "Linux Clean-Machine Smoke": platformChecks,
  "Storage Failure Evidence": [
    "Read-only workspace folder reports save failure without losing browser-cache edits",
    "Removed write permission keeps project dirty after failed package save",
    "Full or quota-limited disk reports package save failure",
    "Full or quota-limited disk reports backup export failure",
    "Missing `loopcat-workspace.json` is repaired from project package folders",
    "Corrupt project package is skipped with validation warning"
  ],
  "Signing And Notarization Evidence": [
    "Windows artifacts signed with Authenticode",
    "Windows NSIS installer launches after download",
    "Windows portable launches after download",
    "macOS artifacts signed with Developer ID Application",
    "macOS artifacts notarized and stapled",
    "macOS DMG launches after download",
    "macOS ZIP launches after download",
    "macOS Gatekeeper launches without override",
    "Linux AppImage launches after download",
    "Linux DEB installs and launches after download",
    "Linux checksums published"
  ],
  "Upgrade And Migration Evidence": [
    "Previous release project package imports",
    "Previous release browser backup restores",
    "Previous release workspace folder opens and syncs",
    "Secret stripping verified after upgrade",
    "Service worker cache version changed with app version",
    "Rollback artifacts retained"
  ]
};

const choicePlaceholderPatterns = [
  /^pass\s*\/\s*fail$/i,
  /^pass\s*\/\s*fail\s*\/\s*not applicable$/i,
  /^yes\s*\/\s*no$/i,
  /^ship\s*\/\s*do not ship$/i,
  /^NSIS installer\s*\/\s*portable$/i,
  /^DMG\s*\/\s*ZIP$/i,
  /^AppImage\s*\/\s*DEB$/i
];

const sensitivePatterns = [
  { pattern: /\bsk-[A-Za-z0-9_-]{10,}/, label: "OpenAI-style API key" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/, label: "GitHub token" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i, label: "GitHub fine-grained token" },
  { pattern: /\bnpm_[A-Za-z0-9]{20,}\b/i, label: "npm token" },
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{8,}/i, label: "bearer token" },
  { pattern: /\bAuthorization\s*:/i, label: "authorization header" },
  { pattern: /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9._+\-/=]{12,}/i, label: "secret assignment" },
  { pattern: /BEGIN (?:RSA |EC |OPENSSH |PRIVATE )?PRIVATE KEY/i, label: "private key" },
  { pattern: /\b[A-Za-z]:[\\/][^\r\n]+/, label: "absolute Windows path" },
  { pattern: /\/Users\/[^/\s]+/i, label: "macOS user-home path" },
  { pattern: /\/home\/[^/\s]+/i, label: "Linux user-home path" },
  { pattern: /(?:^|[\\/])\.ssh(?:[\\/]|$)/i, label: "SSH credential path" },
  { pattern: /\bAppData\\/i, label: "Windows profile data path" },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, label: "email address" },
  { pattern: /\.(?:p12|pfx|pem|key)\b/i, label: "certificate or key filename" }
];

const releaseBlockingResidualRiskPatterns = [
  /\bdata[-\s]?loss\b/i,
  /\blost work\b/i,
  /\bunsaved work\b/i,
  /\bcannot save\b/i,
  /\bbackup (?:restore )?(?:fail|fails|failed|broken)\b/i,
  /\bexport (?:fail|fails|failed|broken)\b/i,
  /\bimport (?:fail|fails|failed|broken)\b/i,
  /\boffline (?:fail|fails|failed|broken|untested|not tested)\b/i,
  /\binternet required\b/i,
  /\bnot signed\b/i,
  /\bunsigned\b/i,
  /\bnot notarized\b/i,
  /\bnot stapled\b/i,
  /\bgatekeeper (?:fail|fails|failed|blocked|untested|not tested)\b/i,
  /\bclean[-\s]?machine (?:untested|not tested|missing)\b/i,
  /\bmissing artifact\b/i,
  /\bcannot launch\b/i,
  /\bcrash(?:es|ed|ing)?\b/i
];

function fail(message) {
  failures.push(message);
}

function normalizeValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isChoicePlaceholder(value) {
  const normalized = normalizeValue(value);
  return choicePlaceholderPatterns.some((pattern) => pattern.test(normalized));
}

function isoDateValue(value) {
  const normalized = normalizeValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return null;
  return date;
}

function todayUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function artifactChecksumPattern(label) {
  return new RegExp(`(?:^|\\s)${artifactChecksumFilenamePattern(label)}(?:\\s|$)`, "i");
}

function artifactChecksumFilenamePattern(label) {
  const escapedProductName = escapeRegExp(productName);
  const escapedPackageName = escapeRegExp(packageName);
  const escapedVersion = escapeRegExp(packageJson.version);
  const looseProductVersion = `${escapedProductName}[\\s_-]+${escapedVersion}(?:[\\s_-].*)?`;
  const patterns = {
    "Windows NSIS installer": `${escapedProductName}\\s+Setup\\s+${escapedVersion}\\.exe`,
    "Windows portable": `${escapedProductName}\\s+${escapedVersion}\\.exe`,
    "macOS DMG": `${looseProductVersion}\\.dmg`,
    "macOS ZIP": `${looseProductVersion}\\.zip`,
    "Linux AppImage": `${looseProductVersion}\\.AppImage`,
    "Linux DEB": `${escapedPackageName}_${escapedVersion}_[a-z0-9.+~-]+\\.deb`
  };
  return patterns[label];
}

function artifactFilenameFromEvidence(label, value) {
  const match = new RegExp(artifactChecksumFilenamePattern(label), "i").exec(value);
  return match ? match[0] : "";
}

function isDisallowedPublicArtifactName(name) {
  return /(?:^|[._\s-])(?:source|src|symbols|debug)(?:[._\s-]|$)/i.test(name);
}

function parseChecksumFile(filePath) {
  const entries = new Map();
  if (!filePath) return entries;
  if (!fs.existsSync(filePath)) {
    fail(`Checksum file does not exist: ${filePath}.`);
    return entries;
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  lines.forEach((line, index) => {
    const match = /^([a-f0-9]{64})  (.+)$/i.exec(line);
    if (!match) {
      fail(`Checksum file line ${index + 1} is not in "<hash>  <path>" format.`);
      return;
    }
    const hash = match[1].toLowerCase();
    const relativePath = match[2].replaceAll("\\", "/");
    if (path.isAbsolute(relativePath) || /^[A-Za-z]:\//.test(relativePath) || relativePath.split("/").includes("..")) {
      fail(`Checksum file line ${index + 1} has an unsafe path: ${relativePath}.`);
      return;
    }
    const name = path.basename(relativePath).toLowerCase();
    if (isDisallowedPublicArtifactName(name) || !artifactChecksumFields.some((label) => new RegExp(`^${artifactChecksumFilenamePattern(label)}$`, "i").test(name))) {
      fail(`Checksum file line ${index + 1} references an unexpected release artifact: ${relativePath}.`);
      return;
    }
    const matches = entries.get(name) || [];
    matches.push({ hash, relativePath });
    entries.set(name, matches);
  });
  return entries;
}

function commitOrTagLooksConcrete(value) {
  const normalized = normalizeValue(value);
  if (/^[a-f0-9]{7,40}$/i.test(normalized)) return true;
  if (new RegExp(`^v?${escapeRegExp(packageJson.version)}$`, "i").test(normalized)) return true;
  return false;
}

function looksLikeVersionTag(value) {
  return /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/i.test(normalizeValue(value));
}

function parseEvidence(text) {
  const sections = new Map();
  let currentSection = null;

  for (const line of text.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      currentSection = heading[1].trim();
      if (!sections.has(currentSection)) sections.set(currentSection, new Map());
      continue;
    }

    const field = /^\s*-\s+(.+):\s*(.*?)\s*$/.exec(line);
    if (!field || !currentSection) continue;
    sections.get(currentSection).set(field[1].trim(), field[2].trim());
  }

  return sections;
}

function getField(sections, section, label) {
  const fields = sections.get(section);
  if (!fields || !fields.has(label)) {
    fail(`${section} is missing "${label}".`);
    return "";
  }
  return fields.get(label);
}

function requireTemplateFields(sections) {
  for (const section of requiredSections) {
    if (!sections.has(section)) fail(`Missing required section: ${section}.`);
  }

  for (const [section, labels] of Object.entries(requiredFields)) {
    for (const label of labels) getField(sections, section, label);
  }

  for (const [section, labels] of Object.entries(requiredChecks)) {
    for (const label of labels) getField(sections, section, label);
  }
}

function requireFilledField(sections, section, label) {
  const value = getField(sections, section, label);
  if (!value) fail(`${section} "${label}" must be filled in.`);
  if (isChoicePlaceholder(value)) fail(`${section} "${label}" still contains a choice placeholder.`);
  return value;
}

function requirePassField(sections, section, label, allowedStatuses = ["pass"]) {
  const value = requireFilledField(sections, section, label);
  const normalized = normalizeValue(value).toLowerCase();
  if (!["pass", "fail", "not applicable"].includes(normalized)) {
    fail(`${section} "${label}" must be "pass"${allowedStatuses.includes("not applicable") ? ' or "not applicable"' : ""}.`);
    return normalized;
  }
  if (!allowedStatuses.includes(normalized)) {
    fail(`${section} "${label}" is "${value}", so the release evidence is not publishable.`);
  }
  return normalized;
}

function requireChoiceField(sections, section, label, choices) {
  const value = requireFilledField(sections, section, label);
  const normalized = normalizeValue(value).toLowerCase();
  const allowed = choices.map((choice) => choice.toLowerCase());
  if (!allowed.includes(normalized)) {
    fail(`${section} "${label}" must be one of: ${choices.join(", ")}.`);
  }
  return normalized;
}

function verifyCompletedEvidence(sections, text) {
  if (!checksumFilePath) {
    fail("Completed release evidence must be validated with --checksum-file path/to/SHA256SUMS.txt or --dist path/to/release-dist.");
  }

  for (const [section, labels] of Object.entries(requiredFields)) {
    for (const label of labels) requireFilledField(sections, section, label);
  }

  const evidenceVersion = normalizeValue(getField(sections, "Release Candidate", "Version")).replace(/^v/i, "");
  if (evidenceVersion !== packageJson.version) {
    fail(`Release Candidate "Version" must match package.json version ${packageJson.version}.`);
  }

  const commitOrTag = normalizeValue(getField(sections, "Release Candidate", "Commit or tag"));
  if (!commitOrTagLooksConcrete(commitOrTag)) {
    if (looksLikeVersionTag(commitOrTag)) {
      fail(`Release Candidate "Commit or tag" version tag must match package.json version ${packageJson.version}.`);
    } else {
      fail('Release Candidate "Commit or tag" must be a concrete commit SHA or the matching release tag.');
    }
  }

  const artifactSource = normalizeValue(getField(sections, "Release Candidate", "Artifact source"));
  if (!artifactSource.toLowerCase().includes(packageJson.version.toLowerCase())) {
    fail(`Release Candidate "Artifact source" must identify the versioned artifact source for ${packageJson.version}.`);
  }

  const checksumEntries = parseChecksumFile(checksumFilePath);
  const artifactHashes = new Set();
  for (const label of artifactChecksumFields) {
    const value = requireFilledField(sections, "Artifact Checksums", label);
    if (!value.toLowerCase().includes(packageJson.version.toLowerCase())) {
      fail(`Artifact Checksums "${label}" must name a downloadable artifact containing package.json version ${packageJson.version}.`);
    }
    if (!artifactChecksumPattern(label).test(value)) {
      fail(`Artifact Checksums "${label}" must name the expected ${label} artifact filename.`);
    }
    const artifactName = artifactFilenameFromEvidence(label, value);
    if (artifactName && isDisallowedPublicArtifactName(artifactName)) {
      fail(`Artifact Checksums "${label}" must not name source, symbols, or debug artifacts.`);
    }
    const hashMatch = /\b[a-f0-9]{64}\b/i.exec(value);
    if (!hashMatch) {
      fail(`Artifact Checksums "${label}" must include a SHA-256 hash.`);
      continue;
    }
    const hash = hashMatch[0].toLowerCase();
    if (artifactHashes.has(hash)) {
      fail(`Artifact Checksums "${label}" repeats a SHA-256 hash already used by another artifact.`);
    }
    artifactHashes.add(hash);
    if (checksumFilePath) {
      const checksumMatches = checksumEntries.get(artifactName.toLowerCase()) || [];
      if (!checksumMatches.length) {
        fail(`Artifact Checksums "${label}" names ${artifactName}, but that artifact is missing from ${path.basename(checksumFilePath)}.`);
      } else if (checksumMatches.length > 1) {
        fail(`Artifact Checksums "${label}" names ${artifactName}, but ${path.basename(checksumFilePath)} contains duplicate basename entries.`);
      } else if (checksumMatches[0].hash !== hash) {
        fail(`Artifact Checksums "${label}" hash does not match ${checksumMatches[0].relativePath} in ${path.basename(checksumFilePath)}.`);
      }
    }
  }

  const releaseDate = isoDateValue(getField(sections, "Release Candidate", "Date"));
  if (!releaseDate) {
    fail('Release Candidate "Date" must be a valid YYYY-MM-DD date.');
  } else if (releaseDate > todayUtcDate()) {
    fail('Release Candidate "Date" must not be in the future.');
  }

  const offlineMode = normalizeValue(getField(sections, "Release Candidate", "Offline test mode")).toLowerCase();
  if (offlineMode !== "yes") fail("Release Candidate \"Offline test mode\" must be yes for a publishable offline desktop release.");

  for (const [section, { label, choices }] of Object.entries(cleanMachineArtifactChoices)) {
    requireChoiceField(sections, section, label, choices);
  }

  for (const [section, labels] of Object.entries(requiredChecks)) {
    for (const label of labels) requirePassField(sections, section, label, ["pass"]);
  }

  const decision = normalizeValue(getField(sections, "Release Decision", "Ship / do not ship")).toLowerCase();
  if (decision !== "ship") fail('Release Decision "Ship / do not ship" must be "Ship" for publishable release evidence.');

  const followUpBeforeShip = normalizeValue(getField(sections, "Release Decision", "Required follow-up before ship")).toLowerCase();
  if (followUpBeforeShip !== "none") {
    fail('Release Decision "Required follow-up before ship" must be "None" for publishable release evidence.');
  }

  const residualRisks = normalizeValue(getField(sections, "Release Decision", "Residual risks accepted"));
  const blockingResidualRisk = releaseBlockingResidualRiskPatterns.find((pattern) => pattern.test(residualRisks));
  if (blockingResidualRisk) {
    fail('Release Decision "Residual risks accepted" contains a release-blocking risk. Do not mark evidence publishable until it is resolved.');
  }

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (isChoicePlaceholder(line.replace(/^\s*-\s+[^:]+:\s*/, ""))) {
      fail(`Line ${index + 1} still contains an unreplaced choice placeholder.`);
    }
  }

  for (const { pattern, label } of sensitivePatterns) {
    if (pattern.test(text)) fail(`Completed evidence contains a ${label}. Remove private release details before storing it.`);
  }
}

if (!fs.existsSync(evidencePath)) {
  fail(`Evidence file does not exist: ${evidencePath}`);
} else {
  const evidenceText = fs.readFileSync(evidencePath, "utf8");
  const sections = parseEvidence(evidenceText);
  requireTemplateFields(sections);
  if (!templateMode) verifyCompletedEvidence(sections, evidenceText);
}

if (failures.length) {
  console.error(templateMode ? "Release evidence template verification failed:" : "Release evidence verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (templateMode) {
  console.log("Release evidence template verification passed.");
} else {
  console.log(`Release evidence verification passed for ${path.relative(root, evidencePath).replaceAll("\\", "/")}.`);
}
