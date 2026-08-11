const fs = require("node:fs");
const path = require("node:path");
const { FuseV1Options, getCurrentFuseWire } = require("@electron/fuses");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productName = packageJson.build?.productName || "LoopCAT";
const packageName = packageJson.name || "loopcat";
const ENABLED = "1".charCodeAt(0);
const DISABLED = "0".charCodeAt(0);

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

async function main() {
  const executable = candidateExecutables().find((candidate) => fs.existsSync(candidate));
  if (!executable)
    throw new Error("No unpacked Electron executable was found under dist/. Build it before verifying fuses.");
  const wire = await getCurrentFuseWire(executable);
  const expected = new Map([
    [FuseV1Options.RunAsNode, DISABLED],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, DISABLED],
    [FuseV1Options.EnableNodeCliInspectArguments, DISABLED],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, ENABLED],
    [FuseV1Options.OnlyLoadAppFromAsar, ENABLED],
    [FuseV1Options.GrantFileProtocolExtraPrivileges, DISABLED]
  ]);
  const failures = [];
  for (const [fuse, expectedState] of expected) {
    if (wire[fuse] !== expectedState) {
      failures.push(
        `${FuseV1Options[fuse]} expected ${String.fromCharCode(expectedState)} but found ${String.fromCharCode(wire[fuse] || 63)}`
      );
    }
  }
  if (failures.length) throw new Error(`Electron fuse verification failed:\n- ${failures.join("\n- ")}`);
  console.log(`Electron fuse verification passed for ${path.relative(root, executable).replaceAll("\\", "/")}.`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
