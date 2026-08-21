const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/workspace/workspace-project-coverage-service.js")).href);
}

function createHarness(createWorkspaceProjectCoverageService, overrides = {}) {
  const calls = [];
  const marked = [];
  const options = {
    workspace: {
      canListPackages() {
        calls.push(["canListPackages"]);
        if (overrides.canListError) throw overrides.canListError;
        return overrides.canList === undefined ? true : overrides.canList;
      },
      isConnected() {
        calls.push(["isConnected"]);
        if (overrides.connectedError) throw overrides.connectedError;
        return overrides.connected === undefined ? true : overrides.connected;
      },
      listPackages() {
        calls.push(["listPackages"]);
        if (overrides.packagesError) throw overrides.packagesError;
        return overrides.packageRefs === undefined ? [] : overrides.packageRefs;
      }
    },
    projects: {
      list() {
        calls.push(["listProjects"]);
        if (overrides.projectsError) throw overrides.projectsError;
        return overrides.projects === undefined ? [] : overrides.projects;
      }
    },
    dirty: {
      markProjects(projectIds) {
        calls.push(["markProjects", projectIds]);
        marked.push(projectIds);
        if (overrides.markError) throw overrides.markError;
        return overrides.markResult;
      }
    }
  };
  return {
    calls,
    marked,
    options,
    service: createWorkspaceProjectCoverageService(options)
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("WorkspaceProjectCoverageService preserves capability and connection guard order", async () => {
  const { createWorkspaceProjectCoverageService } = await loadFactory();
  const unavailable = createHarness(createWorkspaceProjectCoverageService, {
    canList: 0,
    connectedError: new Error("connection must not be read")
  });
  assert.equal(await unavailable.service.markMissingLocalDirty(), 0);
  assert.deepEqual(unavailable.calls, [["canListPackages"]]);

  const disconnected = createHarness(createWorkspaceProjectCoverageService, {
    canList: "available",
    connected: ""
  });
  assert.equal(await disconnected.service.markMissingLocalDirty(), 0);
  assert.deepEqual(disconnected.calls, [["canListPackages"], ["isConnected"]]);
});

test("WorkspaceProjectCoverageService starts local and workspace reads concurrently in order", async () => {
  const { createWorkspaceProjectCoverageService } = await loadFactory();
  const local = deferred();
  const remote = deferred();
  const harness = createHarness(createWorkspaceProjectCoverageService, {
    projects: local.promise,
    packageRefs: remote.promise
  });

  const pending = harness.service.markMissingLocalDirty();
  assert.deepEqual(harness.calls, [["canListPackages"], ["isConnected"], ["listProjects"], ["listPackages"]]);
  remote.resolve([{ id: "present" }]);
  await Promise.resolve();
  assert.equal(harness.marked.length, 0);
  local.resolve([{ id: "present" }, { id: "missing" }]);
  assert.equal(await pending, 1);
  assert.deepEqual(harness.marked, [["missing"]]);
});

test("WorkspaceProjectCoverageService preserves strict IDs, stable order, duplicates, and truthy filtering", async () => {
  const { createWorkspaceProjectCoverageService } = await loadFactory();
  const harness = createHarness(createWorkspaceProjectCoverageService, {
    packageRefs: [{ id: "present" }, { id: 7 }, { id: "" }, { id: 0 }, { id: null }],
    projects: [
      { id: "present" },
      { id: "7" },
      { id: 7 },
      { id: "missing" },
      { id: "missing" },
      { id: "" },
      { id: 0 },
      { id: null }
    ]
  });

  assert.equal(await harness.service.markMissingLocalDirty(), 3);
  assert.deepEqual(harness.marked, [["7", "missing", "missing"]]);
});

test("WorkspaceProjectCoverageService preserves nullish-list fallbacks and empty dirty marking", async () => {
  const { createWorkspaceProjectCoverageService } = await loadFactory();
  const noRefs = createHarness(createWorkspaceProjectCoverageService, {
    packageRefs: null,
    projects: [{ id: "a" }, { id: "b" }]
  });
  assert.equal(await noRefs.service.markMissingLocalDirty(), 2);
  assert.deepEqual(noRefs.marked, [["a", "b"]]);

  const noProjects = createHarness(createWorkspaceProjectCoverageService, {
    packageRefs: [{ id: "a" }],
    projects: null,
    markResult: "ignored"
  });
  assert.equal(await noProjects.service.markMissingLocalDirty(), 0);
  assert.deepEqual(noProjects.marked, [[]]);
});

test("WorkspaceProjectCoverageService reads every boundary live on repeated runs", async () => {
  const { createWorkspaceProjectCoverageService } = await loadFactory();
  const calls = [];
  let connected = false;
  let localProjects = [{ id: "first" }];
  let packageRefs = [];
  const marked = [];
  const service = createWorkspaceProjectCoverageService({
    workspace: {
      canListPackages() {
        calls.push("capability");
        return true;
      },
      isConnected() {
        calls.push("connected");
        return connected;
      },
      listPackages() {
        calls.push("packages");
        return packageRefs;
      }
    },
    projects: {
      list() {
        calls.push("projects");
        return localProjects;
      }
    },
    dirty: {
      markProjects(ids) {
        calls.push("mark");
        marked.push(ids);
      }
    }
  });

  assert.equal(await service.markMissingLocalDirty(), 0);
  connected = true;
  assert.equal(await service.markMissingLocalDirty(), 1);
  localProjects = [{ id: "second" }];
  packageRefs = [{ id: "second" }];
  assert.equal(await service.markMissingLocalDirty(), 0);
  assert.deepEqual(marked, [["first"], []]);
  assert.deepEqual(calls, [
    "capability",
    "connected",
    "capability",
    "connected",
    "projects",
    "packages",
    "mark",
    "capability",
    "connected",
    "projects",
    "packages",
    "mark"
  ]);
});

test("WorkspaceProjectCoverageService preserves direct list and record access failures", async () => {
  const { createWorkspaceProjectCoverageService } = await loadFactory();
  for (const overrides of [{ packageRefs: {} }, { packageRefs: [null] }, { projects: {} }, { projects: [undefined] }]) {
    const harness = createHarness(createWorkspaceProjectCoverageService, overrides);
    await assert.rejects(harness.service.markMissingLocalDirty(), TypeError);
    assert.equal(harness.marked.length, 0);
  }
});

test("WorkspaceProjectCoverageService preserves dependency and dirty-mark failure timing", async () => {
  const { createWorkspaceProjectCoverageService } = await loadFactory();
  for (const [overrides, expectedCalls, failureKey] of [
    [{ canListError: new Error("capability failed") }, [["canListPackages"]], "canListError"],
    [{ connectedError: new Error("connection failed") }, [["canListPackages"], ["isConnected"]], "connectedError"],
    [
      { projectsError: new Error("projects failed") },
      [["canListPackages"], ["isConnected"], ["listProjects"]],
      "projectsError"
    ],
    [
      { packagesError: new Error("packages failed") },
      [["canListPackages"], ["isConnected"], ["listProjects"], ["listPackages"]],
      "packagesError"
    ],
    [
      { projects: [{ id: "missing" }], markError: new Error("mark failed") },
      [["canListPackages"], ["isConnected"], ["listProjects"], ["listPackages"], ["markProjects", ["missing"]]],
      "markError"
    ]
  ]) {
    const harness = createHarness(createWorkspaceProjectCoverageService, overrides);
    await assert.rejects(harness.service.markMissingLocalDirty(), overrides[failureKey]);
    assert.deepEqual(harness.calls, expectedCalls);
  }
});

test("WorkspaceProjectCoverageService preserves concurrent rejection and waits for neither later result", async () => {
  const { createWorkspaceProjectCoverageService } = await loadFactory();
  const local = deferred();
  const remoteFailure = new Error("package listing rejected");
  const harness = createHarness(createWorkspaceProjectCoverageService, {
    projects: local.promise,
    packageRefs: Promise.reject(remoteFailure)
  });

  await assert.rejects(harness.service.markMissingLocalDirty(), remoteFailure);
  assert.deepEqual(harness.calls, [["canListPackages"], ["isConnected"], ["listProjects"], ["listPackages"]]);
  assert.equal(harness.marked.length, 0);
  local.resolve([]);
});

test("WorkspaceProjectCoverageService validates every boundary and exposes an immutable API", async () => {
  const { createWorkspaceProjectCoverageService } = await loadFactory();
  const valid = createHarness(createWorkspaceProjectCoverageService);
  assert.equal(Object.isFrozen(valid.service), true);
  assert.deepEqual(Object.keys(valid.service), ["markMissingLocalDirty"]);

  for (const options of [
    undefined,
    {},
    { ...valid.options, workspace: { ...valid.options.workspace, canListPackages: null } },
    { ...valid.options, workspace: { ...valid.options.workspace, isConnected: null } },
    { ...valid.options, workspace: { ...valid.options.workspace, listPackages: null } },
    { ...valid.options, projects: { list: null } },
    { ...valid.options, dirty: { markProjects: null } }
  ]) {
    assert.throws(
      () => createWorkspaceProjectCoverageService(options),
      /workspace, project-list, and dirty-marker boundaries/
    );
  }
});
