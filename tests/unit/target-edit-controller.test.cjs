const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function fakeElement() {
  const listeners = new Map();
  const classes = new Set();
  return {
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    focused: false,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name)
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.forEach((listener) => listener(event));
    },
    focus() {
      this.focused = true;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  };
}

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/target-edit-controller.js")).href);
}

function createSessionHarness() {
  const sessions = new Set();
  const calls = [];
  return {
    calls,
    sessions,
    boundary: {
      begin(options) {
        calls.push(["begin", options]);
        sessions.add(options.segmentId);
      },
      capture(segmentId, patch, context) {
        calls.push(["capture", segmentId, patch, context]);
      },
      finalize(segmentId) {
        calls.push(["finalize", segmentId]);
        if (!sessions.delete(segmentId)) return null;
        return { segmentId };
      },
      finalizeProject(projectId) {
        calls.push(["finalizeProject", projectId]);
        const recorded = Array.from(sessions, (segmentId) => ({ segmentId }));
        sessions.clear();
        return recorded;
      },
      finalizeAll() {
        calls.push(["finalizeAll"]);
        const recorded = Array.from(sessions, (segmentId) => ({ segmentId }));
        sessions.clear();
        return recorded;
      },
      has: (segmentId) => sessions.has(segmentId)
    }
  };
}

function createHarness(createTargetEditController) {
  const segment = { id: "s1", projectId: "p1", target: "before" };
  const textarea = fakeElement();
  textarea.value = segment.target;
  textarea.selectionStart = segment.target.length;
  textarea.selectionEnd = segment.target.length;
  const editingCell = fakeElement();
  const sessions = createSessionHarness();
  const calls = [];
  const controller = createTargetEditController({
    editorSessionStore: {
      getProject: () => ({ id: "p1" }),
      getSegments: () => [segment]
    },
    commandBus: {
      canUndo: () => true,
      canRedo: () => true
    },
    editTargetSessions: sessions.boundary,
    persistence: { debounce: (value) => calls.push(["debounce", value.target]) },
    status: { commandsChanged: () => calls.push(["commandsChanged"]) },
    selection: {
      getActiveIndex: () => 0,
      ensureVisible: (index) => calls.push(["ensureVisible", index]),
      findEditor: () => textarea
    },
    createPatch: (value) => ({ target: value.target }),
    restorePatch: (segmentId, patch, context) => calls.push(["restore", segmentId, patch, context]),
    applyDraft: ({ target }) => {
      segment.target = target;
      calls.push(["applyDraft", target]);
      return { segment, patch: { target } };
    },
    activateSegment: (index) => calls.push(["activate", index]),
    confirmSegment: () => calls.push(["confirm"]),
    getCommandProjectId: () => "p1",
    getVisibleIndexes: () => [0, 1, 2],
    getVisiblePosition: () => 0,
    undo: () => calls.push(["undo"]),
    redo: () => calls.push(["redo"])
  });
  return { calls, controller, editingCell, segment, sessions, textarea };
}

test("target editor owns focus, composition input, coalescing, blur finalization, and listener cleanup", async () => {
  const { createTargetEditController } = await loadFactory();
  const harness = createHarness(createTargetEditController);
  const unbind = harness.controller.bindTargetEditor({
    textarea: harness.textarea,
    editingCell: harness.editingCell,
    index: 0,
    segmentId: "s1"
  });

  harness.textarea.dispatch("focus");
  assert.equal(harness.editingCell.classList.contains("editing"), true);
  assert.deepEqual(harness.calls[0], ["activate", 0]);

  harness.textarea.dispatch("compositionstart");
  harness.textarea.value = "composing one";
  harness.textarea.dispatch("input");
  harness.textarea.value = "composing two";
  harness.textarea.dispatch("input");
  assert.equal(harness.controller.isComposing(harness.textarea), true);
  assert.equal(harness.segment.target, "composing two");
  assert.equal(harness.sessions.calls.filter(([name]) => name === "begin").length, 1);
  assert.equal(harness.sessions.calls.filter(([name]) => name === "capture").length, 2);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "debounce"),
    [
      ["debounce", "composing one"],
      ["debounce", "composing two"]
    ]
  );

  harness.textarea.dispatch("compositionend");
  harness.textarea.dispatch("blur");
  assert.equal(harness.controller.isComposing(harness.textarea), false);
  assert.equal(harness.editingCell.classList.contains("editing"), false);
  assert.deepEqual(harness.calls.at(-1), ["commandsChanged"]);

  unbind();
  harness.textarea.value = "ignored after cleanup";
  harness.textarea.dispatch("input");
  assert.equal(harness.segment.target, "composing two");
});

test("target editor normalizes caret selection and routes Undo, Redo, confirm, and row navigation", async () => {
  const { createTargetEditController } = await loadFactory();
  const harness = createHarness(createTargetEditController);
  harness.controller.updateDraft(0, "edited");

  const undoEvent = {
    key: "z",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    }
  };
  harness.controller.handleKeydown(undoEvent, 0);
  assert.equal(undoEvent.prevented && undoEvent.stopped, true);
  assert.ok(harness.calls.some(([name]) => name === "undo"));
  assert.ok(harness.calls.some(([name]) => name === "commandsChanged"));

  harness.sessions.sessions.add("s1");
  harness.controller.handleKeydown({ ...undoEvent, shiftKey: true, prevented: false, stopped: false }, 0);
  assert.ok(harness.calls.some(([name]) => name === "redo"));

  const confirmEvent = { key: "Enter", ctrlKey: true, metaKey: false, preventDefault() {} };
  harness.controller.handleKeydown(confirmEvent, 0);
  assert.ok(harness.calls.some(([name]) => name === "confirm"));

  const navigationEvent = { key: "ArrowDown", altKey: true, preventDefault() {} };
  harness.controller.handleKeydown(navigationEvent, 0);
  await Promise.resolve();
  assert.ok(harness.calls.some(([name, index]) => name === "activate" && index === 1));

  harness.textarea.value = "edited";
  harness.controller.focusActive({ start: -5, end: 200 });
  assert.equal(harness.textarea.focused, true);
  assert.deepEqual(
    { start: harness.textarea.selectionStart, end: harness.textarea.selectionEnd },
    { start: 0, end: 6 }
  );
  harness.textarea.selectionStart = 2;
  harness.textarea.selectionEnd = 4;
  assert.deepEqual(harness.controller.activeSelection(harness.segment), { start: 2, end: 4 });
});
