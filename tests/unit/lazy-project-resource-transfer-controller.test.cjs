const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const apiOrder = ["importTmx", "exportTmx", "importTbx", "importTermList", "exportTbx"];

function controllerOptions() {
  const fn = () => {};
  return {
    session: { getProject: fn },
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
    repositories: {
      importTmEntries: fn,
      importTerms: fn,
      getAllByIndex: fn,
      listTerms: fn
    },
    resources: {
      mainTmName: fn,
      projectTmNames: fn,
      selectedTermBaseName: fn,
      primaryTermBaseName: fn,
      projectTermBaseNames: fn,
      markProjectsUsingDirty: fn
    },
    refresh: { tmMatches: fn, projectTerms: fn, terms: fn },
    builders: { buildTmx: fn, buildTbx: fn },
    fileSafeName: fn,
    download: fn,
    activity: { logOptionalProject: fn },
    status: { appendActivityWarning: fn, exportMode: fn, set: fn }
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

test("lazy project resource transfer validates synchronously and exposes the frozen ordered API without loading", async () => {
  const { createLazyProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/lazy-project-resource-transfer-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyProjectResourceTransferController(controllerOptions(), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), apiOrder);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(loadCount, 0);
  assert.throws(
    () => createLazyProjectResourceTransferController({}, { load() {} }),
    /ProjectResourceTransferController requires session/
  );
});

test("lazy project resource transfer shares one concurrent load and preserves options receivers arguments and results", async () => {
  const { createLazyProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/lazy-project-resource-transfer-controller.js"
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
  const controller = createLazyProjectResourceTransferController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.importTmx("tmx-file");
  const second = controller.exportTbx("tbx-options");
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createProjectResourceTransferController(value) {
      receivedOptions = value;
      return installed;
    }
  });

  assert.deepEqual(await first, { method: "importTmx", args: ["tmx-file"] });
  assert.deepEqual(await second, { method: "exportTbx", args: ["tbx-options"] });
  assert.equal(receivedOptions, options);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === installed, args]),
    [
      ["importTmx", true, ["tmx-file"]],
      ["exportTbx", true, ["tbx-options"]]
    ]
  );
});

test("lazy project resource transfer redacts load failure preserves its cause and retries the next action", async () => {
  const { createLazyProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/lazy-project-resource-transfer-controller.js"
  );
  const expectedError = new Error("C:\\Users\\person\\private-resource-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyProjectResourceTransferController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createProjectResourceTransferController: () => implementation() };
    }
  });

  await assert.rejects(controller.importTbx(), (error) => {
    assert.equal(error.message, "Project resource transfer implementation could not be loaded. Try again.");
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

test("lazy project resource transfer rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/lazy-project-resource-transfer-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyProjectResourceTransferController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createProjectResourceTransferController: () => (loadCount === 1 ? { importTmx() {} } : implementation())
      };
    }
  });

  await assert.rejects(controller.exportTmx(), /Project resource transfer implementation could not be loaded/);
  assert.deepEqual(await controller.exportTmx("repaired"), {
    method: "exportTmx",
    args: ["repaired"]
  });
  assert.equal(loadCount, 2);
});

test("lazy project resource transfer preserves implementation failure identity without reloading", async () => {
  const { createLazyProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/lazy-project-resource-transfer-controller.js"
  );
  const expectedError = new Error("term parser rejected the file");
  let loadCount = 0;
  const installed = implementation();
  installed.importTermList = () => {
    throw expectedError;
  };
  const controller = createLazyProjectResourceTransferController(controllerOptions(), {
    load() {
      loadCount += 1;
      return { createProjectResourceTransferController: () => installed };
    }
  });

  await assert.rejects(controller.importTermList(), (error) => error === expectedError);
  assert.deepEqual(await controller.exportTbx(), { method: "exportTbx", args: [] });
  assert.equal(loadCount, 1);
});

test("lazy project resource transfer validates loader configuration", async () => {
  const { createLazyProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/lazy-project-resource-transfer-controller.js"
  );
  assert.throws(
    () => createLazyProjectResourceTransferController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
