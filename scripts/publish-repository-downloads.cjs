"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  createBuildIdentity,
  assertReceiptArtifact,
  repositoryArtifacts,
  receiptName,
  writeJson,
  fileRecord,
  verifyRepositoryDownloads
} = require("./repository-build-identity.cjs");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productName = packageJson.build?.productName || "LoopCAT";
const version = packageJson.version;
const downloadsDirectory = path.join(root, "downloads");

const artifacts = [
  {
    label: "Web application",
    source: path.join(root, "dist-web", `${productName} Web ${version}.zip`),
    name: `${productName}.Web.${version}.zip`
  },
  {
    label: "Windows installer",
    source: path.join(root, "dist", `${productName} Windows Setup ${version}.zip`),
    name: `${productName}.Windows.Setup.${version}.zip`
  },
  {
    label: "Windows portable application",
    source: path.join(root, "dist", `${productName} ${version} Portable.zip`),
    name: `${productName}.${version}.Portable.zip`
  }
];

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertZip(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Missing release ZIP: ${path.relative(root, filePath)}`);
  }
  if (fs.statSync(filePath).size < 1024 * 1024) {
    throw new Error(`Release ZIP is unexpectedly small: ${path.relative(root, filePath)}`);
  }
  const header = Buffer.alloc(4);
  const descriptor = fs.openSync(filePath, "r");
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (header.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`Release file is not a ZIP archive: ${path.relative(root, filePath)}`);
  }
}

const identity = createBuildIdentity(root);
// Validate every source and its build receipt before changing the existing mirror.
for (const artifact of repositoryArtifacts(version)) {
  const directory = path.join(root, artifact.directory);
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, receiptName), "utf8"));
  assertReceiptArtifact(receipt, identity, directory, artifact.source);
}
for (const artifact of artifacts) assertZip(artifact.source);
fs.mkdirSync(downloadsDirectory, { recursive: true });

const expectedGeneratedNames = new Set(artifacts.map((artifact) => artifact.name));
const checksumName = `${productName}.${version}.SHA256SUMS.txt`;
expectedGeneratedNames.add(checksumName);

for (const entry of fs.readdirSync(downloadsDirectory, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!/^LoopCAT(?:\.| ).*(?:\.zip|SHA256SUMS\.txt)$/i.test(entry.name)) continue;
  if (!expectedGeneratedNames.has(entry.name)) {
    fs.rmSync(path.join(downloadsDirectory, entry.name), { force: true });
  }
}

for (const artifact of artifacts) {
  fs.copyFileSync(artifact.source, path.join(downloadsDirectory, artifact.name));
}

const checksumLines = artifacts.map((artifact) => {
  const target = path.join(downloadsDirectory, artifact.name);
  return `${sha256(target)}  ${artifact.name}`;
});
fs.writeFileSync(path.join(downloadsDirectory, checksumName), `${checksumLines.join("\n")}\n`, "utf8");
writeJson(path.join(downloadsDirectory, "release.json"), {
  schemaVersion: 1,
  channel: "unsigned-development-preview",
  identity,
  releaseNotes: `docs/releases/${version}.md`,
  qualification:
    "Not production-qualified. Windows signing and clean-machine testing remain outstanding; no macOS or Linux downloads are included.",
  artifacts: artifacts.map(({ name }) => ({ name, ...fileRecord(path.join(downloadsDirectory, name)) }))
});

const readme = `# LoopCAT ${version} Downloads

This is an **unsigned development preview**, not a tagged or production-qualified release.

Build: \`${identity.buildId}\`

Base commit: \`${identity.baseCommit}\`

Source snapshot SHA-256: \`${identity.sourceSha256}\`

The source snapshot includes the base commit plus local release-preparation changes; it is not claimed to be the unchanged base commit. All three ZIPs were built from this same snapshot. Each ZIP contains \`build-info.json\`; the desktop application also embeds it inside \`resources/app.asar\`. The [release manifest](./release.json) records the complete source fingerprint and ZIP hashes.

| Download | File |
| --- | --- |
${artifacts.map((artifact) => `| ${artifact.label} | [\`${artifact.name}\`](./${artifact.name}) |`).join("\n")}
| SHA-256 checksums | [\`${checksumName}\`](./${checksumName}) |

The Windows installer and portable application are unsigned. Windows may show an unknown-publisher or SmartScreen warning. Verify these ZIP files against the checksum list in this directory and proceed only if you trust the [LoopCAT repository](https://github.com/gokhandogru/LoopCAT).

The older \`draft-0.0.3\` tag points to July commit \`6f9754d\`. Its historical assets are not this preview; do not mix ZIPs or checksum lists. Prior untagged 0.0.3 mirror files have been superseded here without changing that historical tag.

For installation and checksum instructions, see the [main README](../README.md). The authoritative release notes are [LoopCAT ${version}](../docs/releases/${version}.md). After preparing downloads, run \`pnpm run verify:repository-downloads\` to detect changed sources, mixed builds, modified ZIPs, incorrect checksums, or leftover older downloads.
`;
fs.writeFileSync(path.join(downloadsDirectory, "README.md"), readme, "utf8");
verifyRepositoryDownloads(root);

console.log(`Prepared ${artifacts.length} LoopCAT ${version} repository downloads and ${checksumName}.`);
