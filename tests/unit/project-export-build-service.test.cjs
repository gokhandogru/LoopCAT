const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/import-export/project-export-build-service.js")).href);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createHarness(createProjectExportBuildService, overrides = {}) {
  const calls = [];
  const currentProject = Object.prototype.hasOwnProperty.call(overrides, "currentProject")
    ? overrides.currentProject
    : {
        id: "project-current",
        name: "Current project",
        sourceLang: "en-US",
        targetLang: "tr-TR",
        aiSettings: { provider: "local" }
      };
  const currentSegments = overrides.currentSegments || [{ id: "segment-current" }];
  const context = { id: "portable-context" };
  const links = overrides.links || [
    { id: "link-main", type: "tm", name: "Main TM", role: "main" },
    { id: "link-tb", type: "termbase", name: "Main TB" }
  ];
  const options = {
    session: {
      getProject() {
        calls.push(["getProject"]);
        if (overrides.getProjectError) throw overrides.getProjectError;
        return currentProject;
      },
      getSegments() {
        calls.push(["getSegments"]);
        if (overrides.getSegmentsError) throw overrides.getSegmentsError;
        return currentSegments;
      }
    },
    autosave: {
      flush(projectId) {
        calls.push(["flush", projectId]);
        if (overrides.flushError) return Promise.reject(overrides.flushError);
        return Promise.resolve(overrides.flushResult);
      }
    },
    storage: {
      getProjectSegments(projectId) {
        calls.push(["getProjectSegments", projectId]);
        if (overrides.projectSegmentsError) return Promise.reject(overrides.projectSegmentsError);
        return Promise.resolve(overrides.projectSegments || [{ id: "segment-repository" }]);
      },
      getAllByIndex(storeName, indexName, value) {
        calls.push(["getAllByIndex", storeName, indexName, value]);
        if (overrides.tmError) return Promise.reject(overrides.tmError);
        return Promise.resolve(
          overrides.tmEntries || [
            { id: "tm-main", tmName: "Main TM" },
            { id: "tm-reference", tmName: "Reference TM" },
            { id: "tm-external", tmName: "External TM" }
          ]
        );
      },
      listTerms(termOptions) {
        calls.push(["listTerms", termOptions]);
        if (overrides.termsError) return Promise.reject(overrides.termsError);
        return Promise.resolve(overrides.terms || [{ id: "term-1" }]);
      },
      listActivityEvents(projectId) {
        calls.push(["listActivityEvents", projectId]);
        if (overrides.activityError) return Promise.reject(overrides.activityError);
        return Promise.resolve(overrides.activityEvents || [{ id: "activity-existing" }]);
      },
      exportAllData() {
        calls.push(["exportAllData"]);
        if (overrides.exportAllError) return Promise.reject(overrides.exportAllError);
        return Promise.resolve(overrides.backupRecord || { app: "LoopCAT", projects: [] });
      }
    },
    resources: {
      getLinks(project) {
        calls.push(["getLinks", project]);
        if (overrides.linksError) throw overrides.linksError;
        return links;
      },
      getTmNames(project) {
        calls.push(["getTmNames", project]);
        if (overrides.tmNamesError) throw overrides.tmNamesError;
        return overrides.tmNames || ["Main TM", "Reference TM"];
      },
      getTermBaseNames(project) {
        calls.push(["getTermBaseNames", project]);
        if (overrides.termBaseNamesError) throw overrides.termBaseNamesError;
        return overrides.termBaseNames || ["Main TB", "Reference TB"];
      }
    },
    documents: {
      manifest(project) {
        calls.push(["manifest", project]);
        if (overrides.manifestError) throw overrides.manifestError;
        return overrides.documents || [];
      }
    },
    ai: {
      normalizeProjectSettings(settings) {
        calls.push(["normalizeProjectSettings", settings]);
        if (overrides.aiError) throw overrides.aiError;
        return { normalized: settings || null };
      }
    },
    portable: {
      createContext() {
        calls.push(["createContext"]);
        if (overrides.contextError) throw overrides.contextError;
        return context;
      },
      sanitize(value, valuePath, notes, portableContext) {
        calls.push(["sanitize", value, valuePath, notes, portableContext]);
        if (overrides.sanitizeErrorPath === valuePath) throw overrides.sanitizeError;
        return clone(value);
      },
      validateProjectPackage(pkg) {
        calls.push(["validateProjectPackage", pkg]);
        if (overrides.packageValidationError) throw overrides.packageValidationError;
        return overrides.packageValidation || { ok: true, warnings: [] };
      },
      hasOriginalLocalizationStructure(structure) {
        calls.push(["hasOriginalLocalizationStructure", structure]);
        if (overrides.structureError) throw overrides.structureError;
        return Boolean(
          structure?.source ||
          structure?.sourceLines ||
          structure?.sourceJson !== undefined ||
          structure?.rows ||
          structure?.packageBase64
        );
      }
    },
    backup: {
      validate(backupRecord) {
        calls.push(["validateBackup", backupRecord]);
        if (overrides.backupValidationError) throw overrides.backupValidationError;
        return overrides.backupValidation || { ok: true, warnings: [] };
      }
    },
    validation: {
      summary(report) {
        calls.push(["summary", report]);
        if (overrides.summaryError) throw overrides.summaryError;
        return overrides.summary || "validation summary";
      }
    },
    workspace: {
      isConnected() {
        calls.push(["isConnected"]);
        if (overrides.workspaceError) throw overrides.workspaceError;
        return Boolean(overrides.workspaceConnected);
      }
    },
    constants: {
      appName: "LoopCAT",
      projectPackageSchemaVersion: 5
    },
    clock: {
      now() {
        calls.push(["now"]);
        if (overrides.clockError) throw overrides.clockError;
        return overrides.now || "2026-08-20T12:00:00.000Z";
      }
    }
  };
  return {
    calls,
    context,
    currentProject,
    options,
    service: createProjectExportBuildService(options)
  };
}

test("ProjectExportBuildService preserves the default no-project guard before every effect", async () => {
  const { createProjectExportBuildService } = await loadFactory();
  const { calls, service } = createHarness(createProjectExportBuildService, { currentProject: null });
  assert.equal(await service.buildProjectPackage(), null);
  assert.deepEqual(calls, [["getProject"]]);
});

test("ProjectExportBuildService builds the current project with exact store queries, scoping, and metadata", async () => {
  const { createProjectExportBuildService } = await loadFactory();
  const project = {
    id: "project-current",
    name: "Current project",
    sourceLang: "en-US",
    targetLang: "tr-TR",
    aiSettings: { provider: "local" }
  };
  const extraActivity = { id: "activity-pending" };
  const { calls, context, service } = createHarness(createProjectExportBuildService, {
    currentProject: project,
    workspaceConnected: true
  });
  const pkg = await service.buildProjectPackage(undefined, null, { activityEvents: [extraActivity] });

  assert.equal(pkg.app, "LoopCAT");
  assert.equal(pkg.type, "project-package");
  assert.equal(pkg.version, 1);
  assert.equal(pkg.schemaVersion, 5);
  assert.equal(pkg.exportedAt, "2026-08-20T12:00:00.000Z");
  assert.deepEqual(pkg.packageMetadata, {
    format: "loopcat-project-package",
    packageVersion: 1,
    contractVersion: "loopcat-package-v1",
    generator: "LoopCAT browser workspace",
    storageMode: "workspace-folder"
  });
  assert.deepEqual(pkg.project.resourceLinks, [
    { id: "link-main", type: "tm", name: "Main TM", role: "main" },
    { id: "link-tb", type: "termbase", name: "Main TB" }
  ]);
  assert.deepEqual(pkg.project.aiSettings, { normalized: { provider: "local" } });
  assert.deepEqual(pkg.segments, [{ id: "segment-current" }]);
  assert.deepEqual(pkg.resources, {
    tmEntries: [
      { id: "tm-main", tmName: "Main TM" },
      { id: "tm-reference", tmName: "Reference TM" }
    ],
    terms: [{ id: "term-1" }]
  });
  assert.deepEqual(pkg.resourceReferences, [
    {
      id: "link-main",
      type: "tm",
      name: "Main TM",
      role: "main",
      sourceLang: "en-US",
      targetLang: "tr-TR"
    },
    {
      id: "link-tb",
      type: "termbase",
      name: "Main TB",
      role: "",
      sourceLang: "en-US",
      targetLang: "tr-TR"
    }
  ]);
  assert.deepEqual(pkg.activityEvents, [{ id: "activity-existing" }, extraActivity]);
  assert.strictEqual(pkg.validation, pkg.validationReports.package);
  assert.deepEqual(calls.filter(([name]) => name === "getAllByIndex")[0], [
    "getAllByIndex",
    "tmEntries",
    "languagePair",
    "en-US::tr-TR"
  ]);
  assert.deepEqual(calls.filter(([name]) => name === "listTerms")[0][1], {
    sourceLang: "en-US",
    targetLang: "tr-TR",
    termBaseNames: ["Main TB", "Reference TB"]
  });
  assert.equal(calls.filter(([name]) => name === "getLinks").length, 2);
  assert.equal(calls.filter(([name]) => name === "sanitize").length, 6);
  assert.ok(calls.filter(([name]) => name === "sanitize").every((entry) => entry[4] === context));
});

test("ProjectExportBuildService preserves repository fallback and explicit segment precedence", async () => {
  const { createProjectExportBuildService } = await loadFactory();
  const otherProject = {
    id: "project-other",
    sourceLang: "ca-ES",
    targetLang: "tr-TR",
    aiSettings: null
  };
  const repositoryHarness = createHarness(createProjectExportBuildService, {
    projectSegments: [{ id: "segment-loaded" }]
  });
  const repositoryPackage = await repositoryHarness.service.buildProjectPackage(otherProject);
  assert.deepEqual(repositoryPackage.segments, [{ id: "segment-loaded" }]);
  assert.deepEqual(
    repositoryHarness.calls.filter(([name]) => ["flush", "getProject", "getProjectSegments"].includes(name)),
    [["flush", "project-other"], ["getProject"], ["getProjectSegments", "project-other"]]
  );

  const explicitHarness = createHarness(createProjectExportBuildService);
  const explicitSegments = [{ id: "segment-explicit" }];
  const explicitPackage = await explicitHarness.service.buildProjectPackage(otherProject, explicitSegments);
  assert.deepEqual(explicitPackage.segments, explicitSegments);
  assert.equal(
    explicitHarness.calls.some(([name]) => name === "getProject"),
    false
  );
  assert.equal(
    explicitHarness.calls.some(([name]) => name === "getSegments"),
    false
  );
  assert.equal(
    explicitHarness.calls.some(([name]) => name === "getProjectSegments"),
    false
  );
});

test("ProjectExportBuildService preserves source-asset structure and shared sanitizer policy", async () => {
  const { createProjectExportBuildService } = await loadFactory();
  const project = {
    id: "project-current",
    sourceLang: "en-US",
    targetLang: "tr-TR",
    docxStructures: { docx: { docxPackageBase64: "UEs=" } },
    docxStructure: { styles: [] },
    localizationStructures: { localization: { sourceJson: {} } }
  };
  const documents = [
    { id: "docx", name: "Source.docx", type: "docx" },
    { id: "legacy", name: "Legacy.docx", type: "docx" },
    { id: "localization", name: "Messages.json", type: "json" },
    { id: "plain", name: "Notes.txt", type: "txt" }
  ];
  const { calls, service } = createHarness(createProjectExportBuildService, {
    currentProject: project,
    documents
  });
  const pkg = await service.buildProjectPackage();
  assert.deepEqual(pkg.sourceAssets, [
    { id: "docx", name: "Source.docx", type: "docx", originalAvailable: true, structurePreserved: true },
    { id: "legacy", name: "Legacy.docx", type: "docx", originalAvailable: false, structurePreserved: true },
    {
      id: "localization",
      name: "Messages.json",
      type: "json",
      originalAvailable: true,
      structurePreserved: true
    },
    { id: "plain", name: "Notes.txt", type: "txt", originalAvailable: false, structurePreserved: false }
  ]);
  assert.deepEqual(
    calls.filter(([name]) => name === "hasOriginalLocalizationStructure").map((entry) => entry[1]),
    [undefined, { sourceJson: {} }, undefined]
  );
  assert.deepEqual(
    calls.filter(([name]) => name === "sanitize").map((entry) => entry[2]),
    ["", "", "", "resourceReferences", "sourceAssets", ""]
  );
  assert.deepEqual(
    calls.filter(([name]) => name === "sanitize").map((entry) => entry[3]),
    [[], [], [], [], [], []]
  );
});

test("ProjectExportBuildService preserves cached and fresh package validation with exact attached errors", async () => {
  const { createProjectExportBuildService } = await loadFactory();
  const cachedValidation = { ok: true, warnings: ["cached"] };
  const cachedHarness = createHarness(createProjectExportBuildService);
  assert.strictEqual(
    cachedHarness.service.assertValidProjectPackageForWrite({ validation: cachedValidation }, "write package"),
    cachedValidation
  );
  assert.deepEqual(cachedHarness.calls, []);

  const freshValidation = { ok: true, warnings: ["fresh"] };
  const freshHarness = createHarness(createProjectExportBuildService, { packageValidation: freshValidation });
  assert.strictEqual(
    freshHarness.service.assertValidProjectPackageForWrite({ id: "pkg" }, "write package"),
    freshValidation
  );
  assert.deepEqual(
    freshHarness.calls.map(([name]) => name),
    ["validateProjectPackage"]
  );

  const invalidValidation = { ok: false, errors: ["broken"] };
  const invalidHarness = createHarness(createProjectExportBuildService, {
    packageValidation: invalidValidation,
    summary: "broken package"
  });
  assert.throws(
    () => invalidHarness.service.assertValidProjectPackageForWrite({ id: "pkg" }, "export project package"),
    (error) => {
      assert.equal(error.message, "Cannot export project package: broken package");
      assert.strictEqual(error.validation, invalidValidation);
      return true;
    }
  );
  assert.deepEqual(
    invalidHarness.calls.map(([name]) => name),
    ["validateProjectPackage", "summary"]
  );
});

test("ProjectExportBuildService builds browser backups with exact flush, export, and validation order", async () => {
  const { createProjectExportBuildService } = await loadFactory();
  const backupRecord = { app: "LoopCAT", projects: [{ id: "project" }] };
  const backupValidation = { ok: true, warnings: ["note"] };
  const { calls, service } = createHarness(createProjectExportBuildService, {
    backupRecord,
    backupValidation
  });
  const result = await service.buildBackupExport();
  assert.strictEqual(result.backup, backupRecord);
  assert.strictEqual(result.validation, backupValidation);
  assert.deepEqual(calls, [["flush", undefined], ["exportAllData"], ["validateBackup", backupRecord]]);
});

test("ProjectExportBuildService preserves backup errors and delegate failure timing", async () => {
  const { createProjectExportBuildService } = await loadFactory();
  const invalidValidation = { ok: false, errors: ["invalid"] };
  const invalidHarness = createHarness(createProjectExportBuildService, {
    backupValidation: invalidValidation,
    summary: "invalid backup"
  });
  await assert.rejects(invalidHarness.service.buildBackupExport(), (error) => {
    assert.equal(error.message, "Cannot export backup: invalid backup");
    assert.strictEqual(error.validation, invalidValidation);
    return true;
  });
  assert.deepEqual(
    invalidHarness.calls.map(([name]) => name),
    ["flush", "exportAllData", "validateBackup", "summary"]
  );

  const flushError = new Error("flush failed");
  const flushHarness = createHarness(createProjectExportBuildService, { flushError });
  await assert.rejects(flushHarness.service.buildBackupExport(), flushError);
  assert.deepEqual(flushHarness.calls, [["flush", undefined]]);

  const summaryError = new Error("summary failed");
  const summaryHarness = createHarness(createProjectExportBuildService, {
    packageValidation: { ok: false },
    summaryError
  });
  assert.throws(
    () => summaryHarness.service.assertValidProjectPackageForWrite({}, "save project package"),
    summaryError
  );
});

test("ProjectExportBuildService preserves package failure boundaries without late effects", async () => {
  const { createProjectExportBuildService } = await loadFactory();
  const flushError = new Error("project flush failed");
  const flushHarness = createHarness(createProjectExportBuildService, { flushError });
  await assert.rejects(flushHarness.service.buildProjectPackage(), flushError);
  assert.deepEqual(
    flushHarness.calls.map(([name]) => name),
    ["getProject", "flush"]
  );

  const contextError = new Error("context failed");
  const contextHarness = createHarness(createProjectExportBuildService, { contextError });
  await assert.rejects(contextHarness.service.buildProjectPackage(), contextError);
  assert.equal(
    contextHarness.calls.some(([name]) => name === "now"),
    false
  );
  assert.equal(
    contextHarness.calls.some(([name]) => name === "sanitize"),
    false
  );
  assert.equal(
    contextHarness.calls.some(([name]) => name === "validateProjectPackage"),
    false
  );

  const validationError = new Error("validation failed");
  const validationHarness = createHarness(createProjectExportBuildService, {
    packageValidationError: validationError
  });
  await assert.rejects(validationHarness.service.buildProjectPackage(), validationError);
  assert.equal(validationHarness.calls.filter(([name]) => name === "sanitize").length, 6);
});

test("ProjectExportBuildService validates boundaries and exposes an immutable API", async () => {
  const { createProjectExportBuildService } = await loadFactory();
  const { options, service } = createHarness(createProjectExportBuildService);
  assert.throws(
    () => createProjectExportBuildService(),
    /ProjectExportBuildService requires session, autosave, storage, resource, document, AI, portable, backup, validation, workspace, constant, and clock boundaries\./
  );
  for (const mutate of [
    (value) => {
      value.session.getProject = null;
    },
    (value) => {
      value.storage.exportAllData = null;
    },
    (value) => {
      value.portable.sanitize = null;
    },
    (value) => {
      value.constants.projectPackageSchemaVersion = Number.NaN;
    }
  ]) {
    const invalid = {
      ...options,
      session: { ...options.session },
      storage: { ...options.storage },
      portable: { ...options.portable },
      constants: { ...options.constants }
    };
    mutate(invalid);
    assert.throws(
      () => createProjectExportBuildService(invalid),
      /ProjectExportBuildService requires session, autosave, storage, resource, document, AI, portable, backup, validation, workspace, constant, and clock boundaries\./
    );
  }
  assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(Object.keys(service).sort(), [
    "assertValidBackupForWrite",
    "assertValidProjectPackageForWrite",
    "buildBackupExport",
    "buildProjectPackage"
  ]);
});
