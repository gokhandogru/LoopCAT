const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/segment-confirmation-controller.js")).href);
}

function fakeButton() {
  const listeners = new Map();
  const attributes = new Map();
  return {
    disabled: false,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type) {
      listeners.get(type)?.forEach((listener) => listener({ type, target: this }));
    },
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value))
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createHarness(createSegmentConfirmationController, overrides = {}) {
  const button = fakeButton();
  const project = { id: "p1", name: "Project" };
  const segment = {
    id: "s1",
    projectId: "p1",
    documentId: "d1",
    source: "Source",
    target: "Target",
    status: "draft",
    reviewState: "needs-review",
    revision: 4
  };
  const nextSegment = { id: "s2", projectId: "p1", target: "", status: "empty", revision: 1 };
  const segments = [segment, nextSegment];
  const calls = [];
  const statuses = [];
  let activeIndex = 0;
  let executions = 0;
  let createdOptions = null;
  const save = overrides.save || (() => Promise.resolve());
  const controller = createSegmentConfirmationController({
    element: button,
    editorSessionStore: {
      getProject: () => project,
      getSegments: () => segments
    },
    commands: {
      bus: {
        execute(command) {
          executions += 1;
          calls.push(["execute"]);
          return command.execute();
        }
      },
      create(options) {
        createdOptions = options;
        calls.push(["create", options.projectId, options.segmentId]);
        return { execute: options.applyFirst };
      },
      changed: () => calls.push(["commandsChanged"])
    },
    selection: {
      getActiveIndex: () => activeIndex,
      focusTarget: () => calls.push(["focusTarget", activeIndex]),
      goToNextOpen: () => {
        calls.push(["goToNextOpen"]);
        if (overrides.navigationError) return Promise.reject(overrides.navigationError);
        if (overrides.navigate !== false) activeIndex = 1;
        return Promise.resolve();
      }
    },
    validation: {
      missingTags: overrides.missingTags || (() => []),
      tagLabel: (tag) => String(tag)
    },
    filters: { matches: overrides.matches || (() => true) },
    mutation: {
      confirm(value) {
        calls.push(["confirmMutation"]);
        value.status = "confirmed";
        value.reviewState = "";
        value.revision += 1;
      },
      restore(value, snapshot) {
        calls.push(["restoreMutation"]);
        Reflect.ownKeys(value).forEach((key) => delete value[key]);
        Object.assign(value, snapshot);
      },
      preparePersistedRollback(value, savedRevision) {
        calls.push(["prepareRollback", savedRevision]);
        value.revision = Math.max(Number(value.revision || 0), savedRevision) + 1;
        value.updatedAt = "rollback";
      }
    },
    persistence: {
      clearPending: () => calls.push(["clearPending"]),
      save: (value) => {
        calls.push(["save", value.status, value.revision]);
        return save(value, calls);
      },
      saveToTm: () => {
        calls.push(["saveToTm"]);
        return overrides.tmError ? Promise.reject(overrides.tmError) : Promise.resolve();
      },
      logActivity: () => {
        calls.push(["logActivity"]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    restoration: {
      restoreCommand: (segmentId, snapshot, options) => {
        calls.push(["restoreCommand", segmentId, snapshot, options]);
        return Promise.resolve();
      }
    },
    view: {
      updateRow: (index) => calls.push(["updateRow", index]),
      renderSegments: (options) => calls.push(["renderSegments", options]),
      renderProgress: (options) => calls.push(["renderProgress", options]),
      scheduleHistory: () => calls.push(["scheduleHistory"]),
      renderHistory: () => calls.push(["renderHistory"])
    },
    workspace: { markDirty: (projectId) => calls.push(["markDirty", projectId]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    testHooks: overrides.testHooks,
    logger: { warn: (...values) => calls.push(["warn", ...values]) }
  });
  return {
    button,
    calls,
    controller,
    createdOptions: () => createdOptions,
    executions: () => executions,
    segment,
    setActiveIndex: (index) => {
      activeIndex = index;
    },
    statuses
  };
}

test("confirmation controller owns button lifecycle and blocks missing protected tags", async () => {
  const { createSegmentConfirmationController } = await loadFactory();
  const harness = createHarness(createSegmentConfirmationController, {
    missingTags: () => ["<strong>", "{name}"]
  });

  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  harness.button.dispatch("click");
  await Promise.resolve();
  assert.deepEqual(harness.statuses, [["Cannot confirm: missing <strong>, {name}", "dirty"]]);
  assert.equal(harness.executions(), 0);
  assert.ok(harness.calls.some(([name, index]) => name === "updateRow" && index === 0));
  assert.ok(harness.calls.some(([name]) => name === "focusTarget"));
  assert.equal(harness.button.getAttribute("aria-busy"), "false");

  assert.equal(harness.controller.unmount(), true);
  harness.button.dispatch("click");
  await Promise.resolve();
  assert.equal(harness.statuses.length, 1);
});

test("confirmation controller prevents duplicate submission and preserves confirm-and-next command sequencing", async () => {
  const { createSegmentConfirmationController } = await loadFactory();
  const pendingSave = deferred();
  const harness = createHarness(createSegmentConfirmationController, {
    save: () => pendingSave.promise
  });
  harness.controller.mount();

  const first = harness.controller.confirm();
  assert.equal(harness.controller.isBusy("s1"), true);
  assert.equal(harness.button.disabled, true);
  const duplicate = await harness.controller.confirm();
  assert.equal(duplicate, undefined);
  assert.equal(harness.executions(), 1);

  pendingSave.resolve();
  assert.equal(await first, true);
  assert.equal(harness.segment.status, "confirmed");
  assert.equal(harness.segment.reviewState, "");
  assert.equal(harness.controller.isBusy("s1"), false);
  assert.equal(harness.button.disabled, false);
  assert.deepEqual(harness.statuses.at(-1), ["Saved; Undo is available", "saved"]);
  assert.ok(harness.calls.some(([name]) => name === "clearPending"));
  assert.ok(harness.calls.some(([name]) => name === "goToNextOpen"));
  assert.ok(harness.calls.some(([name]) => name === "saveToTm"));
  assert.ok(harness.calls.some(([name]) => name === "logActivity"));
  assert.ok(harness.calls.some(([name]) => name === "commandsChanged"));
  assert.equal(harness.createdOptions().beforeSnapshot.reviewState, "needs-review");

  await harness.createdOptions().restoreSnapshot({ id: "s1" }, { direction: "redo" });
  assert.ok(
    harness.calls.some(
      ([name, segmentId, , options]) => name === "restoreCommand" && segmentId === "s1" && options.navigateNext === true
    )
  );
});

test("secondary TM, activity, and navigation failures keep confirmation durable and visible as warnings", async () => {
  const { createSegmentConfirmationController } = await loadFactory();
  const harness = createHarness(createSegmentConfirmationController, {
    activityError: new Error("activity unavailable"),
    navigationError: new Error("navigation unavailable"),
    tmError: new Error("TM unavailable")
  });

  assert.equal(await harness.controller.confirm(), true);
  assert.equal(harness.segment.status, "confirmed");
  assert.deepEqual(harness.statuses.at(-1), ["Saved; TM save failed; activity log failed; Undo is available", "dirty"]);
  assert.ok(harness.calls.some(([name]) => name === "focusTarget"));
  assert.equal(harness.calls.filter(([name]) => name === "warn").length, 3);
});

test("primary confirmation failure restores the in-memory snapshot and releases busy state", async () => {
  const { createSegmentConfirmationController } = await loadFactory();
  const harness = createHarness(createSegmentConfirmationController, {
    testHooks: {
      beforeSave() {
        throw new Error("primary save blocked");
      }
    }
  });

  assert.equal(await harness.controller.confirm(), false);
  assert.equal(harness.segment.status, "draft");
  assert.equal(harness.segment.reviewState, "needs-review");
  assert.equal(harness.controller.isBusy("s1"), false);
  assert.deepEqual(harness.statuses.at(-1), ["primary save blocked", "dirty"]);
  assert.ok(harness.calls.some(([name]) => name === "restoreMutation"));
  assert.ok(harness.calls.some(([name]) => name === "renderHistory"));
  assert.equal(harness.calls.filter(([name]) => name === "save").length, 0);
});

test("post-save confirmation failure persists a monotonic rollback and reports rollback-write failure", async () => {
  const { createSegmentConfirmationController } = await loadFactory();
  let saveAttempts = 0;
  const harness = createHarness(createSegmentConfirmationController, {
    save: () => {
      saveAttempts += 1;
      if (saveAttempts === 2) return Promise.reject(new Error("rollback storage unavailable"));
      return Promise.resolve();
    },
    testHooks: {
      afterSave() {
        throw new Error("post-save confirmation failure");
      }
    }
  });

  assert.equal(await harness.controller.confirm(), false);
  assert.equal(saveAttempts, 2);
  assert.equal(harness.segment.status, "draft");
  assert.equal(harness.segment.revision, 6);
  assert.deepEqual(harness.statuses.at(-1), [
    "post-save confirmation failure; rollback save failed: rollback storage unavailable",
    "dirty"
  ]);
  assert.ok(harness.calls.some(([name, revision]) => name === "prepareRollback" && revision === 5));
});
