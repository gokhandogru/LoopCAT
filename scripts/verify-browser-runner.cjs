const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let electronBinary = "";

function runNodeScript(relativePath) {
  const result = spawnSync(process.execPath, [path.join(root, relativePath)], {
    cwd: root,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function resolveElectronBinary() {
  try {
    return require("electron");
  } catch {
    return "";
  }
}

function repairElectronInstall() {
  const installer = path.join(root, "node_modules", "electron", "install.js");
  if (!fs.existsSync(installer)) return;
  const result = spawnSync(process.execPath, [installer], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_CACHE: process.env.ELECTRON_CACHE || path.join(root, ".cache", "electron")
    },
    stdio: "inherit"
  });
  if (result.error) console.error(result.error.message);
}

electronBinary = resolveElectronBinary();
if (!electronBinary) {
  repairElectronInstall();
  delete require.cache[require.resolve("electron")];
  electronBinary = resolveElectronBinary();
}
if (typeof electronBinary !== "string" || !electronBinary) {
  console.error("Electron is not installed correctly and could not be repaired. Run pnpm install --frozen-lockfile with install scripts enabled.");
  process.exit(1);
}

runNodeScript("scripts/build-renderer.cjs");
runNodeScript("scripts/verify-renderer-build.cjs");

const runner = path.join(root, "scripts", "browser-runner-electron.cjs");
const result = spawnSync(electronBinary, [runner], {
  cwd: root,
  env: {
    ...process.env,
    LOOPCAT_BROWSER_TEST_TIMEOUT_MS: process.env.LOOPCAT_BROWSER_TEST_TIMEOUT_MS || String(10 * 60 * 1000),
    LOOPCAT_BROWSER_RUNNER_NO_SANDBOX: process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX || "1"
  },
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
