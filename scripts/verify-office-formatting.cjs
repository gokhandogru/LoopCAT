/* Portable fidelity checks; opt in to real Microsoft Office automation with --native. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const native = process.argv.includes("--native");
function run(executable, args) {
  console.log(`Running ${path.basename(executable)} ${args.join(" ")}`);
  const result = spawnSync(executable, args, { cwd: root, stdio: "inherit", env: process.env });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function office(mode) {
  const bundled = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "powershell", "pwsh.exe");
  const installed = path.join(process.env.ProgramFiles || "C:\\Program Files", "PowerShell", "7", "pwsh.exe");
  const shell = process.env.LOOPCAT_POWERSHELL || (fs.existsSync(bundled) ? bundled : fs.existsSync(installed) ? installed : "powershell.exe");
  run(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", "scripts/office-native-formatting.ps1", "-Mode", mode]);
}
if (native && process.platform !== "win32") throw new Error("Native Office verification requires Windows and installed Microsoft Office.");
if (native) office("create");
for (const script of ["word-formatting-review.cjs", "ooxml-formatting-roundtrip.cjs", "idml-formatting-roundtrip.cjs", "office-format-review.cjs", "verify-multilingual-excel-parser.cjs"]) run(process.execPath, [path.join("scripts", script)]);
if (native) {
  run(process.execPath, ["scripts/office-native-roundtrip.cjs"]);
  office("verify");
  const renderRoot = path.join(root, "test-artifacts", "office-formatting", "native", "renders");
  for (const name of ["word-source", "word-copy", "word-translated", "excel-source", "excel-copy", "excel-translated"]) {
    run("pdftoppm", ["-png", "-r", "100", "-singlefile", path.join(renderRoot, `${name}.pdf`), path.join(renderRoot, name)]);
  }
  const bundledPython = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
  const python = process.env.LOOPCAT_PYTHON || (fs.existsSync(bundledPython) ? bundledPython : "python");
  run(python, ["scripts/compare-office-native-renders.py"]);
}
console.log(`Office/DTP formatting verification passed${native ? " including native Office and pixel comparisons" : " (portable structural checks)"}.`);
