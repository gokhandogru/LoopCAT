const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/workspace/workspace-package-save-controller.js")).href);
}

function createHarness(createWorkspacePackageSaveController, overrides = {}) {
  const calls = [];
  let currentProject = Object.prototype.hasOwnProperty.call(overrides, "currentProject")
    ? overrides.currentProject
    : { id: "project-1", name: "Project one" };
  let connected = overrides.connected ?? true;
  let autosaving = overrides.autosaving ?? false;
  let autosaveTimer = overrides.autosaveTimer ?? null;
  let dirtyIds = overrides.dirtyIds || ["project-1"];
  let recoveryIds = overrides.recoveryIds || ["project-1"];
  let dirtyReadCount = 0;
  let buildCount = 0;
  let saveCount = 0;
  const knownProjects = overrides.knownProjects || [currentProject].filter(Boolean);
  const listedProjects = overrides.listedProjects || [];
  const packageFor = (project, options) => ({
    project,
    validation: overrides.validationReport || { ok: true, noteCount: overrides.noteCount || 0 },
    options
  });
  const storageStatus = overrides.storageStatus || {
    connected: true,
    name: "Workspace",
    projectCount: 1
  };
  const saveResult = overrides.saveResult || {
    packagePath: "Projects/Project one.loopcat.json",
    validationReportSaved: true
  };
  const activityEvent = overrides.activityEvent || { id: "activity-workspace", projectId: "project-1" };
  const options = {
    storage: {
      isSupported() {
        calls.push(["isSupported"]);
        return overrides.supported ?? true;
      },
      chooseFolder(folderOptions) {
        calls.push(["chooseFolder", folderOptions]);
        if (overrides.chooseError) return Promise.reject(overrides.chooseError);
        return Promise.resolve(overrides.chosenStatus || storageStatus);
      },
      getStatus() {
        calls.push(["getStatus"]);
        if (overrides.getStatusError) return Promise.reject(overrides.getStatusError);
        return Promise.resolve(storageStatus);
      },
      saveProjectPackage(pkg) {
        saveCount += 1;
        calls.push(["saveProjectPackage", saveCount, pkg]);
        if (overrides.saveErrorAt === saveCount) return Promise.reject(overrides.saveError);
        return Promise.resolve(
          overrides.saveResults?.[saveCount - 1] ||
            overrides.saveResult || { ...saveResult, packagePath: `${pkg.project.id}.loopcat.json` }
        );
      }
    },
    session: {
      getProject() {
        calls.push(["getProject"]);
        return currentProject;
      },
      replaceActivityEvents(events) {
        calls.push(["replaceActivityEvents", events]);
        if (overrides.replaceActivityError) throw overrides.replaceActivityError;
      }
    },
    autosave: {
      flush(projectId) {
        calls.push(["flush", projectId]);
        if (overrides.flushError && overrides.flushErrorProjectId === projectId) {
          return Promise.reject(overrides.flushError);
        }
        return Promise.resolve();
      }
    },
    build: {
      buildProjectPackage(project, segments, buildOptions) {
        buildCount += 1;
        calls.push(["buildProjectPackage", buildCount, project, segments, buildOptions]);
        if (overrides.buildErrorAt === buildCount) return Promise.reject(overrides.buildError);
        return Promise.resolve(packageFor(project, buildOptions));
      },
      assertValidProjectPackageForWrite(pkg, action) {
        calls.push(["assertValid", pkg, action]);
        if (overrides.validationErrorAt === buildCount) throw overrides.validationError;
      }
    },
    projects: {
      knownById(projectId) {
        calls.push(["knownById", projectId]);
        return knownProjects.find((project) => project?.id === projectId) || null;
      },
      list() {
        calls.push(["listProjects"]);
        if (overrides.listError) return Promise.reject(overrides.listError);
        return Promise.resolve(listedProjects);
      }
    },
    activity: {
      draft(project, type, summary, detail) {
        calls.push(["draftActivity", project, type, summary, detail]);
        if (overrides.draftError) throw overrides.draftError;
        return activityEvent;
      },
      bulkPut(storeName, records) {
        calls.push(["bulkPut", storeName, records]);
        if (overrides.bulkPutError) return Promise.reject(overrides.bulkPutError);
        return Promise.resolve();
      },
      list(projectId) {
        calls.push(["listActivity", projectId]);
        if (overrides.listActivityError) return Promise.reject(overrides.listActivityError);
        return Promise.resolve(overrides.activityEvents || [activityEvent]);
      }
    },
    workspace: {
      isConnected() {
        calls.push(["isConnected"]);
        return connected;
      },
      setStatus(nextStatus) {
        calls.push(["setWorkspaceStatus", nextStatus]);
        connected = Boolean(nextStatus?.connected);
      },
      markMissingLocalDirty() {
        calls.push(["markMissingLocalDirty"]);
        if (overrides.missingError) return Promise.reject(overrides.missingError);
        return Promise.resolve(overrides.missingCount || 0);
      },
      clearDirty(projectId) {
        calls.push(["clearDirty", projectId]);
        if (overrides.clearDirtyError) throw overrides.clearDirtyError;
      },
      markDirty(projectId) {
        calls.push(["markDirty", projectId]);
        if (overrides.markDirtyError) throw overrides.markDirtyError;
      },
      hasDirty() {
        calls.push(["hasDirty"]);
        return dirtyIds.length > 0;
      },
      dirtyIds() {
        dirtyReadCount += 1;
        calls.push(["dirtyIds", dirtyReadCount]);
        if (overrides.dirtyIdsErrorAt === dirtyReadCount) throw overrides.dirtyIdsError;
        return [...dirtyIds];
      },
      recoveryIds() {
        calls.push(["recoveryIds"]);
        return [...recoveryIds];
      },
      isAutosaving() {
        calls.push(["isAutosaving"]);
        return autosaving;
      },
      setAutosaving(value) {
        calls.push(["setAutosaving", value]);
        autosaving = value;
      },
      getAutosaveTimer() {
        calls.push(["getAutosaveTimer"]);
        return autosaveTimer;
      },
      setAutosaveTimer(timer) {
        calls.push(["setAutosaveTimer", timer]);
        autosaveTimer = timer;
      }
    },
    validation: {
      count(report) {
        calls.push(["countValidation", report]);
        return report?.noteCount || 0;
      }
    },
    presentation: {
      renderWorkspaceStatus() {
        calls.push(["renderWorkspaceStatus"]);
      },
      renderValidation(report) {
        calls.push(["renderValidation", report]);
      },
      renderBackupReminder() {
        calls.push(["renderBackupReminder"]);
        if (overrides.backupReminderError) throw overrides.backupReminderError;
      },
      renderRecovery() {
        calls.push(["renderRecovery"]);
      }
    },
    status: {
      set(message, mode) {
        calls.push(["status", message, mode]);
        if (overrides.statusErrorMessage === message) throw overrides.statusError;
      }
    },
    preferences: {
      saveToFolder() {
        calls.push(["saveToFolderPreference"]);
        return overrides.saveToFolder ?? true;
      }
    },
    timers: {
      clear(timer) {
        calls.push(["clearTimer", timer]);
      },
      set(callback, delayMs) {
        calls.push(["setTimer", callback, delayMs]);
        return overrides.newTimer || { id: "new-timer" };
      }
    },
    test: {
      shouldFailActivity() {
        calls.push(["shouldFailActivity"]);
        return overrides.simulateActivityFailure || false;
      }
    },
    logger: {
      warn(...args) {
        calls.push(["warn", ...args]);
      }
    }
  };
  return {
    calls,
    controller: createWorkspacePackageSaveController(options),
    setConnected(value) {
      connected = value;
    },
    setCurrentProject(value) {
      currentProject = value;
    },
    setDirtyIds(value) {
      dirtyIds = value;
    },
    getAutosaving() {
      return autosaving;
    }
  };
}

test("WorkspacePackageSaveController preserves unsupported and connected folder-selection outcomes", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const unsupported = createHarness(createWorkspacePackageSaveController, { supported: false });
  assert.equal(await unsupported.controller.chooseFolder(), undefined);
  assert.deepEqual(unsupported.calls, [
    ["isSupported"],
    ["status", "Folder storage is unavailable in this browser", "dirty"]
  ]);

  const connected = createHarness(createWorkspacePackageSaveController, {
    connected: false,
    missingCount: 2
  });
  assert.equal(await connected.controller.chooseFolder(), undefined);
  assert.deepEqual(connected.calls, [
    ["isSupported"],
    ["chooseFolder", { startIn: "documents" }],
    ["setWorkspaceStatus", { connected: true, name: "Workspace", projectCount: 1 }],
    ["markMissingLocalDirty"],
    ["renderWorkspaceStatus"],
    ["status", "Workspace folder connected; 2 local project packages need to be saved", "dirty"]
  ]);
});

test("WorkspacePackageSaveController preserves singular folder-selection grammar and delegate failures", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const singular = createHarness(createWorkspacePackageSaveController, { connected: false, missingCount: 1 });
  await singular.controller.chooseFolder();
  assert.deepEqual(singular.calls.at(-1), [
    "status",
    "Workspace folder connected; 1 local project package needs to be saved",
    "dirty"
  ]);

  const chooseError = new Error("folder denied");
  const failed = createHarness(createWorkspacePackageSaveController, { connected: false, chooseError });
  await assert.rejects(failed.controller.chooseFolder(), chooseError);
  assert.equal(
    failed.calls.some(([name]) => name === "setWorkspaceStatus"),
    false
  );
});

test("WorkspacePackageSaveController saves known and repository-fallback projects with exact active status policy", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const current = { id: "project-current" };
  const inactive = { id: "project-inactive" };
  const harness = createHarness(createWorkspacePackageSaveController, {
    currentProject: current,
    knownProjects: [current],
    listedProjects: [inactive]
  });
  const activeResult = await harness.controller.saveById(current.id, { activityEvents: [{ id: "event-1" }] });
  assert.equal(activeResult.pkg.project, current);
  assert.deepEqual(activeResult.pkg.options, { activityEvents: [{ id: "event-1" }] });
  assert.equal(harness.calls.filter(([name]) => name === "getStatus").length, 1);
  assert.deepEqual(harness.calls.at(-1), ["clearDirty", current.id]);

  harness.calls.length = 0;
  const inactiveResult = await harness.controller.saveById(inactive.id);
  assert.equal(inactiveResult.pkg.project, inactive);
  assert.equal(
    harness.calls.some(([name]) => name === "listProjects"),
    true
  );
  assert.equal(
    harness.calls.some(([name]) => name === "getStatus"),
    false
  );
  assert.deepEqual(harness.calls.at(-1), ["clearDirty", inactive.id]);
});

test("WorkspacePackageSaveController preserves missing-project and failed-save dirty timing", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const missing = createHarness(createWorkspacePackageSaveController, {
    knownProjects: [],
    listedProjects: []
  });
  await assert.rejects(missing.controller.saveById("missing"), /Project package could not be found/);
  assert.equal(
    missing.calls.some(([name]) => name === "markDirty"),
    false
  );

  const saveError = new Error("write failed");
  const failed = createHarness(createWorkspacePackageSaveController, { saveErrorAt: 1, saveError });
  await assert.rejects(failed.controller.saveById("project-1"), saveError);
  assert.deepEqual(failed.calls.at(-1), ["markDirty", "project-1"]);
});

test("WorkspacePackageSaveController completes manual current save with exact two-pass activity sequencing", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const harness = createHarness(createWorkspacePackageSaveController);
  assert.equal(await harness.controller.saveCurrent(), undefined);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "flush"),
    [
      ["flush", undefined],
      ["flush", "project-1"]
    ]
  );
  assert.equal(harness.calls.filter(([name]) => name === "buildProjectPackage").length, 2);
  assert.deepEqual(harness.calls.find(([name]) => name === "draftActivity").slice(2), [
    "workspace-save",
    "Project package saved to workspace folder",
    undefined
  ]);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "bulkPut"),
    ["bulkPut", "activityEvents", [{ id: "activity-workspace", projectId: "project-1" }]]
  );
  assert.deepEqual(harness.calls.at(-1), ["status", "Saved to project-1.loopcat.json", "saved"]);
});

test("WorkspacePackageSaveController preserves manual save connection, sidecar, and activity-warning branches", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const disconnected = createHarness(createWorkspacePackageSaveController, {
    connected: false,
    chosenStatus: { connected: false }
  });
  assert.equal(await disconnected.controller.saveCurrent(), undefined);
  assert.equal(disconnected.calls.filter(([name]) => name === "buildProjectPackage").length, 0);

  const sidecar = createHarness(createWorkspacePackageSaveController, {
    saveResult: { packagePath: "project.loopcat.json", validationReportSaved: false },
    noteCount: 1
  });
  await sidecar.controller.saveCurrent();
  assert.deepEqual(sidecar.calls.at(-1), [
    "status",
    "Saved to project.loopcat.json; validation report sidecar failed",
    "dirty"
  ]);

  const activityError = new Error("activity failed");
  const activityFailure = createHarness(createWorkspacePackageSaveController, { bulkPutError: activityError });
  await activityFailure.controller.saveCurrent();
  assert.deepEqual(
    activityFailure.calls.find(([name]) => name === "warn"),
    ["warn", "Workspace save activity log failed.", activityError]
  );
  assert.equal(
    activityFailure.calls.some(([name, projectId]) => name === "markDirty" && projectId === "project-1"),
    true
  );
  assert.deepEqual(activityFailure.calls.at(-1), [
    "status",
    "Saved to project-1.loopcat.json; activity log failed",
    "dirty"
  ]);
});

test("WorkspacePackageSaveController preserves simulated activity failure without drafting an event", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const harness = createHarness(createWorkspacePackageSaveController, { simulateActivityFailure: true });
  await harness.controller.saveCurrent();
  assert.equal(
    harness.calls.some(([name]) => name === "draftActivity"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "bulkPut"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "renderBackupReminder"),
    false
  );
  assert.deepEqual(harness.calls.at(-1), ["status", "Saved to project-1.loopcat.json; activity log failed", "dirty"]);
});

test("WorkspacePackageSaveController background autosave preserves guards, ordering, continuation, and cleanup", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const busy = createHarness(createWorkspacePackageSaveController, { autosaving: true });
  assert.equal(await busy.controller.autosaveDirty(), undefined);
  assert.deepEqual(busy.calls, [["isAutosaving"]]);

  const empty = createHarness(createWorkspacePackageSaveController, { dirtyIds: [] });
  await empty.controller.autosaveDirty();
  assert.equal(
    empty.calls.some(([name]) => name === "setAutosaving"),
    false
  );

  const saveError = new Error("first failed");
  const mixed = createHarness(createWorkspacePackageSaveController, {
    currentProject: { id: "project-2" },
    knownProjects: [{ id: "project-1" }, { id: "project-2" }],
    dirtyIds: ["project-1", "project-2"],
    saveErrorAt: 1,
    saveError
  });
  await mixed.controller.autosaveDirty();
  assert.equal(mixed.calls.filter(([name]) => name === "saveProjectPackage").length, 2);
  assert.deepEqual(
    mixed.calls.filter(([name]) => name === "setAutosaving"),
    [
      ["setAutosaving", true],
      ["setAutosaving", false]
    ]
  );
  assert.deepEqual(
    mixed.calls.find(([name]) => name === "status"),
    ["status", "1 background workspace save failed; other dirty packages were still attempted.", "dirty"]
  );
});

test("WorkspacePackageSaveController contains outer background failures and releases busy state", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const dirtyIdsError = new Error("");
  const harness = createHarness(createWorkspacePackageSaveController, {
    dirtyIdsErrorAt: 1,
    dirtyIdsError
  });
  assert.equal(await harness.controller.autosaveDirty(), undefined);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "warn"),
    ["warn", dirtyIdsError]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "status"),
    ["status", "Background workspace save failed", "dirty"]
  );
  assert.equal(harness.getAutosaving(), false);
});

test("WorkspacePackageSaveController preserves recovery and settings opt-in outcomes", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const noRecovery = createHarness(createWorkspacePackageSaveController, { recoveryIds: [] });
  assert.equal(await noRecovery.controller.saveRecovery(), undefined);
  assert.deepEqual(noRecovery.calls, [["recoveryIds"]]);

  const recovery = createHarness(createWorkspacePackageSaveController);
  await recovery.controller.saveRecovery();
  assert.equal(
    recovery.calls.some(([name, message]) => name === "status" && message === "Saving recovered workspace packages..."),
    true
  );
  assert.deepEqual(recovery.calls.at(-1), ["renderRecovery"]);

  const disabled = createHarness(createWorkspacePackageSaveController, { saveToFolder: false });
  assert.equal(await disabled.controller.maybeSaveFromSettings(), false);
  assert.deepEqual(disabled.calls, [["saveToFolderPreference"]]);

  const abort = Object.assign(new Error("canceled"), { name: "AbortError" });
  const canceled = createHarness(createWorkspacePackageSaveController, {
    connected: false,
    chooseError: abort
  });
  assert.equal(await canceled.controller.maybeSaveFromSettings(true), false);
  assert.deepEqual(canceled.calls.at(-1), ["status", "Project kept in browser cache", "saved"]);
});

test("WorkspacePackageSaveController replaces its timer and exposes an immutable checked API", async () => {
  const { createWorkspacePackageSaveController } = await loadFactory();
  const oldTimer = { id: "old-timer" };
  const harness = createHarness(createWorkspacePackageSaveController, { autosaveTimer: oldTimer });
  assert.equal(harness.controller.startAutosave(), undefined);
  assert.deepEqual(harness.calls[0], ["getAutosaveTimer"]);
  assert.deepEqual(harness.calls[1], ["getAutosaveTimer"]);
  assert.deepEqual(harness.calls[2], ["clearTimer", oldTimer]);
  assert.equal(harness.calls[3][0], "setTimer");
  assert.equal(harness.calls[3][1], harness.controller.autosaveDirty);
  assert.equal(harness.calls[3][2], 5 * 60 * 1000);
  assert.deepEqual(harness.calls[4], ["setAutosaveTimer", { id: "new-timer" }]);
  assert.equal(Object.isFrozen(harness.controller), true);
  harness.controller.extra = true;
  assert.equal(harness.controller.extra, undefined);

  assert.throws(
    () => createWorkspacePackageSaveController({}),
    /WorkspacePackageSaveController requires storage, session, autosave, build, project, activity, workspace, validation, presentation, status, preference, timer, test, and logger boundaries/
  );
});
