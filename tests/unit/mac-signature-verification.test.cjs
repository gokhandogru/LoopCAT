const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const version = require("../../package.json").version;
const scriptPath = path.join(root, "scripts/verify-platform-signatures.cjs");
const source = fs.readFileSync(scriptPath, "utf8");

// Exercise the real verifier with controlled native command results. Actual
// codesign/lipo and packaged-app launch run on both macOS CI architectures.
function verifyFixture({ preview = true, signature = "adhoc", corrupt = "", wrongArch = false } = {}) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-mac-signature-test-"));
  const calls = [];
  const output = [];
  let exitCode = 0;
  const makeApp = (dir) => {
    fs.mkdirSync(path.join(dir, "LoopCAT.app/Contents/Frameworks/LoopCAT Helper.app"), { recursive: true });
  };
  const spawnSync = (command, args) => {
    calls.push({ command, args });
    if (command === "ditto") makeApp(args.at(-1));
    if (command === "hdiutil" && args[0] === "attach") makeApp(args[args.indexOf("-mountpoint") + 1]);
    if (command === "codesign" && args[0] === "--display") {
      return signature === "unsigned"
        ? { status: 1, stderr: "code object is not signed at all" }
        : {
            status: 0,
            stderr:
              signature === "adhoc"
                ? "Signature=adhoc\nTeamIdentifier=not set"
                : "Authority=Developer ID Application: Example"
          };
    }
    if (command === "codesign" && args[0] === "--verify" && corrupt && args.at(-1).includes(corrupt)) {
      return { status: 1, stderr: "a sealed resource is missing or invalid" };
    }
    if (command === "lipo" && wrongArch) return { status: 1, stderr: "does not contain architecture x86_64" };
    return { status: 0, stdout: "", stderr: "" };
  };
  try {
    makeApp(path.join(dist, "mac-universal"));
    fs.writeFileSync(path.join(dist, `LoopCAT-${version}-universal.dmg`), "fixture");
    fs.writeFileSync(path.join(dist, `LoopCAT-${version}-universal-mac.zip`), "fixture");
    const context = {
      require: (name) => (name === "node:child_process" ? { spawnSync } : require(name)),
      __dirname: path.dirname(scriptPath),
      console: { log: (line) => output.push(line), error: (line) => output.push(line) },
      process: {
        platform: "darwin",
        argv: [
          process.execPath,
          scriptPath,
          "mac",
          "--dist",
          dist,
          "--require-universal",
          ...(preview ? ["--allow-adhoc"] : [])
        ],
        cwd: () => root,
        exit: (code) => {
          exitCode = code;
          throw new Error("fixture process exit");
        }
      }
    };
    try {
      vm.runInNewContext(source, context, { filename: scriptPath });
    } catch (error) {
      if (error.message !== "fixture process exit") throw error;
    }
    return { exitCode, calls, output: output.join("\n") };
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
}

test("ad-hoc preview verifies unpacked, ZIP, and DMG signatures and both CPU architectures", () => {
  const result = verifyFixture();
  assert.equal(result.exitCode, 0, result.output);
  assert.equal(result.calls.filter(({ command, args }) => command === "codesign" && args[0] === "--verify").length, 3);
  assert.equal(result.calls.filter(({ command }) => command === "lipo").length, 6);
  assert.equal(
    result.calls.some(({ command }) => command === "spctl" || command === "xcrun"),
    false
  );
  assert.equal(
    result.calls.some(({ command, args }) => command === "hdiutil" && args[0] === "detach"),
    true
  );
});

test("a preview never accepts an unsigned app", () => {
  const result = verifyFixture({ signature: "unsigned" });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /not signed at all/);
});

test("an intact unpacked app cannot hide a damaged ZIP signature", () => {
  const result = verifyFixture({ corrupt: "loopcat-zip-verify-" });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /sealed resource is missing or invalid/);
});

test("an intact unpacked app cannot hide a damaged DMG signature", () => {
  const result = verifyFixture({ corrupt: "loopcat-dmg-verify-" });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /sealed resource is missing or invalid/);
  assert.equal(
    result.calls.some(({ command, args }) => command === "hdiutil" && args[0] === "detach"),
    true
  );
});

test("a single-architecture app fails a universal release gate", () => {
  const result = verifyFixture({ wrongArch: true });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /does not contain architecture x86_64/);
});

test("production rejects ad-hoc signatures and retains Gatekeeper and notarization checks", () => {
  const result = verifyFixture({ preview: false });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /not signed with a Developer ID/);
  assert.equal(
    result.calls.some(({ command }) => command === "spctl"),
    true
  );
  assert.equal(
    result.calls.some(({ command }) => command === "xcrun"),
    true
  );
});

test("production checks the signed root app without requiring helper apps to carry notarization tickets", () => {
  const result = verifyFixture({ preview: false, signature: "developer-id" });
  assert.equal(result.exitCode, 0, result.output);
  assert.equal(
    result.calls.some(({ command, args }) => command === "xcrun" && args.at(-1).includes("LoopCAT Helper.app")),
    false
  );
});
