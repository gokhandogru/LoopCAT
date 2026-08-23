const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const apiOrder = [
  "confirmDuplicate",
  "hasDocumentNamed",
  "importDocx",
  "importFile",
  "importLocalization",
  "importXliff"
];

function controllerOptions(calls = []) {
  const fn = () => {};
  return {
    session: {
      getProject: fn,
      getProjects: fn,
      getSegments: fn,
      replaceProject: fn,
      replaceProjects: fn,
      replaceSegments: fn
    },
    catalog: {
      list() {
        calls.push(["list"]);
        return [{ name: "Existing.HTML" }];
      },
      manifest: fn
    },
    files: { assertSize: fn, maxBytes: 1024 },
    formats: {
      extractDocx: fn,
      parseLocalization: fn,
      parseXliff: fn,
      decodingOptions: fn,
      isXliffType: fn
    },
    repository: { append: fn, getProjectSegments: fn },
    histories: { prepare: fn },
    progress: { report: fn },
    ids: { next: fn },
    summaries: { refresh: fn },
    navigation: { selectDocument: fn },
    activity: { log: fn, appendWarning: fn },
    workspace: { markDirty: fn },
    status: { set: fn, mode: fn },
    presentation: { renderAll: fn, refreshEditorContext: fn },
    text: {
      lower(value) {
        calls.push(["lower", value]);
        return String(value).toLowerCase();
      },
      safe(value) {
        calls.push(["safe", value]);
        return `safe:${value}`;
      }
    },
    confirm(message) {
      calls.push(["confirm", message]);
      return false;
    }
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

test("lazy project-document import validates synchronously preserves duplicate policy and exposes the frozen ordered API without loading", async () => {
  const { createLazyProjectDocumentImportController } = await moduleAt(
    "src/features/import-export/lazy-project-document-import-controller.js"
  );
  const calls = [];
  let loadCount = 0;
  const controller = createLazyProjectDocumentImportController(controllerOptions(calls), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), apiOrder);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(controller.hasDocumentNamed("  EXISTING.html "), true);
  assert.equal(controller.hasDocumentNamed(""), false);
  assert.equal(controller.confirmDuplicate({ name: "new.html" }), true);
  assert.equal(controller.confirmDuplicate({ name: "Existing.HTML" }), false);
  assert.deepEqual(calls.at(-2), ["safe", "Existing.HTML"]);
  assert.deepEqual(calls.at(-1), [
    "confirm",
    'A file named "safe:Existing.HTML" already exists in this project. Import it again anyway?'
  ]);
  assert.equal(loadCount, 0);
  assert.throws(
    () => createLazyProjectDocumentImportController({}, { load() {} }),
    /ProjectDocumentImportController requires checked session/
  );
});

test("lazy project-document import shares one concurrent load and preserves options receivers arguments and results", async () => {
  const { createLazyProjectDocumentImportController } = await moduleAt(
    "src/features/import-export/lazy-project-document-import-controller.js"
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
  const controller = createLazyProjectDocumentImportController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.importDocx("docx-file");
  const second = controller.importXliff("xliff-file", { encoding: "utf-8" });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createProjectDocumentImportController(value) {
      receivedOptions = value;
      return installed;
    }
  });

  assert.deepEqual(await first, { method: "importDocx", args: ["docx-file"] });
  assert.deepEqual(await second, {
    method: "importXliff",
    args: ["xliff-file", { encoding: "utf-8" }]
  });
  assert.equal(receivedOptions, options);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === installed, args]),
    [
      ["importDocx", true, ["docx-file"]],
      ["importXliff", true, ["xliff-file", { encoding: "utf-8" }]]
    ]
  );
});

test("lazy project-document import redacts load failure preserves its cause and retries the next import", async () => {
  const { createLazyProjectDocumentImportController } = await moduleAt(
    "src/features/import-export/lazy-project-document-import-controller.js"
  );
  const expectedError = new Error("C:\\Users\\person\\private-document-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyProjectDocumentImportController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createProjectDocumentImportController: () => implementation() };
    }
  });

  await assert.rejects(controller.importLocalization(), (error) => {
    assert.equal(error.message, "Project-document import implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.deepEqual(await controller.importLocalization("retry"), {
    method: "importLocalization",
    args: ["retry"]
  });
  assert.equal(loadCount, 2);
});

test("lazy project-document import rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyProjectDocumentImportController } = await moduleAt(
    "src/features/import-export/lazy-project-document-import-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyProjectDocumentImportController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createProjectDocumentImportController: () => (loadCount === 1 ? { importFile() {} } : implementation())
      };
    }
  });

  await assert.rejects(controller.importFile(), /Project-document import implementation could not be loaded/);
  assert.deepEqual(await controller.importFile("repaired"), {
    method: "importFile",
    args: ["repaired"]
  });
  assert.equal(loadCount, 2);
});

test("lazy project-document import preserves implementation failure identity without reloading", async () => {
  const { createLazyProjectDocumentImportController } = await moduleAt(
    "src/features/import-export/lazy-project-document-import-controller.js"
  );
  const expectedError = new Error("document parser failed");
  let loadCount = 0;
  const installed = implementation();
  installed.importFile = () => {
    throw expectedError;
  };
  const controller = createLazyProjectDocumentImportController(controllerOptions(), {
    load() {
      loadCount += 1;
      return { createProjectDocumentImportController: () => installed };
    }
  });

  await assert.rejects(controller.importFile(), (error) => error === expectedError);
  assert.deepEqual(await controller.importDocx(), { method: "importDocx", args: [] });
  assert.equal(loadCount, 1);
});

test("lazy project-document import validates loader configuration", async () => {
  const { createLazyProjectDocumentImportController } = await moduleAt(
    "src/features/import-export/lazy-project-document-import-controller.js"
  );
  assert.throws(
    () => createLazyProjectDocumentImportController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
