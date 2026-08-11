const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("diagnostics collect only redacted local summaries", async () => {
  const { createDiagnosticsService } = await moduleAt("src/features/diagnostics/diagnostics-service.js");
  const service = createDiagnosticsService({
    platform: {
      kind: "electron",
      getRuntimeStatus: () =>
        Promise.resolve({
          platform: "win32",
          rendererSandbox: true,
          hardwareAccelerationEnabled: true,
          diagnostic: "authorization=Bearer-secret C:\\Users\\person\\LoopCAT"
        })
    },
    browserNavigator: { onLine: false, storage: { estimate: () => Promise.resolve({ usage: 1200, quota: 5000 }) } },
    browserPerformance: { getEntriesByType: () => [] },
    appVersion: "0.0.3",
    getProjectSummary: () => Promise.resolve({ projectCount: 2, segmentCount: 40, projectName: "Private" }),
    getLastError: () => ({ whatHappened: "token=secret-value" })
  });
  const output = await service.serialize();
  assert.match(output, /\[redacted\]/);
  assert.doesNotMatch(output, /secret-value|Bearer-secret|Private|\\Users\\person/);
  assert.match(output, /"projectCount": 2/);
  assert.match(output, /"rendererSandbox": true/);
});
