function define(id, options) {
  return Object.freeze({ id, ...options });
}

export const KEYBOARD_SHORTCUTS = Object.freeze({
  undo: define("undo", { key: "z", primary: true, label: "Ctrl/Cmd+Z" }),
  redo: define("redo", { key: "z", primary: true, shift: true, label: "Ctrl/Cmd+Shift+Z" }),
  palette: define("palette", { key: "k", code: "KeyK", primary: true, label: "Ctrl/Cmd+K" }),
  "palette-compat": define("palette-compat", {
    key: "p",
    primary: true,
    shift: true,
    label: "Ctrl/Cmd+Shift+P"
  }),
  confirm: define("confirm", { key: "enter", primary: true, label: "Ctrl/Cmd+Enter" }),
  "visible-next": define("visible-next", { key: "arrowdown", alt: true, label: "Alt+Down" }),
  "visible-previous": define("visible-previous", { key: "arrowup", alt: true, label: "Alt+Up" }),
  "open-next": define("open-next", { key: "enter", alt: true, label: "Alt+Enter" }),
  "open-previous": define("open-previous", {
    key: "enter",
    alt: true,
    shift: true,
    label: "Alt+Shift+Enter"
  }),
  "copy-source": define("copy-source", {
    key: "s",
    primary: true,
    shift: true,
    label: "Ctrl/Cmd+Shift+S"
  }),
  "quick-insert": define("quick-insert", { key: "tab", label: "Tab" }),
  concordance: define("concordance", {
    key: "k",
    code: "KeyK",
    primary: true,
    shift: true,
    label: "Ctrl/Cmd+Shift+K"
  }),
  "concordance-legacy": define("concordance-legacy", {
    key: "k",
    code: "KeyK",
    primary: true,
    alt: true,
    label: "Ctrl/Cmd+Alt+K"
  }),
  "focus-mode": define("focus-mode", {
    key: "f",
    primary: true,
    shift: true,
    label: "Ctrl/Cmd+Shift+F"
  }),
  "find-segments": define("find-segments", { key: "f", primary: true, label: "Ctrl/Cmd+F" }),
  "replace-target": define("replace-target", { key: "h", primary: true, label: "Ctrl/Cmd+H" }),
  "review-comment": define("review-comment", {
    key: "m",
    primary: true,
    shift: true,
    label: "Ctrl/Cmd+Shift+M"
  }),
  "next-tag": define("next-tag", { key: "f8", label: "F8" }),
  "all-tags": define("all-tags", {
    key: "f8",
    primary: true,
    shift: true,
    label: "Ctrl/Cmd+Shift+F8"
  }),
  "next-quality-risk": define("next-quality-risk", { key: "f9", label: "F9" }),
  qa: define("qa", { key: "f9", shift: true, label: "Shift+F9" }),
  "split-segment": define("split-segment", { key: "e", primary: true, label: "Ctrl/Cmd+E" }),
  "merge-segments": define("merge-segments", { key: "j", primary: true, label: "Ctrl/Cmd+J" })
});

function normalizedKey(value, normalizeKey) {
  if (typeof normalizeKey === "function") return normalizeKey(value);
  return String(value || "").toLowerCase();
}

export function isEditableKeyboardTarget(target) {
  return Boolean(target?.matches?.("input, textarea, select, [contenteditable='true']"));
}

export function isTargetEditor(target) {
  return Boolean(target?.matches?.(".segment-grid textarea"));
}

export function isUsableShortcutEvent(event) {
  if (!event || event.defaultPrevented || event.isComposing) return false;
  if (event.getModifierState?.("AltGraph")) return false;
  const key = normalizedKey(event.key);
  return key !== "dead" && key !== "process" && (key !== "unidentified" || Boolean(event.code));
}

export function matchesShortcut(event, shortcut, normalizeKey) {
  if (!shortcut || !isUsableShortcutEvent(event)) return false;
  const primary = Boolean(event.ctrlKey || event.metaKey);
  if (Boolean(shortcut.primary) !== primary) return false;
  if (Boolean(shortcut.shift) !== Boolean(event.shiftKey)) return false;
  if (Boolean(shortcut.alt) !== Boolean(event.altKey)) return false;
  const keyMatches = normalizedKey(event.key, normalizeKey) === normalizedKey(shortcut.key, normalizeKey);
  return keyMatches || Boolean(shortcut.code && event.code === shortcut.code);
}

export function shortcutLabel(id) {
  return KEYBOARD_SHORTCUTS[id]?.label || "";
}
