const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const verifierScript = path.join(root, "scripts", "verify-release-provenance.cjs");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const failures = [];

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createFixtureRoot(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `loopcat-provenance-${label}-`));
  writeFile(path.join(dir, "package.json"), JSON.stringify({ version: packageJson.version }, null, 2));
  return dir;
}

function runVerifier(dir, env = {}) {
  return spawnSync(process.execPath, [
    verifierScript,
    "--allow-untagged",
    "--root",
    dir
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`.trim();
}

function expectFail(label, prepare, expectedMessage, env = {}) {
  const dir = createFixtureRoot(label);
  try {
    prepare?.(dir);
    const result = runVerifier(dir, env);
    const output = outputOf(result);
    if (result.status === 0) {
      failures.push(`${label} should fail but passed.`);
      return;
    }
    if (!output.includes(expectedMessage)) {
      failures.push(`${label} failed without expected message "${expectedMessage}": ${output}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

expectFail(
  "missing-git-metadata",
  null,
  "Git metadata is missing: .git does not exist."
);

expectFail(
  "empty-git-directory",
  (dir) => fs.mkdirSync(path.join(dir, ".git")),
  "Git metadata is incomplete: .git/HEAD is missing."
);

expectFail(
  "invalid-git-worktree-file",
  (dir) => writeFile(path.join(dir, ".git"), "not a gitdir\n"),
  "Git metadata is incomplete: .git worktree file does not point to a gitdir."
);

expectFail(
  "missing-linked-gitdir",
  (dir) => writeFile(path.join(dir, ".git"), "gitdir: ../missing-loopcat-gitdir\n"),
  "Git metadata is incomplete: .git points to missing gitdir ../missing-loopcat-gitdir."
);

expectFail(
  "linked-gitdir-missing-head",
  (dir) => {
    writeFile(path.join(dir, ".git"), "gitdir: linked-gitdir\n");
    fs.mkdirSync(path.join(dir, "linked-gitdir"));
  },
  "Git metadata is incomplete: linked-gitdir/HEAD is missing."
);

expectFail(
  "missing-git-executable",
  (dir) => {
    fs.mkdirSync(path.join(dir, ".git"));
    writeFile(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  },
  "Git executable is unavailable:",
  { GIT_BIN: path.join(os.tmpdir(), "loopcat-missing-git-executable") }
);

if (failures.length) {
  console.error("Release provenance verifier self-test failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Release provenance verifier self-test passed.");
