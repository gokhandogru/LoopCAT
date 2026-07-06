const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const failures = [];

const version = packageJson.version;
const productName = packageJson.build?.productName || "LoopCAT";
const packageName = packageJson.name || "loopcat";
const MIN_FIXTURE_DOWNLOAD_BYTES = 2 * 1024 * 1024;

const scripts = {
  downloadArtifacts: path.join(root, "scripts", "verify-download-artifacts.cjs"),
  generateChecksums: path.join(root, "scripts", "generate-checksums.cjs"),
  verifyChecksums: path.join(root, "scripts", "verify-checksums.cjs")
};

function writeFixtureFile(dir, relativePath, content = relativePath) {
  const filePath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function writeFixtureDownloadFile(dir, relativePath) {
  const filePath = writeFixtureFile(dir, relativePath, relativePath);
  fs.truncateSync(filePath, MIN_FIXTURE_DOWNLOAD_BYTES);
  return filePath;
}

function createBaseFixture(dir) {
  writeFixtureDownloadFile(dir, `${productName} ${version}.exe`);
  writeFixtureDownloadFile(dir, `${productName} Setup ${version}.exe`);
  writeFixtureDownloadFile(dir, `${productName}-${version}.dmg`);
  writeFixtureDownloadFile(dir, `${productName}-${version}.zip`);
  writeFixtureDownloadFile(dir, `${productName}-${version}.AppImage`);
  writeFixtureDownloadFile(dir, `${packageName}_${version}_amd64.deb`);
}

function runScript(scriptPath, args, cwd = root) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8"
  });
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`.trim();
}

function expectPass(label, scriptPath, args) {
  const result = runScript(scriptPath, args);
  if (result.status !== 0) {
    failures.push(`${label} should pass but failed: ${outputOf(result)}`);
  }
}

function expectFail(label, scriptPath, args, expectedMessage) {
  const result = runScript(scriptPath, args);
  const output = outputOf(result);
  if (result.status === 0) {
    failures.push(`${label} should fail but passed.`);
    return;
  }
  if (expectedMessage && !output.includes(expectedMessage)) {
    failures.push(`${label} failed without expected message "${expectedMessage}": ${output}`);
  }
}

function withFixture(label, prepare, test) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `loopcat-${label}-`));
  try {
    createBaseFixture(dir);
    prepare?.(dir);
    test(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

withFixture("valid-release-artifacts", null, (dir) => {
  expectPass("all-platform download artifact verification", scripts.downloadArtifacts, ["--all", "--dist", dir]);
  expectPass("all-platform checksum generation", scripts.generateChecksums, ["--dist", dir]);
  expectPass("all-platform checksum verification", scripts.verifyChecksums, ["--dist", dir]);
});

withFixture("unexpected-source-zip", (dir) => {
  writeFixtureFile(dir, `${productName}-${version}-source.zip`, "source bundle");
}, (dir) => {
  expectFail("download verifier rejects source ZIP", scripts.downloadArtifacts, ["--all", "--dist", dir], "not an expected LoopCAT public download artifact filename");
  expectFail("checksum generator rejects source ZIP", scripts.generateChecksums, ["--dist", dir], "unexpected public download artifact filenames");
});

withFixture("duplicate-portable", (dir) => {
  writeFixtureDownloadFile(dir, `nested/${productName} ${version}.exe`);
}, (dir) => {
  expectFail("download verifier rejects duplicate portable", scripts.downloadArtifacts, ["win", "--dist", dir], "multiple matching artifacts");
  expectFail("checksum generator rejects duplicate artifact name", scripts.generateChecksums, ["--dist", dir], "duplicate public download artifact filenames");
});

withFixture("truncated-installer", (dir) => {
  writeFixtureFile(dir, `${productName} Setup ${version}.exe`, "partial installer");
}, (dir) => {
  expectFail("download verifier rejects truncated installer", scripts.downloadArtifacts, ["win", "--dist", dir], "minimum public download size");
  expectFail("checksum generator rejects truncated installer", scripts.generateChecksums, ["--dist", dir], "minimum public download size");
  createBaseFixture(dir);
  expectPass("checksum generation for truncated-installer setup", scripts.generateChecksums, ["--dist", dir]);
  writeFixtureFile(dir, `${productName} Setup ${version}.exe`, "partial installer");
  expectFail("checksum verifier rejects truncated installer", scripts.verifyChecksums, ["--dist", dir], "minimum public download size");
});

withFixture("unexpected-checksum-entry", null, (dir) => {
  expectPass("checksum generation for unexpected-entry setup", scripts.generateChecksums, ["--dist", dir]);
  fs.appendFileSync(path.join(dir, "SHA256SUMS.txt"), `0000000000000000000000000000000000000000000000000000000000000000  ${productName}-${version}-debug.zip\n`);
  expectFail("checksum verifier rejects unexpected checksum entry", scripts.verifyChecksums, ["--dist", dir], "unexpected public download artifact filename");
});

withFixture("nested-platform-checksum-sidecar", (dir) => {
  writeFixtureFile(dir, path.join("LoopCAT-Windows", "SHA256SUMS.txt"), "stale platform checksum\n");
}, (dir) => {
  expectFail("checksum verifier rejects nested platform checksum sidecar", scripts.verifyChecksums, ["--dist", dir], "Nested checksum sidecar");
  expectPass("checksum generator removes nested platform checksum sidecar", scripts.generateChecksums, ["--dist", dir]);
  if (fs.existsSync(path.join(dir, "LoopCAT-Windows", "SHA256SUMS.txt"))) {
    failures.push("checksum generator should remove nested platform checksum sidecars before writing the combined checksum file.");
  }
  expectPass("checksum verifier accepts cleaned combined checksum bundle", scripts.verifyChecksums, ["--dist", dir]);
});

if (failures.length) {
  console.error("Download artifact rule self-test failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Download artifact rule self-test passed.");
