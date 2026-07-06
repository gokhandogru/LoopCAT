const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const verifier = path.join(root, "scripts", "verify-release-evidence.cjs");
const templatePath = path.join(root, "docs", "release-smoke-evidence-template.md");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const failures = [];

function checksumValues() {
  return new Map([
    ["Windows NSIS installer", { file: `LoopCAT Setup ${packageJson.version}.exe`, hash: `${"0".repeat(63)}1` }],
    ["Windows portable", { file: `LoopCAT ${packageJson.version}.exe`, hash: `${"0".repeat(63)}2` }],
    ["macOS DMG", { file: `LoopCAT-${packageJson.version}.dmg`, hash: `${"0".repeat(63)}3` }],
    ["macOS ZIP", { file: `LoopCAT-${packageJson.version}.zip`, hash: `${"0".repeat(63)}4` }],
    ["Linux AppImage", { file: `LoopCAT-${packageJson.version}.AppImage`, hash: `${"0".repeat(63)}5` }],
    ["Linux DEB", { file: `loopcat_${packageJson.version}_amd64.deb`, hash: `${"0".repeat(63)}6` }]
  ]);
}

function checksumFileText(overrides = new Map()) {
  return Array.from(checksumValues().values()).map(({ file, hash }) => {
    const lineHash = overrides.has(file) ? overrides.get(file) : hash;
    if (lineHash === null) return "";
    return `${lineHash}  ${file}`;
  }).filter(Boolean).join("\n") + "\n";
}

function fillTemplate(text) {
  const fieldValues = new Map([
    ["Version", packageJson.version],
    ["Commit or tag", "0123456789abcdef0123456789abcdef01234567"],
    ["Date", "2026-06-21"],
    ["Tester", "Release verifier self-test"],
    ["Artifact source", `CI artifact bundle for v${packageJson.version}`],
    ["Offline test mode", "yes"],
    ["Windows version", "Windows 11"],
    ["macOS version", "macOS 15"],
    ["Distribution and version", "Ubuntu 24.04"],
    ["Ship / do not ship", "Ship"],
    ["Required follow-up before ship", "None"],
    ["Residual risks accepted", "None"]
  ]);

  return text.replace(/^([^\S\r\n]*-\s+(.+):[^\S\r\n]*)(.*?)[^\S\r\n]*$/gm, (line, prefix, label, value) => {
    const trimmedValue = value.trim();
    const checksumValue = checksumValues().get(label);
    if (checksumValue) return `${prefix}${checksumValue.file} sha256=${checksumValue.hash}`;
    if (fieldValues.has(label)) return `${prefix}${fieldValues.get(label)}`;
    if (/^pass\s*\/\s*fail$/i.test(trimmedValue)) return `${prefix}pass`;
    if (/^NSIS installer\s*\/\s*portable$/i.test(trimmedValue)) return `${prefix}NSIS installer`;
    if (/^DMG\s*\/\s*ZIP$/i.test(trimmedValue)) return `${prefix}DMG`;
    if (/^AppImage\s*\/\s*DEB$/i.test(trimmedValue)) return `${prefix}AppImage`;
    if (!trimmedValue) return `${prefix}Self-test note`;
    return line;
  });
}

function runVerifier(filePath, extraArgs = []) {
  return spawnSync(process.execPath, [verifier, filePath, ...extraArgs], {
    cwd: root,
    encoding: "utf8"
  });
}

function expectPass(filePath, label, extraArgs = []) {
  const result = runVerifier(filePath, extraArgs);
  if (result.status !== 0) {
    failures.push(`${label} should pass but failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
}

function expectFail(filePath, label, expectedMessage, extraArgs = []) {
  const result = runVerifier(filePath, extraArgs);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0) {
    failures.push(`${label} should fail but passed.`);
    return;
  }
  if (expectedMessage && !output.includes(expectedMessage)) {
    failures.push(`${label} failed without expected message "${expectedMessage}".`);
  }
}

function writeCase(dir, name, text) {
  const filePath = path.join(dir, `${name}.md`);
  fs.writeFileSync(filePath, text, "utf8");
  return filePath;
}

if (!fs.existsSync(templatePath)) {
  failures.push(`Missing release evidence template: ${templatePath}`);
} else {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-release-evidence-"));
  try {
    const template = fs.readFileSync(templatePath, "utf8");
    const goodEvidence = fillTemplate(template);
    const checksumFile = path.join(tmpDir, "SHA256SUMS.txt");
    fs.writeFileSync(checksumFile, checksumFileText(), "utf8");

    expectFail(
      writeCase(tmpDir, "missing-checksum-file", goodEvidence),
      "completed evidence without checksum file",
      "must be validated with --checksum-file"
    );
    expectPass(writeCase(tmpDir, "good-with-checksum-file", goodEvidence), "complete publishable evidence with checksum file", ["--checksum-file", checksumFile]);
    const mismatchChecksumFile = path.join(tmpDir, "SHA256SUMS-mismatch.txt");
    fs.writeFileSync(mismatchChecksumFile, checksumFileText(new Map([[`LoopCAT ${packageJson.version}.exe`, `${"f".repeat(64)}`]])), "utf8");
    expectFail(
      writeCase(tmpDir, "artifact-checksum-file-mismatch", goodEvidence),
      "artifact-checksum-file-mismatch evidence",
      "hash does not match",
      ["--checksum-file", mismatchChecksumFile]
    );
    const missingChecksumFile = path.join(tmpDir, "SHA256SUMS-missing.txt");
    fs.writeFileSync(missingChecksumFile, checksumFileText(new Map([[`LoopCAT-${packageJson.version}.zip`, null]])), "utf8");
    expectFail(
      writeCase(tmpDir, "artifact-checksum-file-missing", goodEvidence),
      "artifact-checksum-file-missing evidence",
      "artifact is missing from",
      ["--checksum-file", missingChecksumFile]
    );
    const unsafeChecksumFile = path.join(tmpDir, "SHA256SUMS-unsafe-path.txt");
    fs.writeFileSync(
      unsafeChecksumFile,
      checksumFileText().replace(
        new RegExp(`^(${"0".repeat(63)}2)  ${`LoopCAT ${packageJson.version}.exe`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"),
        `$1  ../LoopCAT ${packageJson.version}.exe`
      ),
      "utf8"
    );
    expectFail(
      writeCase(tmpDir, "artifact-checksum-file-unsafe-path", goodEvidence),
      "artifact-checksum-file-unsafe-path evidence",
      "unsafe path",
      ["--checksum-file", unsafeChecksumFile]
    );
    const unexpectedChecksumFile = path.join(tmpDir, "SHA256SUMS-unexpected-entry.txt");
    fs.writeFileSync(unexpectedChecksumFile, `${checksumFileText()}${"0".repeat(63)}7  LoopCAT-${packageJson.version}-source.zip\n`, "utf8");
    expectFail(
      writeCase(tmpDir, "artifact-checksum-file-unexpected-entry", goodEvidence),
      "artifact-checksum-file-unexpected-entry evidence",
      "unexpected release artifact",
      ["--checksum-file", unexpectedChecksumFile]
    );
    expectFail(
      writeCase(tmpDir, "artifact-checksum-source-archive", goodEvidence.replace(/^(\s*-\s+macOS ZIP:\s*).+$/m, `$1LoopCAT-${packageJson.version}-source.zip sha256=${"0".repeat(63)}4`)),
      "artifact-checksum-source-archive evidence",
      "must not name source, symbols, or debug artifacts",
      ["--checksum-file", checksumFile]
    );
    expectFail(
      writeCase(tmpDir, "placeholder", goodEvidence.replace("`pnpm run verify:release`: pass", "`pnpm run verify:release`: pass / fail")),
      "placeholder evidence",
      "choice placeholder"
    );
    expectFail(
      writeCase(tmpDir, "failed-signing", goodEvidence.replace("Windows artifacts signed with Authenticode: pass", "Windows artifacts signed with Authenticode: fail")),
      "failed signing evidence",
      "not publishable"
    );
    expectFail(
      writeCase(tmpDir, "failed-artifact-launch", goodEvidence.replace("Linux DEB installs and launches after download: pass", "Linux DEB installs and launches after download: fail")),
      "failed artifact launch evidence",
      "not publishable"
    );
    expectFail(
      writeCase(tmpDir, "not-applicable-notarization", goodEvidence.replace("macOS artifacts notarized and stapled: pass", "macOS artifacts notarized and stapled: not applicable")),
      "not-applicable notarization evidence",
      "not publishable"
    );
    expectFail(
      writeCase(tmpDir, "offline-no", goodEvidence.replace("Offline test mode: yes", "Offline test mode: no")),
      "online-mode evidence",
      "Offline test mode"
    );
    expectFail(
      writeCase(tmpDir, "version-mismatch", goodEvidence.replace(/^(\s*-\s+Version:\s*).+$/m, "$10.0.0-mismatch")),
      "version-mismatch evidence",
      "package.json version"
    );
    expectFail(
      writeCase(tmpDir, "commit-placeholder", goodEvidence.replace(/^(\s*-\s+Commit or tag:\s*).+$/m, "$1latest build")),
      "commit-placeholder evidence",
      "concrete commit SHA"
    );
    expectFail(
      writeCase(tmpDir, "tag-version-mismatch", goodEvidence.replace(/^(\s*-\s+Commit or tag:\s*).+$/m, "$1v0.0.0")),
      "tag-version-mismatch evidence",
      "version tag"
    );
    expectFail(
      writeCase(tmpDir, "artifact-source-version-missing", goodEvidence.replace(/^(\s*-\s+Artifact source:\s*).+$/m, "$1CI artifact bundle")),
      "artifact-source-version-missing evidence",
      "versioned artifact source"
    );
    expectFail(
      writeCase(tmpDir, "invalid-windows-artifact-tested", goodEvidence.replace(/^(\s*-\s+Artifact tested:\s*)NSIS installer\s*$/m, "$1latest Windows build")),
      "invalid Windows artifact-tested evidence",
      "Windows Clean-Machine Smoke \"Artifact tested\" must be one of",
      ["--checksum-file", checksumFile]
    );
    expectFail(
      writeCase(tmpDir, "invalid-macos-artifact-tested", goodEvidence.replace(/^(\s*-\s+Artifact tested:\s*)DMG\s*$/m, "$1latest macOS build")),
      "invalid macOS artifact-tested evidence",
      "macOS Clean-Machine Smoke \"Artifact tested\" must be one of",
      ["--checksum-file", checksumFile]
    );
    expectFail(
      writeCase(tmpDir, "invalid-linux-artifact-tested", goodEvidence.replace(/^(\s*-\s+Artifact tested:\s*)AppImage\s*$/m, "$1latest Linux build")),
      "invalid Linux artifact-tested evidence",
      "Linux Clean-Machine Smoke \"Artifact tested\" must be one of",
      ["--checksum-file", checksumFile]
    );
    expectFail(
      writeCase(tmpDir, "artifact-checksum-hash-missing", goodEvidence.replace(/^(\s*-\s+Windows portable:\s*).+$/m, `$1LoopCAT ${packageJson.version}.exe`)),
      "artifact-checksum-hash-missing evidence",
      "SHA-256 hash"
    );
    expectFail(
      writeCase(tmpDir, "artifact-checksum-version-missing", goodEvidence.replace(/^(\s*-\s+macOS DMG:\s*).+$/m, `$1LoopCAT-latest.dmg sha256=${"0".repeat(63)}3`)),
      "artifact-checksum-version-missing evidence",
      "downloadable artifact containing package.json version"
    );
    expectFail(
      writeCase(tmpDir, "artifact-checksum-wrong-kind", goodEvidence.replace(/^(\s*-\s+macOS ZIP:\s*).+$/m, `$1LoopCAT-${packageJson.version}.dmg sha256=${"0".repeat(63)}4`)),
      "artifact-checksum-wrong-kind evidence",
      "expected macOS ZIP artifact filename"
    );
    expectFail(
      writeCase(tmpDir, "duplicate-artifact-checksum", goodEvidence.replace(/^(\s*-\s+Linux DEB:\s*).+$/m, `$1loopcat_${packageJson.version}_amd64.deb sha256=${"0".repeat(63)}5`)),
      "duplicate-artifact-checksum evidence",
      "repeats a SHA-256 hash"
    );
    expectFail(
      writeCase(tmpDir, "bad-date", goodEvidence.replace(/^(\s*-\s+Date:\s*).+$/m, "$12026/06/21")),
      "bad-date evidence",
      "YYYY-MM-DD"
    );
    expectFail(
      writeCase(tmpDir, "future-date", goodEvidence.replace(/^(\s*-\s+Date:\s*).+$/m, "$12099-01-01")),
      "future-date evidence",
      "future"
    );
    expectFail(
      writeCase(tmpDir, "required-follow-up", goodEvidence.replace(/^(\s*-\s+Required follow-up before ship:\s*)None\s*$/m, "$1Sign the release later")),
      "required-follow-up evidence",
      "Required follow-up before ship"
    );
    expectFail(
      writeCase(tmpDir, "required-follow-up-not-applicable", goodEvidence.replace(/^(\s*-\s+Required follow-up before ship:\s*)None\s*$/m, "$1not applicable")),
      "required-follow-up-not-applicable evidence",
      "must be \"None\""
    );
    expectFail(
      writeCase(tmpDir, "blocking-residual-risk", goodEvidence.replace(/^(\s*-\s+Residual risks accepted:\s*)None\s*$/m, "$1Known data loss risk in workspace saves")),
      "blocking residual risk evidence",
      "release-blocking risk"
    );
    expectFail(
      writeCase(tmpDir, "secret", `${goodEvidence}\n\nSelf-test sensitive marker: ${"sk-" + "selftesttoken123456"}\n`),
      "secret-bearing evidence",
      "OpenAI-style API key"
    );
    expectFail(
      writeCase(tmpDir, "github-token", `${goodEvidence}\n\nSelf-test sensitive marker: ghp_selftesttoken12345678901234567890\n`),
      "GitHub token evidence",
      "GitHub token"
    );
    expectFail(
      writeCase(tmpDir, "npm-token", `${goodEvidence}\n\nSelf-test sensitive marker: npm_0123456789abcdef0123456789abcdef0123\n`),
      "npm token evidence",
      "npm token"
    );
    expectFail(
      writeCase(tmpDir, "secret-assignment", `${goodEvidence}\n\nSelf-test sensitive marker: apiKey=selftest-secret-value-12345\n`),
      "secret assignment evidence",
      "secret assignment"
    );
    expectFail(
      writeCase(tmpDir, "windows-forward-slash-path", `${goodEvidence}\n\nSelf-test path marker: C:/Users/release-tester/Documents/LoopCAT\n`),
      "Windows forward-slash path evidence",
      "absolute Windows path"
    );
    expectFail(
      writeCase(tmpDir, "mac-user-path", `${goodEvidence}\n\nSelf-test path marker: /Users/release-tester/Downloads/LoopCAT.dmg\n`),
      "macOS user path evidence",
      "macOS user-home path"
    );
    expectFail(
      writeCase(tmpDir, "email-address", `${goodEvidence}\n\nSelf-test email marker: release.tester@example.com\n`),
      "email-bearing evidence",
      "email address"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (failures.length) {
  console.error("Release evidence verifier self-test failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Release evidence verifier self-test passed.");
