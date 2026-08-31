"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const receiptName = "build-receipt.json";
const sourceDirectories = new Set([
  ".github",
  "config",
  "desktop",
  "docs",
  "i18n",
  "icons",
  "liquid-glass",
  "scripts",
  "src",
  "tests"
]);

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function fileRecord(filePath) {
  const bytes = fs.readFileSync(filePath);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function createBuildIdentity(root) {
  const git = (args) =>
    execFileSync(process.env.GIT_BIN || "git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true
    }).trim();
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  // Include tracked inputs and new source files, but never generated downloads,
  // local reports, dependencies, caches, or ignored files. Record hashes, not contents.
  const files = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .filter((name) => !name.includes("/") || sourceDirectories.has(name.split("/")[0]))
    .filter((name) => fs.existsSync(path.join(root, name)));
  const sourceFiles = [...new Set(files)].sort().map((name) => ({
    path: name,
    ...fileRecord(path.join(root, name))
  }));
  const sourceSha256 = sha256(JSON.stringify(sourceFiles));
  return {
    schemaVersion: 1,
    version,
    buildId: `${version}+source.${sourceSha256.slice(0, 12)}`,
    sourceKind: "working-tree-snapshot",
    baseCommit: git(["rev-parse", "HEAD"]),
    sourceSha256,
    sourceFiles
  };
}

function assertSameIdentity(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} does not match the current source snapshot. Rebuild all repository downloads together.`);
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeReceipt(root, directory, identity, filenames) {
  assertSameIdentity(identity, createBuildIdentity(root), "Build inputs changed during packaging");
  const artifacts = filenames.map((name) => ({ name, ...fileRecord(path.join(directory, name)) }));
  writeJson(path.join(directory, receiptName), { schemaVersion: 1, identity, artifacts });
}

function assertReceiptArtifact(receipt, identity, directory, name) {
  assertSameIdentity(receipt.identity, identity, name);
  const matches = receipt.artifacts.filter((artifact) => artifact.name === name);
  if (matches.length !== 1) throw new Error(`Missing or duplicate build receipt entry for ${name}.`);
  const actual = fileRecord(path.join(directory, name));
  if (actual.sha256 !== matches[0].sha256 || actual.bytes !== matches[0].bytes) {
    throw new Error(`${name} changed after packaging; rebuild it before preparing downloads.`);
  }
}

function repositoryArtifacts(version) {
  return [
    {
      label: "Web application",
      directory: "dist-web",
      source: `LoopCAT Web ${version}.zip`,
      name: `LoopCAT.Web.${version}.zip`
    },
    {
      label: "Windows installer",
      directory: "dist",
      source: `LoopCAT Windows Setup ${version}.zip`,
      name: `LoopCAT.Windows.Setup.${version}.zip`
    },
    {
      label: "Windows portable application",
      directory: "dist",
      source: `LoopCAT ${version} Portable.zip`,
      name: `LoopCAT.${version}.Portable.zip`
    }
  ];
}

function verifyRepositoryDownloads(root) {
  const directory = path.join(root, "downloads");
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "release.json"), "utf8"));
  const identity = createBuildIdentity(root);
  // A later commit may add only generated downloads. Keep the original build
  // commit in the manifest while requiring every source byte to remain identical.
  assertSameIdentity(
    { ...manifest.identity, baseCommit: identity.baseCommit },
    identity,
    "Repository download manifest"
  );
  if (!/^[a-f0-9]{40}$/.test(manifest.identity.baseCommit || "")) {
    throw new Error("Repository download manifest has an invalid source commit.");
  }
  try {
    execFileSync(process.env.GIT_BIN || "git", ["merge-base", "--is-ancestor", manifest.identity.baseCommit, "HEAD"], {
      cwd: root,
      stdio: "pipe",
      windowsHide: true
    });
  } catch {
    throw new Error("Repository download source commit is not an ancestor of this checkout.");
  }
  const expected = repositoryArtifacts(identity.version);
  if (manifest.artifacts.length !== expected.length) throw new Error("Unexpected repository artifact count.");
  for (const artifact of expected) assertReceiptArtifact(manifest, manifest.identity, directory, artifact.name);
  const checksumName = `LoopCAT.${identity.version}.SHA256SUMS.txt`;
  const checksumText =
    expected.map(({ name }) => `${fileRecord(path.join(directory, name)).sha256}  ${name}`).join("\n") + "\n";
  if (fs.readFileSync(path.join(directory, checksumName), "utf8") !== checksumText) {
    throw new Error("Repository checksums do not match the release manifest and ZIPs.");
  }
  const allowed = new Set([...expected.map(({ name }) => name), checksumName]);
  for (const name of fs.readdirSync(directory)) {
    if (/\.(?:zip|exe)$|SHA256SUMS\.txt$/i.test(name) && !allowed.has(name)) {
      throw new Error(`Unexpected or superseded repository download: ${name}`);
    }
  }
  return manifest;
}

module.exports = {
  createBuildIdentity,
  assertSameIdentity,
  writeJson,
  writeReceipt,
  assertReceiptArtifact,
  repositoryArtifacts,
  verifyRepositoryDownloads,
  fileRecord,
  receiptName
};
