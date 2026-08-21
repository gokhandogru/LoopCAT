const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const STORAGE_KEY = "loopcat.workspace.dirtyProjectIds";

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/workspace/workspace-dirty-state-controller.js")).href);
}

function createHarness(createWorkspaceDirtyStateController, overrides = {}) {
  const calls = [];
  const model = {
    dirty: new Set(overrides.dirty || []),
    recovery: new Set(overrides.recovery || []),
    status: Object.hasOwn(overrides, "status") ? overrides.status : { connected: true },
    project: Object.hasOwn(overrides, "project") ? overrides.project : { id: "current" },
    projects: overrides.projects || [],
    stored: Object.hasOwn(overrides, "stored") ? overrides.stored : null
  };
  const dependencies = {
    state: {
      getDirty() {
        if (overrides.getDirtyError) throw overrides.getDirtyError;
        return model.dirty;
      },
      setDirty(value) {
        calls.push(["setDirty", Array.from(value)]);
        if (overrides.setDirtyError) throw overrides.setDirtyError;
        model.dirty = value;
      },
      getRecovery() {
        if (overrides.getRecoveryError) throw overrides.getRecoveryError;
        return model.recovery;
      },
      setRecovery(value) {
        calls.push(["setRecovery", Array.from(value)]);
        if (overrides.setRecoveryError) throw overrides.setRecoveryError;
        model.recovery = value;
      },
      getStatus() {
        calls.push(["getStatus"]);
        if (overrides.getStatusError) throw overrides.getStatusError;
        return model.status;
      }
    },
    storage: {
      getItem(key) {
        calls.push(["getItem", key]);
        if (overrides.getItemError) throw overrides.getItemError;
        return model.stored;
      },
      setItem(key, value) {
        calls.push(["setItem", key, value]);
        if (overrides.setItemError) throw overrides.setItemError;
        model.stored = value;
      },
      removeItem(key) {
        calls.push(["removeItem", key]);
        if (overrides.removeItemError) throw overrides.removeItemError;
        model.stored = null;
      }
    },
    session: {
      getProject() {
        calls.push(["getProject"]);
        if (overrides.getProjectError) throw overrides.getProjectError;
        return model.project;
      },
      getProjects() {
        calls.push(["getProjects"]);
        if (overrides.getProjectsError) throw overrides.getProjectsError;
        return model.projects;
      }
    },
    resources: {
      links(project) {
        calls.push(["links", project]);
        if (overrides.linksError) throw overrides.linksError;
        return Object.hasOwn(overrides, "links") ? overrides.links : project.links || [];
      }
    },
    summary: {
      markDirty(projectId) {
        calls.push(["markSummary", projectId]);
        if (overrides.summaryError) throw overrides.summaryError;
      }
    },
    recovery: {
      resetDismissal() {
        calls.push(["resetDismissal"]);
        if (overrides.recoveryError) throw overrides.recoveryError;
      }
    },
    presentation: {
      renderStatus() {
        calls.push(["renderStatus"]);
        if (overrides.renderStatusError) throw overrides.renderStatusError;
      },
      renderRecovery() {
        calls.push(["renderRecovery"]);
        if (overrides.renderRecoveryError) throw overrides.renderRecoveryError;
      }
    }
  };
  return {
    calls,
    model,
    dependencies,
    controller: createWorkspaceDirtyStateController(dependencies)
  };
}

test("WorkspaceDirtyStateController preserves insertion-order IDs and connected visibility policy", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const harness = createHarness(createWorkspaceDirtyStateController, { dirty: ["b", "a"] });
  const firstIds = harness.controller.ids();
  const secondIds = harness.controller.ids();
  assert.deepEqual(firstIds, ["b", "a"]);
  assert.deepEqual(secondIds, ["b", "a"]);
  assert.notStrictEqual(firstIds, secondIds);
  assert.equal(harness.controller.hasUnsaved(), true);
  assert.equal(harness.controller.visibleCount(), 2);
  assert.equal(harness.controller.visibleCount({ connected: false }), 0);
  harness.model.status = null;
  assert.equal(harness.controller.hasUnsaved(), false);
  assert.deepEqual(harness.calls, [["getStatus"], ["getStatus"], ["getStatus"]]);
});

test("WorkspaceDirtyStateController preserves stored JSON filtering, duplicates, and exact storage key", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const harness = createHarness(createWorkspaceDirtyStateController, {
    stored: JSON.stringify(["a", " ", " b ", 7, null, "a", ""])
  });
  assert.deepEqual(harness.controller.readStored(), ["a", " b ", "a"]);
  harness.model.stored = JSON.stringify({ project: "a" });
  assert.deepEqual(harness.controller.readStored(), []);
  harness.model.stored = null;
  assert.deepEqual(harness.controller.readStored(), []);
  assert.deepEqual(harness.calls, [
    ["getItem", STORAGE_KEY],
    ["getItem", STORAGE_KEY],
    ["getItem", STORAGE_KEY]
  ]);
});

test("WorkspaceDirtyStateController cleans malformed storage and preserves cleanup failure timing", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const malformed = createHarness(createWorkspaceDirtyStateController, { stored: "{" });
  assert.deepEqual(malformed.controller.readStored(), []);
  assert.deepEqual(malformed.calls, [
    ["getItem", STORAGE_KEY],
    ["removeItem", STORAGE_KEY]
  ]);

  const getItemError = new Error("read failed");
  const failedRead = createHarness(createWorkspaceDirtyStateController, { getItemError });
  assert.deepEqual(failedRead.controller.readStored(), []);
  assert.deepEqual(failedRead.calls, [
    ["getItem", STORAGE_KEY],
    ["removeItem", STORAGE_KEY]
  ]);

  const removeItemError = new Error("cleanup failed");
  const failedCleanup = createHarness(createWorkspaceDirtyStateController, {
    stored: "{",
    removeItemError
  });
  assert.throws(() => failedCleanup.controller.readStored(), removeItemError);
});

test("WorkspaceDirtyStateController persists ordered IDs or removes empty state while containing failures", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const populated = createHarness(createWorkspaceDirtyStateController, { dirty: ["b", "a"] });
  assert.equal(populated.controller.persist(), undefined);
  assert.deepEqual(populated.calls, [["setItem", STORAGE_KEY, '["b","a"]']]);
  assert.equal(populated.model.stored, '["b","a"]');

  const empty = createHarness(createWorkspaceDirtyStateController);
  assert.equal(empty.controller.persist(), undefined);
  assert.deepEqual(empty.calls, [["removeItem", STORAGE_KEY]]);

  const failedSet = createHarness(createWorkspaceDirtyStateController, {
    dirty: ["a"],
    setItemError: new Error("write failed")
  });
  assert.doesNotThrow(() => failedSet.controller.persist());
  assert.deepEqual(failedSet.calls, [["setItem", STORAGE_KEY, '["a"]']]);

  const failedState = createHarness(createWorkspaceDirtyStateController, {
    getDirtyError: new Error("state failed")
  });
  assert.doesNotThrow(() => failedState.controller.persist());
  assert.deepEqual(failedState.calls, []);
});

test("WorkspaceDirtyStateController restores fresh dirty and recovery Sets before resetting dismissal", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const harness = createHarness(createWorkspaceDirtyStateController, { stored: '["a","b"]' });
  assert.equal(harness.controller.restore(), undefined);
  assert.deepEqual(Array.from(harness.model.dirty), ["a", "b"]);
  assert.deepEqual(Array.from(harness.model.recovery), ["a", "b"]);
  assert.notStrictEqual(harness.model.dirty, harness.model.recovery);
  assert.deepEqual(harness.calls, [
    ["getItem", STORAGE_KEY],
    ["setDirty", ["a", "b"]],
    ["setRecovery", ["a", "b"]],
    ["resetDismissal"]
  ]);

  const recoveryError = new Error("reset failed");
  const failed = createHarness(createWorkspaceDirtyStateController, {
    stored: '["saved"]',
    recoveryError
  });
  assert.throws(() => failed.controller.restore(), recoveryError);
  assert.deepEqual(Array.from(failed.model.dirty), ["saved"]);
  assert.deepEqual(Array.from(failed.model.recovery), ["saved"]);
});

test("WorkspaceDirtyStateController prunes unknown dirty and recovery IDs with exact effects", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const harness = createHarness(createWorkspaceDirtyStateController, {
    dirty: ["known", "missing"],
    recovery: ["known", "missing", "recovery-only"],
    projects: [{ id: "known" }, { id: "" }, { id: "other" }]
  });
  assert.equal(harness.controller.prune(), undefined);
  assert.deepEqual(Array.from(harness.model.dirty), ["known"]);
  assert.deepEqual(Array.from(harness.model.recovery), ["known"]);
  assert.deepEqual(harness.calls, [
    ["getProjects"],
    ["setDirty", ["known"]],
    ["setRecovery", ["known"]],
    ["setItem", STORAGE_KEY, '["known"]'],
    ["renderRecovery"]
  ]);

  const unchanged = createHarness(createWorkspaceDirtyStateController, {
    dirty: ["known", "other"],
    recovery: ["known"],
    projects: [{ id: "known" }, { id: "other" }]
  });
  assert.equal(unchanged.controller.prune(), undefined);
  assert.deepEqual(unchanged.calls, [["getProjects"]]);
});

test("WorkspaceDirtyStateController marks the current project and repeats only summary invalidation", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const harness = createHarness(createWorkspaceDirtyStateController, { project: { id: "current" } });
  assert.equal(harness.controller.mark(), undefined);
  assert.deepEqual(Array.from(harness.model.dirty), ["current"]);
  assert.deepEqual(harness.calls, [
    ["getProject"],
    ["markSummary", "current"],
    ["setItem", STORAGE_KEY, '["current"]'],
    ["renderStatus"]
  ]);
  harness.calls.length = 0;
  assert.equal(harness.controller.mark("current"), undefined);
  assert.deepEqual(harness.calls, [["markSummary", "current"]]);
  harness.calls.length = 0;
  assert.equal(harness.controller.mark(null), undefined);
  assert.deepEqual(harness.calls, []);

  const summaryError = new Error("summary failed");
  const failed = createHarness(createWorkspaceDirtyStateController, { summaryError });
  assert.throws(() => failed.controller.mark("added"), summaryError);
  assert.deepEqual(Array.from(failed.model.dirty), ["added"]);
  assert.deepEqual(failed.calls, [["markSummary", "added"]]);
});

test("WorkspaceDirtyStateController marks project lists with stable deduplication and one changed effect pair", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const harness = createHarness(createWorkspaceDirtyStateController, { dirty: ["a"] });
  assert.equal(harness.controller.markProjects(["a", "", "b", "a", null]), undefined);
  assert.deepEqual(Array.from(harness.model.dirty), ["a", "b"]);
  assert.deepEqual(harness.calls, [
    ["markSummary", "a"],
    ["markSummary", "b"],
    ["markSummary", "a"],
    ["setItem", STORAGE_KEY, '["a","b"]'],
    ["renderStatus"]
  ]);
  harness.calls.length = 0;
  harness.controller.markProjects(["a", "b"]);
  assert.deepEqual(harness.calls, [
    ["markSummary", "a"],
    ["markSummary", "b"]
  ]);
  assert.throws(() => harness.controller.markProjects(null), TypeError);
});

test("WorkspaceDirtyStateController preserves resource guards, language matching, and link failures", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const project = {
    id: "p1",
    sourceLang: "en",
    targetLang: "tr",
    links: [{ type: "tm", name: "Main" }]
  };
  const harness = createHarness(createWorkspaceDirtyStateController);
  for (const args of [
    [null, "tm", "Main"],
    [project, "", "Main"],
    [project, "tm", ""],
    [project, "tm", "Main", "de"],
    [project, "tm", "Main", "en", "de"]
  ]) {
    assert.equal(harness.controller.usesResource(...args), false);
  }
  assert.deepEqual(harness.calls, []);
  assert.equal(harness.controller.usesResource(project, "tm", "Main", "en", "tr"), true);
  assert.equal(harness.controller.usesResource(project, "termbase", "Main"), false);
  assert.deepEqual(harness.calls, [
    ["links", project],
    ["links", project]
  ]);

  const linksError = new Error("links failed");
  const failed = createHarness(createWorkspaceDirtyStateController, { linksError });
  assert.throws(() => failed.controller.usesResource(project, "tm", "Main"), linksError);
});

test("WorkspaceDirtyStateController marks every matching resource project and returns the uncollapsed count", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const matching = {
    id: "shared",
    sourceLang: "en",
    targetLang: "tr",
    links: [{ type: "termbase", name: "Terms" }]
  };
  const mismatch = {
    id: "other",
    sourceLang: "en",
    targetLang: "ca",
    links: [{ type: "termbase", name: "Terms" }]
  };
  const harness = createHarness(createWorkspaceDirtyStateController, {
    projects: [matching, { ...matching }, mismatch]
  });
  assert.equal(harness.controller.markProjectsUsingResource("termbase", "Terms", "en", "tr"), 2);
  assert.deepEqual(Array.from(harness.model.dirty), ["shared"]);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "markSummary"),
    [
      ["markSummary", "shared"],
      ["markSummary", "shared"]
    ]
  );
  assert.deepEqual(harness.calls.slice(-2), [["setItem", STORAGE_KEY, '["shared"]'], ["renderStatus"]]);
});

test("WorkspaceDirtyStateController preserves clear, clear-all, and memory-only effect sequencing", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const clearHarness = createHarness(createWorkspaceDirtyStateController, {
    dirty: ["current", "other"],
    recovery: ["current", "other"],
    project: { id: "current" }
  });
  assert.equal(clearHarness.controller.clear(), undefined);
  assert.deepEqual(Array.from(clearHarness.model.dirty), ["other"]);
  assert.deepEqual(Array.from(clearHarness.model.recovery), ["other"]);
  assert.deepEqual(clearHarness.calls, [["getProject"], ["setItem", STORAGE_KEY, '["other"]'], ["renderStatus"]]);
  clearHarness.calls.length = 0;
  clearHarness.controller.clear(null);
  assert.deepEqual(clearHarness.calls, [["setItem", STORAGE_KEY, '["other"]'], ["renderStatus"]]);

  const clearAllHarness = createHarness(createWorkspaceDirtyStateController, {
    dirty: ["a"],
    recovery: ["a"]
  });
  clearAllHarness.controller.clearAll();
  assert.deepEqual(Array.from(clearAllHarness.model.dirty), []);
  assert.deepEqual(Array.from(clearAllHarness.model.recovery), []);
  assert.deepEqual(clearAllHarness.calls, [["resetDismissal"], ["removeItem", STORAGE_KEY], ["renderStatus"]]);

  const memoryHarness = createHarness(createWorkspaceDirtyStateController, {
    dirty: ["a"],
    recovery: ["a"]
  });
  memoryHarness.controller.clearMemory();
  assert.deepEqual(Array.from(memoryHarness.model.dirty), []);
  assert.deepEqual(Array.from(memoryHarness.model.recovery), []);
  assert.deepEqual(memoryHarness.calls, [["renderStatus"]]);
});

test("WorkspaceDirtyStateController preserves mutation before reset and presentation failures", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const recoveryError = new Error("reset failed");
  const failedReset = createHarness(createWorkspaceDirtyStateController, {
    dirty: ["a"],
    recovery: ["a"],
    recoveryError
  });
  assert.throws(() => failedReset.controller.clearAll(), recoveryError);
  assert.deepEqual(Array.from(failedReset.model.dirty), []);
  assert.deepEqual(Array.from(failedReset.model.recovery), []);
  assert.deepEqual(failedReset.calls, [["resetDismissal"]]);

  const renderError = new Error("render failed");
  const failedRender = createHarness(createWorkspaceDirtyStateController, {
    dirty: ["a"],
    recovery: ["a"],
    renderStatusError: renderError
  });
  assert.throws(() => failedRender.controller.clearMemory(), renderError);
  assert.deepEqual(Array.from(failedRender.model.dirty), []);
  assert.deepEqual(Array.from(failedRender.model.recovery), []);
});

test("WorkspaceDirtyStateController validates boundaries and exposes an immutable API", async () => {
  const { createWorkspaceDirtyStateController } = await loadFactory();
  const valid = createHarness(createWorkspaceDirtyStateController).dependencies;
  const required = [
    ["state", "getDirty"],
    ["state", "setDirty"],
    ["state", "getRecovery"],
    ["state", "setRecovery"],
    ["state", "getStatus"],
    ["storage", "getItem"],
    ["storage", "setItem"],
    ["storage", "removeItem"],
    ["session", "getProject"],
    ["session", "getProjects"],
    ["resources", "links"],
    ["summary", "markDirty"],
    ["recovery", "resetDismissal"],
    ["presentation", "renderStatus"],
    ["presentation", "renderRecovery"]
  ];
  for (const [owner, method] of required) {
    assert.throws(
      () =>
        createWorkspaceDirtyStateController({
          ...valid,
          [owner]: { ...valid[owner], [method]: null }
        }),
      /checked state, storage, session, resource, summary, recovery, and presentation boundaries/
    );
  }
  const controller = createWorkspaceDirtyStateController(valid);
  assert.equal(Object.isFrozen(controller), true);
  assert.deepEqual(Object.keys(controller), [
    "ids",
    "readStored",
    "persist",
    "restore",
    "prune",
    "hasUnsaved",
    "visibleCount",
    "mark",
    "markProjects",
    "usesResource",
    "markProjectsUsingResource",
    "clear",
    "clearAll",
    "clearMemory"
  ]);
});
