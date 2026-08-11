const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { inspectBundleContract } = require("./verify-bundle-contract.cjs");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-bundle-contract-"));
try {
  fs.writeFileSync(path.join(tempRoot, "app.js"), "const production = true;\n", "utf8");
  const contract = {
    mode: "self-test",
    productionFiles: ["app.js"],
    knownMarkers: { "app.js": { runAppWorkflowTest: 0 } },
    forbiddenMarkers: ["window.__LOOPCAT_TEST__"]
  };
  const clean = inspectBundleContract(contract, tempRoot);
  if (clean.failures.length) throw new Error(`Clean fixture failed: ${clean.failures.join(" | ")}`);
  fs.appendFileSync(path.join(tempRoot, "app.js"), "window.__LOOPCAT_TEST__ = true;\n", "utf8");
  const injected = inspectBundleContract(contract, tempRoot);
  if (!injected.failures.some((failure) => failure.includes("forbidden production marker"))) {
    throw new Error("Injected test-only global was not rejected.");
  }
  console.log("Bundle contract self-test passed.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
