const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const suppliedExecutable = process.argv[2];
const executable = suppliedExecutable ? path.resolve(suppliedExecutable) : require("electron");
const artifacts = path.join(root, "test-artifacts", "resources-native");
const profile = path.join(root, "tmp", `resources-native-profile-${process.pid}-${Date.now()}`);
const resultFile = path.join(artifacts, "report.json");
fs.mkdirSync(artifacts, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
const args = ["--in-process-gpu", ...(suppliedExecutable ? [] : [path.join(root, "desktop", "main.cjs")])];
const result = spawnSync(executable, args, {
  cwd: root,
  timeout: 100000,
  windowsHide: true,
  encoding: "utf8",
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE")),
    LOOPCAT_DESKTOP_SMOKE: "1",
    LOOPCAT_DESKTOP_RESOURCE_SMOKE: "1",
    LOOPCAT_DESKTOP_SMOKE_TIMEOUT_MS: "90000",
    LOOPCAT_DESKTOP_SMOKE_RESULT_FILE: resultFile,
    LOOPCAT_DESKTOP_SMOKE_USER_DATA_DIR: profile,
    LOOPCAT_DISABLE_HARDWARE_ACCELERATION: "1"
  }
});
const report = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, "utf8")) : null;
if (result.status !== 0 || !report?.ok) {
  console.error(
    JSON.stringify(
      { result: report, error: result.error?.message, output: result.stdout, stderr: result.stderr },
      null,
      2
    )
  );
  process.exit(1);
}
console.log(
  `${suppliedExecutable ? "Packaged" : "Development"} native Resources smoke passed: ${report.checks.length} checks.`
);
console.log(`Report: ${resultFile}`);
