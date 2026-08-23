const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const apiOrder = ["importTmx", "importTbx", "importTermList"];

function controllerOptions() {
  const fn = () => {};
  return {
    forms: {
      tmName: fn,
      tbName: fn,
      tmSourceLanguageInput: {},
      tmTargetLanguageInput: {},
      tbSourceLanguageInput: {},
      tbTargetLanguageInput: {},
      normalizeLanguageInput: fn
    },
    files: {
      assertSize: fn,
      readText: fn,
      reportProgress: fn,
      progressDetail: fn,
      yieldToUi: fn
    },
    parsers: {
      parseTmx: fn,
      parseTbx: fn,
      parseTermList: fn,
      parseTermWorkbook: fn
    },
    repositories: { importTmEntries: fn, importTerms: fn },
    resources: {
      markProjectsUsingDirty: fn,
      open: fn,
      refresh: fn,
      refreshProjectTerms: fn
    },
    alert: fn,
    status: { set: fn }
  };
}

function implementation(calls = []) {
  return Object.fromEntries(
    apiOrder.map((method) => [
      method,
      function (...args) {
        calls.push([method, this, args]);
        return { method, args };
      }
    ])
  );
}

test("lazy Resources-library import validates synchronously and exposes the frozen ordered API without loading", async () => {
  const { createLazyResourceLibraryImportController } = await moduleAt(
    "src/features/resources/lazy-resource-library-import-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyResourceLibraryImportController(controllerOptions(), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), apiOrder);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(loadCount, 0);
  assert.throws(
    () => createLazyResourceLibraryImportController({}, { load() {} }),
    /ResourceLibraryImportController requires form/
  );
});

test("lazy Resources-library import shares one concurrent load and preserves options receivers arguments and results", async () => {
  const { createLazyResourceLibraryImportController } = await moduleAt(
    "src/features/resources/lazy-resource-library-import-controller.js"
  );
  const options = controllerOptions();
  const calls = [];
  const installed = implementation(calls);
  let receivedOptions;
  let resolveLoad;
  let loadCount = 0;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const controller = createLazyResourceLibraryImportController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.importTmx("tmx-file");
  const second = controller.importTermList("term-file", { encoding: "utf-8" });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createResourceLibraryImportController(value) {
      receivedOptions = value;
      return installed;
    }
  });

  assert.deepEqual(await first, { method: "importTmx", args: ["tmx-file"] });
  assert.deepEqual(await second, {
    method: "importTermList",
    args: ["term-file", { encoding: "utf-8" }]
  });
  assert.equal(receivedOptions, options);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === installed, args]),
    [
      ["importTmx", true, ["tmx-file"]],
      ["importTermList", true, ["term-file", { encoding: "utf-8" }]]
    ]
  );
});

test("lazy Resources-library import redacts load failure preserves its cause and retries the next import", async () => {
  const { createLazyResourceLibraryImportController } = await moduleAt(
    "src/features/resources/lazy-resource-library-import-controller.js"
  );
  const expectedError = new Error("C:\\Users\\person\\private-resource-import-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyResourceLibraryImportController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createResourceLibraryImportController: () => implementation() };
    }
  });

  await assert.rejects(controller.importTbx(), (error) => {
    assert.equal(error.message, "Resources-library import implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.deepEqual(await controller.importTbx("retry"), {
    method: "importTbx",
    args: ["retry"]
  });
  assert.equal(loadCount, 2);
});

test("lazy Resources-library import rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyResourceLibraryImportController } = await moduleAt(
    "src/features/resources/lazy-resource-library-import-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyResourceLibraryImportController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createResourceLibraryImportController: () => (loadCount === 1 ? { importTmx() {} } : implementation())
      };
    }
  });

  await assert.rejects(controller.importTmx(), /Resources-library import implementation could not be loaded/);
  assert.deepEqual(await controller.importTmx("repaired"), {
    method: "importTmx",
    args: ["repaired"]
  });
  assert.equal(loadCount, 2);
});

test("lazy Resources-library import preserves implementation failure identity without reloading", async () => {
  const { createLazyResourceLibraryImportController } = await moduleAt(
    "src/features/resources/lazy-resource-library-import-controller.js"
  );
  const expectedError = new Error("resource parser failed");
  let loadCount = 0;
  const installed = implementation();
  installed.importTermList = () => {
    throw expectedError;
  };
  const controller = createLazyResourceLibraryImportController(controllerOptions(), {
    load() {
      loadCount += 1;
      return { createResourceLibraryImportController: () => installed };
    }
  });

  await assert.rejects(controller.importTermList(), (error) => error === expectedError);
  assert.deepEqual(await controller.importTbx(), { method: "importTbx", args: [] });
  assert.equal(loadCount, 1);
});

test("lazy Resources-library import validates loader configuration", async () => {
  const { createLazyResourceLibraryImportController } = await moduleAt(
    "src/features/resources/lazy-resource-library-import-controller.js"
  );
  assert.throws(
    () => createLazyResourceLibraryImportController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
