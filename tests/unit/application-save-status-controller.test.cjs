const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-save-status-controller.js")).href);
}

function createHarness(createApplicationSaveStatusController, overrides = {}) {
  const calls = [];
  const callbacks = new Map();
  const state = { text: "", className: "", busy: "" };
  let nextHandle = 40;
  const fail = (name) => {
    if (overrides.errorAt === name) throw overrides.error || new Error(`${name} failed`);
  };
  const redaction = {
    sanitize(value) {
      calls.push(["redaction.sanitize", value]);
      fail("redaction.sanitize");
      return overrides.redacted ?? String(value);
    }
  };
  const model = {
    publish(record) {
      calls.push(["model.publish", record]);
      fail("model.publish");
      return overrides.modelResult;
    }
  };
  const context = {
    getProjectId() {
      calls.push(["context.getProjectId"]);
      fail("context.getProjectId");
      return Object.hasOwn(overrides, "projectId") ? overrides.projectId : "project-1";
    },
    getSegmentId() {
      calls.push(["context.getSegmentId"]);
      fail("context.getSegmentId");
      return Object.hasOwn(overrides, "segmentId") ? overrides.segmentId : "segment-2";
    }
  };
  const localization = {
    source(value) {
      calls.push(["localization.source", value]);
      fail("localization.source");
      return `source:${value}`;
    },
    translate(key) {
      calls.push(["localization.translate", key]);
      fail("localization.translate");
      return overrides.savedLabel || "Saved locally";
    }
  };
  const view = {
    setText(value) {
      calls.push(["view.setText", value]);
      fail("view.setText");
      state.text = value;
    },
    setClass(value) {
      calls.push(["view.setClass", value]);
      fail("view.setClass");
      state.className = value;
    },
    setBusy(value) {
      calls.push(["view.setBusy", value]);
      fail("view.setBusy");
      state.busy = value;
    }
  };
  const timers = {
    set(callback, delay) {
      calls.push(["timers.set", delay]);
      fail("timers.set");
      nextHandle += 1;
      callbacks.set(nextHandle, callback);
      return nextHandle;
    },
    clear(handle) {
      calls.push(["timers.clear", handle]);
      fail("timers.clear");
      callbacks.delete(handle);
    }
  };
  const controller = createApplicationSaveStatusController({
    redaction,
    model,
    context,
    localization,
    view,
    timers
  });
  return {
    callbacks,
    calls,
    context,
    controller,
    fire(handle) {
      return callbacks.get(handle)?.();
    },
    localization,
    model,
    redaction,
    state,
    timers,
    view
  };
}

test("ApplicationSaveStatusController preserves redaction, live context, model, and visible presentation order", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();
  const harness = createHarness(createApplicationSaveStatusController, {
    redacted: "  Saving translated content  ",
    projectId: null,
    segmentId: "segment-live"
  });
  assert.equal(harness.controller.set("Bearer secret", "dirty"), undefined);
  assert.deepEqual(harness.calls, [
    ["redaction.sanitize", "Bearer secret"],
    ["context.getProjectId"],
    ["context.getSegmentId"],
    [
      "model.publish",
      {
        text: "Saving translated content",
        mode: "dirty",
        projectId: null,
        segmentId: "segment-live"
      }
    ],
    ["localization.source", "Saving translated content"],
    ["view.setText", "source:Saving translated content"],
    ["view.setClass", "save-status dirty"],
    ["view.setBusy", "true"]
  ]);
  assert.deepEqual(harness.state, {
    text: "source:Saving translated content",
    className: "save-status dirty",
    busy: "true"
  });
});

test("ApplicationSaveStatusController preserves falsy text normalization and every operation-busy branch", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();
  const falsy = createHarness(createApplicationSaveStatusController);
  falsy.controller.set(0);
  assert.deepEqual(falsy.calls[0], ["redaction.sanitize", ""]);
  assert.equal(falsy.state.text, "source:");
  assert.equal(falsy.state.className, "save-status ");

  for (const text of [
    "Saving project",
    "STARTING import",
    "Requesting provider",
    "Sending prompt",
    "Running QA",
    "Generating report",
    "Extracting terms",
    "Polishing draft",
    "Adapting target",
    "Pretranslating file",
    "Canceling operation",
    "Import project: reading",
    "Import project: parsing",
    "Import project: importing",
    "Import project: saving"
  ]) {
    const harness = createHarness(createApplicationSaveStatusController);
    harness.controller.set(text);
    assert.equal(harness.state.busy, "true", text);
  }
  for (const text of ["Saved", "Parsing file", "Loading", "Import project: validating", "", "Canceled"]) {
    const harness = createHarness(createApplicationSaveStatusController);
    harness.controller.set(text);
    assert.equal(harness.state.busy, "false", text);
  }
});

test("ApplicationSaveStatusController replaces a pending saved timer before the next status", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();
  const harness = createHarness(createApplicationSaveStatusController);
  harness.controller.set("Project package saved", "saved");
  assert.deepEqual(harness.calls.slice(-1), [["timers.set", 5000]]);
  assert.deepEqual([...harness.callbacks.keys()], [41]);

  harness.calls.length = 0;
  harness.controller.set("Unsaved changes", "dirty");
  assert.deepEqual(harness.calls[0], ["timers.clear", 41]);
  assert.equal(harness.callbacks.size, 0);
  assert.equal(
    harness.calls.some(([name]) => name === "timers.set"),
    false
  );
});

test("ApplicationSaveStatusController preserves delayed-saved eligibility, callback order, and private timer release", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();

  for (const [text, mode, expectedTimer] of [
    ["Completed", "saved", true],
    ["Saved to workspace", "", true],
    ["Saved", "saved", false],
    ["saved to workspace", "", false],
    ["Completed", "dirty", false]
  ]) {
    const harness = createHarness(createApplicationSaveStatusController);
    harness.controller.set(text, mode);
    assert.equal(
      harness.calls.some(([name]) => name === "timers.set"),
      expectedTimer,
      `${text}/${mode}`
    );
  }

  const harness = createHarness(createApplicationSaveStatusController, { savedLabel: "Localized saved" });
  harness.controller.set("Saved to folder");
  harness.calls.length = 0;
  assert.equal(harness.fire(41), undefined);
  assert.deepEqual(harness.calls, [
    ["localization.translate", "app.status.saved"],
    ["view.setText", "Localized saved"],
    ["view.setClass", "save-status saved"]
  ]);
  assert.deepEqual(harness.state, { text: "Localized saved", className: "save-status saved", busy: "false" });

  harness.calls.length = 0;
  harness.controller.set("Next status");
  assert.equal(
    harness.calls.some(([name]) => name === "timers.clear"),
    false
  );
});

test("ApplicationSaveStatusController preserves synchronous failure timing and retained timer after callback failure", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();
  for (const errorAt of [
    "redaction.sanitize",
    "context.getProjectId",
    "context.getSegmentId",
    "model.publish",
    "localization.source",
    "view.setText",
    "view.setClass",
    "view.setBusy",
    "timers.set"
  ]) {
    const error = new Error(`${errorAt} sentinel`);
    const harness = createHarness(createApplicationSaveStatusController, { errorAt, error });
    assert.throws(() => harness.controller.set("Completed", "saved"), error, errorAt);
    const failureIndex = harness.calls.findIndex(([name]) => name === errorAt);
    assert.equal(failureIndex, harness.calls.length - 1, errorAt);
  }

  const clearError = new Error("clear sentinel");
  const clearHarness = createHarness(createApplicationSaveStatusController);
  clearHarness.controller.set("Completed", "saved");
  clearHarness.calls.length = 0;
  clearHarness.timers.clear = (handle) => {
    clearHarness.calls.push(["timers.clear", handle]);
    throw clearError;
  };
  assert.throws(() => clearHarness.controller.set("Next"), clearError);
  assert.deepEqual(clearHarness.calls, [["timers.clear", 41]]);

  const callbackError = new Error("translate sentinel");
  const callbackHarness = createHarness(createApplicationSaveStatusController);
  callbackHarness.controller.set("Completed", "saved");
  callbackHarness.localization.translate = (key) => {
    callbackHarness.calls.push(["localization.translate", key]);
    throw callbackError;
  };
  assert.throws(() => callbackHarness.fire(41), callbackError);
  callbackHarness.calls.length = 0;
  callbackHarness.controller.set("Next");
  assert.deepEqual(callbackHarness.calls[0], ["timers.clear", 41]);
});

test("ApplicationSaveStatusController validates boundaries and exposes only an immutable set action", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();
  const valid = createHarness(createApplicationSaveStatusController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["set"]);

  const create = (changes = {}) =>
    createApplicationSaveStatusController({
      redaction: valid.redaction,
      model: valid.model,
      context: valid.context,
      localization: valid.localization,
      view: valid.view,
      timers: valid.timers,
      ...changes
    });
  for (const changes of [
    { redaction: {} },
    { model: {} },
    { context: { ...valid.context, getProjectId: null } },
    { context: { ...valid.context, getSegmentId: null } },
    { localization: { ...valid.localization, source: null } },
    { localization: { ...valid.localization, translate: null } },
    { view: { ...valid.view, setText: null } },
    { view: { ...valid.view, setClass: null } },
    { view: { ...valid.view, setBusy: null } },
    { timers: { ...valid.timers, set: null } },
    { timers: { ...valid.timers, clear: null } }
  ]) {
    assert.throws(() => create(changes), /ApplicationSaveStatusController requires checked/);
  }
});
