const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("lazy DOCX preserves the synchronous detector on a mutable four-method compatibility facade", async () => {
  const { installLazyDocxModule } = await moduleAt("src/features/import-export/install-lazy-docx-module.js");
  const detected = [{ id: "tag-1" }];
  const detectProtectedTags = (text) => ({ text, detected });
  const browserWindow = { CatHan: { protectedTags: { detectProtectedTags } } };
  const installation = installLazyDocxModule(browserWindow, { load() {} });

  assert.equal(browserWindow.CatHan.docx, installation.module);
  assert.deepEqual(Object.keys(installation.module), [
    "extractDocxSegments",
    "buildTargetDocx",
    "buildBilingualDocx",
    "detectProtectedTags"
  ]);
  assert.deepEqual(installation.module.detectProtectedTags("Hello {{name}}"), {
    text: "Hello {{name}}",
    detected
  });
  assert.equal(installation.module.detectProtectedTags, detectProtectedTags);
  assert.equal(Object.isFrozen(installation.module), false);
  const originalBuilder = installation.module.buildBilingualDocx;
  installation.module.buildBilingualDocx = () => "test override";
  assert.equal(installation.module.buildBilingualDocx(), "test override");
  installation.module.buildBilingualDocx = originalBuilder;
  assert.equal(Object.isFrozen(installation), true);
});

test("lazy DOCX shares one concurrent load and preserves archive delegate receivers, arguments, and results", async () => {
  const { installLazyDocxModule } = await moduleAt("src/features/import-export/install-lazy-docx-module.js");
  const detectProtectedTags = () => [];
  const browserWindow = { CatHan: { protectedTags: { detectProtectedTags } } };
  let resolveLoad;
  let loadCount = 0;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const installation = installLazyDocxModule(browserWindow, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const calls = [];
  const results = {
    extractDocxSegments: { segments: [] },
    buildTargetDocx: new Uint8Array([1]),
    buildBilingualDocx: new Uint8Array([2])
  };
  const implementation = {
    extractDocxSegments(...args) {
      calls.push(["extractDocxSegments", this, args]);
      return results.extractDocxSegments;
    },
    buildTargetDocx(...args) {
      calls.push(["buildTargetDocx", this, args]);
      return results.buildTargetDocx;
    },
    buildBilingualDocx(...args) {
      calls.push(["buildBilingualDocx", this, args]);
      return results.buildBilingualDocx;
    },
    detectProtectedTags
  };

  const extracted = installation.module.extractDocxSegments({ name: "source.docx" });
  const target = installation.module.buildTargetDocx({ id: "project" }, [{ id: "segment" }]);
  const bilingual = installation.module.buildBilingualDocx({ id: "project" }, [{ id: "segment" }], { qaChecks: [] });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  browserWindow.CatHan.docx = implementation;
  resolveLoad();

  assert.equal(await extracted, results.extractDocxSegments);
  assert.equal(await target, results.buildTargetDocx);
  assert.equal(await bilingual, results.buildBilingualDocx);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === implementation, args]),
    [
      ["extractDocxSegments", true, [{ name: "source.docx" }]],
      ["buildTargetDocx", true, [{ id: "project" }, [{ id: "segment" }]]],
      ["buildBilingualDocx", true, [{ id: "project" }, [{ id: "segment" }], { qaChecks: [] }]]
    ]
  );
  assert.equal(await installation.load(), implementation);
  assert.equal(loadCount, 1);
});

test("lazy DOCX propagates load failure identity and retries the next first use", async () => {
  const { installLazyDocxModule } = await moduleAt("src/features/import-export/install-lazy-docx-module.js");
  const detectProtectedTags = () => [];
  const browserWindow = { CatHan: { protectedTags: { detectProtectedTags } } };
  const expectedError = new Error("DOCX chunk unavailable");
  let loadCount = 0;
  const installation = installLazyDocxModule(browserWindow, {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      browserWindow.CatHan.docx = {
        extractDocxSegments: () => "ready",
        buildTargetDocx: () => "ready",
        buildBilingualDocx: () => "ready",
        detectProtectedTags
      };
    }
  });

  await assert.rejects(installation.module.extractDocxSegments({}), (error) => error === expectedError);
  assert.equal(await installation.module.extractDocxSegments({}), "ready");
  assert.equal(loadCount, 2);
});

test("lazy DOCX rejects incomplete installation and permits a repaired retry", async () => {
  const { installLazyDocxModule } = await moduleAt("src/features/import-export/install-lazy-docx-module.js");
  const detectProtectedTags = () => [];
  const browserWindow = { CatHan: { protectedTags: { detectProtectedTags } } };
  let loadCount = 0;
  const installation = installLazyDocxModule(browserWindow, {
    load() {
      loadCount += 1;
      browserWindow.CatHan.docx =
        loadCount === 1
          ? { extractDocxSegments() {}, buildTargetDocx() {}, detectProtectedTags }
          : {
              extractDocxSegments: () => "ready",
              buildTargetDocx: () => "ready",
              buildBilingualDocx: () => "ready",
              detectProtectedTags
            };
    }
  });

  await assert.rejects(installation.module.buildBilingualDocx({}, []), /did not install its implementation/);
  assert.equal(await installation.module.buildBilingualDocx({}, []), "ready");
  assert.equal(loadCount, 2);
});

test("lazy DOCX validates namespace, detector, and loader boundaries", async () => {
  const { installLazyDocxModule } = await moduleAt("src/features/import-export/install-lazy-docx-module.js");
  assert.throws(() => installLazyDocxModule({}), /requires the LoopCAT compatibility namespace/);
  assert.throws(() => installLazyDocxModule({ CatHan: {} }), /requires the synchronous protected-tag detector/);
  assert.throws(
    () => installLazyDocxModule({ CatHan: { protectedTags: { detectProtectedTags() {} } } }, { load: false }),
    /requires a load function/
  );
});
