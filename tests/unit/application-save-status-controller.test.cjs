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
  assert.equal(falsy.state.text, "");
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
    "Import project: saving",
    "Local AI pre-translating 44 segments..."
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

test("ApplicationSaveStatusController cancels notice expiry when unsaved work replaces it", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();
  const harness = createHarness(createApplicationSaveStatusController);
  harness.controller.set("Project package saved", "saved");
  assert.deepEqual(harness.calls.slice(-1), [["timers.set", 2000]]);
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

test("ApplicationSaveStatusController dismisses completed successes, failures, and warnings without claiming a save", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();

  for (const [text, mode] of [
    ["Completed", "saved"],
    ["Saved to workspace", ""],
    ["Saved", "saved"],
    ["Local AI pre-translation: no segments updated; 1 failed", "saved"],
    ["Local AI pre-translation failed", "dirty"],
    ["Starting LM Studio server failed", "dirty"],
    ["Select a segment first", "dirty"]
  ]) {
    const harness = createHarness(createApplicationSaveStatusController);
    harness.controller.set(text, mode);
    assert.equal(harness.state.busy, "false", text);
    assert.deepEqual(harness.calls.at(-1), ["timers.set", 2000], text);
    const published = harness.calls.filter(([name]) => name === "model.publish");
    harness.fire(41);
    assert.deepEqual(harness.state, { text: "", className: "save-status", busy: "false" }, text);
    assert.deepEqual(
      harness.calls.filter(([name]) => name === "model.publish"),
      published
    );
  }
});

test("ApplicationSaveStatusController preserves running operations and pending autosave indicators", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();
  for (const [text, mode] of [
    ["Saving...", ""],
    ["Local AI pre-translating 44 segments...", ""],
    ["Canceling local AI batch...", "dirty"],
    ["Unsaved changes", "dirty"],
    ["2 save pending", "saved"],
    ["Save failed; retrying autosave", "dirty"]
  ]) {
    const harness = createHarness(createApplicationSaveStatusController);
    harness.controller.set(text, mode);
    assert.equal(harness.callbacks.size, 0, text);
    harness.controller.navigationChanged({ view: "project" }, { view: "editor" });
    assert.equal(harness.state.text, `source:${text}`);
  }
});

test("ApplicationSaveStatusController clears notices when changing screens, projects, or files but not segments", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();
  const previous = { view: "editor", projectId: "project-1", documentId: "doc-1", segmentId: "segment-1" };
  for (const patch of [
    { view: "project" },
    { view: "resources" },
    { projectId: "project-2" },
    { documentId: "doc-2" }
  ]) {
    const harness = createHarness(createApplicationSaveStatusController);
    harness.controller.set("Local AI pre-translation failed", "dirty");
    harness.controller.navigationChanged({ ...previous, ...patch }, previous);
    assert.equal(harness.state.text, "");
    assert.equal(harness.callbacks.size, 0);
  }
  const harness = createHarness(createApplicationSaveStatusController);
  harness.controller.set("Translation updated", "saved");
  harness.controller.navigationChanged({ ...previous, segmentId: "segment-2" }, previous);
  assert.equal(harness.state.text, "source:Translation updated");
  assert.equal(harness.callbacks.size, 1);
});

test("ApplicationSaveStatusController ignores expired callbacks after navigation or a newer operation", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();
  const harness = createHarness(createApplicationSaveStatusController);
  harness.controller.set("Translation updated", "saved");
  const staleCallback = harness.callbacks.get(41);
  harness.controller.navigationChanged({ view: "projects" }, { view: "editor" });
  harness.controller.set("Running QA...");
  staleCallback();
  assert.equal(harness.state.text, "source:Running QA...");
  assert.equal(harness.state.busy, "true");
});

test("ApplicationSaveStatusController preserves synchronous failure timing", async () => {
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
});

test("ApplicationSaveStatusController validates boundaries and exposes immutable status actions", async () => {
  const { createApplicationSaveStatusController } = await loadFactory();
  const valid = createHarness(createApplicationSaveStatusController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["set", "navigationChanged"]);

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
