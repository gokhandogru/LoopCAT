const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const verifier = path.join(root, "scripts", "verify-signing-env.cjs");
const signingEnvNames = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "WIN_CSC_LINK",
  "WIN_CSC_KEY_PASSWORD",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_KEYCHAIN",
  "APPLE_KEYCHAIN_PROFILE"
];
const failures = [];

function cleanEnv(overrides = {}) {
  const env = { ...process.env };
  signingEnvNames.forEach((name) => delete env[name]);
  Object.entries(overrides).forEach(([name, value]) => {
    env[name] = value;
  });
  return env;
}

function run(platform, env = {}, separator = false) {
  return spawnSync(process.execPath, [verifier, ...(separator ? ["--"] : []), platform], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(env)
  });
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function expectPass(platform, env, label, expectedText = "", separator = false) {
  const result = run(platform, env, separator);
  const output = outputOf(result);
  if (result.status !== 0) {
    failures.push(`${label} should pass but failed: ${output.trim()}`);
  }
  if (expectedText && !output.includes(expectedText)) {
    failures.push(`${label} did not include expected text: ${expectedText}`);
  }
}

function expectFail(platform, env, label, expectedText = "") {
  const result = run(platform, env);
  const output = outputOf(result);
  if (result.status === 0) {
    failures.push(`${label} should fail but passed.`);
    return;
  }
  if (expectedText && !output.includes(expectedText)) {
    failures.push(`${label} failed without expected text: ${expectedText}`);
  }
}

expectFail("", {}, "missing platform", "Usage:");
expectFail("win", {}, "Windows missing credentials", "Windows Authenticode certificate");
expectFail("win", { CSC_LINK: "selftest-cert" }, "Windows partial standard certificate", "CSC_KEY_PASSWORD");
expectFail(
  "win",
  { WIN_CSC_LINK: "   ", WIN_CSC_KEY_PASSWORD: "selftest-secret-password" },
  "Windows whitespace-only certificate link",
  "WIN_CSC_LINK"
);
expectPass(
  "win",
  { WIN_CSC_LINK: "selftest-secret-link", WIN_CSC_KEY_PASSWORD: "selftest-secret-password" },
  "Windows-specific certificate credentials",
  "WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD"
);
expectPass(
  "linux",
  {},
  "pnpm separator compatibility",
  "Signing environment verification passed for linux",
  true
);
expectFail("mac", {}, "macOS missing credentials", "macOS Developer ID certificate");
expectFail(
  "mac",
  { CSC_LINK: "selftest-cert", CSC_KEY_PASSWORD: "selftest-password" },
  "macOS missing notarization credentials",
  "macOS notarization credentials"
);
expectFail(
  "mac",
  {
    CSC_LINK: "selftest-cert",
    CSC_KEY_PASSWORD: "   ",
    APPLE_API_KEY: "selftest-api-key",
    APPLE_API_KEY_ID: "selftest-key-id",
    APPLE_API_ISSUER: "selftest-issuer"
  },
  "macOS whitespace-only certificate password",
  "CSC_KEY_PASSWORD"
);
expectFail(
  "mac",
  {
    CSC_LINK: "selftest-cert",
    CSC_KEY_PASSWORD: "selftest-password",
    APPLE_API_KEY: "selftest-api-key",
    APPLE_API_KEY_ID: "selftest-key-id"
  },
  "macOS partial API notarization credentials",
  "APPLE_API_ISSUER"
);
expectPass(
  "mac",
  {
    CSC_LINK: "selftest-cert",
    CSC_KEY_PASSWORD: "selftest-password",
    APPLE_API_KEY: "selftest-api-key",
    APPLE_API_KEY_ID: "selftest-key-id",
    APPLE_API_ISSUER: "selftest-issuer"
  },
  "macOS API notarization credentials",
  "APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER"
);
expectPass("linux", {}, "Linux checksum-based release gate", "passed for linux");

const secretLeakResult = run("win", {
  WIN_CSC_LINK: "selftest-secret-link",
  WIN_CSC_KEY_PASSWORD: "selftest-secret-password"
});
const secretLeakOutput = outputOf(secretLeakResult);
if (secretLeakOutput.includes("selftest-secret-link") || secretLeakOutput.includes("selftest-secret-password")) {
  failures.push("Signing environment verifier printed secret values.");
}

if (failures.length) {
  console.error("Signing environment verifier self-test failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Signing environment verifier self-test passed.");
