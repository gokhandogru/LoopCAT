const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");

function loadFactory() {
  return import(
    pathToFileURL(path.join(root, "src/features/workspace/workspace-recovery-presentation-service.js")).href
  );
}

function createHarness(createWorkspaceRecoveryPresentationService, overrides = {}) {
  const calls = [];
  const rendered = { status: [], recovery: [], projectStorage: [] };
  const model = {
    status: Object.hasOwn(overrides, "status") ? overrides.status : { supported: true, connected: true },
    durability: Object.hasOwn(overrides, "durability") ? overrides.durability : { checked: true, persisted: true },
    importTask: Object.hasOwn(overrides, "importTask") ? overrides.importTask : null,
    recovery: new Set(overrides.recoveryIds || []),
    dirty: new Set(overrides.dirtyIds || []),
    autosaving: Object.hasOwn(overrides, "autosaving") ? overrides.autosaving : false,
    currentProject: Object.hasOwn(overrides, "currentProject") ? overrides.currentProject : null,
    knownProjects: new Map(overrides.knownProjects || [])
  };
  let statusRead = 0;
  let durabilityRead = 0;
  let dirtyRead = 0;
  const dependencies = {
    available: Object.hasOwn(overrides, "available") ? overrides.available : true,
    state: {
      getStatus() {
        calls.push(["getStatus"]);
        if (overrides.getStatusError) throw overrides.getStatusError;
        const reads = overrides.statusReads;
        if (!reads) return model.status;
        const value = reads[Math.min(statusRead, reads.length - 1)];
        statusRead += 1;
        return value;
      },
      getDurability() {
        calls.push(["getDurability"]);
        if (overrides.getDurabilityError) throw overrides.getDurabilityError;
        const reads = overrides.durabilityReads;
        if (!reads) return model.durability;
        const value = reads[Math.min(durabilityRead, reads.length - 1)];
        durabilityRead += 1;
        return value;
      },
      getImportTask() {
        calls.push(["getImportTask"]);
        if (overrides.getImportTaskError) throw overrides.getImportTaskError;
        return model.importTask;
      },
      getRecovery() {
        calls.push(["getRecovery"]);
        if (overrides.getRecoveryError) throw overrides.getRecoveryError;
        return model.recovery;
      },
      getDirty() {
        dirtyRead += 1;
        calls.push(["getDirty", dirtyRead]);
        if (overrides.getDirtyErrorAt === dirtyRead) throw overrides.getDirtyError;
        return model.dirty;
      },
      getAutosaving() {
        calls.push(["getAutosaving"]);
        if (overrides.getAutosavingError) throw overrides.getAutosavingError;
        return model.autosaving;
      }
    },
    dirty: {
      visibleCount(status) {
        calls.push(["visibleCount", status]);
        if (overrides.visibleCountError) throw overrides.visibleCountError;
        return Object.hasOwn(overrides, "visibleCount") ? overrides.visibleCount : model.dirty.size;
      }
    },
    projects: {
      getCurrent() {
        calls.push(["getCurrent"]);
        if (overrides.getCurrentError) throw overrides.getCurrentError;
        return model.currentProject;
      },
      knownById(projectId) {
        calls.push(["knownById", projectId]);
        if (overrides.knownByIdError === projectId) throw overrides.knownByIdFailure;
        return model.knownProjects.get(projectId) || null;
      }
    },
    durability: {
      warnings(info) {
        calls.push(["warnings", info]);
        if (overrides.warningsError) throw overrides.warningsError;
        return Object.hasOwn(overrides, "storageWarnings") ? overrides.storageWarnings : [];
      },
      line(info) {
        calls.push(["line", info]);
        if (overrides.lineError) throw overrides.lineError;
        return Object.hasOwn(overrides, "storageLine") ? overrides.storageLine : "storage line";
      }
    },
    recovery: {
      renderStatus(viewModel) {
        calls.push(["renderStatus"]);
        rendered.status.push(viewModel);
        if (overrides.renderStatusError) throw overrides.renderStatusError;
        return overrides.renderStatusResult;
      },
      renderRecovery(viewModel) {
        calls.push(["renderRecovery"]);
        rendered.recovery.push(viewModel);
        if (overrides.renderRecoveryError) throw overrides.renderRecoveryError;
        return overrides.renderRecoveryResult;
      },
      renderProjectStorage(viewModel) {
        calls.push(["renderProjectStorage"]);
        rendered.projectStorage.push(viewModel);
        if (overrides.renderProjectStorageError) throw overrides.renderProjectStorageError;
        return overrides.renderProjectStorageResult;
      }
    }
  };
  return {
    calls,
    rendered,
    model,
    dependencies,
    service: createWorkspaceRecoveryPresentationService(dependencies)
  };
}

test("WorkspaceRecoveryPresentationService preserves recovery Set order and repeated dirty reads", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const harness = createHarness(createWorkspaceRecoveryPresentationService, {
    recoveryIds: ["recovery-only", "b", "a"],
    dirtyIds: ["a", "b"]
  });
  const first = harness.service.ids();
  const second = harness.service.ids();
  assert.deepEqual(first, ["b", "a"]);
  assert.deepEqual(second, ["b", "a"]);
  assert.notStrictEqual(first, second);
  assert.deepEqual(harness.calls, [
    ["getRecovery"],
    ["getDirty", 1],
    ["getDirty", 2],
    ["getDirty", 3],
    ["getRecovery"],
    ["getDirty", 4],
    ["getDirty", 5],
    ["getDirty", 6]
  ]);
});

test("WorkspaceRecoveryPresentationService preserves partial recovery filtering failure timing", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const failure = new Error("dirty lookup failed");
  const harness = createHarness(createWorkspaceRecoveryPresentationService, {
    recoveryIds: ["a", "b", "c"],
    dirtyIds: ["a", "b", "c"],
    getDirtyErrorAt: 2,
    getDirtyError: failure
  });
  assert.throws(() => harness.service.ids(), failure);
  assert.deepEqual(harness.calls, [["getRecovery"], ["getDirty", 1], ["getDirty", 2]]);
});

test("WorkspaceRecoveryPresentationService preserves the unavailable-workspace status no-op", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const harness = createHarness(createWorkspaceRecoveryPresentationService, { available: false });
  assert.equal(harness.service.renderStatus(), undefined);
  assert.equal(harness.service.renderProjectStorage(), undefined);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.rendered, { status: [], recovery: [], projectStorage: [] });
});

test("WorkspaceRecoveryPresentationService preserves live project-storage view models and fallback", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const status = { supported: true, connected: true };
  const harness = createHarness(createWorkspaceRecoveryPresentationService, {
    statusReads: [status, null],
    renderProjectStorageResult: "ignored"
  });

  assert.equal(harness.service.renderProjectStorage(), undefined);
  assert.equal(harness.service.renderProjectStorage(), undefined);
  assert.deepEqual(harness.rendered.projectStorage, [{ status }, { status: {} }]);
  assert.notStrictEqual(harness.rendered.projectStorage[0], harness.rendered.projectStorage[1]);
  assert.deepEqual(
    harness.calls.map((entry) => entry[0]),
    ["getStatus", "renderProjectStorage", "getStatus", "renderProjectStorage"]
  );
});

test("WorkspaceRecoveryPresentationService preserves project-storage failure timing", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const statusFailure = new Error("status failed");
  const statusHarness = createHarness(createWorkspaceRecoveryPresentationService, {
    getStatusError: statusFailure
  });
  assert.throws(() => statusHarness.service.renderProjectStorage(), statusFailure);
  assert.deepEqual(statusHarness.calls, [["getStatus"]]);
  assert.deepEqual(statusHarness.rendered.projectStorage, []);

  const renderFailure = new Error("project storage failed");
  const renderHarness = createHarness(createWorkspaceRecoveryPresentationService, {
    renderProjectStorageError: renderFailure
  });
  assert.throws(() => renderHarness.service.renderProjectStorage(), renderFailure);
  assert.deepEqual(
    renderHarness.calls.map((entry) => entry[0]),
    ["getStatus", "renderProjectStorage"]
  );
  assert.equal(renderHarness.rendered.projectStorage.length, 1);
});

test("WorkspaceRecoveryPresentationService preserves exact status-before-recovery view models and order", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const status = { supported: true, connected: true, mode: "workspace" };
  const recoveryStatus = { supported: true, connected: false, mode: "browser-cache" };
  const warningDurability = { checked: true, persisted: false };
  const lineDurability = { checked: true, persisted: true };
  const importTask = { name: "Import" };
  const currentProject = { id: "current" };
  const storageWarnings = ["warning"];
  const harness = createHarness(createWorkspaceRecoveryPresentationService, {
    statusReads: [status, recoveryStatus],
    durabilityReads: [warningDurability, lineDurability],
    importTask,
    currentProject,
    recoveryIds: ["unused", "b", "a"],
    dirtyIds: ["a", "b"],
    knownProjects: [
      ["b", { id: "b", name: "Beta" }],
      ["a", { id: "a", name: "" }]
    ],
    visibleCount: 7,
    storageWarnings,
    storageLine: "persistent storage",
    autosaving: "saving",
    renderStatusResult: "ignored status",
    renderRecoveryResult: "ignored recovery"
  });
  assert.equal(harness.service.renderStatus(), undefined);
  assert.deepEqual(harness.rendered.status, [
    {
      status,
      dirtyCount: 7,
      storageLine: "persistent storage",
      storageWarnings,
      importBusy: true,
      hasProject: true
    }
  ]);
  assert.deepEqual(harness.rendered.recovery, [
    {
      status: recoveryStatus,
      projects: [
        { id: "b", name: "Beta" },
        { id: "a", name: "a" }
      ],
      autosaving: "saving"
    }
  ]);
  assert.deepEqual(
    harness.calls.map((entry) => entry[0]),
    [
      "getStatus",
      "visibleCount",
      "getDurability",
      "warnings",
      "getDurability",
      "line",
      "getImportTask",
      "getCurrent",
      "renderStatus",
      "getRecovery",
      "getDirty",
      "getDirty",
      "getDirty",
      "getStatus",
      "knownById",
      "knownById",
      "getAutosaving",
      "renderRecovery"
    ]
  );
});

test("WorkspaceRecoveryPresentationService preserves falsy status, flag, and project-name fallbacks", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const harness = createHarness(createWorkspaceRecoveryPresentationService, {
    statusReads: [null, undefined],
    importTask: 0,
    currentProject: "",
    recoveryIds: ["missing", "zero-name"],
    dirtyIds: ["missing", "zero-name"],
    knownProjects: [["zero-name", { name: 0 }]],
    autosaving: 0
  });
  assert.equal(harness.service.renderStatus(), undefined);
  assert.deepEqual(harness.rendered.status[0], {
    status: {},
    dirtyCount: 2,
    storageLine: "storage line",
    storageWarnings: [],
    importBusy: false,
    hasProject: false
  });
  assert.deepEqual(harness.rendered.recovery[0], {
    status: {},
    projects: [
      { id: "missing", name: "missing" },
      { id: "zero-name", name: "zero-name" }
    ],
    autosaving: 0
  });
  assert.notStrictEqual(harness.rendered.status[0].status, harness.rendered.recovery[0].status);
});

test("WorkspaceRecoveryPresentationService renders recovery directly even when workspace is unavailable", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const status = { supported: true };
  const harness = createHarness(createWorkspaceRecoveryPresentationService, {
    available: false,
    status,
    recoveryIds: ["project"],
    dirtyIds: ["project"],
    knownProjects: [["project", { name: "Project" }]],
    autosaving: true,
    renderRecoveryResult: "ignored"
  });
  assert.equal(harness.service.renderRecovery(), undefined);
  assert.deepEqual(harness.rendered.recovery, [
    { status, projects: [{ id: "project", name: "Project" }], autosaving: true }
  ]);
  assert.deepEqual(
    harness.calls.map((entry) => entry[0]),
    ["getRecovery", "getDirty", "getStatus", "knownById", "getAutosaving", "renderRecovery"]
  );
});

test("WorkspaceRecoveryPresentationService stops recovery when status presentation fails", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const failure = new Error("status render failed");
  const harness = createHarness(createWorkspaceRecoveryPresentationService, { renderStatusError: failure });
  assert.throws(() => harness.service.renderStatus(), failure);
  assert.deepEqual(
    harness.calls.map((entry) => entry[0]),
    [
      "getStatus",
      "visibleCount",
      "getDurability",
      "warnings",
      "getDurability",
      "line",
      "getImportTask",
      "getCurrent",
      "renderStatus"
    ]
  );
  assert.deepEqual(harness.rendered.recovery, []);
});

test("WorkspaceRecoveryPresentationService preserves durability and recovery failure timing", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const warningFailure = new Error("warning failed");
  const warningHarness = createHarness(createWorkspaceRecoveryPresentationService, {
    warningsError: warningFailure
  });
  assert.throws(() => warningHarness.service.renderStatus(), warningFailure);
  assert.deepEqual(
    warningHarness.calls.map((entry) => entry[0]),
    ["getStatus", "visibleCount", "getDurability", "warnings"]
  );

  const lineFailure = new Error("line failed");
  const lineHarness = createHarness(createWorkspaceRecoveryPresentationService, { lineError: lineFailure });
  assert.throws(() => lineHarness.service.renderStatus(), lineFailure);
  assert.deepEqual(
    lineHarness.calls.map((entry) => entry[0]),
    ["getStatus", "visibleCount", "getDurability", "warnings", "getDurability", "line"]
  );

  const lookupFailure = new Error("lookup failed");
  const recoveryHarness = createHarness(createWorkspaceRecoveryPresentationService, {
    recoveryIds: ["a", "b"],
    dirtyIds: ["a", "b"],
    knownByIdError: "b",
    knownByIdFailure: lookupFailure
  });
  assert.throws(() => recoveryHarness.service.renderRecovery(), lookupFailure);
  assert.deepEqual(
    recoveryHarness.calls.map((entry) => entry[0]),
    ["getRecovery", "getDirty", "getDirty", "getStatus", "knownById", "knownById"]
  );
  assert.deepEqual(recoveryHarness.rendered.recovery, []);
});

test("WorkspaceRecoveryPresentationService validates every boundary and exposes an immutable API", async () => {
  const { createWorkspaceRecoveryPresentationService } = await loadFactory();
  const valid = createHarness(createWorkspaceRecoveryPresentationService).dependencies;
  const required = [
    ["state", "getStatus"],
    ["state", "getDurability"],
    ["state", "getImportTask"],
    ["state", "getRecovery"],
    ["state", "getDirty"],
    ["state", "getAutosaving"],
    ["dirty", "visibleCount"],
    ["projects", "getCurrent"],
    ["projects", "knownById"],
    ["durability", "warnings"],
    ["durability", "line"],
    ["recovery", "renderStatus"],
    ["recovery", "renderRecovery"],
    ["recovery", "renderProjectStorage"]
  ];
  for (const [owner, method] of required) {
    const dependencies = { ...valid, [owner]: { ...valid[owner], [method]: undefined } };
    assert.throws(
      () => createWorkspaceRecoveryPresentationService(dependencies),
      /requires checked availability, state, dirty-state, project, durability, and recovery boundaries/
    );
  }
  assert.throws(
    () => createWorkspaceRecoveryPresentationService({ ...valid, available: "yes" }),
    /requires checked availability/
  );
  const service = createWorkspaceRecoveryPresentationService(valid);
  assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(Object.keys(service), ["ids", "renderStatus", "renderRecovery", "renderProjectStorage"]);
  assert.equal(
    Reflect.set(service, "ids", () => []),
    false
  );
});
