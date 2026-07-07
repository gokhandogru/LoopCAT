const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const buildLockDir = path.join(root, ".cache", "desktop-build.lock");
const buildLockStaleMs = Number(process.env.LOOPCAT_BUILD_LOCK_STALE_MS || 6 * 60 * 60 * 1000);
const env = {
  ...process.env,
  ELECTRON_CACHE: process.env.ELECTRON_CACHE || path.join(root, ".cache", "electron"),
  ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || path.join(root, ".cache", "electron-builder")
};
const builderSidecarPattern = /^builder-(?:debug|effective-config)\.ya?ml$/i;

function requestedPlatforms(args) {
  const platforms = new Set();
  for (const arg of args) {
    if (arg === "--mac" || arg === "--macos" || arg === "-m") platforms.add("darwin");
    if (arg === "--linux" || arg === "-l") platforms.add("linux");
    if (arg === "--win" || arg === "--windows" || arg === "-w") platforms.add("win32");
    if (/^-[^-]/.test(arg)) {
      if (arg.includes("m")) platforms.add("darwin");
      if (arg.includes("l")) platforms.add("linux");
      if (arg.includes("w")) platforms.add("win32");
    }
  }
  return platforms;
}

function assertPlatformBuildHost(args) {
  const platforms = requestedPlatforms(args);
  if (!platforms.size) return;
  const names = {
    darwin: "macOS",
    linux: "Linux",
    win32: "Windows"
  };
  for (const platform of platforms) {
    if (platform === process.platform) continue;
    throw new Error(`LoopCAT ${names[platform]} desktop artifacts must be built on ${names[platform]}. Run the platform packaging command on the matching OS or through the desktop release workflow.`);
  }
}

function lockMetadata() {
  const metadataPath = path.join(buildLockDir, "lock.json");
  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  const processId = Number(pid);
  if (!Number.isInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function isStaleLock(metadata) {
  if (!isProcessAlive(metadata?.pid)) return true;
  const startedAt = Date.parse(metadata?.startedAt || "");
  return !Number.isFinite(startedAt) || Date.now() - startedAt > buildLockStaleMs;
}

function acquireBuildLock() {
  fs.mkdirSync(path.dirname(buildLockDir), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(buildLockDir);
      fs.writeFileSync(path.join(buildLockDir, "lock.json"), JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        args: process.argv.slice(2)
      }, null, 2));
      return () => {
        fs.rmSync(buildLockDir, { recursive: true, force: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const metadata = lockMetadata();
      if (attempt === 0 && isStaleLock(metadata)) {
        fs.rmSync(buildLockDir, { recursive: true, force: true });
        continue;
      }
      const detail = metadata?.startedAt ? ` started at ${metadata.startedAt}` : "";
      throw new Error(`Another desktop build appears to be running${detail}. Wait for it to finish before starting another platform build.`);
    }
  }
  throw new Error("Could not acquire desktop build lock.");
}

function removeBuildScratch() {
  if (!fs.existsSync(distDir)) return;
  const distRoot = `${fs.realpathSync(distDir)}${path.sep}`;
  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    const isScratchDirectory = entry.isDirectory() && (
      /^(?:win|linux)-unpacked$/i.test(entry.name) ||
      /^mac(?:-.+)?$/i.test(entry.name) ||
      /^__appImage-/i.test(entry.name)
    );
    const isScratchFile = entry.isFile() && builderSidecarPattern.test(entry.name);
    if (!isScratchDirectory && !isScratchFile) continue;

    const target = path.join(distDir, entry.name);
    const resolved = fs.realpathSync(target);
    if (!`${resolved}${entry.isDirectory() ? path.sep : ""}`.startsWith(distRoot)) {
      throw new Error(`Refusing to remove build scratch outside dist: ${target}`);
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function removeBuilderDebugSidecars() {
  if (!fs.existsSync(distDir)) return;
  const distRoot = `${fs.realpathSync(distDir)}${path.sep}`;
  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    if (!entry.isFile() || !builderSidecarPattern.test(entry.name)) continue;
    const target = path.join(distDir, entry.name);
    const resolved = fs.realpathSync(target);
    if (!`${resolved}`.startsWith(distRoot)) {
      throw new Error(`Refusing to remove builder sidecar outside dist: ${target}`);
    }
    fs.rmSync(target, { force: true });
  }
}

function runNodeScript(scriptName) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", scriptName)], {
    cwd: root,
    env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${scriptName} failed.`);
}

let releaseBuildLock = null;
let exitCode = 0;
try {
  assertPlatformBuildHost(process.argv.slice(2));
  releaseBuildLock = acquireBuildLock();
  removeBuildScratch();
  runNodeScript("i18n-validate.cjs");
  runNodeScript("i18n-compile.cjs");

  const command = process.platform === "win32" ? "electron-builder.cmd" : "electron-builder";
  const result = spawnSync(command, process.argv.slice(2), {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    console.error(result.error.message);
    exitCode = 1;
  } else {
    exitCode = result.status ?? 1;
  }
  removeBuilderDebugSidecars();
} catch (error) {
  console.error(error?.message || String(error));
  exitCode = 1;
} finally {
  if (releaseBuildLock) releaseBuildLock();
}
process.exit(exitCode);
