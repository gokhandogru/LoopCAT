const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function fakeElement() {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map();
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
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
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

function createHarness(createTargetEditController, overrides = {}) {
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
    redo: () => calls.push(["redo"]),
    quickInsert: {
      hasSuggestions: () => overrides.hasSuggestions !== false,
      open: () => calls.push(["quickInsert"])
    },
    protectedTags: {
      targetTags: overrides.targetTags,
      missing: () => overrides.missingTags || [{ text: "<b>" }, { text: "</b>" }],
      insert: (tagTexts) => calls.push(["insertTags", tagTexts])
    }
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
  assert.match(harness.textarea.getAttribute("aria-keyshortcuts"), /Control\+Enter/);
  assert.ok(!harness.textarea.getAttribute("title"));

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

function xmlTags(segment) {
  return Array.from(String(segment.target || "").matchAll(/<[^>]+>/g), (match) => ({
    text: match[0],
    index: match.index
  }));
}

async function protectedHarness(target = 'Hello <g id="fmt1">world</g>.') {
  const { createTargetEditController } = await loadFactory();
  const harness = createHarness(createTargetEditController, { targetTags: xmlTags });
  harness.segment.target = target;
  harness.textarea.value = target;
  harness.unbind = harness.controller.bindTargetEditor({
    textarea: harness.textarea,
    editingCell: harness.editingCell,
    index: 0,
    segmentId: "s1"
  });
  return harness;
}

function beforeInput(harness, inputType, data = null) {
  const event = {
    inputType,
    data,
    cancelable: true,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  };
  harness.textarea.dispatch("beforeinput", event);
  return event;
}

test("protected target selections snap insertions outside raw tag attributes and expand partial selections", async () => {
  const h = await protectedHarness();
  const token = xmlTags(h.segment)[0];
  h.textarea.setSelectionRange(token.index + 2, token.index + 2);
  assert.deepEqual(h.controller.activeSelection(h.segment), { start: token.index, end: token.index });
  const typed = beforeInput(h, "insertText", "X");
  assert.equal(typed.prevented, true);
  assert.equal(h.segment.target, 'Hello X<g id="fmt1">world</g>.');
  assert.equal(h.textarea.value, h.segment.target);
  assert.equal(h.calls.filter(([name]) => name === "debounce").length, 1);
  const shifted = xmlTags(h.segment)[0];
  h.textarea.setSelectionRange(shifted.index + 2, shifted.index + 5);
  assert.deepEqual(h.controller.activeSelection(h.segment), {
    start: shifted.index,
    end: shifted.index + shifted.text.length
  });
});

test("Backspace and Delete at tag boundaries remove exactly the whole raw token", async () => {
  for (const inputType of ["deleteContentBackward", "deleteContentForward"]) {
    const h = await protectedHarness();
    const token = xmlTags(h.segment)[0];
    const caret = inputType.endsWith("Backward") ? token.index + token.text.length : token.index;
    h.textarea.setSelectionRange(caret, caret);
    assert.equal(beforeInput(h, inputType).prevented, true);
    assert.equal(h.segment.target, "Hello world</g>.");
    assert.equal(h.textarea.selectionStart, token.index);
    assert.equal(h.calls.filter(([name]) => name === "debounce").length, 1);
  }
});

test("whole-tag paste replacement is permitted even when attributes share a long prefix and suffix", async () => {
  const h = await protectedHarness();
  const token = xmlTags(h.segment)[0];
  h.textarea.setSelectionRange(token.index + 2, token.index + 8);
  h.textarea.dispatch("paste", { clipboardData: { getData: () => '<g id="fmt2">' } });
  assert.equal(h.textarea.selectionStart, token.index);
  assert.equal(h.textarea.selectionEnd, token.index + token.text.length);
  beforeInput(h, "insertFromPaste");
  h.textarea.value = 'Hello <g id="fmt2">world</g>.';
  h.textarea.dispatch("input", { inputType: "insertFromPaste" });
  assert.equal(h.segment.target, h.textarea.value);
  assert.equal(h.calls.filter(([name]) => name === "debounce").length, 1);
  assert.equal(
    h.controller.updateDraft(0, 'Hello <g id="fmt3">world</g>.'),
    null,
    "direct updates cannot silently change tag attributes"
  );
  assert.equal(h.segment.target, 'Hello <g id="fmt2">world</g>.');
});

test("cut selections expand atomically and native token moves preserve every raw attribute", async () => {
  const h = await protectedHarness();
  const token = xmlTags(h.segment)[0];
  h.textarea.setSelectionRange(token.index + 1, token.index + 5);
  h.textarea.dispatch("cut");
  assert.equal(h.textarea.selectionStart, token.index);
  assert.equal(h.textarea.selectionEnd, token.index + token.text.length);
  h.textarea.value = "Hello world</g>.";
  h.textarea.dispatch("input", { inputType: "deleteByCut" });
  assert.equal(h.segment.target, "Hello world</g>.");

  const moved = await protectedHarness();
  moved.textarea.value = '<g id="fmt1">Hello world</g>.';
  moved.textarea.dispatch("input", { inputType: "insertFromDrop" });
  assert.equal(moved.segment.target, '<g id="fmt1">Hello world</g>.');
});

test("missing/noncancelable beforeinput cannot persist a damaged token from paste, drop, or IME", async () => {
  for (const inputType of ["insertFromPaste", "insertFromDrop", "insertCompositionText", "insertReplacementText"]) {
    const h = await protectedHarness();
    const original = h.segment.target;
    h.textarea.value = 'Hello <g id="broken">world</g>.';
    h.textarea.setSelectionRange(15, 15);
    h.textarea.dispatch("input", { inputType, isComposing: inputType === "insertCompositionText" });
    assert.equal(h.segment.target, original, inputType);
    assert.equal(h.textarea.value, original, inputType);
    assert.equal(h.calls.filter(([name]) => name === "debounce").length, 0, inputType);
    assert.equal(h.sessions.calls.length, 0, inputType);
  }
});

test("noncancelable deletion that crosses part of a tag expands to one complete-token deletion", async () => {
  const h = await protectedHarness();
  h.textarea.value = 'Hello <g id="fmt1"world</g>.';
  h.textarea.dispatch("input", { inputType: "deleteWordBackward" });
  assert.equal(h.segment.target, "Hello world</g>.");
  assert.equal(h.textarea.value, h.segment.target);
  assert.equal(h.calls.filter(([name]) => name === "debounce").length, 1);
});

test("IME text outside protected tags still updates drafts and autosave before composition ends", async () => {
  const h = await protectedHarness('😀 <g id="fmt1">世界</g>');
  const position = h.segment.target.indexOf("世界");
  h.textarea.setSelectionRange(position, position + 2);
  h.textarea.dispatch("compositionstart");
  h.textarea.value = '😀 <g id="fmt1">世</g>';
  h.textarea.dispatch("input", { inputType: "insertCompositionText", isComposing: true });
  h.textarea.value = '😀 <g id="fmt1">世界中</g>';
  h.textarea.dispatch("input", { inputType: "insertCompositionText", isComposing: true });
  assert.equal(h.segment.target, '😀 <g id="fmt1">世界中</g>');
  assert.equal(h.controller.isComposing(h.textarea), true);
  assert.equal(h.calls.filter(([name]) => name === "debounce").length, 2);
  h.textarea.dispatch("compositionend");
  assert.equal(h.controller.isComposing(h.textarea), false);
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

test("target editor routes contextual Quick Insert and protected-tag shortcuts as atomic actions", async () => {
  const { createTargetEditController } = await loadFactory();
  const harness = createHarness(createTargetEditController);
  const event = (overrides) => ({
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    ...overrides
  });

  const quickInsertEvent = event({ key: "Tab" });
  harness.controller.handleKeydown(quickInsertEvent, 0);
  assert.equal(quickInsertEvent.prevented && quickInsertEvent.stopped, true);
  assert.ok(harness.calls.some(([name]) => name === "quickInsert"));

  const nextTagEvent = event({ key: "F8" });
  harness.controller.handleKeydown(nextTagEvent, 0);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "insertTags"),
    ["insertTags", ["<b>"]]
  );

  const allTagsEvent = event({ ctrlKey: true, key: "F8", shiftKey: true });
  harness.controller.handleKeydown(allTagsEvent, 0);
  assert.deepEqual(harness.calls.filter(([name]) => name === "insertTags").at(-1), ["insertTags", ["<b>", "</b>"]]);

  const unavailable = createHarness(createTargetEditController, { hasSuggestions: false, missingTags: [] });
  const nativeTab = event({ key: "Tab" });
  unavailable.controller.handleKeydown(nativeTab, 0);
  assert.equal(nativeTab.prevented, false);
  const noTag = event({ key: "F8" });
  unavailable.controller.handleKeydown(noTag, 0);
  assert.equal(noTag.prevented, false);

  const composing = event({ isComposing: true, key: "Tab" });
  harness.controller.handleKeydown(composing, 0);
  assert.equal(harness.calls.filter(([name]) => name === "quickInsert").length, 1);
});
