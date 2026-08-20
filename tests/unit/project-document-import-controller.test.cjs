const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(
    pathToFileURL(path.join(rootPath, "src/features/import-export/project-document-import-controller.js")).href
  );
}

function createHarness(createProjectDocumentImportController, overrides = {}) {
  const calls = [];
  const file = overrides.file || { name: "incoming.html", size: 42 };
  const originalLocalizationStructures = { old: { kind: "json" } };
  let project =
    overrides.project === undefined
      ? {
          id: "project-1",
          documents: [{ id: "old", name: "Existing.HTML", type: "html" }],
          docxStructures: { old: { kind: "docx" } },
          localizationStructures: originalLocalizationStructures
        }
      : overrides.project;
  let projects = overrides.projects || [project, { id: "project-2", name: "Other" }].filter(Boolean);
  let segments = overrides.segments || [
    { id: "old-segment", documentId: "old" },
    { id: "imported-segment", documentId: "doc-uuid-1" }
  ];
  const results = {
    docx: overrides.docxResult || {
      fileName: "incoming.docx",
      segments: [{ source: "One" }, { source: "Two" }],
      structure: { textPartSummary: [{ segments: 1 }, { segments: 0 }, { segments: 2 }] }
    },
    localization:
      overrides.localizationResult === undefined
        ? {
            fileName: "incoming.html",
            documentType: "html",
            segments: [{ source: "One" }, { source: "Two" }],
            structure: { kind: "html" }
          }
        : overrides.localizationResult,
    xliff: overrides.xliffResult || {
      fileName: "incoming.xlf",
      documentType: "xlf",
      segments: [{ source: "One" }],
      structure: { kind: "xliff" }
    }
  };

  const options = {
    session: {
      getProject() {
        calls.push(["getProject"]);
        return project;
      },
      getProjects() {
        calls.push(["getProjects"]);
        return projects;
      },
      getSegments() {
        calls.push(["getSegments"]);
        return segments;
      },
      replaceProject(value) {
        calls.push(["replaceProject", value]);
        project = value;
      },
      replaceProjects(value) {
        calls.push(["replaceProjects", value]);
        projects = value;
      },
      replaceSegments(value) {
        calls.push(["replaceSegments", value]);
        segments = value;
      }
    },
    catalog: {
      list() {
        calls.push(["catalogList"]);
        return overrides.catalog || project?.documents || [];
      },
      manifest(value) {
        calls.push(["manifest", value]);
        return value?.documents || [];
      }
    },
    files: {
      assertSize(value, label, maxBytes) {
        calls.push(["assertSize", value, label, maxBytes]);
        if (overrides.sizeError) throw overrides.sizeError;
      },
      maxBytes: 100
    },
    formats: {
      extractDocx(value) {
        calls.push(["extractDocx", value]);
        if (overrides.parserError === "docx") return Promise.reject(overrides.parserFailure);
        return Promise.resolve(results.docx);
      },
      parseLocalization(value, decodingOptions) {
        calls.push(["parseLocalization", value, decodingOptions]);
        if (overrides.parserError === "localization") return Promise.reject(overrides.parserFailure);
        return Promise.resolve(results.localization);
      },
      parseXliff(value, decodingOptions) {
        calls.push(["parseXliff", value, decodingOptions]);
        if (overrides.parserError === "xliff") return Promise.reject(overrides.parserFailure);
        return Promise.resolve(results.xliff);
      },
      decodingOptions() {
        calls.push(["decodingOptions"]);
        return { encoding: "windows-1254" };
      },
      isXliffType(extension) {
        calls.push(["isXliffType", extension]);
        return ["xlf", "xliff", "sdlxliff"].includes(extension);
      }
    },
    repository: {
      append(nextProject, nextSegments, appendOptions) {
        calls.push(["append", nextProject, nextSegments, appendOptions]);
        if (overrides.appendError) return Promise.reject(overrides.appendError);
        return Promise.resolve({ project: { ...nextProject, saved: true } });
      },
      getProjectSegments(projectId) {
        calls.push(["getProjectSegments", projectId]);
        return Promise.resolve(overrides.storedSegments || segments);
      }
    },
    histories: {
      prepare(value) {
        calls.push(["prepare", value]);
        return value.map((segment) => ({ ...segment, historyPrepared: true }));
      }
    },
    progress: {
      report(phase, value, detail) {
        calls.push(["progress", phase, value, detail]);
        if (overrides.progressErrorPhase === phase) return Promise.reject(overrides.progressError);
        return Promise.resolve();
      }
    },
    ids: {
      next() {
        calls.push(["nextId"]);
        return "uuid-1";
      }
    },
    summaries: {
      refresh() {
        calls.push(["refreshSummaries"]);
        if (overrides.summaryError) return Promise.reject(overrides.summaryError);
        return Promise.resolve();
      }
    },
    navigation: {
      selectDocument(selection) {
        calls.push(["selectDocument", selection]);
      }
    },
    activity: {
      log(type, summary, detail, label) {
        calls.push(["activity", type, summary, detail, label]);
        if (overrides.activityError) return Promise.reject(overrides.activityError);
        return Promise.resolve(overrides.activityLogged !== false);
      },
      appendWarning(message, activityLogged) {
        calls.push(["appendWarning", message, activityLogged]);
        return activityLogged ? message : `${message}; activity warning`;
      }
    },
    workspace: {
      markDirty() {
        calls.push(["markDirty"]);
      }
    },
    status: {
      set(message, mode) {
        calls.push(["status", message, mode]);
      },
      mode(mode, activityLogged) {
        calls.push(["statusMode", mode, activityLogged]);
        return activityLogged ? mode : "dirty";
      }
    },
    presentation: {
      renderAll() {
        calls.push(["renderAll"]);
      },
      refreshEditorContext() {
        calls.push(["refreshEditorContext"]);
        if (overrides.contextError) return Promise.reject(overrides.contextError);
        return Promise.resolve();
      }
    },
    text: {
      lower(value) {
        calls.push(["lower", value]);
        return value.toLocaleLowerCase("en-US");
      },
      safe(value) {
        calls.push(["safe", value]);
        return `safe:${String(value)}`;
      }
    },
    confirm(message) {
      calls.push(["confirm", message]);
      return overrides.confirmResult !== false;
    }
  };

  return {
    calls,
    controller: createProjectDocumentImportController(options),
    file,
    options,
    originalLocalizationStructures,
    read: () => ({ project, projects, segments })
  };
}

test("ProjectDocumentImportController preserves project/file guards and duplicate confirmation", async () => {
  const { createProjectDocumentImportController } = await loadFactory();
  const missingProject = createHarness(createProjectDocumentImportController, { project: null, projects: [] });
  assert.equal(await missingProject.controller.importFile(missingProject.file), undefined);
  assert.deepEqual(missingProject.calls, [["getProject"]]);

  const missingFile = createHarness(createProjectDocumentImportController);
  assert.equal(await missingFile.controller.importFile(null), undefined);
  assert.deepEqual(missingFile.calls, [["getProject"]]);

  const harness = createHarness(createProjectDocumentImportController, { confirmResult: false });
  assert.equal(harness.controller.hasDocumentNamed("  existing.html "), true);
  assert.equal(harness.controller.hasDocumentNamed(""), false);
  assert.equal(harness.controller.confirmDuplicate({ name: "Existing.HTML" }), false);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "confirm"),
    ["confirm", 'A file named "safe:Existing.HTML" already exists in this project. Import it again anyway?']
  );

  const canceledFile = { name: "Existing.HTML", size: 20 };
  assert.equal(await harness.controller.importFile(canceledFile), false);
  assert.deepEqual(harness.calls.at(-1), ["status", "Import canceled", "saved"]);
  assert.equal(harness.calls.filter(([name]) => name === "assertSize").length, 1);
  assert.equal(
    harness.calls.some(([name]) => name.startsWith("parse") || name === "extractDocx"),
    false
  );
});

test("ProjectDocumentImportController routes DOCX, XLIFF, and localization files after the shared check", async () => {
  const { createProjectDocumentImportController } = await loadFactory();
  for (const [fileName, parser, xliffExtension] of [
    ["route.DOCX", "extractDocx", null],
    ["route.SDLXLIFF", "parseXliff", "sdlxliff"],
    ["route.JSON", "parseLocalization", "json"]
  ]) {
    const harness = createHarness(createProjectDocumentImportController, {
      file: { name: fileName, size: 10 },
      catalog: []
    });
    assert.equal(await harness.controller.importFile(harness.file), undefined);
    assert.equal(harness.calls.filter(([name]) => name === "assertSize").length, 2);
    assert.equal(harness.calls.filter(([name]) => name === parser).length, 1);
    assert.equal(
      harness.calls.filter(([name]) => ["extractDocx", "parseXliff", "parseLocalization"].includes(name)).length,
      1
    );
    const xliffCall = harness.calls.find(([name]) => name === "isXliffType");
    if (xliffExtension) assert.deepEqual(xliffCall, ["isXliffType", xliffExtension]);
    else assert.equal(xliffCall, undefined);
  }
});

test("ProjectDocumentImportController preserves DOCX metadata and the complete success sequence", async () => {
  const { createProjectDocumentImportController } = await loadFactory();
  const harness = createHarness(createProjectDocumentImportController);
  await harness.controller.importDocx(harness.file);

  const append = harness.calls.find(([name]) => name === "append");
  assert.deepEqual(append[1].documents, [
    { id: "old", name: "Existing.HTML", type: "html" },
    { id: "doc-uuid-1", name: "incoming.docx", type: "docx" }
  ]);
  assert.equal(append[1].sourceFileName, "incoming.docx");
  assert.strictEqual(append[1].docxStructure, append[1].docxStructures["doc-uuid-1"]);
  assert.deepEqual(append[3], {
    documentId: "doc-uuid-1",
    documentName: "incoming.docx",
    documentType: "docx"
  });
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "progress"),
    [
      ["progress", "Reading DOCX package", harness.file, undefined],
      ["progress", "Saving imported segments", harness.file, "2 segments"],
      ["progress", "Refreshing project view", harness.file, undefined]
    ]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "selectDocument"),
    ["selectDocument", { documentId: "doc-uuid-1", segmentId: "imported-segment", activeIndex: 1 }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "activity"),
    [
      "activity",
      "import",
      "DOCX imported",
      { fileName: "incoming.html", segmentCount: 2, documentId: "doc-uuid-1" },
      "DOCX import"
    ]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "status"),
    ["status", "Imported 2 segments from 2 DOCX parts", "saved"]
  );
  assert.deepEqual(
    harness.calls
      .filter(([name]) =>
        [
          "append",
          "replaceProject",
          "getProjectSegments",
          "prepare",
          "replaceSegments",
          "replaceProjects",
          "refreshSummaries",
          "selectDocument",
          "activity",
          "markDirty",
          "status",
          "renderAll",
          "refreshEditorContext"
        ].includes(name)
      )
      .map(([name]) => name),
    [
      "append",
      "replaceProject",
      "getProjectSegments",
      "prepare",
      "replaceSegments",
      "replaceProjects",
      "refreshSummaries",
      "selectDocument",
      "activity",
      "markDirty",
      "status",
      "renderAll",
      "refreshEditorContext"
    ]
  );
});

test("ProjectDocumentImportController preserves localization structures and activity warnings", async () => {
  const { createProjectDocumentImportController } = await loadFactory();
  const structure = { kind: "html", tokens: [1] };
  const harness = createHarness(createProjectDocumentImportController, {
    activityLogged: false,
    localizationResult: {
      fileName: "incoming.html",
      documentType: "html",
      segments: [{ source: "Only" }],
      structure
    }
  });
  await harness.controller.importLocalization(harness.file);
  const append = harness.calls.find(([name]) => name === "append");
  assert.strictEqual(append[1].localizationStructures["doc-uuid-1"], structure);
  assert.deepEqual(append[3], {
    documentId: "doc-uuid-1",
    documentName: "incoming.html",
    documentType: "html"
  });
  assert.deepEqual(
    harness.calls.find(([name]) => name === "parseLocalization"),
    ["parseLocalization", harness.file, { encoding: "windows-1254" }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "activity"),
    [
      "activity",
      "import",
      "Localization file imported",
      { fileName: "incoming.html", documentType: "html", segmentCount: 1, documentId: "doc-uuid-1" },
      "Localization import"
    ]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "status"),
    ["status", "Saved; activity warning", "dirty"]
  );

  const absentStructure = createHarness(createProjectDocumentImportController, {
    localizationResult: {
      fileName: "plain.txt",
      documentType: "txt",
      segments: [],
      structure: null
    }
  });
  await absentStructure.controller.importLocalization(absentStructure.file);
  assert.strictEqual(
    absentStructure.calls.find(([name]) => name === "append")[1].localizationStructures,
    absentStructure.originalLocalizationStructures
  );
  assert.deepEqual(absentStructure.calls.filter(([name]) => name === "progress")[1], [
    "progress",
    "Saving imported segments",
    absentStructure.file,
    "0 segments"
  ]);
});

test("ProjectDocumentImportController preserves XLIFF structure, singular copy, and navigation fallback", async () => {
  const { createProjectDocumentImportController } = await loadFactory();
  const harness = createHarness(createProjectDocumentImportController, {
    segments: [{ id: "old-segment", documentId: "old" }]
  });
  await harness.controller.importXliff(harness.file);
  const append = harness.calls.find(([name]) => name === "append");
  assert.deepEqual(append[1].localizationStructures["doc-uuid-1"], { kind: "xliff" });
  assert.deepEqual(
    harness.calls.find(([name]) => name === "parseXliff"),
    ["parseXliff", harness.file, { encoding: "windows-1254" }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "selectDocument"),
    ["selectDocument", { documentId: "doc-uuid-1", segmentId: "", activeIndex: -1 }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "status"),
    ["status", "Imported 1 XLIFF segment", "saved"]
  );
});

test("ProjectDocumentImportController stops exactly at size, parser, append, and summary failures", async () => {
  const { createProjectDocumentImportController } = await loadFactory();
  const sizeError = new Error("too large");
  const sizeFailure = createHarness(createProjectDocumentImportController, { sizeError });
  await assert.rejects(sizeFailure.controller.importDocx(sizeFailure.file), sizeError);
  assert.deepEqual(
    sizeFailure.calls.map(([name]) => name),
    ["assertSize"]
  );

  const parserFailure = new Error("parse failed");
  const parser = createHarness(createProjectDocumentImportController, {
    parserError: "localization",
    parserFailure
  });
  await assert.rejects(parser.controller.importLocalization(parser.file), parserFailure);
  assert.equal(
    parser.calls.some(([name]) => name === "append"),
    false
  );
  assert.deepEqual(
    parser.calls.map(([name]) => name),
    ["assertSize", "progress", "decodingOptions", "parseLocalization"]
  );

  const appendError = new Error("append failed");
  const append = createHarness(createProjectDocumentImportController, { appendError });
  await assert.rejects(append.controller.importXliff(append.file), appendError);
  assert.equal(
    append.calls.some(([name]) => name === "replaceProject"),
    false
  );

  const summaryError = new Error("summary failed");
  const summary = createHarness(createProjectDocumentImportController, { summaryError });
  await assert.rejects(summary.controller.importDocx(summary.file), summaryError);
  assert.equal(
    summary.calls.some(([name]) => name === "replaceProjects"),
    true
  );
  assert.equal(
    summary.calls.some(([name]) => name === "selectDocument"),
    false
  );
  assert.equal(
    summary.calls.some(([name]) => name === "activity"),
    false
  );
});

test("ProjectDocumentImportController preserves completed effects and late failure timing", async () => {
  const { createProjectDocumentImportController } = await loadFactory();
  const activityError = new Error("activity failed");
  const activity = createHarness(createProjectDocumentImportController, { activityError });
  await assert.rejects(activity.controller.importLocalization(activity.file), activityError);
  assert.equal(
    activity.calls.some(([name]) => name === "selectDocument"),
    true
  );
  assert.equal(
    activity.calls.some(([name]) => name === "markDirty"),
    false
  );

  const contextError = new Error("context failed");
  const context = createHarness(createProjectDocumentImportController, { contextError });
  await assert.rejects(context.controller.importXliff(context.file), contextError);
  for (const name of ["markDirty", "status", "renderAll", "refreshEditorContext"]) {
    assert.equal(
      context.calls.some(([callName]) => callName === name),
      true
    );
  }
  assert.equal(context.read().project.saved, true);
});

test("ProjectDocumentImportController validates boundaries and exposes an immutable API", async () => {
  const { createProjectDocumentImportController } = await loadFactory();
  assert.throws(() => createProjectDocumentImportController(), /requires checked session/);
  const harness = createHarness(createProjectDocumentImportController);
  assert.throws(
    () => createProjectDocumentImportController({ ...harness.options, formats: null }),
    /requires checked session/
  );
  assert.deepEqual(Object.keys(harness.controller), [
    "confirmDuplicate",
    "hasDocumentNamed",
    "importDocx",
    "importFile",
    "importLocalization",
    "importXliff"
  ]);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.throws(() => {
    "use strict";
    harness.controller.importFile = null;
  }, TypeError);
});
