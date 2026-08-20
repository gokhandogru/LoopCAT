const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/workspace/workspace-sync-controller.js")).href);
}

function createHarness(createWorkspaceSyncController, overrides = {}) {
  const calls = [];
  const dirtyIds = new Set(overrides.dirtyIds || []);
  const references = overrides.references || [];
  const packageByPath = new Map(overrides.packages || []);
  const importResults = new Map(overrides.importResults || []);
  const workspaceStatus = overrides.workspaceStatus || { connected: true, warnings: [] };
  let storedWorkspaceStatus = overrides.initialWorkspaceStatus || null;
  let validationReport = null;
  let finalStatus = null;
  const options = {
    connection: {
      isConnected() {
        calls.push(["isConnected"]);
        return overrides.connected ?? true;
      }
    },
    autosave: {
      flush() {
        calls.push(["flush"]);
        if (overrides.flushError) return Promise.reject(overrides.flushError);
        return Promise.resolve();
      }
    },
    packages: {
      list() {
        calls.push(["listPackages"]);
        if (overrides.listError) return Promise.reject(overrides.listError);
        return Promise.resolve(references);
      },
      read(reference) {
        calls.push(["readPackage", reference.id]);
        if (overrides.readErrors?.has(reference.id)) return Promise.reject(overrides.readErrors.get(reference.id));
        return Promise.resolve(packageByPath.get(reference.id));
      }
    },
    dirty: {
      has(projectId) {
        calls.push(["hasDirty", projectId]);
        return dirtyIds.has(projectId);
      }
    },
    imports: {
      importProjectPackageData(pkg, importOptions) {
        calls.push(["importPackage", pkg?.project?.id, importOptions]);
        if (overrides.importErrors?.has(pkg?.project?.id)) {
          return Promise.reject(overrides.importErrors.get(pkg.project.id));
        }
        return Promise.resolve(importResults.has(pkg?.project?.id) ? importResults.get(pkg.project.id) : null);
      }
    },
    validation: {
      count(report) {
        calls.push(["countValidation", report]);
        return report?.noteCount || 0;
      }
    },
    text: {
      redact(value) {
        calls.push(["redact", value]);
        if (overrides.redact) return overrides.redact(value);
        return String(value ?? "").replaceAll("secret", "[redacted]");
      }
    },
    session: {
      replaceProject(project) {
        calls.push(["replaceProject", project]);
      },
      replaceSegments(segments) {
        calls.push(["replaceSegments", segments]);
      }
    },
    navigation: {
      openProjects() {
        calls.push(["openProjects"]);
      },
      clearSelection() {
        calls.push(["clearSelection"]);
      }
    },
    projects: {
      load(render) {
        calls.push(["loadProjects", render]);
        if (overrides.loadError) return Promise.reject(overrides.loadError);
        return Promise.resolve();
      }
    },
    workspace: {
      getStatus() {
        calls.push(["getWorkspaceStatus"]);
        if (overrides.statusError) return Promise.reject(overrides.statusError);
        return Promise.resolve(workspaceStatus);
      },
      setStatus(value) {
        calls.push(["setWorkspaceStatus", value]);
        storedWorkspaceStatus = value;
      }
    },
    presentation: {
      renderWorkspaceStatus() {
        calls.push(["renderWorkspaceStatus"]);
      },
      renderValidation(report) {
        calls.push(["renderValidation", report]);
        validationReport = report;
      }
    },
    status: {
      set(message, mode) {
        calls.push(["setStatus", message, mode]);
        finalStatus = { message, mode };
      }
    }
  };
  for (const [name, boundary] of Object.entries(overrides.boundaries || {})) {
    options[name] = { ...options[name], ...boundary };
  }
  const controller = createWorkspaceSyncController(options);
  return {
    calls,
    controller,
    dirtyIds,
    getFinalStatus: () => finalStatus,
    getStoredWorkspaceStatus: () => storedWorkspaceStatus,
    getValidationReport: () => validationReport
  };
}

test("WorkspaceSyncController preserves the disconnected no-op before autosave", async () => {
  const { createWorkspaceSyncController } = await loadFactory();
  const harness = createHarness(createWorkspaceSyncController, { connected: false });

  assert.equal(await harness.controller.sync(), undefined);
  assert.deepEqual(harness.calls, [["isConnected"]]);
});

test("WorkspaceSyncController synchronizes packages sequentially with exact import and completion effects", async () => {
  const { createWorkspaceSyncController } = await loadFactory();
  const firstPackage = { project: { id: "project-1", name: "Project one" } };
  const secondPackage = { project: { id: "project-2", name: "" } };
  const firstResult = { pkg: firstPackage, validation: { noteCount: 0 } };
  const secondResult = { pkg: secondPackage, validation: { noteCount: 0 } };
  const workspaceStatus = { connected: true, warnings: [] };
  const harness = createHarness(createWorkspaceSyncController, {
    references: [
      { id: "reference-1", name: "Reference one", packagePath: "one.loopcat.json" },
      { id: "reference-2", name: "Reference two", packagePath: "two.loopcat.json" }
    ],
    packages: [
      ["reference-1", firstPackage],
      ["reference-2", secondPackage]
    ],
    importResults: [
      ["project-1", firstResult],
      ["project-2", secondResult]
    ],
    workspaceStatus
  });

  await harness.controller.sync();

  const imports = harness.calls.filter(([name]) => name === "importPackage");
  assert.deepEqual(imports, [
    [
      "importPackage",
      "project-1",
      {
        sourceName: "one.loopcat.json",
        replaceExisting: true,
        open: false,
        sourceIsWorkspace: true,
        suppressAlert: true
      }
    ],
    [
      "importPackage",
      "project-2",
      {
        sourceName: "two.loopcat.json",
        replaceExisting: true,
        open: false,
        sourceIsWorkspace: true,
        suppressAlert: true
      }
    ]
  ]);
  assert.deepEqual(harness.getValidationReport(), {
    ok: true,
    errors: [],
    warnings: [],
    preserved: ["2 project packages synced from the workspace folder."],
    simplified: [],
    skipped: [],
    risky: []
  });
  assert.deepEqual(harness.getFinalStatus(), { message: "Workspace synced", mode: "saved" });
  assert.equal(harness.getStoredWorkspaceStatus(), workspaceStatus);
  assert.deepEqual(
    harness.calls.filter(([name]) =>
      [
        "replaceProject",
        "replaceSegments",
        "openProjects",
        "clearSelection",
        "loadProjects",
        "getWorkspaceStatus",
        "setWorkspaceStatus",
        "renderWorkspaceStatus",
        "renderValidation",
        "setStatus"
      ].includes(name)
    ),
    [
      ["replaceProject", null],
      ["replaceSegments", []],
      ["openProjects"],
      ["clearSelection"],
      ["loadProjects", false],
      ["getWorkspaceStatus"],
      ["setWorkspaceStatus", workspaceStatus],
      ["renderWorkspaceStatus"],
      ["renderValidation", harness.getValidationReport()],
      ["setStatus", "Workspace synced", "saved"]
    ]
  );
});

test("WorkspaceSyncController skips dirty reference identities before reading packages", async () => {
  const { createWorkspaceSyncController } = await loadFactory();
  const harness = createHarness(createWorkspaceSyncController, {
    references: [{ id: "dirty-reference", name: "Dirty reference", packagePath: "dirty.loopcat.json" }],
    dirtyIds: ["dirty-reference"]
  });

  await harness.controller.sync();

  assert.equal(
    harness.calls.some(([name]) => name === "readPackage"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "importPackage"),
    false
  );
  assert.deepEqual(harness.getValidationReport().warnings, [
    "Dirty reference: local package has unsaved folder changes; save it before syncing from the workspace folder."
  ]);
  assert.deepEqual(harness.getFinalStatus(), {
    message: "Workspace sync completed with warnings",
    mode: "dirty"
  });
});

test("WorkspaceSyncController skips dirty package project identities after reading", async () => {
  const { createWorkspaceSyncController } = await loadFactory();
  const harness = createHarness(createWorkspaceSyncController, {
    references: [{ id: "reference", name: "Workspace copy", packagePath: "copy.loopcat.json" }],
    packages: [["reference", { project: { id: "dirty-project", name: "Package project" } }]],
    dirtyIds: ["dirty-project"]
  });

  await harness.controller.sync();

  assert.deepEqual(
    harness.calls.filter(([name]) => ["readPackage", "hasDirty", "importPackage"].includes(name)),
    [
      ["hasDirty", "reference"],
      ["readPackage", "reference"],
      ["hasDirty", "dirty-project"]
    ]
  );
  assert.deepEqual(harness.getValidationReport().warnings, [
    "Workspace copy: local package has unsaved folder changes; save it before syncing from the workspace folder."
  ]);
});

test("WorkspaceSyncController preserves validation-note grammar and invalid-package warnings", async () => {
  const { createWorkspaceSyncController } = await loadFactory();
  const packages = [
    { project: { id: "singular", name: "Singular" } },
    { project: { id: "plural", name: "Plural" } },
    { project: { id: "invalid", name: "Invalid" } }
  ];
  const harness = createHarness(createWorkspaceSyncController, {
    references: packages.map((pkg) => ({
      id: pkg.project.id,
      name: `${pkg.project.name} reference`,
      packagePath: `${pkg.project.id}.loopcat.json`
    })),
    packages: packages.map((pkg) => [pkg.project.id, pkg]),
    importResults: [
      ["singular", { pkg: packages[0], validation: { noteCount: 1 } }],
      ["plural", { pkg: packages[1], validation: { noteCount: 2 } }],
      ["invalid", null]
    ]
  });

  await harness.controller.sync();

  assert.deepEqual(harness.getValidationReport().warnings, [
    "Singular: imported with 1 validation note.",
    "Plural: imported with 2 validation notes.",
    "Invalid reference: package failed validation and was skipped."
  ]);
  assert.deepEqual(harness.getValidationReport().preserved, ["2 project packages synced from the workspace folder."]);
});

test("WorkspaceSyncController contains package failures and redacts and deduplicates final warnings", async () => {
  const { createWorkspaceSyncController } = await loadFactory();
  const secretMessage = "Secret package: secret read failure";
  const harness = createHarness(createWorkspaceSyncController, {
    references: [{ id: "broken", name: "Secret package", packagePath: "broken.loopcat.json" }],
    readErrors: new Map([["broken", new Error("secret read failure")]]),
    workspaceStatus: {
      connected: true,
      warnings: [secretMessage, "", secretMessage]
    }
  });

  await harness.controller.sync();

  assert.deepEqual(harness.getValidationReport().warnings, ["Secret package: [redacted] read failure"]);
  assert.deepEqual(harness.getValidationReport().preserved, ["0 project packages synced from the workspace folder."]);
  assert.equal(
    harness.calls.some(([name]) => name === "replaceProject"),
    true
  );
});

test("WorkspaceSyncController preserves blank-warning suppression and a clean zero-package result", async () => {
  const { createWorkspaceSyncController } = await loadFactory();
  const harness = createHarness(createWorkspaceSyncController, {
    references: [{ id: "invalid", name: "Invalid", packagePath: "invalid.loopcat.json" }],
    packages: [["invalid", { project: { id: "invalid" } }]],
    importResults: [["invalid", null]],
    redact: () => "   "
  });

  await harness.controller.sync();

  assert.deepEqual(harness.getValidationReport().warnings, []);
  assert.equal(harness.getValidationReport().ok, true);
  assert.deepEqual(harness.getFinalStatus(), { message: "Workspace synced", mode: "saved" });
});

test("WorkspaceSyncController propagates primary failures before post-loop effects", async () => {
  const { createWorkspaceSyncController } = await loadFactory();
  const listError = new Error("list failed");
  const harness = createHarness(createWorkspaceSyncController, { listError });

  await assert.rejects(harness.controller.sync(), listError);
  assert.deepEqual(harness.calls, [["isConnected"], ["flush"], ["listPackages"]]);
});

test("WorkspaceSyncController preserves completed reset effects before a late project-load failure", async () => {
  const { createWorkspaceSyncController } = await loadFactory();
  const loadError = new Error("load failed");
  const harness = createHarness(createWorkspaceSyncController, { loadError });

  await assert.rejects(harness.controller.sync(), loadError);
  assert.deepEqual(harness.calls.slice(-5), [
    ["replaceProject", null],
    ["replaceSegments", []],
    ["openProjects"],
    ["clearSelection"],
    ["loadProjects", false]
  ]);
  assert.equal(harness.getValidationReport(), null);
  assert.equal(harness.getFinalStatus(), null);
});

test("WorkspaceSyncController validates boundaries and exposes an immutable API", async () => {
  const { createWorkspaceSyncController } = await loadFactory();
  assert.throws(
    () => createWorkspaceSyncController({}),
    new TypeError(
      "WorkspaceSyncController requires connection, autosave, package, dirty, import, validation, text, session, navigation, project, workspace, presentation, and status boundaries."
    )
  );
  const harness = createHarness(createWorkspaceSyncController);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.deepEqual(Object.keys(harness.controller), ["sync"]);
});
