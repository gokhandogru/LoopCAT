const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const apiOrder = ["importProjectPackage", "importProjectPackageData", "restoreBackupData", "restoreBackupFile"];

function controllerOptions() {
  const fn = () => {};
  return {
    files: { progress: fn, parseJson: fn },
    portability: { validate: fn, prepare: fn },
    backup: { validate: fn },
    session: { getProjects: fn, replaceProject: fn, replaceSegments: fn },
    autosave: { flush: fn },
    persistence: { importProjectPackageRecords: fn, importAllData: fn },
    indexes: { rebuildTm: fn, rebuildTerms: fn },
    activity: { logForProject: fn, appendWarning: fn },
    navigation: { openProjects: fn, clearSelection: fn },
    projects: { load: fn, open: fn },
    workspace: {
      isConnected: fn,
      clearDirty: fn,
      markDirty: fn,
      clearDirtyMarkers: fn,
      markProjectsDirty: fn
    },
    validation: { count: fn, alertText: fn },
    presentation: { renderValidation: fn, renderWorkspaceStatus: fn },
    status: { set: fn, mode: fn },
    localization: { alert: fn, confirm: fn },
    text: { safe: fn }
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

test("lazy project import and restore validates synchronously and exposes the frozen ordered API without loading", async () => {
  const { createLazyProjectImportRestoreController } = await moduleAt(
    "src/features/import-export/lazy-project-import-restore-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyProjectImportRestoreController(controllerOptions(), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), apiOrder);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(loadCount, 0);
  assert.throws(
    () => createLazyProjectImportRestoreController({}, { load() {} }),
    /ProjectImportRestoreController requires file/
  );
});

test("lazy project import and restore shares one concurrent load and preserves options receivers arguments and results", async () => {
  const { createLazyProjectImportRestoreController } = await moduleAt(
    "src/features/import-export/lazy-project-import-restore-controller.js"
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
  const controller = createLazyProjectImportRestoreController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.importProjectPackageData("package", { open: false });
  const second = controller.restoreBackupFile("backup-file");
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createProjectImportRestoreController(value) {
      receivedOptions = value;
      return installed;
    }
  });

  assert.deepEqual(await first, {
    method: "importProjectPackageData",
    args: ["package", { open: false }]
  });
  assert.deepEqual(await second, { method: "restoreBackupFile", args: ["backup-file"] });
  assert.equal(receivedOptions, options);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === installed, args]),
    [
      ["importProjectPackageData", true, ["package", { open: false }]],
      ["restoreBackupFile", true, ["backup-file"]]
    ]
  );
});

test("lazy project import and restore redacts load failure preserves its cause and retries the next action", async () => {
  const { createLazyProjectImportRestoreController } = await moduleAt(
    "src/features/import-export/lazy-project-import-restore-controller.js"
  );
  const expectedError = new Error("C:\\Users\\person\\private-restore-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyProjectImportRestoreController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createProjectImportRestoreController: () => implementation() };
    }
  });

  await assert.rejects(controller.restoreBackupData(), (error) => {
    assert.equal(error.message, "Project import and restore implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.deepEqual(await controller.restoreBackupData("retry"), {
    method: "restoreBackupData",
    args: ["retry"]
  });
  assert.equal(loadCount, 2);
});

test("lazy project import and restore rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyProjectImportRestoreController } = await moduleAt(
    "src/features/import-export/lazy-project-import-restore-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyProjectImportRestoreController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createProjectImportRestoreController: () => (loadCount === 1 ? { importProjectPackage() {} } : implementation())
      };
    }
  });

  await assert.rejects(
    controller.importProjectPackage(),
    /Project import and restore implementation could not be loaded/
  );
  assert.deepEqual(await controller.importProjectPackage("repaired"), {
    method: "importProjectPackage",
    args: ["repaired"]
  });
  assert.equal(loadCount, 2);
});

test("lazy project import and restore preserves implementation failure identity without reloading", async () => {
  const { createLazyProjectImportRestoreController } = await moduleAt(
    "src/features/import-export/lazy-project-import-restore-controller.js"
  );
  const expectedError = new Error("package validation failed");
  let loadCount = 0;
  const installed = implementation();
  installed.importProjectPackageData = () => {
    throw expectedError;
  };
  const controller = createLazyProjectImportRestoreController(controllerOptions(), {
    load() {
      loadCount += 1;
      return { createProjectImportRestoreController: () => installed };
    }
  });

  await assert.rejects(controller.importProjectPackageData(), (error) => error === expectedError);
  assert.deepEqual(await controller.restoreBackupFile(), { method: "restoreBackupFile", args: [] });
  assert.equal(loadCount, 1);
});

test("lazy project import and restore validates loader configuration", async () => {
  const { createLazyProjectImportRestoreController } = await moduleAt(
    "src/features/import-export/lazy-project-import-restore-controller.js"
  );
  assert.throws(
    () => createLazyProjectImportRestoreController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
