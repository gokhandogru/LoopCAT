const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);
const archiveMethods = [
  "buildXliff",
  "buildXliff22",
  "buildTargetXliff",
  "detectXliffProfile",
  "parseXliffFile",
  "parseXliffText",
  "validateXliff2Document"
];

function completeImplementation(overrides = {}) {
  return {
    buildXliff() {},
    buildXliff22() {},
    buildTargetXliff() {},
    detectXliffProfile() {},
    parseXliffFile() {},
    parseXliffText() {},
    validateXliff2Document() {},
    xliffMimeType() {},
    ...overrides
  };
}

test("lazy XLIFF preserves synchronous MIME policy on a mutable eight-method compatibility facade", async () => {
  const { installLazyXliffModule } = await moduleAt("src/features/import-export/install-lazy-xliff-module.js");
  const browserWindow = { CatHan: {} };
  let loadCount = 0;
  const installation = installLazyXliffModule(browserWindow, {
    load() {
      loadCount += 1;
    }
  });

  assert.equal(browserWindow.CatHan.xliff, installation.module);
  assert.deepEqual(Object.keys(installation.module), [...archiveMethods, "xliffMimeType"]);
  assert.equal(installation.module.xliffMimeType(), "application/x-xliff+xml");
  assert.equal(installation.module.xliffMimeType("1.2"), "application/x-xliff+xml");
  assert.equal(installation.module.xliffMimeType("2.2"), "application/xliff+xml");
  assert.equal(loadCount, 0);
  assert.equal(Object.isFrozen(installation.module), false);
  const originalBuilder = installation.module.buildXliff;
  installation.module.buildXliff = () => "test override";
  assert.equal(installation.module.buildXliff(), "test override");
  installation.module.buildXliff = originalBuilder;
  assert.equal(Object.isFrozen(installation), true);
});

test("lazy XLIFF shares one concurrent load and preserves parser and builder receivers, arguments, and results", async () => {
  const { installLazyXliffModule } = await moduleAt("src/features/import-export/install-lazy-xliff-module.js");
  const browserWindow = { CatHan: {} };
  let resolveLoad;
  let loadCount = 0;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const installation = installLazyXliffModule(browserWindow, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const calls = [];
  const results = Object.fromEntries(archiveMethods.map((method) => [method, { method }]));
  const implementation = completeImplementation({ xliffMimeType: () => "implementation MIME" });
  archiveMethods.forEach((method) => {
    implementation[method] = function delegate(...args) {
      calls.push([method, this, args]);
      return results[method];
    };
  });
  const argumentsByMethod = Object.fromEntries(archiveMethods.map((method, index) => [method, [{ method }, index]]));

  const pending = archiveMethods.map((method) => installation.module[method](...argumentsByMethod[method]));
  await Promise.resolve();
  assert.equal(loadCount, 1);
  browserWindow.CatHan.xliff = implementation;
  resolveLoad();

  const resolved = await Promise.all(pending);
  assert.deepEqual(
    resolved,
    archiveMethods.map((method) => results[method])
  );
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === implementation, args]),
    archiveMethods.map((method) => [method, true, argumentsByMethod[method]])
  );
  assert.equal(await installation.load(), implementation);
  assert.equal(loadCount, 1);
});

test("lazy XLIFF propagates load failure identity and retries the next first use", async () => {
  const { installLazyXliffModule } = await moduleAt("src/features/import-export/install-lazy-xliff-module.js");
  const browserWindow = { CatHan: {} };
  const expectedError = new Error("XLIFF chunk unavailable");
  let loadCount = 0;
  const installation = installLazyXliffModule(browserWindow, {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      browserWindow.CatHan.xliff = completeImplementation({ parseXliffText: () => "ready" });
    }
  });

  await assert.rejects(installation.module.parseXliffText("<xliff/>"), (error) => error === expectedError);
  assert.equal(await installation.module.parseXliffText("<xliff/>"), "ready");
  assert.equal(loadCount, 2);
});

test("lazy XLIFF rejects incomplete installation and permits a repaired retry", async () => {
  const { installLazyXliffModule } = await moduleAt("src/features/import-export/install-lazy-xliff-module.js");
  const browserWindow = { CatHan: {} };
  let loadCount = 0;
  const installation = installLazyXliffModule(browserWindow, {
    load() {
      loadCount += 1;
      browserWindow.CatHan.xliff =
        loadCount === 1
          ? completeImplementation({ validateXliff2Document: undefined })
          : completeImplementation({ buildXliff22: () => "ready" });
    }
  });

  await assert.rejects(installation.module.buildXliff22({}, []), /did not install its implementation/);
  assert.equal(await installation.module.buildXliff22({}, []), "ready");
  assert.equal(loadCount, 2);
});

test("lazy XLIFF validates namespace and loader boundaries", async () => {
  const { installLazyXliffModule } = await moduleAt("src/features/import-export/install-lazy-xliff-module.js");
  assert.throws(() => installLazyXliffModule({}), /requires the LoopCAT compatibility namespace/);
  assert.throws(() => installLazyXliffModule({ CatHan: {} }, { load: false }), /requires a load function/);
});
