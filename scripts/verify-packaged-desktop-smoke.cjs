const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productName = packageJson.build?.productName || "LoopCAT";
const packageName = packageJson.name || "loopcat";
const timeoutMs = Number(process.env.LOOPCAT_PACKAGED_SMOKE_TIMEOUT_MS || 60000);
const useNoSandboxDiagnostic = process.env.LOOPCAT_DESKTOP_SMOKE_NO_SANDBOX === "1";

function candidateExecutables() {
  if (process.platform === "win32") {
    return [
      path.join(distDir, "win-unpacked", `${productName}.exe`),
      path.join(distDir, "win-ia32-unpacked", `${productName}.exe`),
      path.join(distDir, "win-arm64-unpacked", `${productName}.exe`)
    ];
  }
  if (process.platform === "darwin") {
    return [
      path.join(distDir, "mac", `${productName}.app`, "Contents", "MacOS", productName),
      path.join(distDir, "mac-arm64", `${productName}.app`, "Contents", "MacOS", productName),
      path.join(distDir, "mac-universal", `${productName}.app`, "Contents", "MacOS", productName)
    ];
  }
  return [
    path.join(distDir, "linux-unpacked", packageName),
    path.join(distDir, "linux-unpacked", productName),
    path.join(distDir, "linux-arm64-unpacked", packageName),
    path.join(distDir, "linux-arm64-unpacked", productName)
  ];
}

function findExecutable() {
  return candidateExecutables().find((candidate) => fs.existsSync(candidate));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child, timeoutMs = 5000) {
  if (!child || child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (!child) return;
  if (child.exitCode === null && !(await waitForExit(child, 5000))) {
    child.kill("SIGKILL");
    await waitForExit(child, 5000);
  }
}

async function removeDirWithRetries(dir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await wait(250 * (attempt + 1));
    }
  }
}

async function waitForResult(filePath, child) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      const result = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return result;
    }
    if (child.exitCode !== null) break;
    await wait(250);
  }
  return null;
}

async function runPackagedSmoke(executable, options = {}) {
  const disableHardwareAcceleration = options.disableHardwareAcceleration === true;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-packaged-smoke-"));
  const resultFile = path.join(tmpDir, "result.json");
  const userDataDir = path.join(tmpDir, "user-data");
  fs.mkdirSync(userDataDir, { recursive: true });
  let child = null;
  try {
    child = spawn(executable, [], {
      cwd: path.dirname(executable),
      env: {
        ...process.env,
        LOOPCAT_DESKTOP_SMOKE: "1",
        LOOPCAT_DESKTOP_SMOKE_RESULT_FILE: resultFile,
        LOOPCAT_DESKTOP_SMOKE_USER_DATA_DIR: userDataDir,
        ...(useNoSandboxDiagnostic ? { LOOPCAT_DESKTOP_SMOKE_NO_SANDBOX: "1" } : {}),
        LOOPCAT_DISABLE_HARDWARE_ACCELERATION: disableHardwareAcceleration ? "1" : "",
        LOOPCAT_DESKTOP_SMOKE_TIMEOUT_MS: String(Math.max(10000, timeoutMs - 5000))
      },
      stdio: "ignore",
      windowsHide: true
    });
    const result = await waitForResult(resultFile, child);
    if (!result) {
      if (child.exitCode === null) child.kill("SIGKILL");
      const exitDetail = child.exitCode === null
        ? "child was still running"
        : `child exited with code ${child.exitCode}${child.signalCode ? ` and signal ${child.signalCode}` : ""}`;
      throw new Error(`Packaged desktop smoke timed out after ${timeoutMs} ms or ended without writing a result file (${exitDetail}).`);
    }
    if (!result.ok) {
      throw new Error(`Packaged desktop smoke failed:\n${JSON.stringify(result, null, 2)}`);
    }
    if (!useNoSandboxDiagnostic && (result.desktopRuntime?.rendererSandbox !== true || result.desktopRuntime?.chromiumNoSandbox === true)) {
      throw new Error(`Packaged desktop smoke requires the renderer OS sandbox for release evidence.\n${JSON.stringify(result.desktopRuntime || {}, null, 2)}`);
    }
    const expectedHardwareAcceleration = !disableHardwareAcceleration;
    if (!useNoSandboxDiagnostic && result.desktopRuntime?.hardwareAccelerationEnabled !== expectedHardwareAcceleration) {
      throw new Error(`Packaged desktop smoke did not honor the explicit hardware acceleration policy.\n${JSON.stringify(result.desktopRuntime || {}, null, 2)}`);
    }
    const runtimeNote = result.desktopRuntime?.chromiumNoSandbox
      ? " with Chromium no-sandbox launch mode"
      : result.desktopRuntime?.hardwareAccelerationEnabled === false
        ? " with hardware acceleration disabled"
        : " with renderer OS sandbox and hardware acceleration";
    console.log(`Packaged desktop smoke passed${runtimeNote} for ${path.relative(root, executable).replaceAll("\\", "/")}.`);
  } finally {
    await stopChild(child);
    await removeDirWithRetries(tmpDir);
  }
}

async function main() {
  const executable = findExecutable();
  if (!executable) {
    console.error(`No unpacked ${productName} executable was found under dist/. Build the desktop artifact first.`);
    for (const candidate of candidateExecutables()) console.error(`- checked ${path.relative(root, candidate).replaceAll("\\", "/")}`);
    process.exit(1);
  }
  await runPackagedSmoke(executable);
  if (!useNoSandboxDiagnostic) await runPackagedSmoke(executable, { disableHardwareAcceleration: true });
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
