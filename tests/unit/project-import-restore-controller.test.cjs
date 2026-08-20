const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(
    pathToFileURL(path.join(rootPath, "src/features/import-export/project-import-restore-controller.js")).href
  );
}

function createHarness(createProjectImportRestoreController, overrides = {}) {
  const calls = [];
  let sessionProjects = overrides.projects || [];
  const packageValidation = overrides.packageValidation || {
    ok: true,
    errors: [],
    warnings: [],
    preserved: ["Package preserved"],
    simplified: [],
    skipped: [],
    risky: [],
    noteCount: 1
  };
  const prepared = overrides.prepared || {
    project: { id: "project-imported", name: "Imported project" },
    segments: [{ id: "segment-1" }, { id: "segment-2" }],
    resources: {
      tmEntries: [{ id: "tm-1" }],
      terms: [{ id: "term-1" }]
    },
    activityEvents: [{ id: "activity-1" }]
  };
  const backupReport = overrides.backupReport || {
    ok: true,
    warnings: ["Backup warning"],
    preserved: ["Backup preserved"],
    risky: ["Backup risk"]
  };
  const options = {
    files: {
      progress(phase, file, detail) {
        calls.push(["progress", phase, file, detail]);
        if (overrides.progressErrorPhase === phase) return Promise.reject(overrides.progressError);
        return Promise.resolve();
      },
      parseJson(file, label) {
        calls.push(["parseJson", file, label]);
        if (overrides.parseError) return Promise.reject(overrides.parseError);
        return Promise.resolve(overrides.parsedJson || { parsed: label });
      }
    },
    portability: {
      validate(pkg) {
        calls.push(["validatePackage", pkg]);
        if (overrides.packageValidationError) throw overrides.packageValidationError;
        return packageValidation;
      },
      prepare(pkg, prepareOptions) {
        calls.push(["preparePackage", pkg, prepareOptions]);
        if (overrides.prepareError) return Promise.reject(overrides.prepareError);
        return Promise.resolve(prepared);
      }
    },
    backup: {
      validate(backupRecord) {
        calls.push(["validateBackup", backupRecord]);
        if (overrides.backupValidationError) throw overrides.backupValidationError;
        return backupReport;
      }
    },
    session: {
      getProjects() {
        calls.push(["getProjects"]);
        return sessionProjects;
      },
      replaceProject(project) {
        calls.push(["replaceProject", project]);
        if (overrides.replaceProjectError) throw overrides.replaceProjectError;
      },
      replaceSegments(segments) {
        calls.push(["replaceSegments", segments]);
        if (overrides.replaceSegmentsError) throw overrides.replaceSegmentsError;
      }
    },
    autosave: {
      flush(projectId) {
        calls.push(["flush", projectId]);
        if (overrides.flushError) return Promise.reject(overrides.flushError);
        return Promise.resolve();
      }
    },
    persistence: {
      importProjectPackageRecords(records) {
        calls.push(["importProjectPackageRecords", records]);
        if (overrides.importPackageError) return Promise.reject(overrides.importPackageError);
        return Promise.resolve();
      },
      importAllData(backupRecord) {
        calls.push(["importAllData", backupRecord]);
        if (overrides.importBackupError) return Promise.reject(overrides.importBackupError);
        return Promise.resolve();
      }
    },
    indexes: {
      rebuildTm() {
        calls.push(["rebuildTm"]);
        if (overrides.tmIndexError) return Promise.reject(overrides.tmIndexError);
        return Promise.resolve();
      },
      rebuildTerms() {
        calls.push(["rebuildTerms"]);
        if (overrides.termIndexError) return Promise.reject(overrides.termIndexError);
        return Promise.resolve();
      }
    },
    activity: {
      logForProject(projectId, type, summary, detail, label) {
        calls.push(["logForProject", projectId, type, summary, detail, label]);
        if (overrides.activityError) return Promise.reject(overrides.activityError);
        return Promise.resolve({ ok: overrides.activityLogged !== false });
      },
      appendWarning(message, logged) {
        calls.push(["appendActivityWarning", message, logged]);
        if (overrides.appendWarningError) throw overrides.appendWarningError;
        return logged ? message : `${message}; activity log failed`;
      }
    },
    navigation: {
      openProjects() {
        calls.push(["openProjects"]);
        if (overrides.openProjectsError) throw overrides.openProjectsError;
      },
      clearSelection() {
        calls.push(["clearSelection"]);
        if (overrides.clearSelectionError) throw overrides.clearSelectionError;
      }
    },
    projects: {
      load(openFirst) {
        calls.push(["loadProjects", openFirst]);
        if (overrides.loadError) return Promise.reject(overrides.loadError);
        if (overrides.loadedProjects) sessionProjects = overrides.loadedProjects;
        return Promise.resolve();
      },
      open(projectId) {
        calls.push(["openProject", projectId]);
        if (overrides.openError) return Promise.reject(overrides.openError);
        return Promise.resolve();
      }
    },
    workspace: {
      isConnected() {
        calls.push(["isWorkspaceConnected"]);
        if (overrides.workspaceError) throw overrides.workspaceError;
        return Boolean(overrides.workspaceConnected);
      },
      clearDirty(projectId) {
        calls.push(["clearWorkspaceDirty", projectId]);
        if (overrides.clearDirtyError) throw overrides.clearDirtyError;
      },
      markDirty(projectId) {
        calls.push(["markWorkspaceDirty", projectId]);
        if (overrides.markDirtyError) throw overrides.markDirtyError;
      },
      clearDirtyMarkers() {
        calls.push(["clearWorkspaceDirtyMarkers"]);
        if (overrides.clearMarkersError) throw overrides.clearMarkersError;
      },
      markProjectsDirty(projectIds) {
        calls.push(["markWorkspaceProjectsDirty", projectIds]);
        if (overrides.markProjectsError) throw overrides.markProjectsError;
      }
    },
    validation: {
      count(report) {
        calls.push(["reportCount", report]);
        if (overrides.countError) throw overrides.countError;
        return Number(report?.noteCount ?? report?.warnings?.length ?? 0);
      },
      alertText(report, fallback) {
        calls.push(["validationAlertText", report, fallback]);
        if (overrides.alertTextError) throw overrides.alertTextError;
        return overrides.alertText || `${fallback}: details`;
      }
    },
    presentation: {
      renderValidation(report) {
        calls.push(["renderValidation", report]);
        if (overrides.renderValidationError) throw overrides.renderValidationError;
      },
      renderWorkspaceStatus() {
        calls.push(["renderWorkspaceStatus"]);
        if (overrides.renderWorkspaceError) throw overrides.renderWorkspaceError;
      }
    },
    status: {
      set(message, mode) {
        calls.push(["status", message, mode]);
        if (overrides.statusError) throw overrides.statusError;
      },
      mode(preferred, logged) {
        calls.push(["statusMode", preferred, logged]);
        if (overrides.statusModeError) throw overrides.statusModeError;
        return logged ? preferred : "dirty";
      }
    },
    localization: {
      alert(message) {
        calls.push(["alert", message]);
        if (overrides.alertError) throw overrides.alertError;
      },
      confirm(message) {
        calls.push(["confirm", message]);
        if (overrides.confirmError) throw overrides.confirmError;
        const responses = overrides.confirmResponses || [];
        return responses[calls.filter(([name]) => name === "confirm").length - 1] ?? false;
      }
    },
    text: {
      safe(value) {
        calls.push(["safeText", value]);
        if (overrides.safeTextError) throw overrides.safeTextError;
        return `safe:${value}`;
      }
    }
  };
  return {
    backupReport,
    calls,
    options,
    packageValidation,
    prepared,
    service: createProjectImportRestoreController(options)
  };
}

test("ProjectImportRestoreController rejects invalid packages with exact alert and suppression behavior", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const invalid = { ok: false, errors: ["invalid"] };
  const alertHarness = createHarness(createProjectImportRestoreController, { packageValidation: invalid });
  assert.equal(await alertHarness.service.importProjectPackageData({ id: "pkg" }), null);
  assert.deepEqual(alertHarness.calls, [
    ["progress", "Validating project package", { name: "project package" }, undefined],
    ["validatePackage", { id: "pkg" }],
    ["validationAlertText", invalid, "Project package import failed validation"],
    ["alert", "Project package import failed validation: details"],
    ["renderValidation", invalid],
    ["status", "Project package import failed validation", "dirty"]
  ]);

  const suppressedHarness = createHarness(createProjectImportRestoreController, { packageValidation: invalid });
  assert.equal(
    await suppressedHarness.service.importProjectPackageData(
      { id: "pkg" },
      { sourceName: "workspace.loopcat.json", suppressAlert: true }
    ),
    null
  );
  assert.equal(
    suppressedHarness.calls.some(([name]) => name === "validationAlertText"),
    false
  );
  assert.equal(
    suppressedHarness.calls.some(([name]) => name === "alert"),
    false
  );
});

test("ProjectImportRestoreController preserves replace and copy confirmation cancellation", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const existing = { id: "project-existing", name: "Secret Project" };
  const pkg = { project: { id: "project-existing" } };
  const harness = createHarness(createProjectImportRestoreController, {
    projects: [existing],
    confirmResponses: [false, false]
  });
  assert.equal(await harness.service.importProjectPackageData(pkg), null);
  assert.deepEqual(
    harness.calls.filter(([name]) => ["safeText", "confirm"].includes(name)),
    [
      ["safeText", "Secret Project"],
      ["confirm", 'A project named "safe:Secret Project" already exists. Replace it with this package?'],
      ["confirm", "Keep the existing project and import this package as a separate copy?"]
    ]
  );
  assert.equal(
    harness.calls.some(([name]) => name === "flush"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "preparePackage"),
    false
  );
});

test("ProjectImportRestoreController replaces an existing project with exact import and refresh sequencing", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const existing = { id: "project-imported", name: "Existing" };
  const pkg = { project: { id: "project-imported" } };
  const harness = createHarness(createProjectImportRestoreController, {
    projects: [existing],
    activityLogged: true
  });
  const result = await harness.service.importProjectPackageData(pkg, {
    sourceName: "incoming.loopcat.json",
    replaceExisting: true
  });
  assert.strictEqual(result.pkg, harness.prepared);
  assert.strictEqual(result.validation, harness.packageValidation);
  assert.deepEqual(
    harness.calls.filter(([name]) =>
      [
        "flush",
        "preparePackage",
        "importProjectPackageRecords",
        "rebuildTm",
        "rebuildTerms",
        "logForProject",
        "replaceProject",
        "replaceSegments",
        "openProjects",
        "clearSelection",
        "loadProjects",
        "openProject"
      ].includes(name)
    ),
    [
      ["flush", "project-imported"],
      ["preparePackage", pkg, { replaceProjectId: "project-imported", importAsCopy: false }],
      [
        "importProjectPackageRecords",
        {
          project: harness.prepared.project,
          segments: harness.prepared.segments,
          tmEntries: harness.prepared.resources.tmEntries,
          terms: harness.prepared.resources.terms,
          activityEvents: harness.prepared.activityEvents,
          replaceProjectId: "project-imported"
        }
      ],
      ["rebuildTm"],
      ["rebuildTerms"],
      [
        "logForProject",
        "project-imported",
        "import",
        "Project package imported",
        { fileName: "incoming.loopcat.json", warningCount: 1, importAsCopy: false },
        "Project package import"
      ],
      ["replaceProject", null],
      ["replaceSegments", []],
      ["openProjects"],
      ["clearSelection"],
      ["loadProjects", false],
      ["openProject", "project-imported"]
    ]
  );
  assert.deepEqual(harness.calls.at(-1), ["isWorkspaceConnected"]);
  assert.deepEqual(harness.calls.slice(-6, -1), [
    ["renderValidation", harness.packageValidation],
    ["reportCount", harness.packageValidation],
    ["appendActivityWarning", "Imported with 1 validation note", true],
    ["statusMode", "dirty", true],
    ["status", "Imported with 1 validation note", "dirty"]
  ]);
});

test("ProjectImportRestoreController imports a copy with preserved note and connected-workspace dirtiness", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const existing = { id: "project-original", name: "Original" };
  const pkg = { project: { id: "project-original" } };
  const prepared = {
    project: { id: "project-copy", name: "Original (copy)" },
    segments: [{ id: "copy-segment" }],
    resources: {},
    activityEvents: []
  };
  const harness = createHarness(createProjectImportRestoreController, {
    projects: [existing],
    prepared,
    workspaceConnected: true
  });
  const result = await harness.service.importProjectPackageData(pkg, {
    replaceExisting: false,
    importAsCopy: true
  });
  assert.equal(
    harness.calls.some(([name]) => name === "confirm"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "flush"),
    false
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "preparePackage"),
    ["preparePackage", pkg, { replaceProjectId: "", importAsCopy: true }]
  );
  assert.notStrictEqual(result.validation, harness.packageValidation);
  assert.deepEqual(result.validation.preserved, [
    "Package preserved",
    'Imported as a separate project copy named "safe:Original (copy)".'
  ]);
  assert.deepEqual(harness.calls.at(-2), ["isWorkspaceConnected"]);
  assert.deepEqual(harness.calls.at(-1), ["markWorkspaceDirty", "project-copy"]);
});

test("ProjectImportRestoreController preserves workspace-source and open-false outcomes", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const harness = createHarness(createProjectImportRestoreController, { workspaceConnected: true });
  const result = await harness.service.importProjectPackageData(
    { project: { id: "new-project" } },
    { sourceIsWorkspace: true, open: false }
  );
  assert.ok(result);
  assert.equal(
    harness.calls.some(([name]) => name === "openProject"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "isWorkspaceConnected"),
    false
  );
  assert.deepEqual(harness.calls.at(-1), ["clearWorkspaceDirty", "project-imported"]);
});

test("ProjectImportRestoreController project and backup file adapters preserve progress, parsing, and returns", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const projectFile = { name: "project.loopcat.json" };
  const parsedProject = { project: { id: "project-new" } };
  const projectHarness = createHarness(createProjectImportRestoreController, { parsedJson: parsedProject });
  const importResult = await projectHarness.service.importProjectPackage(projectFile);
  assert.ok(importResult);
  assert.deepEqual(projectHarness.calls.slice(0, 4), [
    ["progress", "Reading project package", projectFile, undefined],
    ["parseJson", projectFile, "Project package"],
    ["progress", "Validating project package", { name: "project.loopcat.json" }, undefined],
    ["validatePackage", parsedProject]
  ]);

  const backupFile = { name: "backup.json" };
  const parsedBackup = { projects: [], segments: [] };
  const backupHarness = createHarness(createProjectImportRestoreController, {
    parsedJson: parsedBackup,
    backupReport: { ok: false }
  });
  assert.equal(await backupHarness.service.restoreBackupFile(backupFile), null);
  assert.deepEqual(backupHarness.calls.slice(0, 4), [
    ["progress", "Reading backup file", backupFile, undefined],
    ["parseJson", backupFile, "Backup file"],
    ["progress", "Validating backup", undefined, undefined],
    ["validateBackup", parsedBackup]
  ]);
});

test("ProjectImportRestoreController rejects invalid backups before flush or store replacement", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const invalidReport = { ok: false, errors: ["invalid backup"] };
  const backupRecord = { projects: {} };
  const harness = createHarness(createProjectImportRestoreController, { backupReport: invalidReport });
  assert.equal(await harness.service.restoreBackupData(backupRecord), null);
  assert.deepEqual(harness.calls, [
    ["progress", "Validating backup", undefined, undefined],
    ["validateBackup", backupRecord],
    ["renderValidation", invalidReport],
    ["status", "Backup restore failed validation", "dirty"]
  ]);
});

test("ProjectImportRestoreController restores disconnected backups with exact report and sequencing", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const backupRecord = {
    projects: [{ id: "project-a" }],
    segments: [{ id: "segment-a" }, { id: "segment-b" }]
  };
  const loadedProjects = [{ id: "project-a" }, { id: "" }, { id: "project-b" }];
  const harness = createHarness(createProjectImportRestoreController, {
    loadedProjects,
    workspaceConnected: false
  });
  const result = await harness.service.restoreBackupData(backupRecord);
  assert.strictEqual(result.backup, backupRecord);
  assert.deepEqual(result.report, {
    ok: true,
    errors: [],
    warnings: ["Backup warning"],
    preserved: ["Backup preserved", "1 project restored.", "2 segments restored."],
    simplified: [],
    skipped: [],
    risky: ["Backup risk"]
  });
  assert.deepEqual(
    harness.calls.filter(([name]) =>
      [
        "flush",
        "importAllData",
        "rebuildTm",
        "rebuildTerms",
        "replaceProject",
        "replaceSegments",
        "openProjects",
        "clearSelection",
        "loadProjects",
        "getProjects",
        "isWorkspaceConnected"
      ].includes(name)
    ),
    [
      ["flush", undefined],
      ["importAllData", backupRecord],
      ["rebuildTm"],
      ["rebuildTerms"],
      ["replaceProject", null],
      ["replaceSegments", []],
      ["openProjects"],
      ["clearSelection"],
      ["loadProjects", false],
      ["getProjects"],
      ["isWorkspaceConnected"],
      ["isWorkspaceConnected"]
    ]
  );
  assert.deepEqual(harness.calls.at(-1), ["status", "Backup restored with 1 validation note", "dirty"]);
});

test("ProjectImportRestoreController restores connected backups and marks every restored project package dirty", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const backupRecord = { projects: [{ id: "a" }, { id: "b" }], segments: [{ id: "segment" }] };
  const loadedProjects = [{ id: "a" }, { id: null }, { id: "b" }];
  const harness = createHarness(createProjectImportRestoreController, {
    backupRecord,
    loadedProjects,
    workspaceConnected: true
  });
  const result = await harness.service.restoreBackupData(backupRecord);
  assert.deepEqual(
    harness.calls.filter(([name]) =>
      ["clearWorkspaceDirtyMarkers", "markWorkspaceProjectsDirty", "renderWorkspaceStatus"].includes(name)
    ),
    [["clearWorkspaceDirtyMarkers"], ["markWorkspaceProjectsDirty", ["a", "b"]], ["renderWorkspaceStatus"]]
  );
  assert.deepEqual(result.report.risky, [
    "Backup risk",
    "2 restored project packages must be saved to the workspace folder."
  ]);
});

test("ProjectImportRestoreController preserves primary failure timing without late import effects", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const prepareError = new Error("prepare failed");
  const prepareHarness = createHarness(createProjectImportRestoreController, { prepareError });
  await assert.rejects(prepareHarness.service.importProjectPackageData({ project: { id: "new" } }), prepareError);
  assert.equal(
    prepareHarness.calls.some(([name]) => name === "importProjectPackageRecords"),
    false
  );
  assert.equal(
    prepareHarness.calls.some(([name]) => name === "rebuildTm"),
    false
  );

  const flushError = new Error("flush failed");
  const backupHarness = createHarness(createProjectImportRestoreController, { flushError });
  await assert.rejects(backupHarness.service.restoreBackupData({ projects: [], segments: [] }), flushError);
  assert.deepEqual(
    backupHarness.calls.map(([name]) => name),
    ["progress", "validateBackup", "flush"]
  );
});

test("ProjectImportRestoreController validates boundaries and exposes an immutable API", async () => {
  const { createProjectImportRestoreController } = await loadFactory();
  const { options, service } = createHarness(createProjectImportRestoreController);
  const message =
    /ProjectImportRestoreController requires file, portability, backup, session, autosave, persistence, index, activity, navigation, project, workspace, validation, presentation, status, localization, and text boundaries\./;
  assert.throws(() => createProjectImportRestoreController(), message);
  for (const mutate of [
    (value) => {
      value.files.parseJson = null;
    },
    (value) => {
      value.portability.prepare = null;
    },
    (value) => {
      value.persistence.importAllData = null;
    },
    (value) => {
      value.workspace.markProjectsDirty = null;
    },
    (value) => {
      value.localization.confirm = null;
    }
  ]) {
    const invalid = {
      ...options,
      files: { ...options.files },
      portability: { ...options.portability },
      persistence: { ...options.persistence },
      workspace: { ...options.workspace },
      localization: { ...options.localization }
    };
    mutate(invalid);
    assert.throws(() => createProjectImportRestoreController(invalid), message);
  }
  assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(Object.keys(service).sort(), [
    "importProjectPackage",
    "importProjectPackageData",
    "restoreBackupData",
    "restoreBackupFile"
  ]);
});
