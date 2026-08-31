const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");
const {
  createBuildIdentity,
  writeReceipt,
  assertReceiptArtifact,
  repositoryArtifacts,
  verifyRepositoryDownloads,
  writeJson,
  fileRecord
} = require("../../scripts/repository-build-identity.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-build-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync(process.env.GIT_BIN || "git", args, { cwd: root, stdio: "pipe", windowsHide: true });
  git("init");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "0.0.4-dev.20260830" }));
  fs.writeFileSync(path.join(root, "app.js"), "initial source");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "-m",
    "fixture"
  );
  return root;
}

test("Build identity detects new source and documentation without including generated reports or downloads", (t) => {
  const root = fixture(t);
  const before = createBuildIdentity(root);
  for (const directory of ["reports", "downloads"]) {
    fs.mkdirSync(path.join(root, directory));
    fs.writeFileSync(path.join(root, directory, "generated.md"), "generated");
  }
  assert.deepEqual(createBuildIdentity(root), before);
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "new.js"), "new runtime input");
  const withSource = createBuildIdentity(root);
  assert.notEqual(withSource.sourceSha256, before.sourceSha256);
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs", "release.md"), "release instructions");
  assert.notEqual(createBuildIdentity(root).sourceSha256, withSource.sourceSha256);
});

test("Build receipts reject changed inputs, mixed snapshots, and modified archives", (t) => {
  const root = fixture(t);
  const directory = path.join(root, "downloads");
  fs.mkdirSync(directory);
  const identity = createBuildIdentity(root);
  fs.writeFileSync(path.join(directory, "fixture.zip"), "archive payload");
  writeReceipt(root, directory, identity, ["fixture.zip"]);
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, "build-receipt.json")));
  assertReceiptArtifact(receipt, identity, directory, "fixture.zip");
  fs.writeFileSync(path.join(root, "app.js"), "later shortcut fix");
  assert.throws(() => writeReceipt(root, directory, identity, ["fixture.zip"]), /inputs changed/i);
  assert.throws(
    () => assertReceiptArtifact(receipt, createBuildIdentity(root), directory, "fixture.zip"),
    /source snapshot/
  );
  fs.writeFileSync(path.join(directory, "fixture.zip"), "modified archive");
  assert.throws(() => assertReceiptArtifact(receipt, identity, directory, "fixture.zip"), /changed after packaging/);
});

test("Repository verification rejects mismatched checksums, extra downloads, and changed source", (t) => {
  const root = fixture(t);
  const directory = path.join(root, "downloads");
  fs.mkdirSync(directory);
  const identity = createBuildIdentity(root);
  const artifacts = repositoryArtifacts(identity.version).map(({ name }) => {
    fs.writeFileSync(path.join(directory, name), `fixture payload: ${name}`);
    return { name, ...fileRecord(path.join(directory, name)) };
  });
  writeJson(path.join(directory, "release.json"), { identity, artifacts });
  const checksumPath = path.join(directory, `LoopCAT.${identity.version}.SHA256SUMS.txt`);
  const checksums = artifacts.map(({ name, sha256 }) => `${sha256}  ${name}\n`).join("");
  fs.writeFileSync(checksumPath, checksums);
  verifyRepositoryDownloads(root);
  // Publishing the generated mirror must not falsely mark unchanged builds stale.
  const git = (...args) =>
    execFileSync(process.env.GIT_BIN || "git", args, { cwd: root, stdio: "pipe", windowsHide: true });
  git("add", "downloads");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "-m",
    "publish downloads"
  );
  assert.notEqual(createBuildIdentity(root).baseCommit, identity.baseCommit);
  verifyRepositoryDownloads(root);
  writeJson(path.join(directory, "release.json"), { identity: { ...identity, baseCommit: "0".repeat(40) }, artifacts });
  assert.throws(() => verifyRepositoryDownloads(root), /not an ancestor/);
  writeJson(path.join(directory, "release.json"), { identity, artifacts });
  fs.writeFileSync(checksumPath, "incorrect checksum list");
  assert.throws(() => verifyRepositoryDownloads(root), /checksums/);
  fs.writeFileSync(checksumPath, checksums);
  fs.writeFileSync(path.join(directory, "LoopCAT.Web.0.0.3.zip"), "old download");
  assert.throws(() => verifyRepositoryDownloads(root), /superseded/);
  fs.unlinkSync(path.join(directory, "LoopCAT.Web.0.0.3.zip"));
  fs.writeFileSync(path.join(root, "app.js"), "unpackaged change");
  assert.throws(() => verifyRepositoryDownloads(root), /source snapshot/);
});
