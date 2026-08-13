function normalizeSelection(selection, targetLength) {
  if (!selection) return null;
  const length = Math.max(0, Number(targetLength) || 0);
  const start = Math.max(0, Math.min(length, Number(selection.start) || 0));
  const end = Math.max(start, Math.min(length, Number(selection.end) || start));
  return { start, end };
}

/**
 * Owns target-editor DOM input, composition, focus, keyboard, and caret
 * orchestration. Domain records, reversible commands, persistence, status, and
 * selection lookup remain behind injected application boundaries.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[] },
 *   commandBus: { canUndo: (projectId: string | null) => boolean, canRedo: (projectId: string | null) => boolean },
 *   editTargetSessions: { begin: (options: object) => unknown, capture: (segmentId: string, patch: any, context?: object) => unknown, finalize: (segmentId: string) => unknown, finalizeProject: (projectId: string) => unknown[], finalizeAll: () => unknown[], has: (segmentId: string) => boolean },
 *   persistence: { debounce: (segment: any) => unknown },
 *   status: { commandsChanged: () => void },
 *   selection: { getActiveIndex: () => number, ensureVisible: (index: number) => void, findEditor: (index: number) => any },
 *   createPatch: (segment: any) => any,
 *   restorePatch: (segmentId: string, patch: any, context?: object) => Promise<unknown> | unknown,
 *   applyDraft: (context: { index: number, segment: any, target: string }) => { segment?: any, patch?: any } | void,
 *   activateSegment?: (index: number) => Promise<unknown> | unknown,
 *   confirmSegment?: () => Promise<unknown> | unknown,
 *   getCommandProjectId?: () => string,
 *   getVisibleIndexes?: () => number[],
 *   getVisiblePosition?: (index: number) => number,
 *   normalizeKey?: (value: unknown) => string,
 *   undo?: () => Promise<unknown> | unknown,
 *   redo?: () => Promise<unknown> | unknown
 * }} options
 */
export function createTargetEditController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const commandBus = options?.commandBus;
  const editTargetSessions = options?.editTargetSessions;
  const persistence = options?.persistence;
  const status = options?.status;
  const selection = options?.selection;
  if (typeof editorSessionStore?.getSegments !== "function" || typeof editorSessionStore?.getProject !== "function") {
    throw new TypeError("TargetEditController requires EditorSessionStore selectors.");
  }
  if (typeof commandBus?.canUndo !== "function" || typeof commandBus?.canRedo !== "function") {
    throw new TypeError("TargetEditController requires the CommandBus boundary.");
  }
  if (
    typeof editTargetSessions?.begin !== "function" ||
    typeof editTargetSessions?.capture !== "function" ||
    typeof editTargetSessions?.finalize !== "function" ||
    typeof editTargetSessions?.finalizeProject !== "function" ||
    typeof editTargetSessions?.finalizeAll !== "function" ||
    typeof editTargetSessions?.has !== "function"
  ) {
    throw new TypeError("TargetEditController requires EditTarget session orchestration.");
  }
  if (typeof persistence?.debounce !== "function") {
    throw new TypeError("TargetEditController requires an autosave persistence boundary.");
  }
  if (typeof status?.commandsChanged !== "function") {
    throw new TypeError("TargetEditController requires a command-status boundary.");
  }
  if (
    typeof selection?.getActiveIndex !== "function" ||
    typeof selection?.ensureVisible !== "function" ||
    typeof selection?.findEditor !== "function"
  ) {
    throw new TypeError("TargetEditController requires target selection boundaries.");
  }
  if (
    typeof options.createPatch !== "function" ||
    typeof options.restorePatch !== "function" ||
    typeof options.applyDraft !== "function"
  ) {
    throw new TypeError("TargetEditController requires target mutation adapters.");
  }

  const activateSegment =
    typeof options.activateSegment === "function" ? options.activateSegment : () => Promise.resolve();
  const confirmSegment = typeof options.confirmSegment === "function" ? options.confirmSegment : () => {};
  const getCommandProjectId =
    typeof options.getCommandProjectId === "function" ? options.getCommandProjectId : () => "";
  const getVisibleIndexes = typeof options.getVisibleIndexes === "function" ? options.getVisibleIndexes : () => [];
  const getVisiblePosition = typeof options.getVisiblePosition === "function" ? options.getVisiblePosition : () => -1;
  const normalizeKey =
    typeof options.normalizeKey === "function" ? options.normalizeKey : (value) => String(value || "").toLowerCase();
  const undo = typeof options.undo === "function" ? options.undo : () => {};
  const redo = typeof options.redo === "function" ? options.redo : () => {};
  const composingEditors = new WeakSet();

  function finalize(segmentId) {
    if (!segmentId) return null;
    const recorded = editTargetSessions.finalize(segmentId) || null;
    if (recorded) status.commandsChanged();
    return recorded;
  }

  function finalizeProject(projectId = "") {
    const recorded = projectId ? editTargetSessions.finalizeProject(projectId) || [] : [];
    if (recorded.length) status.commandsChanged();
    return recorded;
  }

  function finalizeAll() {
    const recorded = editTargetSessions.finalizeAll() || [];
    if (recorded.length) status.commandsChanged();
    return recorded;
  }

  function updateDraft(index, target) {
    const segment = editorSessionStore.getSegments()[index];
    if (!segment) return null;
    if (!editTargetSessions.has(segment.id)) {
      editTargetSessions.begin({
        projectId: segment.projectId || editorSessionStore.getProject()?.id,
        segmentId: segment.id,
        beforePatch: options.createPatch(segment),
        restorePatch: (patch, context) => options.restorePatch(segment.id, patch, context)
      });
    }
    const result = options.applyDraft({ index, segment, target: String(target || "") }) || {};
    const appliedSegment = result.segment || segment;
    editTargetSessions.capture(segment.id, result.patch || options.createPatch(appliedSegment), {
      activeSegmentId: segment.id
    });
    persistence.debounce(appliedSegment);
    return result;
  }

  function focusActive(targetSelection = null) {
    const index = selection.getActiveIndex();
    selection.ensureVisible(index);
    const editor = selection.findEditor(index);
    editor?.focus?.();
    if (editor && targetSelection) {
      const normalized = normalizeSelection(targetSelection, String(editor.value || "").length);
      editor.setSelectionRange?.(normalized.start, normalized.end);
    }
    return editor || null;
  }

  function activeSelection(segment) {
    const editor = selection.findEditor(selection.getActiveIndex());
    const length = String(segment?.target || "").length;
    return normalizeSelection(
      editor
        ? { start: editor.selectionStart ?? length, end: editor.selectionEnd ?? length }
        : { start: length, end: length },
      length
    );
  }

  function handleKeydown(event, index) {
    const key = normalizeKey(event.key);
    if ((event.ctrlKey || event.metaKey) && key === "z" && !event.altKey) {
      finalize(editorSessionStore.getSegments()[index]?.id || "");
      const projectId = getCommandProjectId() || editorSessionStore.getProject()?.id || null;
      const canRun = event.shiftKey ? commandBus.canRedo(projectId) : commandBus.canUndo(projectId);
      if (canRun) {
        event.preventDefault();
        event.stopPropagation();
        void (event.shiftKey ? redo() : undo());
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void confirmSegment();
      return;
    }
    if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const visible = getVisibleIndexes();
      const position = getVisiblePosition(index);
      const offset = event.key === "ArrowDown" ? 1 : -1;
      const nextPosition = Math.max(0, Math.min(position + offset, visible.length - 1));
      const next = visible[nextPosition];
      void Promise.resolve(activateSegment(next)).then(() => focusActive());
    }
  }

  function bindTargetEditor({ textarea, editingCell, index, segmentId }) {
    if (!textarea?.addEventListener) {
      throw new TypeError("TargetEditController requires a target textarea.");
    }
    const listeners = {
      focus: () => {
        editingCell?.classList?.add?.("editing");
        void activateSegment(index);
      },
      blur: () => {
        editingCell?.classList?.remove?.("editing");
        finalize(segmentId);
      },
      compositionstart: () => composingEditors.add(textarea),
      compositionend: () => composingEditors.delete(textarea),
      input: () => updateDraft(index, textarea.value),
      keydown: (event) => handleKeydown(event, index)
    };
    Object.entries(listeners).forEach(([type, listener]) => textarea.addEventListener(type, listener));
    return () => {
      Object.entries(listeners).forEach(([type, listener]) => textarea.removeEventListener(type, listener));
      composingEditors.delete(textarea);
    };
  }

  return Object.freeze({
    activeSelection,
    bindTargetEditor,
    finalize,
    finalizeAll,
    finalizeProject,
    focusActive,
    handleKeydown,
    isComposing: (editor) => composingEditors.has(editor),
    normalizeSelection,
    updateDraft
  });
}
