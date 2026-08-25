const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadModule() {
  return import(pathToFileURL(path.join(root, "src/app/keyboard-shortcuts.js")).href);
}

function event(overrides = {}) {
  return {
    altKey: false,
    code: "",
    ctrlKey: false,
    defaultPrevented: false,
    getModifierState: () => false,
    isComposing: false,
    key: "",
    metaKey: false,
    shiftKey: false,
    ...overrides
  };
}

test("shortcut registry is immutable and exposes the documented central labels", async () => {
  const { KEYBOARD_SHORTCUTS, shortcutLabel } = await loadModule();
  assert.equal(Object.isFrozen(KEYBOARD_SHORTCUTS), true);
  assert.equal(Object.isFrozen(KEYBOARD_SHORTCUTS.confirm), true);
  assert.equal(shortcutLabel("confirm"), "Ctrl/Cmd+Enter");
  assert.equal(shortcutLabel("quick-insert"), "Tab");
  assert.equal(shortcutLabel("palette"), "F2");
  assert.equal(shortcutLabel("concordance"), "F4");
  assert.equal(shortcutLabel("review-comment"), "Shift+F4");
  assert.equal(shortcutLabel("replace-target"), "Ctrl/Cmd+Shift+H");
  assert.equal(shortcutLabel("split-segment"), "Ctrl/Cmd+Shift+E");
  assert.equal(shortcutLabel("merge-segments"), "Ctrl/Cmd+Shift+L");
  assert.equal(shortcutLabel("missing"), "");
});

test("shortcut matching accepts Ctrl or Command and requires exact modifiers", async () => {
  const { KEYBOARD_SHORTCUTS, matchesShortcut } = await loadModule();
  assert.equal(matchesShortcut(event({ ctrlKey: true, key: "ENTER" }), KEYBOARD_SHORTCUTS.confirm), true);
  assert.equal(matchesShortcut(event({ key: "Enter", metaKey: true }), KEYBOARD_SHORTCUTS.confirm), true);
  assert.equal(
    matchesShortcut(event({ ctrlKey: true, key: "Enter", shiftKey: true }), KEYBOARD_SHORTCUTS.confirm),
    false
  );
  assert.equal(matchesShortcut(event({ altKey: true, key: "ArrowDown" }), KEYBOARD_SHORTCUTS["visible-next"]), true);
  assert.equal(matchesShortcut(event({ key: "Tab" }), KEYBOARD_SHORTCUTS["quick-insert"]), true);
});

test("physical-key fallback works without accepting composition, AltGraph, or unusable key states", async () => {
  const { KEYBOARD_SHORTCUTS, isUsableShortcutEvent, matchesShortcut } = await loadModule();
  assert.equal(
    matchesShortcut(
      event({ code: "KeyK", ctrlKey: true, key: "Unidentified", shiftKey: true }),
      KEYBOARD_SHORTCUTS["concordance-alternate"]
    ),
    true
  );
  for (const blocked of [
    event({ ctrlKey: true, isComposing: true, key: "k" }),
    event({ ctrlKey: true, key: "Dead" }),
    event({ ctrlKey: true, key: "Process" }),
    event({ ctrlKey: true, key: "k", getModifierState: (name) => name === "AltGraph" })
  ]) {
    assert.equal(isUsableShortcutEvent(blocked), false);
    assert.equal(matchesShortcut(blocked, KEYBOARD_SHORTCUTS["palette-compat"]), false);
  }

  const consumedF2 = event({ defaultPrevented: true, key: "F2" });
  assert.equal(isUsableShortcutEvent(consumedF2), true);
  assert.equal(matchesShortcut(consumedF2, KEYBOARD_SHORTCUTS.palette), true);
});

test("editable and target-editor classification keeps application routing contextual", async () => {
  const { isEditableKeyboardTarget, isTargetEditor } = await loadModule();
  const target = {
    matches(selector) {
      return selector === "input, textarea, select, [contenteditable='true']" || selector === ".segment-grid textarea";
    }
  };
  assert.equal(isEditableKeyboardTarget(target), true);
  assert.equal(isTargetEditor(target), true);
  assert.equal(isEditableKeyboardTarget(null), false);
  assert.equal(isTargetEditor(null), false);
});
