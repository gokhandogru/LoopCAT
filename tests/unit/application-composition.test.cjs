const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const browserGlobalNames = [
  "Blob",
  "Date",
  "Intl",
  "URL",
  "caches",
  "clearInterval",
  "clearTimeout",
  "console",
  "crypto",
  "document",
  "fetch",
  "localStorage",
  "navigator",
  "performance",
  "requestAnimationFrame",
  "sessionStorage",
  "setInterval",
  "setTimeout",
  "structuredClone"
];

test("application entry is a bootstrap-only explicit composition call below 300 lines", () => {
  const source = read("app.js");
  const orderedSnippets = [
    'import { installApplicationComposition } from "./src/app/application-composition.js";',
    "const browserGlobals = globalThis;",
    "const window = browserGlobals.window;",
    "const appRuntime = window.CatHan.appRuntime;",
    "const compatibilityModules = appRuntime.compatibilityModules;",
    "installApplicationComposition({"
  ];
  let cursor = -1;
  for (const snippet of orderedSnippets) {
    const next = source.indexOf(snippet);
    assert.ok(next > cursor, `Expected bootstrap snippet in order: ${snippet}`);
    cursor = next;
  }
  assert.ok(source.split(/\r?\n/).length < 300);
  for (const forbidden of [
    "featureFactories",
    "document.",
    "querySelector",
    "addEventListener",
    "LOOPCAT_TEST_BUILD",
    "LOOPCAT_TEST_WORKFLOW_DRIVER",
    "applicationStartupController",
    "const state ="
  ]) {
    assert.equal(source.includes(forbidden), false, `Bootstrap entry unexpectedly owns ${forbidden}`);
  }
});

test("ApplicationComposition receives runtime, compatibility modules, and browser globals explicitly", () => {
  const source = read("src/app/application-composition.js");
  assert.match(
    source,
    /export function installApplicationComposition\(\{ appRuntime, browserGlobals, compatibilityModules, window \}\)/
  );
  const boundaryEnd = source.indexOf("const storageApi");
  const boundary = source.slice(0, boundaryEnd);
  for (const name of browserGlobalNames) assert.match(boundary, new RegExp(`\\b${name}\\b`));
  assert.equal(source.includes("globalThis"), false);
  assert.equal(source.includes("window.CatHan"), false);
});

test("ApplicationComposition retains checkpoint, workflow-driver, and startup order", () => {
  const source = read("src/app/application-composition.js");
  const checkpoints = source.indexOf("window.__loopcatTopLevelCheckpoint");
  const startupComposition = source.indexOf("createApplicationStartupController({");
  const workflowAdapter = source.indexOf(
    "workflow: { run: () => (LOOPCAT_TEST_BUILD ? runAppWorkflowTest() : undefined) }"
  );
  const workflowMarker = source.indexOf("/* LOOPCAT_TEST_WORKFLOW_DRIVER */");
  const startupCall = source.indexOf("applicationStartupController.start();");
  assert.ok(checkpoints !== -1);
  assert.ok(checkpoints < startupComposition);
  assert.ok(startupComposition < workflowAdapter);
  assert.ok(workflowAdapter < workflowMarker);
  assert.ok(workflowMarker < startupCall);
  assert.equal(source.indexOf("applicationStartupController.start();", startupCall + 1), -1);
});

test("renderer build injects the external workflow driver only at the composition boundary", () => {
  const source = read("scripts/build-renderer.cjs");
  assert.equal(
    source.includes("const applicationCompositionFilter = /src[\\\\/]app[\\\\/]application-composition\\.js$/;"),
    true
  );
  assert.equal((source.match(/filter: applicationCompositionFilter/g) || []).length, 2);
  assert.equal(source.includes("build.onLoad({ filter: /app\\.js$/"), false);
  assert.match(source, /replace\(workflowDriverMarker, ""\)/);
  assert.match(source, /source\.replace\(workflowDriverMarker, workflowDriver\)/);
  assert.match(read("tests/app-workflow/workflow-driver.inc.js"), /async function runAppWorkflowTest\(\)/);
});

test("ApplicationComposition preserves explicit browser-global read order and failure identity", async () => {
  const { installApplicationComposition } = await moduleAt("src/app/application-composition.js");
  const calls = [];
  const expectedError = new Error("URL unavailable");
  const browserGlobals = new Proxy(
    {},
    {
      get(_target, property) {
        calls.push(property);
        if (property === "URL") throw expectedError;
        return undefined;
      }
    }
  );
  assert.throws(
    () =>
      installApplicationComposition({
        appRuntime: {},
        browserGlobals,
        compatibilityModules: {},
        window: {}
      }),
    (error) => error === expectedError
  );
  assert.deepEqual(calls, ["Blob", "Date", "Intl", "URL"]);
});

test("ApplicationComposition propagates the first factory failure without wrapping it", async () => {
  const { installApplicationComposition } = await moduleAt("src/app/application-composition.js");
  let universal;
  const callable = () => universal;
  universal = new Proxy(callable, {
    apply: () => universal,
    construct: () => universal,
    get: () => universal
  });
  const calls = [];
  const expectedError = new Error("first factory failed");
  const featureFactories = new Proxy(
    {},
    {
      get(_target, property) {
        calls.push(property);
        if (property === "createApplicationTextSafetyService") {
          return () => {
            throw expectedError;
          };
        }
        return universal;
      }
    }
  );
  const browserGlobals = new Proxy({}, { get: () => universal });
  assert.throws(
    () =>
      installApplicationComposition({
        appRuntime: { featureFactories },
        browserGlobals,
        compatibilityModules: universal,
        window: universal
      }),
    (error) => error === expectedError
  );
  assert.deepEqual(calls, ["createApplicationTextSafetyService"]);
});
