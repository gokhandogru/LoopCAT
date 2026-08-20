const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(
    pathToFileURL(path.join(rootPath, "src/features/workspace/workspace-backup-export-controller.js")).href
  );
}

function createHarness(createWorkspaceBackupExportController, overrides = {}) {
  const calls = [];
  const backup = overrides.backup || { app: "LoopCAT", projects: [] };
  const validationReport = overrides.validationReport || { ok: true, noteCount: 0 };
  const reference = overrides.reference || { path: "backups/loopcat-backup.json", manifestSaved: true };
  const workspaceStatus = overrides.workspaceStatus || { connected: true, backupCount: 1 };
  const generatedErrorReport = overrides.generatedErrorReport || { ok: false, errors: ["generated"] };
  let renderValidationCount = 0;
  let statusSetCount = 0;
  let storedWorkspaceStatus = null;
  const options = {
    connection: {
      isConnected() {
        calls.push(["isConnected"]);
        return overrides.connected ?? true;
      }
    },
    build: {
      buildBackupExport() {
        calls.push(["buildBackupExport"]);
        if (overrides.buildError) return Promise.reject(overrides.buildError);
        return Promise.resolve({ backup, validation: validationReport });
      }
    },
    storage: {
      exportFullBackup(value) {
        calls.push(["exportFullBackup", value]);
        if (overrides.exportError) return Promise.reject(overrides.exportError);
        return Promise.resolve(reference);
      },
      getStatus() {
        calls.push(["getWorkspaceStatus"]);
        if (overrides.getStatusError) return Promise.reject(overrides.getStatusError);
        return Promise.resolve(workspaceStatus);
      }
    },
    workspace: {
      setStatus(value) {
        calls.push(["setWorkspaceStatus", value]);
        if (overrides.setWorkspaceError) throw overrides.setWorkspaceError;
        storedWorkspaceStatus = value;
      }
    },
    validation: {
      count(report) {
        calls.push(["countValidation", report]);
        if (overrides.countError) throw overrides.countError;
        return report?.noteCount || 0;
      },
      errorReport(message) {
        calls.push(["errorReport", message]);
        if (overrides.errorReportError) throw overrides.errorReportError;
        return generatedErrorReport;
      }
    },
    presentation: {
      renderWorkspaceStatus() {
        calls.push(["renderWorkspaceStatus"]);
        if (overrides.renderWorkspaceError) throw overrides.renderWorkspaceError;
      },
      renderValidation(report) {
        renderValidationCount += 1;
        calls.push(["renderValidation", renderValidationCount, report]);
        if (overrides.renderValidationErrorAt === renderValidationCount) throw overrides.renderValidationError;
      }
    },
    status: {
      set(message, mode) {
        statusSetCount += 1;
        calls.push(["setStatus", statusSetCount, message, mode]);
        if (overrides.statusErrorAt === statusSetCount) throw overrides.statusError;
      }
    }
  };
  for (const [name, boundary] of Object.entries(overrides.boundaries || {})) {
    options[name] = { ...options[name], ...boundary };
  }
  const controller = createWorkspaceBackupExportController(options);
  return {
    backup,
    calls,
    controller,
    generatedErrorReport,
    getStoredWorkspaceStatus: () => storedWorkspaceStatus,
    reference,
    validationReport,
    workspaceStatus
  };
}

test("WorkspaceBackupExportController preserves the disconnected no-op before backup construction", async () => {
  const { createWorkspaceBackupExportController } = await loadFactory();
  const harness = createHarness(createWorkspaceBackupExportController, { connected: false });

  assert.equal(await harness.controller.exportBackup(), undefined);
  assert.deepEqual(harness.calls, [["isConnected"]]);
});

test("WorkspaceBackupExportController exports a clean backup with exact refresh and presentation order", async () => {
  const { createWorkspaceBackupExportController } = await loadFactory();
  const harness = createHarness(createWorkspaceBackupExportController);

  assert.equal(await harness.controller.exportBackup(), undefined);
  assert.deepEqual(harness.calls, [
    ["isConnected"],
    ["buildBackupExport"],
    ["exportFullBackup", harness.backup],
    ["getWorkspaceStatus"],
    ["setWorkspaceStatus", harness.workspaceStatus],
    ["renderWorkspaceStatus"],
    ["renderValidation", 1, harness.validationReport],
    ["countValidation", harness.validationReport],
    ["setStatus", 1, "Workspace backup saved: backups/loopcat-backup.json", "saved"]
  ]);
  assert.equal(harness.getStoredWorkspaceStatus(), harness.workspaceStatus);
});

test("WorkspaceBackupExportController preserves manifest-warning suffix and validation-count short circuit", async () => {
  const { createWorkspaceBackupExportController } = await loadFactory();
  const harness = createHarness(createWorkspaceBackupExportController, {
    reference: { path: "backups/manifest-warning.json", manifestSaved: false },
    validationReport: { ok: true, noteCount: 3 }
  });

  await harness.controller.exportBackup();

  assert.equal(
    harness.calls.some(([name]) => name === "countValidation"),
    false
  );
  assert.deepEqual(harness.calls.at(-1), [
    "setStatus",
    1,
    "Workspace backup saved: backups/manifest-warning.json; manifest update failed",
    "dirty"
  ]);
});

test("WorkspaceBackupExportController marks a manifest-success backup dirty for validation notes", async () => {
  const { createWorkspaceBackupExportController } = await loadFactory();
  const harness = createHarness(createWorkspaceBackupExportController, {
    validationReport: { ok: true, noteCount: 2 }
  });

  await harness.controller.exportBackup();

  assert.deepEqual(harness.calls.slice(-2), [
    ["countValidation", harness.validationReport],
    ["setStatus", 1, "Workspace backup saved: backups/loopcat-backup.json", "dirty"]
  ]);
});

test("WorkspaceBackupExportController preserves attached validation on primary build failure", async () => {
  const { createWorkspaceBackupExportController } = await loadFactory();
  const attachedValidation = { ok: false, errors: ["attached"] };
  const buildError = Object.assign(new Error("Cannot export backup"), { validation: attachedValidation });
  const harness = createHarness(createWorkspaceBackupExportController, { buildError });

  await assert.rejects(harness.controller.exportBackup(), buildError);

  assert.deepEqual(harness.calls, [
    ["isConnected"],
    ["buildBackupExport"],
    ["renderValidation", 1, attachedValidation],
    ["setStatus", 1, "Cannot export backup", "dirty"]
  ]);
});

test("WorkspaceBackupExportController generates a fallback report and fallback message for write failure", async () => {
  const { createWorkspaceBackupExportController } = await loadFactory();
  const exportError = new Error("");
  const harness = createHarness(createWorkspaceBackupExportController, { exportError });

  await assert.rejects(harness.controller.exportBackup(), exportError);

  assert.deepEqual(harness.calls.slice(-3), [
    ["errorReport", "Workspace backup failed."],
    ["renderValidation", 1, harness.generatedErrorReport],
    ["setStatus", 1, "Workspace backup failed.", "dirty"]
  ]);
});

test("WorkspaceBackupExportController preserves durable write before a late workspace-refresh failure", async () => {
  const { createWorkspaceBackupExportController } = await loadFactory();
  const getStatusError = new Error("Workspace status failed");
  const harness = createHarness(createWorkspaceBackupExportController, { getStatusError });

  await assert.rejects(harness.controller.exportBackup(), getStatusError);

  assert.deepEqual(harness.calls.slice(0, 4), [
    ["isConnected"],
    ["buildBackupExport"],
    ["exportFullBackup", harness.backup],
    ["getWorkspaceStatus"]
  ]);
  assert.deepEqual(harness.calls.slice(-3), [
    ["errorReport", "Workspace status failed"],
    ["renderValidation", 1, harness.generatedErrorReport],
    ["setStatus", 1, "Workspace status failed", "dirty"]
  ]);
});

test("WorkspaceBackupExportController contains late rendering and validation-count failures with exact rethrow", async () => {
  const { createWorkspaceBackupExportController } = await loadFactory();
  const renderError = new Error("Workspace render failed");
  const renderHarness = createHarness(createWorkspaceBackupExportController, { renderWorkspaceError: renderError });
  await assert.rejects(renderHarness.controller.exportBackup(), renderError);
  assert.deepEqual(renderHarness.calls.slice(-3), [
    ["errorReport", "Workspace render failed"],
    ["renderValidation", 1, renderHarness.generatedErrorReport],
    ["setStatus", 1, "Workspace render failed", "dirty"]
  ]);

  const countError = new Error("Validation count failed");
  const countHarness = createHarness(createWorkspaceBackupExportController, { countError });
  await assert.rejects(countHarness.controller.exportBackup(), countError);
  assert.deepEqual(countHarness.calls.slice(-4), [
    ["countValidation", countHarness.validationReport],
    ["errorReport", "Validation count failed"],
    ["renderValidation", 2, countHarness.generatedErrorReport],
    ["setStatus", 1, "Validation count failed", "dirty"]
  ]);
});

test("WorkspaceBackupExportController preserves first status failure recovery and original error identity", async () => {
  const { createWorkspaceBackupExportController } = await loadFactory();
  const statusError = new Error("Success status failed");
  const harness = createHarness(createWorkspaceBackupExportController, { statusErrorAt: 1, statusError });

  await assert.rejects(harness.controller.exportBackup(), statusError);

  assert.deepEqual(harness.calls.slice(-4), [
    ["setStatus", 1, "Workspace backup saved: backups/loopcat-backup.json", "saved"],
    ["errorReport", "Success status failed"],
    ["renderValidation", 2, harness.generatedErrorReport],
    ["setStatus", 2, "Success status failed", "dirty"]
  ]);
});

test("WorkspaceBackupExportController validates boundaries and exposes an immutable API", async () => {
  const { createWorkspaceBackupExportController } = await loadFactory();
  assert.throws(
    () => createWorkspaceBackupExportController({}),
    new TypeError(
      "WorkspaceBackupExportController requires connection, build, storage, workspace, validation, presentation, and status boundaries."
    )
  );
  const harness = createHarness(createWorkspaceBackupExportController);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.deepEqual(Object.keys(harness.controller), ["exportBackup"]);
});
