const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const apiOrder = [
  "canRun",
  "exportBilingualDocx",
  "exportLocalization",
  "exportTargetDocx",
  "exportTargetText",
  "exportXliff12",
  "exportXliff22"
];

function controllerOptions(calls = []) {
  const fn = () => {};
  return {
    session: { getProject: fn, getSegments: fn, replaceQaChecks: fn },
    application: { getDocumentId: fn, clearQaFilter: fn },
    autosave: { flush: fn },
    documents: { list: fn, type: fn },
    terms: { listForValidation: fn },
    delivery: {
      plan: fn,
      validate: fn,
      reportCount: fn,
      reportSummary(report) {
        calls.push(["reportSummary", report]);
        return "validation summary";
      }
    },
    localization: { source: fn },
    confirm: fn,
    displaySafeText: fn,
    qa: { run: fn, tagsForSegment: fn, missingTags: fn },
    formats: {
      localizationTypes: new Set(),
      xliffDocumentTypes: new Set(),
      buildTargetDocx: fn,
      buildBilingualDocx: fn,
      buildTargetXliff: fn,
      buildLocalizationFile: fn,
      buildXliff12: fn,
      buildXliff22: fn,
      localizationMimeType: fn,
      xliffMimeType: fn
    },
    fileSafeName: fn,
    download: fn,
    presentation: { renderValidationReport: fn, renderQaResults: fn },
    activity: { logOptionalProject: fn },
    status: {
      appendActivityWarning: fn,
      exportMode: fn,
      set(...args) {
        calls.push(["status", ...args]);
      }
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

test("lazy delivery export validates synchronously preserves canRun and exposes the frozen ordered API without loading", async () => {
  const { createLazyDeliveryExportController } = await moduleAt(
    "src/features/import-export/lazy-delivery-export-controller.js"
  );
  const calls = [];
  let loadCount = 0;
  const controller = createLazyDeliveryExportController(controllerOptions(calls), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), apiOrder);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(controller.canRun({ ok: true, canExport: true }), true);
  assert.equal(controller.canRun({ ok: true, canExport: false }), false);
  assert.equal(controller.canRun({ ok: false }), false);
  assert.deepEqual(calls, [
    ["status", "Export blocked: review the validation report.", "dirty"],
    ["reportSummary", { ok: false }],
    ["status", "validation summary", "dirty"]
  ]);
  assert.equal(loadCount, 0);
  assert.throws(
    () => createLazyDeliveryExportController({}, { load() {} }),
    /DeliveryExportController requires session/
  );
});

test("lazy delivery export shares one concurrent load and preserves options receivers arguments and results", async () => {
  const { createLazyDeliveryExportController } = await moduleAt(
    "src/features/import-export/lazy-delivery-export-controller.js"
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
  const controller = createLazyDeliveryExportController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.exportTargetText("text-options");
  const second = controller.exportXliff22("xliff-options");
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createDeliveryExportController(value) {
      receivedOptions = value;
      return installed;
    }
  });

  assert.deepEqual(await first, { method: "exportTargetText", args: ["text-options"] });
  assert.deepEqual(await second, { method: "exportXliff22", args: ["xliff-options"] });
  assert.equal(receivedOptions, options);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === installed, args]),
    [
      ["exportTargetText", true, ["text-options"]],
      ["exportXliff22", true, ["xliff-options"]]
    ]
  );
});

test("lazy delivery export redacts load failure preserves its cause and retries the next export", async () => {
  const { createLazyDeliveryExportController } = await moduleAt(
    "src/features/import-export/lazy-delivery-export-controller.js"
  );
  const expectedError = new Error("C:\\Users\\person\\private-export-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyDeliveryExportController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createDeliveryExportController: () => implementation() };
    }
  });

  await assert.rejects(controller.exportLocalization(), (error) => {
    assert.equal(error.message, "Delivery export implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.deepEqual(await controller.exportLocalization("retry"), {
    method: "exportLocalization",
    args: ["retry"]
  });
  assert.equal(loadCount, 2);
});

test("lazy delivery export rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyDeliveryExportController } = await moduleAt(
    "src/features/import-export/lazy-delivery-export-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyDeliveryExportController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createDeliveryExportController: () => (loadCount === 1 ? { exportTargetText() {} } : implementation())
      };
    }
  });

  await assert.rejects(controller.exportTargetText(), /Delivery export implementation could not be loaded/);
  assert.deepEqual(await controller.exportTargetText("repaired"), {
    method: "exportTargetText",
    args: ["repaired"]
  });
  assert.equal(loadCount, 2);
});

test("lazy delivery export validates loader configuration", async () => {
  const { createLazyDeliveryExportController } = await moduleAt(
    "src/features/import-export/lazy-delivery-export-controller.js"
  );
  assert.throws(
    () => createLazyDeliveryExportController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
