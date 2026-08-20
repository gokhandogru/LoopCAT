const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/import-export/project-export-controller.js")).href);
}

function createHarness(createProjectExportController, overrides = {}) {
  const calls = [];
  let currentProject = Object.prototype.hasOwnProperty.call(overrides, "currentProject")
    ? overrides.currentProject
    : {
        id: "project-1",
        name: "Project / One",
        exportHistory: [{ id: "existing-export" }]
      };
  let projects = overrides.projects || [currentProject, { id: "project-2", name: "Other" }].filter(Boolean);
  let projectBuildCount = 0;
  let packageValidationCount = 0;
  let downloadCount = 0;
  const previewValidation = overrides.previewValidation || { ok: true, noteCount: 1 };
  const finalValidation = overrides.finalValidation || { ok: true, noteCount: 2 };
  const previewPackage = overrides.previewPackage || { id: "preview", validation: previewValidation };
  const finalPackage = overrides.finalPackage || { id: "final", validation: finalValidation };
  const backupRecord = overrides.backupRecord || { app: "LoopCAT", projects: [] };
  const backupValidation = overrides.backupValidation || { ok: true, noteCount: 0 };
  const pendingActivityEvent = overrides.pendingActivityEvent || { id: "activity-export", projectId: "project-1" };
  const options = {
    build: {
      buildBackupExport() {
        calls.push(["buildBackupExport"]);
        if (overrides.backupBuildError) return Promise.reject(overrides.backupBuildError);
        return Promise.resolve({ backup: backupRecord, validation: backupValidation });
      },
      buildProjectPackage(...args) {
        projectBuildCount += 1;
        calls.push(["buildProjectPackage", projectBuildCount, ...args]);
        if (overrides.projectBuildErrorAt === projectBuildCount) {
          return Promise.reject(overrides.projectBuildError);
        }
        return Promise.resolve(projectBuildCount === 1 ? previewPackage : finalPackage);
      },
      assertValidProjectPackageForWrite(pkg, label) {
        packageValidationCount += 1;
        calls.push(["assertValidProjectPackageForWrite", packageValidationCount, pkg, label]);
        if (overrides.packageValidationErrorAt === packageValidationCount) {
          throw overrides.packageValidationError;
        }
        return pkg?.validation;
      }
    },
    session: {
      getProject() {
        calls.push(["getProject"]);
        if (overrides.getProjectError) throw overrides.getProjectError;
        return currentProject;
      },
      getProjects() {
        calls.push(["getProjects"]);
        return projects;
      },
      replaceProject(project) {
        calls.push(["replaceProject", project]);
        if (overrides.replaceProjectError) throw overrides.replaceProjectError;
        currentProject = project;
      },
      replaceProjects(nextProjects) {
        calls.push(["replaceProjects", nextProjects]);
        if (overrides.replaceProjectsError) throw overrides.replaceProjectsError;
        projects = nextProjects;
      },
      replaceActivityEvents(events) {
        calls.push(["replaceActivityEvents", events]);
        if (overrides.replaceActivityEventsError) throw overrides.replaceActivityEventsError;
      }
    },
    persistence: {
      updateProject(project) {
        calls.push(["updateProject", project]);
        if (overrides.updateProjectError) return Promise.reject(overrides.updateProjectError);
        return Promise.resolve(overrides.updatedProject || { ...project, persisted: true });
      },
      bulkPut(storeName, records) {
        calls.push(["bulkPut", storeName, records]);
        if (overrides.bulkPutError) return Promise.reject(overrides.bulkPutError);
        return Promise.resolve();
      },
      listActivityEvents(projectId) {
        calls.push(["listActivityEvents", projectId]);
        if (overrides.listActivityError) return Promise.reject(overrides.listActivityError);
        return Promise.resolve(overrides.activityEvents || [pendingActivityEvent]);
      }
    },
    activity: {
      draft(project, type, summary, detail) {
        calls.push(["draftActivity", project, type, summary, detail]);
        if (overrides.draftActivityError) throw overrides.draftActivityError;
        return pendingActivityEvent;
      },
      appendWarning(message, logged) {
        calls.push(["appendActivityWarning", message, logged]);
        if (overrides.appendWarningError) throw overrides.appendWarningError;
        return logged ? message : `${message}; activity log failed`;
      }
    },
    files: {
      safeName(value) {
        calls.push(["safeName", value]);
        if (overrides.safeNameError) throw overrides.safeNameError;
        return overrides.safeName || "Project-One";
      },
      download(name, content, mime) {
        downloadCount += 1;
        calls.push(["download", downloadCount, name, content, mime]);
        if (overrides.downloadErrorAt === downloadCount) throw overrides.downloadError;
      }
    },
    validation: {
      count(report) {
        calls.push(["reportCount", report]);
        if (overrides.reportCountError) throw overrides.reportCountError;
        return Number(report?.noteCount || 0);
      },
      errorReport(message) {
        calls.push(["errorReport", message]);
        if (overrides.errorReportError) throw overrides.errorReportError;
        return { ok: false, errors: [message] };
      }
    },
    presentation: {
      renderValidation(report) {
        calls.push(["renderValidation", report]);
        if (overrides.renderValidationError) throw overrides.renderValidationError;
      },
      renderEditor() {
        calls.push(["renderEditor"]);
        if (overrides.renderEditorError) throw overrides.renderEditorError;
      },
      renderBackupReminder() {
        calls.push(["renderBackupReminder"]);
        if (overrides.renderBackupReminderError) throw overrides.renderBackupReminderError;
      }
    },
    workspace: {
      markDirty(projectId) {
        calls.push(["markWorkspaceDirty", projectId]);
        if (overrides.markDirtyError) throw overrides.markDirtyError;
      }
    },
    status: {
      set(message, mode) {
        calls.push(["status", message, mode]);
        if (overrides.statusError) throw overrides.statusError;
      },
      mode(preferred, activityLogged) {
        calls.push(["statusMode", preferred, activityLogged]);
        if (overrides.statusModeError) throw overrides.statusModeError;
        return activityLogged ? preferred : "dirty";
      }
    },
    clock: {
      now() {
        calls.push(["now"]);
        if (overrides.clockError) throw overrides.clockError;
        return overrides.now || "2026-08-20T15:30:45.000Z";
      },
      nowMs() {
        calls.push(["nowMs"]);
        if (overrides.clockMsError) throw overrides.clockMsError;
        return overrides.nowMs || 1770000000000;
      }
    },
    test: {
      shouldFailActivity() {
        calls.push(["shouldFailActivity"]);
        if (overrides.testHookError) throw overrides.testHookError;
        return Boolean(overrides.shouldFailActivity);
      }
    },
    logger: {
      warn(...args) {
        calls.push(["warn", ...args]);
        if (overrides.loggerError) throw overrides.loggerError;
      }
    }
  };
  return {
    calls,
    options,
    pendingActivityEvent,
    previewPackage,
    finalPackage,
    backupRecord,
    backupValidation,
    service: createProjectExportController(options),
    getProject: () => currentProject,
    getProjects: () => projects
  };
}

test("ProjectExportController exports a browser backup with exact file, validation, and status effects", async () => {
  const { createProjectExportController } = await loadFactory();
  const { calls, backupRecord, backupValidation, service } = createHarness(createProjectExportController);
  assert.equal(await service.exportBrowserBackup(), true);
  const downloadCall = calls.find(([name]) => name === "download");
  assert.deepEqual(downloadCall.slice(0, 3), ["download", 1, "loopcat-backup-2026-08-20.json"]);
  assert.equal(downloadCall[3], JSON.stringify(backupRecord, null, 2));
  assert.equal(downloadCall[4], "application/json");
  assert.deepEqual(calls.slice(-3), [
    ["renderValidation", backupValidation],
    ["reportCount", backupValidation],
    ["status", "Backup exported", "saved"]
  ]);

  const notesHarness = createHarness(createProjectExportController, {
    backupValidation: { ok: true, noteCount: 2 }
  });
  assert.equal(await notesHarness.service.exportBrowserBackup(), true);
  assert.deepEqual(notesHarness.calls.at(-1), ["status", "Backup exported with 2 validation notes", "dirty"]);
});

test("ProjectExportController contains browser-backup failures with report precedence and exact fallback", async () => {
  const { createProjectExportController } = await loadFactory();
  const attachedValidation = { ok: false, errors: ["attached"] };
  const attachedError = Object.assign(new Error("Backup blocked"), { validation: attachedValidation });
  const attachedHarness = createHarness(createProjectExportController, { backupBuildError: attachedError });
  assert.equal(await attachedHarness.service.exportBrowserBackup(), false);
  assert.deepEqual(attachedHarness.calls, [
    ["buildBackupExport"],
    ["renderValidation", attachedValidation],
    ["status", "Backup blocked", "dirty"]
  ]);

  const fallbackHarness = createHarness(createProjectExportController, {
    downloadErrorAt: 1,
    downloadError: {}
  });
  assert.equal(await fallbackHarness.service.exportBrowserBackup(), false);
  assert.deepEqual(fallbackHarness.calls.slice(-3), [
    ["errorReport", "Backup export failed."],
    ["renderValidation", { ok: false, errors: ["Backup export failed."] }],
    ["status", "Backup export failed.", "dirty"]
  ]);
});

test("ProjectExportController preserves the project guard and preview failure reporting", async () => {
  const { createProjectExportController } = await loadFactory();
  const emptyHarness = createHarness(createProjectExportController, { currentProject: null });
  assert.equal(await emptyHarness.service.exportProjectPackage(), undefined);
  assert.deepEqual(emptyHarness.calls, [["getProject"]]);

  const validationReport = { ok: false, errors: ["preview invalid"] };
  const previewError = Object.assign(new Error("Cannot export preview"), { validation: validationReport });
  const failureHarness = createHarness(createProjectExportController, {
    packageValidationErrorAt: 1,
    packageValidationError: previewError
  });
  assert.equal(await failureHarness.service.exportProjectPackage(), undefined);
  assert.deepEqual(failureHarness.calls.slice(-2), [
    ["renderValidation", validationReport],
    ["status", "Cannot export preview", "dirty"]
  ]);
  assert.equal(
    failureHarness.calls.some(([name]) => name === "nowMs"),
    false
  );
  assert.equal(
    failureHarness.calls.some(([name]) => name === "download"),
    false
  );
});

test("ProjectExportController completes two-pass project export, history, activity, and final presentation", async () => {
  const { createProjectExportController } = await loadFactory();
  const updatedProject = {
    id: "project-1",
    name: "Project / One",
    exportHistory: [],
    persisted: true
  };
  const harness = createHarness(createProjectExportController, { updatedProject });
  assert.equal(await harness.service.exportProjectPackage(), undefined);

  const projectBuilds = harness.calls.filter(([name]) => name === "buildProjectPackage");
  assert.equal(projectBuilds.length, 2);
  assert.deepEqual(projectBuilds[0], ["buildProjectPackage", 1]);
  const pendingProject = projectBuilds[1][2];
  assert.equal(pendingProject.exportHistory.length, 2);
  assert.deepEqual(pendingProject.exportHistory[1], {
    id: "export-1770000000000",
    type: "project-package",
    filename: "Project-One.loopcat.json",
    warningCount: 1,
    createdAt: "2026-08-20T15:30:45.000Z"
  });
  assert.equal(projectBuilds[1][3], null);
  assert.deepEqual(projectBuilds[1][4], { activityEvents: [harness.pendingActivityEvent] });
  const draftCall = harness.calls.find(([name]) => name === "draftActivity");
  assert.deepEqual(draftCall.slice(2), [
    "export",
    "Project package exported",
    { filename: "Project-One.loopcat.json", warningCount: 1 }
  ]);
  const downloadCall = harness.calls.find(([name]) => name === "download");
  assert.deepEqual(downloadCall.slice(0, 3), ["download", 1, "Project-One.loopcat.json"]);
  assert.equal(downloadCall[3], JSON.stringify(harness.finalPackage, null, 2));
  assert.equal(downloadCall[4], "application/json");
  assert.ok(harness.calls.some(([name, store]) => name === "bulkPut" && store === "activityEvents"));
  assert.ok(harness.calls.some(([name]) => name === "renderBackupReminder"));
  assert.deepEqual(harness.calls.slice(-5), [
    ["renderValidation", harness.finalPackage.validation],
    ["renderEditor"],
    ["appendActivityWarning", "Project exported with 2 validation warnings", true],
    ["statusMode", "dirty", true],
    ["status", "Project exported with 2 validation warnings", "dirty"]
  ]);
  assert.strictEqual(harness.getProject(), updatedProject);
  assert.strictEqual(harness.getProjects()[0], updatedProject);
});

test("ProjectExportController preserves the final-build failure and package-validation fallback", async () => {
  const { createProjectExportController } = await loadFactory();
  const finalValidation = { ok: false, noteCount: 3 };
  const finalPackage = { id: "final-invalid", validation: finalValidation };
  const validationError = new Error("Final package invalid");
  const harness = createHarness(createProjectExportController, {
    finalPackage,
    packageValidationErrorAt: 2,
    packageValidationError: validationError
  });
  assert.equal(await harness.service.exportProjectPackage(), undefined);
  assert.deepEqual(harness.calls.slice(-2), [
    ["renderValidation", finalValidation],
    ["status", "Final package invalid", "dirty"]
  ]);
  assert.equal(
    harness.calls.some(([name]) => name === "download"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "updateProject"),
    false
  );
});

test("ProjectExportController stops after download failure without local export-history effects", async () => {
  const { createProjectExportController } = await loadFactory();
  const downloadError = new Error("download failed");
  const harness = createHarness(createProjectExportController, {
    downloadErrorAt: 1,
    downloadError
  });
  assert.equal(await harness.service.exportProjectPackage(), undefined);
  assert.deepEqual(harness.calls.slice(-2), [
    ["download", 1, "Project-One.loopcat.json", JSON.stringify(harness.finalPackage, null, 2), "application/json"],
    ["status", "download failed", "dirty"]
  ]);
  assert.equal(
    harness.calls.some(([name]) => name === "updateProject"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "renderValidation"),
    false
  );
});

test("ProjectExportController preserves post-download history failure recovery and early return", async () => {
  const { createProjectExportController } = await loadFactory();
  const updateError = new Error("history failed");
  const harness = createHarness(createProjectExportController, { updateProjectError: updateError });
  assert.equal(await harness.service.exportProjectPackage(), undefined);
  assert.deepEqual(harness.calls.slice(-6), [
    ["warn", "Project package export history update failed.", updateError],
    ["getProject"],
    ["markWorkspaceDirty", "project-1"],
    ["renderValidation", harness.finalPackage.validation],
    ["renderEditor"],
    ["status", "Project package exported; local export history failed", "dirty"]
  ]);
  assert.equal(
    harness.calls.some(([name]) => name === "bulkPut"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "appendActivityWarning"),
    false
  );
});

test("ProjectExportController preserves simulated and persisted activity warning outcomes", async () => {
  const { createProjectExportController } = await loadFactory();
  const simulatedHarness = createHarness(createProjectExportController, { shouldFailActivity: true });
  assert.equal(await simulatedHarness.service.exportProjectPackage(), undefined);
  const finalBuild = simulatedHarness.calls.filter(([name]) => name === "buildProjectPackage")[1];
  assert.deepEqual(finalBuild[4], { activityEvents: [] });
  assert.equal(
    simulatedHarness.calls.some(([name]) => name === "draftActivity"),
    false
  );
  assert.equal(
    simulatedHarness.calls.some(([name]) => name === "bulkPut"),
    false
  );
  assert.ok(
    simulatedHarness.calls.some(
      ([name, message, logged]) =>
        name === "appendActivityWarning" &&
        message === "Project exported with 2 validation warnings" &&
        logged === false
    )
  );
  assert.deepEqual(simulatedHarness.calls.at(-1), [
    "status",
    "Project exported with 2 validation warnings; activity log failed",
    "dirty"
  ]);

  const activityError = new Error("activity write failed");
  const failedHarness = createHarness(createProjectExportController, { bulkPutError: activityError });
  assert.equal(await failedHarness.service.exportProjectPackage(), undefined);
  assert.ok(
    failedHarness.calls.some(
      ([name, message, error]) =>
        name === "warn" && message === "Project package export activity log failed." && error === activityError
    )
  );
  assert.equal(failedHarness.calls.filter(([name]) => name === "markWorkspaceDirty").length, 1);
  assert.deepEqual(failedHarness.calls.at(-1), [
    "status",
    "Project exported with 2 validation warnings; activity log failed",
    "dirty"
  ]);
});

test("ProjectExportController validates boundaries and exposes an immutable API", async () => {
  const { createProjectExportController } = await loadFactory();
  const { options, service } = createHarness(createProjectExportController);
  const message =
    /ProjectExportController requires build, session, persistence, activity, file, validation, presentation, workspace, status, clock, test, and logger boundaries\./;
  assert.throws(() => createProjectExportController(), message);
  for (const mutate of [
    (value) => {
      value.build.buildProjectPackage = null;
    },
    (value) => {
      value.session.replaceProjects = null;
    },
    (value) => {
      value.persistence.bulkPut = null;
    },
    (value) => {
      value.presentation.renderEditor = null;
    },
    (value) => {
      value.test.shouldFailActivity = null;
    }
  ]) {
    const invalid = {
      ...options,
      build: { ...options.build },
      session: { ...options.session },
      persistence: { ...options.persistence },
      presentation: { ...options.presentation },
      test: { ...options.test }
    };
    mutate(invalid);
    assert.throws(() => createProjectExportController(invalid), message);
  }
  assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(Object.keys(service).sort(), ["exportBrowserBackup", "exportProjectPackage"]);
});
