const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.resolve(__dirname, "../../src/security/safe-html.js")).href;

test("Trusted Script URL boundary accepts only LoopCAT worker assets", async () => {
  const { asTrustedScriptUrl } = await import(moduleUrl);
  assert.equal(asTrustedScriptUrl("./service-worker.js"), "./service-worker.js");
  assert.equal(asTrustedScriptUrl("./cat-worker.js"), "./cat-worker.js");
  assert.throws(() => asTrustedScriptUrl("https://example.com/service-worker.js"), /must be relative/);
  assert.throws(() => asTrustedScriptUrl("./app.js"), /unrecognized executable asset/);
});
