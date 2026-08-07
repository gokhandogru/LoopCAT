"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

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

const readme = `# LoopCAT ${version} Downloads

These are the current repository copies of the LoopCAT ${version} public prerelease downloads.

| Download | File |
| --- | --- |
${artifacts.map((artifact) => `| ${artifact.label} | [\`${artifact.name}\`](./${artifact.name}) |`).join("\n")}
| SHA-256 checksums | [\`${checksumName}\`](./${checksumName}) |

The Windows installer and portable application are unsigned. Windows may show an unknown-publisher or SmartScreen warning. Verify the ZIP files against the checksum list and proceed only if you trust the [LoopCAT repository](https://github.com/gokhandogru/LoopCAT).

For installation steps, current limitations, and source documentation, see the [main README](../README.md).
`;
fs.writeFileSync(path.join(downloadsDirectory, "README.md"), readme, "utf8");

console.log(`Prepared ${artifacts.length} LoopCAT ${version} repository downloads and ${checksumName}.`);
