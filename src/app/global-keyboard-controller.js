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
 *   focus: { isActive: () => boolean, toggle: () => unknown, disable: () => unknown }
 * }} options
 */
export function createGlobalKeyboardController(options) {
  const target = options?.target;
  const normalizeKey = options?.normalizeKey;
  const commands = options?.commands;
  const context = options?.context;
  const palette = options?.palette;
  const concordance = options?.concordance;
  const focus = options?.focus;
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

  function handleKeydown(event) {
    const key = normalizeKey(event.key);
    const editableTarget = event.target?.matches?.("input, textarea, [contenteditable='true']");
    if ((event.ctrlKey || event.metaKey) && key === "z" && !editableTarget) {
      const projectId = commands.getProjectId();
      const canRun = event.shiftKey ? commands.canRedo(projectId) : commands.canUndo(projectId);
      if (canRun) {
        event.preventDefault();
        event.stopPropagation();
        void (event.shiftKey ? commands.redo() : commands.undo());
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "p") {
      event.preventDefault();
      event.stopPropagation();
      palette?.open?.();
      return;
    }
    const isK = key === "k" || event.code === "KeyK";
    if (isK && (event.ctrlKey || event.metaKey) && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      palette?.open?.();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      key === "f" &&
      context.getView() === "editor" &&
      context.hasProject()
    ) {
      event.preventDefault();
      event.stopPropagation();
      focus.toggle();
      return;
    }
    const concordanceShortcut = isK && (event.ctrlKey || event.metaKey) && event.altKey;
    if (concordanceShortcut && context.getView() === "editor") {
      event.preventDefault();
      event.stopPropagation();
      concordance.open();
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
