const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
function optionValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

const root = optionValue("--root")
  ? path.resolve(process.cwd(), optionValue("--root"))
  : path.resolve(__dirname, "..");
const allowUntagged = args.includes("--allow-untagged");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const expectedTag = `v${packageJson.version}`;
const gitBin = process.env.GIT_BIN || "git";
const failures = [];

function fail(message) {
  failures.push(message);
}

function basicGitMetadataFailure() {
  const gitPath = path.join(root, ".git");
  if (!fs.existsSync(gitPath)) return "Git metadata is missing: .git does not exist.";
  const stat = fs.statSync(gitPath);
  if (stat.isFile()) {
    const text = fs.readFileSync(gitPath, "utf8").trim();
    if (!/^gitdir:\s*\S+/i.test(text)) return "Git metadata is incomplete: .git worktree file does not point to a gitdir.";
    const gitDir = text.replace(/^gitdir:\s*/i, "");
    const resolvedGitDir = path.resolve(root, gitDir);
    if (!fs.existsSync(resolvedGitDir)) return `Git metadata is incomplete: .git points to missing gitdir ${gitDir}.`;
    if (!fs.existsSync(path.join(resolvedGitDir, "HEAD"))) return `Git metadata is incomplete: ${gitDir}/HEAD is missing.`;
    return "";
  }
  if (!stat.isDirectory()) return "Git metadata is incomplete: .git is neither a directory nor a worktree gitdir file.";
  if (!fs.existsSync(path.join(gitPath, "HEAD"))) return "Git metadata is incomplete: .git/HEAD is missing.";
  return "";
}

function gitExecutableFailure() {
  const result = spawnSync(gitBin, ["--version"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.error) {
    return `Git executable is unavailable: ${result.error.message}. Set GIT_BIN to a usable Git executable before packaging.`;
  }
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    return `Git executable check failed${output ? `: ${output}` : "."}`;
  }
  return "";
}

function git(commandArgs, label) {
  const result = spawnSync(gitBin, commandArgs, {
    cwd: root,
    encoding: "utf8"
  });
  if (result.error) {
    fail(`${label} could not start: ${result.error.message}`);
    return "";
  }
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    fail(`${label} failed${output ? `: ${output}` : "."}`);
    return "";
  }
  return String(result.stdout || "").trim();
}

const metadataFailure = basicGitMetadataFailure();
if (metadataFailure) fail(metadataFailure);

let head = "";
let tagRelease = false;
if (!metadataFailure) {
  const executableFailure = gitExecutableFailure();
  if (executableFailure) fail(executableFailure);
}

if (!metadataFailure && !failures.length) {
  const insideWorkTree = git(["rev-parse", "--is-inside-work-tree"], "Git worktree check");
  if (insideWorkTree && insideWorkTree !== "true") {
    fail(`Git worktree check returned ${insideWorkTree}; expected true.`);
  }

  head = git(["rev-parse", "HEAD"], "Git HEAD lookup");
  if (head && !/^[a-f0-9]{40}$/i.test(head)) {
    fail(`Git HEAD must be a concrete 40-character commit SHA, got "${head}".`);
  }

  const status = git(["status", "--porcelain"], "Git clean tree check");
  if (status) {
    fail(`Release checkout must be clean before packaging. Dirty paths:\n${status}`);
  }

  const githubSha = process.env.GITHUB_SHA || "";
  if (githubSha && head && githubSha.toLowerCase() !== head.toLowerCase()) {
    fail(`GITHUB_SHA (${githubSha}) does not match checked-out HEAD (${head}).`);
  }

  const refType = process.env.GITHUB_REF_TYPE || "";
  const refName = process.env.GITHUB_REF_NAME || "";
  tagRelease = refType === "tag" || refName === expectedTag || (!allowUntagged && !refName);

  if (refType === "tag" && refName !== expectedTag) {
    fail(`Release tag ${refName} must match package.json version tag ${expectedTag}.`);
  }

  if (tagRelease) {
    const tagCommit = git(["rev-parse", "--verify", `${expectedTag}^{commit}`], `${expectedTag} tag lookup`);
    if (tagCommit && head && tagCommit.toLowerCase() !== head.toLowerCase()) {
      fail(`${expectedTag} must point to the checked-out release commit. Tag commit is ${tagCommit}; HEAD is ${head}.`);
    }
  } else if (!allowUntagged) {
    fail(`Release provenance must be checked from ${expectedTag} or run with --allow-untagged for an internal release-candidate build.`);
  }
}

if (failures.length) {
  console.error("Release provenance verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mode = tagRelease ? `tag ${expectedTag}` : "untagged release-candidate checkout";
console.log(`Release provenance verification passed for ${mode} at ${head}.`);
