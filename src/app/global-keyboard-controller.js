import {
  KEYBOARD_SHORTCUTS,
  isEditableKeyboardTarget,
  isTargetEditor,
  isUsableShortcutEvent,
  matchesShortcut
} from "./keyboard-shortcuts.js";

/**
 * Owns application-global keyboard listener lifecycle and shortcut routing.
 * Command, palette, concordance, Focus-mode, session, and navigation behavior
 * remain behind injected boundaries.
 *
 * @param {{
 *   target: { addEventListener: Function, removeEventListener: Function },
 *   normalizeKey: (value: unknown) => string,
 *   commands: {
 *     getProjectId: () => string | null,
 *     canUndo: (projectId: string | null) => boolean,
 *     canRedo: (projectId: string | null) => boolean,
 *     undo: () => unknown,
 *     redo: () => unknown
 *   },
 *   context: { getView: () => string, hasProject: () => boolean },
 *   palette?: { isOpen?: () => boolean, open?: () => unknown, close?: () => unknown } | null,
 *   concordance: { isOpen: () => boolean, open: () => unknown, close: () => unknown },
 *   quickInsert?: { isOpen?: () => boolean, close?: () => unknown } | null,
 *   focus: { isActive: () => boolean, toggle: () => unknown, disable: () => unknown },
 *   editor?: Record<string, Function> | null
 * }} options
 */
export function createGlobalKeyboardController(options) {
  const target = options?.target;
  const normalizeKey = options?.normalizeKey;
  const commands = options?.commands;
  const context = options?.context;
  const palette = options?.palette;
  const concordance = options?.concordance;
  const quickInsert = options?.quickInsert;
  const focus = options?.focus;
  const editor = options?.editor || {};
  if (!target?.addEventListener || !target?.removeEventListener || typeof normalizeKey !== "function") {
    throw new TypeError("GlobalKeyboardController requires an event target and key normalizer.");
  }
  if (
    typeof commands?.getProjectId !== "function" ||
    typeof commands?.canUndo !== "function" ||
    typeof commands?.canRedo !== "function" ||
    typeof commands?.undo !== "function" ||
    typeof commands?.redo !== "function"
  ) {
    throw new TypeError("GlobalKeyboardController requires command boundaries.");
  }
  if (typeof context?.getView !== "function" || typeof context?.hasProject !== "function") {
    throw new TypeError("GlobalKeyboardController requires application context boundaries.");
  }
  if (
    typeof concordance?.isOpen !== "function" ||
    typeof concordance?.open !== "function" ||
    typeof concordance?.close !== "function"
  ) {
    throw new TypeError("GlobalKeyboardController requires concordance boundaries.");
  }
  if (
    typeof focus?.isActive !== "function" ||
    typeof focus?.toggle !== "function" ||
    typeof focus?.disable !== "function"
  ) {
    throw new TypeError("GlobalKeyboardController requires Focus-mode boundaries.");
  }

  let mounted = false;

  function run(event, action) {
    if (typeof action !== "function") return false;
    event.preventDefault();
    event.stopPropagation();
    void action();
    return true;
  }

  function matchesAny(event, shortcutIds) {
    return shortcutIds.some((id) => matchesShortcut(event, KEYBOARD_SHORTCUTS[id], normalizeKey));
  }

  function handleKeydown(event) {
    if (!isUsableShortcutEvent(event)) return;
    const editableTarget = isEditableKeyboardTarget(event.target);
    const targetEditor = isTargetEditor(event.target);
    if (
      !editableTarget &&
      (matchesShortcut(event, KEYBOARD_SHORTCUTS.undo, normalizeKey) ||
        matchesShortcut(event, KEYBOARD_SHORTCUTS.redo, normalizeKey))
    ) {
      const projectId = commands.getProjectId();
      const redoRequested = matchesShortcut(event, KEYBOARD_SHORTCUTS.redo, normalizeKey);
      const canRun = redoRequested ? commands.canRedo(projectId) : commands.canUndo(projectId);
      if (canRun) {
        event.preventDefault();
        event.stopPropagation();
        void (redoRequested ? commands.redo() : commands.undo());
        return;
      }
    }
    if (matchesAny(event, ["palette", "palette-alternate", "palette-compat"])) {
      quickInsert?.close?.();
      run(event, palette?.open);
      return;
    }
    const editorReady = context.getView() === "editor" && context.hasProject();
    if (editorReady && matchesAny(event, ["concordance", "concordance-alternate", "concordance-legacy"])) {
      quickInsert?.close?.();
      run(event, concordance.open);
      return;
    }
    if (editorReady && matchesShortcut(event, KEYBOARD_SHORTCUTS["focus-mode"], normalizeKey)) {
      run(event, focus.toggle);
      return;
    }
    if (editorReady && matchesShortcut(event, KEYBOARD_SHORTCUTS["find-segments"], normalizeKey)) {
      run(event, editor.focusSearch);
      return;
    }
    if (editorReady && matchesAny(event, ["replace-target", "replace-target-compat"])) {
      run(event, editor.openReplace);
      return;
    }
    if (editorReady && matchesAny(event, ["review-comment", "review-comment-alternate", "review-comment-compat"])) {
      run(event, editor.openReviewComment);
      return;
    }
    if (
      editorReady &&
      (!editableTarget || targetEditor) &&
      matchesShortcut(event, KEYBOARD_SHORTCUTS["copy-source"], normalizeKey)
    ) {
      run(event, editor.copySource);
      return;
    }
    if (
      editorReady &&
      (!editableTarget || targetEditor) &&
      matchesShortcut(event, KEYBOARD_SHORTCUTS["open-next"], normalizeKey)
    ) {
      run(event, editor.nextOpen);
      return;
    }
    if (
      editorReady &&
      (!editableTarget || targetEditor) &&
      matchesShortcut(event, KEYBOARD_SHORTCUTS["open-previous"], normalizeKey)
    ) {
      run(event, editor.previousOpen);
      return;
    }
    if (editorReady && matchesShortcut(event, KEYBOARD_SHORTCUTS["next-quality-risk"], normalizeKey)) {
      run(event, editor.nextQualityRisk);
      return;
    }
    if (editorReady && matchesShortcut(event, KEYBOARD_SHORTCUTS.qa, normalizeKey)) {
      run(event, editor.runQa);
      return;
    }
    if (
      editorReady &&
      (!editableTarget || targetEditor) &&
      matchesAny(event, ["split-segment", "split-segment-compat"])
    ) {
      run(event, editor.splitSegment);
      return;
    }
    if (
      editorReady &&
      (!editableTarget || targetEditor) &&
      matchesAny(event, ["merge-segments", "merge-segments-compat"])
    ) {
      run(event, editor.mergeSegment);
      return;
    }
    if (event.key === "Escape" && quickInsert?.isOpen?.()) {
      event.preventDefault();
      quickInsert.close?.();
      return;
    }
    if (event.key === "Escape" && concordance.isOpen()) {
      event.preventDefault();
      concordance.close();
      return;
    }
    if (event.key === "Escape" && palette?.isOpen?.()) {
      event.preventDefault();
      palette?.close?.();
      return;
    }
    if (event.key === "Escape" && focus.isActive()) {
      event.preventDefault();
      focus.disable();
    }
  }

  function mount() {
    if (mounted) return false;
    target.addEventListener("keydown", handleKeydown, true);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    target.removeEventListener("keydown", handleKeydown, true);
    mounted = false;
    return true;
  }

  return Object.freeze({ handleKeydown, mount, unmount });
}
