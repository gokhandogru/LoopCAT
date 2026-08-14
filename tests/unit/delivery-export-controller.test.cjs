const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createDeliveryExportController, overrides = {}) {
  const calls = [];
  const project = {
    id: "project-1",
    name: "Project Name",
    sourceLang: "en",
    targetLang: "tr",
    docxStructures: { "docx-1": { id: "current-docx" } },
    docxStructure: { id: "fallback-docx" },
    localizationStructures: {
      "localization-1": { id: "localization-structure" },
      "xliff-document-1": { id: "xliff-structure" }
    }
  };
  const projectDocuments = [
    { id: "docx-1", name: "Source File.docx", type: "docx" },
    { id: "localization-1", name: "strings.yml", type: "yml" },
    { id: "xliff-document-1", name: "source.xlf", type: "xliff" }
  ];
  const segments = [
    { id: "segment-1", documentId: "docx-1", source: "One", target: " Bir " },
    { id: "segment-2", documentId: "docx-1", source: "Two", target: "Iki" },
    { id: "segment-3", documentId: "localization-1", source: "Three", target: "Uc" },
    { id: "segment-4", documentId: "xliff-document-1", source: "Four", target: "Dort" }
  ];
  const validationTerms = [{ sourceTerm: "One", targetTerm: "Bir" }];
  const qaChecks = overrides.qaChecks || [{ id: "qa-1" }];
  let selectedDocumentId = overrides.selectedDocumentId === undefined ? "docx-1" : overrides.selectedDocumentId;
  let currentProject = overrides.hasProject === false ? null : project;
  const validationReport = overrides.validationReport || {
    ok: true,
    canExport: true,
    preserved: [],
    warnings: overrides.validationNotes ? ["note"] : []
  };
  const planCounts = overrides.planCounts || {};
  const makePlan = (input) => ({
    segments: input.segments,
    policy: "source-fallback",
    emptyTargetCount: planCounts.emptyTargetCount || 0,
    sourceFallbackCount: planCounts.sourceFallbackCount || 0,
    preservedEmptyTargetCount: planCounts.preservedEmptyTargetCount || 0,
    draftTargetCount: planCounts.draftTargetCount || 0,
    requiresConfirmation: Boolean(overrides.requiresConfirmation)
  });
  let fallbackInput = null;
  let workerInput = null;

  const controller = createDeliveryExportController({
    session: {
      getProject() {
        calls.push(["getProject"]);
        return currentProject;
      },
      getSegments() {
        calls.push(["getSegments"]);
        return segments;
      },
      replaceQaChecks(value) {
        calls.push(["replaceQaChecks", value]);
      }
    },
    application: {
      getDocumentId() {
        calls.push(["getDocumentId"]);
        return selectedDocumentId;
      },
      clearQaFilter() {
        calls.push(["clearQaFilter"]);
      }
    },
    autosave: {
      flush() {
        calls.push(["flush"]);
        return overrides.flushFailure ? Promise.reject(overrides.flushFailure) : Promise.resolve();
      }
    },
    documents: {
      list() {
        calls.push(["listDocuments"]);
        return projectDocuments;
      },
      type(documentInfo) {
        calls.push(["documentType", documentInfo]);
        return String(documentInfo?.type || "").toLowerCase();
      }
    },
    terms: {
      listForValidation() {
        calls.push(["listTerms"]);
        return Promise.resolve(validationTerms);
      }
    },
    delivery: {
      plan(input) {
        calls.push(["plan", input]);
        return makePlan(input);
      },
      validate(input) {
        calls.push(["validate", input]);
        return validationReport;
      },
      reportCount(report) {
        calls.push(["reportCount", report]);
        return report?.warnings?.length || 0;
      },
      reportSummary(report) {
        calls.push(["reportSummary", report]);
        return "validation summary";
      }
    },
    localization: {
      source(text, values = {}) {
        calls.push(["source", text, values]);
        return text.replace("{value1}", String(values.value1 ?? ""));
      }
    },
    confirm(message) {
      calls.push(["confirm", message]);
      return overrides.confirmResult === undefined ? true : overrides.confirmResult;
    },
    displaySafeText(value) {
      calls.push(["displaySafeText", value]);
      return String(value || "").replace("secret", "[redacted]");
    },
    qa: {
      worker:
        overrides.worker === undefined
          ? {
              runQaChecks(input) {
                workerInput = input;
                calls.push(["worker.runQaChecks", input]);
                return Promise.resolve(qaChecks);
              }
            }
          : overrides.worker,
      run(...args) {
        fallbackInput = args;
        calls.push(["runQaChecks", ...args]);
        return qaChecks;
      },
      tagsForSegment(segment) {
        calls.push(["tagsForSegment", segment]);
        return [`tag:${segment.id}`];
      },
      missingTags(segment) {
        return [`missing:${segment.id}`];
      }
    },
    formats: {
      localizationTypes: new Set(["yml", "xliff"]),
      xliffDocumentTypes: new Set(["xliff"]),
      buildTargetDocx(value, valueSegments) {
        calls.push(["buildTargetDocx", value, valueSegments]);
        return Promise.resolve("target-docx-bytes");
      },
      buildBilingualDocx(value, valueSegments, options) {
        calls.push(["buildBilingualDocx", value, valueSegments, options]);
        return "bilingual-docx-bytes";
      },
      buildTargetXliff(value, valueSegments, structure) {
        calls.push(["buildTargetXliff", value, valueSegments, structure]);
        return "target-xliff";
      },
      buildLocalizationFile(type, valueSegments, structure) {
        calls.push(["buildLocalizationFile", type, valueSegments, structure]);
        return Promise.resolve("localization-content");
      },
      buildXliff12(value, valueSegments) {
        calls.push(["buildXliff12", value, valueSegments]);
        return "xliff-12";
      },
      buildXliff22(value, valueSegments) {
        calls.push(["buildXliff22", value, valueSegments]);
        return "xliff-22";
      },
      localizationMimeType(extension, structure) {
        calls.push(["localizationMimeType", extension, structure]);
        return `text/${extension}`;
      },
      xliffMimeType(version) {
        calls.push(["xliffMimeType", version]);
        return `application/xliff+xml;version=${version}`;
      }
    },
    fileSafeName(value) {
      calls.push(["fileSafeName", value]);
      return String(value || "")
        .replaceAll(" ", "-")
        .toLowerCase();
    },
    download(...args) {
      calls.push(["download", ...args]);
      if (overrides.downloadFailure) throw overrides.downloadFailure;
    },
    presentation: {
      renderValidationReport(report) {
        calls.push(["renderValidationReport", report]);
      },
      renderQaResults() {
        calls.push(["renderQaResults"]);
      }
    },
    activity: {
      logOptionalProject(...args) {
        calls.push(["logOptionalProject", ...args]);
        return Promise.resolve(overrides.activityLogged === undefined ? true : overrides.activityLogged);
      }
    },
    status: {
      appendActivityWarning(message, logged) {
        calls.push(["appendActivityWarning", message, logged]);
        return logged ? message : `${message}; activity log failed`;
      },
      exportMode(mode, logged) {
        calls.push(["exportMode", mode, logged]);
        return logged ? mode : "dirty";
      },
      set(...args) {
        calls.push(["set", ...args]);
      }
    }
  });

  return {
    calls,
    controller,
    getFallbackInput: () => fallbackInput,
    getWorkerInput: () => workerInput,
    project,
    projectDocuments,
    qaChecks,
    segments,
    validationReport,
    validationTerms,
    setProject(value) {
      currentProject = value;
    },
    setSelectedDocumentId(value) {
      selectedDocumentId = value;
    }
  };
}

const names = (calls) => calls.map(([name]) => name);
const firstCall = (calls, name) => calls.find(([callName]) => callName === name);

test("DeliveryExportController preserves scoped Target TXT planning, confirmation, filename, activity, and warning status", async () => {
  const { createDeliveryExportController } = await moduleAt("src/features/import-export/delivery-export-controller.js");
  const harness = createHarness(createDeliveryExportController, {
    requiresConfirmation: true,
    planCounts: { emptyTargetCount: 1, sourceFallbackCount: 1 },
    activityLogged: false
  });
  await harness.controller.exportTargetText();
  assert.equal(harness.calls[1][0], "flush");
  const planInput = firstCall(harness.calls, "plan")[1];
  assert.equal(planInput.format, "txt");
  assert.equal(planInput.documentInfo, harness.projectDocuments[0]);
  assert.deepEqual(
    planInput.segments.map((segment) => segment.id),
    ["segment-1", "segment-2"]
  );
  assert.deepEqual(firstCall(harness.calls, "download").slice(1), [
    "project-name_source-file.docx_tr.txt",
    "Bir\n\nIki",
    "text/plain"
  ]);
  assert.deepEqual(firstCall(harness.calls, "logOptionalProject").slice(1), [
    "export",
    "Target TXT exported",
    {
      documentId: "docx-1",
      fileName: "Source File.docx",
      segmentCount: 2,
      emptyTargetPolicy: "source-fallback",
      emptyTargetCount: 1,
      sourceFallbackCount: 1,
      preservedEmptyTargetCount: 0,
      draftTargetCount: 0
    },
    "Target TXT export"
  ]);
  assert(names(harness.calls).indexOf("download") < names(harness.calls).indexOf("logOptionalProject"));
  assert.match(firstCall(harness.calls, "confirm")[1], /Source File\.docx[\s\S]*1 empty target segment/);
  assert.deepEqual(harness.calls.at(-1), [
    "set",
    "Target TXT exported with 1 source fallback; activity log failed",
    "dirty"
  ]);
});

test("DeliveryExportController preserves selected DOCX structure, async builder, exact download, and type rejection", async () => {
  const { createDeliveryExportController } = await moduleAt("src/features/import-export/delivery-export-controller.js");
  const harness = createHarness(createDeliveryExportController);
  await harness.controller.exportTargetDocx();
  const builder = firstCall(harness.calls, "buildTargetDocx");
  assert.equal(builder[1].docxStructure.id, "current-docx");
  assert.deepEqual(
    builder[2].map((segment) => segment.id),
    ["segment-1", "segment-2"]
  );
  assert.deepEqual(firstCall(harness.calls, "download").slice(1), [
    "project-name_source-file.docx_tr.docx",
    "target-docx-bytes",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);
  assert.deepEqual(harness.calls.at(-1), ["set", "DOCX exported", "saved"]);

  const mismatch = createHarness(createDeliveryExportController, { selectedDocumentId: "localization-1" });
  await mismatch.controller.exportTargetDocx();
  assert.deepEqual(mismatch.calls.at(-1), ["set", "The selected file is not a DOCX document.", "dirty"]);
  assert.equal(names(mismatch.calls).includes("plan"), false);
  assert.equal(names(mismatch.calls).includes("download"), false);
});

test("DeliveryExportController preserves project-wide bilingual validation, worker/fallback QA, session refresh, and notes", async () => {
  const { createDeliveryExportController } = await moduleAt("src/features/import-export/delivery-export-controller.js");
  const workerHarness = createHarness(createDeliveryExportController, { validationNotes: true });
  await workerHarness.controller.exportBilingualDocx();
  assert.deepEqual(
    workerHarness.getWorkerInput().segments.map((segment) => segment.tags),
    [["tag:segment-1"], ["tag:segment-2"], ["tag:segment-3"], ["tag:segment-4"]]
  );
  assert.equal(typeof workerHarness.getWorkerInput().fallback, "function");
  assert.deepEqual(firstCall(workerHarness.calls, "buildBilingualDocx").slice(1), [
    workerHarness.project,
    workerHarness.segments,
    { qaChecks: workerHarness.qaChecks }
  ]);
  assert.deepEqual(firstCall(workerHarness.calls, "download").slice(1), [
    "project-name_bilingual.docx",
    "bilingual-docx-bytes",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);
  assert.deepEqual(workerHarness.calls.at(-1), ["set", "Bilingual DOCX exported with notes", "dirty"]);

  const fallbackHarness = createHarness(createDeliveryExportController, { worker: null, qaChecks: [] });
  await fallbackHarness.controller.exportBilingualDocx();
  assert.equal(fallbackHarness.getFallbackInput()[0], fallbackHarness.segments);
  assert.equal(fallbackHarness.getFallbackInput()[1], fallbackHarness.validationTerms);
  assert.equal(typeof fallbackHarness.getFallbackInput()[2].missingTags, "function");
  assert.deepEqual(fallbackHarness.calls.at(-1), ["set", "Bilingual DOCX exported", "saved"]);
});

test("DeliveryExportController preserves Other formats normalization, structures, builders, extensions, and MIME types", async () => {
  const { createDeliveryExportController } = await moduleAt("src/features/import-export/delivery-export-controller.js");
  const localization = createHarness(createDeliveryExportController, { selectedDocumentId: "localization-1" });
  await localization.controller.exportLocalization();
  assert.deepEqual(firstCall(localization.calls, "buildLocalizationFile").slice(1), [
    "yml",
    [localization.segments[2]],
    { id: "localization-structure" }
  ]);
  assert.deepEqual(firstCall(localization.calls, "localizationMimeType").slice(1), [
    "yaml",
    { id: "localization-structure" }
  ]);
  assert.deepEqual(firstCall(localization.calls, "download").slice(1), [
    "strings.yml_tr.yaml",
    "localization-content",
    "text/yaml"
  ]);

  const xliffDocument = createHarness(createDeliveryExportController, { selectedDocumentId: "xliff-document-1" });
  await xliffDocument.controller.exportLocalization();
  assert.deepEqual(firstCall(xliffDocument.calls, "buildTargetXliff").slice(1), [
    xliffDocument.project,
    [xliffDocument.segments[3]],
    { id: "xliff-structure" }
  ]);
  assert.equal(names(xliffDocument.calls).includes("buildLocalizationFile"), false);
  assert.deepEqual(firstCall(xliffDocument.calls, "download").slice(1), [
    "source.xlf_tr.xliff",
    "target-xliff",
    "text/xliff"
  ]);
});

test("DeliveryExportController preserves scoped XLIFF 1.2 and 2.2 projects, builders, versions, downloads, and activity", async () => {
  const { createDeliveryExportController } = await moduleAt("src/features/import-export/delivery-export-controller.js");
  const xliff12 = createHarness(createDeliveryExportController);
  await xliff12.controller.exportXliff12();
  const input12 = firstCall(xliff12.calls, "buildXliff12");
  assert.equal(input12[1].sourceFileName, "Source File.docx");
  assert.deepEqual(
    input12[2].map((segment) => segment.id),
    ["segment-1", "segment-2"]
  );
  assert.deepEqual(firstCall(xliff12.calls, "download").slice(1), [
    "project-name_source-file.docx_en-tr.xlf",
    "xliff-12",
    "application/xliff+xml;version=1.2"
  ]);
  assert.equal(firstCall(xliff12.calls, "logOptionalProject")[2], "XLIFF exported");

  const xliff22 = createHarness(createDeliveryExportController, { selectedDocumentId: "" });
  await xliff22.controller.exportXliff22();
  const input22 = firstCall(xliff22.calls, "buildXliff22");
  assert.equal(input22[1], xliff22.project);
  assert.equal(input22[2], xliff22.segments);
  assert.deepEqual(firstCall(xliff22.calls, "download").slice(1), [
    "project-name_en-tr.xlf",
    "xliff-22",
    "application/xliff+xml;version=2.2"
  ]);
  assert.deepEqual(firstCall(xliff22.calls, "logOptionalProject").slice(1, 3), ["export", "XLIFF 2.2 exported"]);
});

test("DeliveryExportController preserves no-project, blocked, canceled, immutable, and primary-failure behavior", async () => {
  const { createDeliveryExportController } = await moduleAt("src/features/import-export/delivery-export-controller.js");
  const noProject = createHarness(createDeliveryExportController, { hasProject: false });
  await noProject.controller.exportTargetText();
  await noProject.controller.exportTargetDocx();
  await noProject.controller.exportBilingualDocx();
  await noProject.controller.exportLocalization();
  await noProject.controller.exportXliff12();
  await noProject.controller.exportXliff22();
  assert.deepEqual(names(noProject.calls), Array(6).fill("getProject"));

  const blocked = createHarness(createDeliveryExportController);
  assert.equal(blocked.controller.canRun({ ok: true, canExport: false }), false);
  assert.deepEqual(blocked.calls.at(-1), ["set", "Export blocked: review the validation report.", "dirty"]);
  assert.equal(blocked.controller.canRun({ ok: false }), false);
  assert.deepEqual(blocked.calls.at(-1), ["set", "validation summary", "dirty"]);

  const canceled = createHarness(createDeliveryExportController, {
    requiresConfirmation: true,
    confirmResult: false
  });
  await canceled.controller.exportTargetText();
  assert.equal(names(canceled.calls).includes("download"), false);
  assert.equal(names(canceled.calls).includes("logOptionalProject"), false);
  assert.deepEqual(canceled.calls.at(-1), ["set", "Export cancelled; no file was created.", "dirty"]);

  const failure = createHarness(createDeliveryExportController, { flushFailure: new Error("flush failed") });
  await failure.controller.exportXliff22();
  assert.deepEqual(failure.calls.at(-1), ["set", "flush failed", "dirty"]);
  assert.equal(names(failure.calls).includes("plan"), false);
  assert.equal(Object.isFrozen(failure.controller), true);
  assert.throws(() => createDeliveryExportController(), /requires session, application, autosave, document/);
});
