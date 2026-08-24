const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const apiOrder = ["exportBrowserBackup", "exportProjectPackage"];

function controllerOptions() {
  const fn = () => {};
  return {
    build: { buildBackupExport: fn, buildProjectPackage: fn, assertValidProjectPackageForWrite: fn },
    session: {
      getProject: fn,
      getProjects: fn,
      replaceProject: fn,
      replaceProjects: fn,
      replaceActivityEvents: fn
    },
    persistence: { updateProject: fn, bulkPut: fn, listActivityEvents: fn },
    activity: { draft: fn, appendWarning: fn },
    files: { safeName: fn, download: fn },
    validation: { count: fn, errorReport: fn },
    presentation: { renderValidation: fn, renderEditor: fn, renderBackupReminder: fn },
    workspace: { markDirty: fn },
    status: { set: fn, mode: fn },
    clock: { now: fn, nowMs: fn },
    test: { shouldFailActivity: fn },
    logger: { warn: fn }
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

test("lazy project export validates synchronously and exposes the frozen ordered API without loading", async () => {
  const { createLazyProjectExportController } = await moduleAt(
    "src/features/import-export/lazy-project-export-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyProjectExportController(controllerOptions(), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), apiOrder);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(loadCount, 0);
  assert.throws(() => createLazyProjectExportController({}, { load() {} }), /ProjectExportController requires build/);
});

test("lazy project export shares one concurrent load and preserves options receivers arguments and results", async () => {
  const { createLazyProjectExportController } = await moduleAt(
    "src/features/import-export/lazy-project-export-controller.js"
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
  const controller = createLazyProjectExportController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.exportBrowserBackup("backup-options");
  const second = controller.exportProjectPackage("package-options");
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createProjectExportController(value) {
      receivedOptions = value;
      return installed;
    }
  });

  assert.deepEqual(await first, { method: "exportBrowserBackup", args: ["backup-options"] });
  assert.deepEqual(await second, { method: "exportProjectPackage", args: ["package-options"] });
  assert.equal(receivedOptions, options);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === installed, args]),
    [
      ["exportBrowserBackup", true, ["backup-options"]],
      ["exportProjectPackage", true, ["package-options"]]
    ]
  );
});

test("lazy project export redacts load failure preserves its cause and retries the next export", async () => {
  const { createLazyProjectExportController } = await moduleAt(
    "src/features/import-export/lazy-project-export-controller.js"
  );
  const expectedError = new Error("C:\\Users\\person\\private-project-export-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyProjectExportController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createProjectExportController: () => implementation() };
    }
  });

  await assert.rejects(controller.exportProjectPackage(), (error) => {
    assert.equal(error.message, "Project export implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.deepEqual(await controller.exportProjectPackage("retry"), {
    method: "exportProjectPackage",
    args: ["retry"]
  });
  assert.equal(loadCount, 2);
});

test("lazy project export rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyProjectExportController } = await moduleAt(
    "src/features/import-export/lazy-project-export-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyProjectExportController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createProjectExportController: () => (loadCount === 1 ? { exportProjectPackage() {} } : implementation())
      };
    }
  });

  await assert.rejects(controller.exportBrowserBackup(), /Project export implementation could not be loaded/);
  assert.deepEqual(await controller.exportBrowserBackup("repaired"), {
    method: "exportBrowserBackup",
    args: ["repaired"]
  });
  assert.equal(loadCount, 2);
});

test("lazy project export preserves implementation failure identity without reloading", async () => {
  const { createLazyProjectExportController } = await moduleAt(
    "src/features/import-export/lazy-project-export-controller.js"
  );
  const expectedError = new Error("project package build failed");
  let loadCount = 0;
  const installed = implementation();
  installed.exportProjectPackage = () => {
    throw expectedError;
  };
  const controller = createLazyProjectExportController(controllerOptions(), {
    load() {
      loadCount += 1;
      return { createProjectExportController: () => installed };
    }
  });

  await assert.rejects(controller.exportProjectPackage(), (error) => error === expectedError);
  assert.deepEqual(await controller.exportBrowserBackup(), { method: "exportBrowserBackup", args: [] });
  assert.equal(loadCount, 1);
});

test("lazy project export validates loader configuration", async () => {
  const { createLazyProjectExportController } = await moduleAt(
    "src/features/import-export/lazy-project-export-controller.js"
  );
  assert.throws(
    () => createLazyProjectExportController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
