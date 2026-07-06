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
const verifierScript = path.join(root, "scripts", "verify-platform-signatures.cjs");

const platformCases = {
  win: {
    expectedFiles: [
      `${productName} Setup ${version}.exe`,
      `${productName} ${version}.exe`
    ],
    unexpectedLabel: "unexpected-win-exe",
    unexpectedFile: `${productName} ${version}-debug.exe`,
    duplicateFile: `${productName} ${version}.exe`
  },
  mac: {
    expectedFiles: [
      `${productName}-${version}.dmg`,
      `${productName}-${version}.zip`
    ],
    unexpectedLabel: "unexpected-mac-zip",
    unexpectedFile: `${productName}-${version}-source.zip`,
    duplicateFile: `${productName}-${version}.zip`
  },
  linux: {
    expectedFiles: [
      `${productName}-${version}.AppImage`,
      `${packageName}_${version}_amd64.deb`
    ],
    unexpectedLabel: "unexpected-linux-appimage",
    unexpectedFile: `${productName}-${version}-symbols.AppImage`,
    duplicateFile: `${productName}-${version}.AppImage`
  }
};

function writeFixtureFile(dir, relativePath, content = relativePath) {
  const filePath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createPlatformFixture(platformName, dir) {
  for (const fileName of platformCases[platformName].expectedFiles) {
    writeFixtureFile(dir, fileName);
  }
}

function runVerifier(platformName, dir) {
  return spawnSync(process.execPath, [
    verifierScript,
    platformName,
    "--dist",
    dir,
    "--artifact-selection-only"
  ], {
    cwd: root,
    encoding: "utf8"
  });
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`.trim();
}

function expectPass(label, platformName, dir) {
  const result = runVerifier(platformName, dir);
  if (result.status !== 0) {
    failures.push(`${label} should pass but failed: ${outputOf(result)}`);
    return;
  }
  if (!outputOf(result).includes("Platform signature artifact selection passed")) {
    failures.push(`${label} passed without reporting artifact-selection verification.`);
  }
}

function expectFail(label, platformName, dir, expectedMessage) {
  const result = runVerifier(platformName, dir);
  const output = outputOf(result);
  if (result.status === 0) {
    failures.push(`${label} should fail but passed.`);
    return;
  }
  if (expectedMessage && !output.includes(expectedMessage)) {
    failures.push(`${label} failed without expected message "${expectedMessage}": ${output}`);
  }
}

function expectSourceIncludes(label, source, expectedText) {
  if (!source.includes(expectedText)) {
    failures.push(`${label} is missing expected verifier source text "${expectedText}".`);
  }
}

function expectSourceExcludes(label, source, disallowedText) {
  if (source.includes(disallowedText)) {
    failures.push(`${label} must not contain verifier source text "${disallowedText}".`);
  }
}

function withFixture(label, prepare, test) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `loopcat-${label}-`));
  try {
    prepare?.(dir);
    test(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const [platformName, testCase] of Object.entries(platformCases)) {
  withFixture(`valid-${platformName}-platform-signature-artifacts`, (dir) => {
    createPlatformFixture(platformName, dir);
  }, (dir) => {
    expectPass(`${platformName} artifact selection`, platformName, dir);
  });

  withFixture(testCase.unexpectedLabel, (dir) => {
    writeFixtureFile(dir, testCase.unexpectedFile);
  }, (dir) => {
    expectFail(
      `${platformName} artifact selection rejects unexpected public artifact`,
      platformName,
      dir,
      `not an expected ${productName} ${platformName} public download artifact filename`
    );
  });

  withFixture(`duplicate-platform-artifact-${platformName}`, (dir) => {
    createPlatformFixture(platformName, dir);
    writeFixtureFile(dir, path.join("nested", testCase.duplicateFile));
  }, (dir) => {
    expectFail(
      `${platformName} artifact selection rejects duplicate public artifact`,
      platformName,
      dir,
      "has multiple matching artifacts"
    );
  });
}

const verifierSource = fs.readFileSync(verifierScript, "utf8");
expectSourceIncludes("Windows unsigned Authenticode normalization", verifierSource, "if ($status -eq 'NotSigned')");
expectSourceIncludes("Windows unsigned Authenticode normalization", verifierSource, "file is not digitally signed");
expectSourceExcludes("Windows unsigned Authenticode normalization", verifierSource, "You cannot run this script");

if (failures.length) {
  console.error("Platform signature artifact rule self-test failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Platform signature artifact rule self-test passed.");
