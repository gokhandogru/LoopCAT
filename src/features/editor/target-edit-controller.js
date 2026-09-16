import { KEYBOARD_SHORTCUTS, isUsableShortcutEvent, matchesShortcut } from "../../app/keyboard-shortcuts.js";
import {
  protectedTokenRanges,
  normalizeProtectedSelection,
  protectedInputSelection,
  permitsProtectedEdit,
  expandProtectedDeletion
} from "./protected-token-edit-guard.js";

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
 *   redo?: () => Promise<unknown> | unknown,
 *   quickInsert?: { hasSuggestions?: () => boolean, open?: () => Promise<unknown> | unknown },
 *   termCapture?: { open?: () => Promise<unknown> | unknown },
 *   predictiveTyping?: { prepare?: () => unknown, onInput?: (editor: any, index: number, event?: any) => unknown, handleKeydown?: (event: any) => boolean, hide?: () => unknown },
 *   protectedTags?: { missing?: (segment: any) => any[], targetTags?: (segment: any) => any[], insert?: (tagTexts: string[]) => Promise<unknown> | unknown }
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
  const quickInsert = options.quickInsert || {};
  const termCapture = options.termCapture || {};
  const predictiveTyping = options.predictiveTyping || {};
  const protectedTags = options.protectedTags || {};
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

  function tokenRanges(segment) {
    return protectedTokenRanges(segment?.target || "", protectedTags.targetTags?.(segment) || []);
  }

  function updateDraft(index, target, intent = null) {
    globalThis.window?.CatHan?.ownership?.assertWritable(editorSessionStore.getProject()?.id);
    const segment = editorSessionStore.getSegments()[index];
    if (!segment) return null;
    if (!permitsProtectedEdit(String(segment.target || ""), String(target || ""), tokenRanges(segment), intent))
      return null;
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
      const normalized = normalizeProtectedSelection(
        targetSelection,
        String(editor.value || "").length,
        tokenRanges(editorSessionStore.getSegments()[index])
      );
      editor.setSelectionRange?.(normalized.start, normalized.end);
    }
    return editor || null;
  }

  function activeSelection(segment) {
    const editor = selection.findEditor(selection.getActiveIndex());
    const length = String(segment?.target || "").length;
    return normalizeProtectedSelection(
      editor
        ? { start: editor.selectionStart ?? length, end: editor.selectionEnd ?? length }
        : { start: length, end: length },
      length,
      tokenRanges(segment)
    );
  }

  function handleKeydown(event, index) {
    if (!isUsableShortcutEvent(event)) return;
    if (predictiveTyping.handleKeydown?.(event)) return;
    if (
      matchesShortcut(event, KEYBOARD_SHORTCUTS.undo, normalizeKey) ||
      matchesShortcut(event, KEYBOARD_SHORTCUTS.redo, normalizeKey)
    ) {
      finalize(editorSessionStore.getSegments()[index]?.id || "");
      const projectId = getCommandProjectId() || editorSessionStore.getProject()?.id || null;
      const redoRequested = matchesShortcut(event, KEYBOARD_SHORTCUTS.redo, normalizeKey);
      const canRun = redoRequested ? commandBus.canRedo(projectId) : commandBus.canUndo(projectId);
      if (canRun) {
        event.preventDefault();
        event.stopPropagation();
        void (redoRequested ? redo() : undo());
        return;
      }
    }
    if (matchesShortcut(event, KEYBOARD_SHORTCUTS.confirm, normalizeKey)) {
      event.preventDefault();
      void confirmSegment();
      return;
    }
    if (matchesShortcut(event, KEYBOARD_SHORTCUTS["term-capture"], normalizeKey)) {
      event.preventDefault();
      event.stopPropagation();
      void termCapture.open?.();
      return;
    }
    if (
      matchesShortcut(event, KEYBOARD_SHORTCUTS["visible-next"], normalizeKey) ||
      matchesShortcut(event, KEYBOARD_SHORTCUTS["visible-previous"], normalizeKey)
    ) {
      event.preventDefault();
      const visible = getVisibleIndexes();
      const position = getVisiblePosition(index);
      const offset = matchesShortcut(event, KEYBOARD_SHORTCUTS["visible-next"], normalizeKey) ? 1 : -1;
      const nextPosition = Math.max(0, Math.min(position + offset, visible.length - 1));
      const next = visible[nextPosition];
      void Promise.resolve(activateSegment(next)).then(() => focusActive());
      return;
    }
    if (
      (matchesShortcut(event, KEYBOARD_SHORTCUTS["quick-insert"], normalizeKey) ||
        matchesShortcut(event, KEYBOARD_SHORTCUTS["quick-insert-alternate"], normalizeKey)) &&
      quickInsert.hasSuggestions?.()
    ) {
      event.preventDefault();
      event.stopPropagation();
      void quickInsert.open?.();
      return;
    }
    if (
      matchesShortcut(event, KEYBOARD_SHORTCUTS["all-tags"], normalizeKey) ||
      matchesShortcut(event, KEYBOARD_SHORTCUTS["next-tag"], normalizeKey)
    ) {
      const segment = editorSessionStore.getSegments()[index];
      const missing = protectedTags.missing?.(segment) || [];
      const insertAll = matchesShortcut(event, KEYBOARD_SHORTCUTS["all-tags"], normalizeKey);
      const tagTexts = (insertAll ? missing : missing.slice(0, 1)).map((tag) => String(tag?.text || tag?.label || ""));
      if (!tagTexts.length) return;
      event.preventDefault();
      event.stopPropagation();
      void protectedTags.insert?.(tagTexts);
    }
  }

  function bindTargetEditor({ textarea, editingCell, index, segmentId }) {
    if (!textarea?.addEventListener) {
      throw new TypeError("TargetEditController requires a target textarea.");
    }
    textarea.readOnly = Boolean(globalThis.window?.CatHan?.ownership?.isReadOnly(editorSessionStore.getProject()?.id));
    textarea.setAttribute?.(
      "aria-keyshortcuts",
      "Control+Enter Meta+Enter Control+Shift+G Meta+Shift+G Alt+ArrowDown Alt+ArrowUp Tab Alt+Insert F8 Control+Shift+F8 Meta+Shift+F8"
    );
    let inputIntent = null;
    function prepareInput(inputType = "", replacement = undefined) {
      const segment = editorSessionStore.getSegments()[index];
      if (!segment || /^(historyUndo|historyRedo)$/.test(inputType)) {
        inputIntent = null;
        return;
      }
      const value = String(segment.target || "");
      const nextSelection = protectedInputSelection(
        { start: textarea.selectionStart, end: textarea.selectionEnd },
        value.length,
        tokenRanges(segment),
        inputType
      );
      if (nextSelection.start !== textarea.selectionStart || nextSelection.end !== textarea.selectionEnd) {
        textarea.setSelectionRange?.(nextSelection.start, nextSelection.end);
      }
      if (/^delete/.test(inputType)) replacement = "";
      else if (/^(insertLineBreak|insertParagraph)$/.test(inputType)) replacement = "\n";
      else if (replacement == null && inputIntent?.value === value && inputIntent.inputType === inputType)
        replacement = inputIntent.replacement;
      inputIntent = {
        value,
        selection: nextSelection,
        inputType,
        replacement: typeof replacement === "string" ? replacement.replace(/\r\n?/g, "\n") : undefined
      };
    }
    function applyInput(event) {
      let result = updateDraft(index, textarea.value, inputIntent);
      inputIntent = null;
      if (!result && /^delete/.test(event?.inputType || "")) {
        const segment = editorSessionStore.getSegments()[index];
        const expanded = expandProtectedDeletion(String(segment?.target || ""), textarea.value, tokenRanges(segment));
        if (expanded) {
          result = updateDraft(index, expanded.value, expanded.intent);
          if (result) {
            textarea.value = expanded.value;
            textarea.setSelectionRange?.(expanded.caret, expanded.caret);
          }
        }
      }
      if (!result) {
        const segment = editorSessionStore.getSegments()[index];
        const restoredSelection = { start: textarea.selectionStart, end: textarea.selectionEnd };
        textarea.value = segment?.target || "";
        const safeSelection = normalizeProtectedSelection(
          restoredSelection,
          textarea.value.length,
          tokenRanges(segment)
        );
        textarea.setSelectionRange?.(safeSelection.start, safeSelection.end);
        predictiveTyping.hide?.();
        return;
      }
      textarea.refreshTokens?.();
      predictiveTyping.onInput?.(textarea, index, {
        isComposing: composingEditors.has(textarea) || event?.isComposing
      });
    }
    const listeners = {
      focus: () => {
        editingCell?.classList?.add?.("editing");
        void Promise.resolve(activateSegment(index)).then(() => predictiveTyping.prepare?.());
      },
      blur: () => {
        editingCell?.classList?.remove?.("editing");
        finalize(segmentId);
        predictiveTyping.hide?.();
      },
      compositionstart: () => {
        prepareInput("insertCompositionText");
        composingEditors.add(textarea);
        predictiveTyping.hide?.();
      },
      compositionend: () => {
        composingEditors.delete(textarea);
        textarea.refreshTokens?.();
        predictiveTyping.onInput?.(textarea, index);
      },
      input: applyInput,
      beforeinput: (event) => {
        if (textarea.refreshTokens && /^(historyUndo|historyRedo)$/.test(event.inputType)) {
          event.preventDefault();
          finalize(segmentId);
          void (event.inputType === "historyUndo" ? undo() : redo());
          return;
        }
        const beforeSelection = { start: textarea.selectionStart, end: textarea.selectionEnd };
        prepareInput(event?.inputType || "", event?.data ?? event?.dataTransfer?.getData?.("text/plain"));
        if (
          !inputIntent ||
          typeof inputIntent.replacement !== "string" ||
          event?.cancelable === false ||
          !event?.preventDefault
        )
          return;
        const { value, selection: safe, replacement } = inputIntent;
        if (safe.start === beforeSelection.start && safe.end === beforeSelection.end) return;
        event.preventDefault();
        // Some engines compute their replacement range before beforeinput.
        // Apply an expanded/snap-to-boundary edit ourselves rather than trust it.
        if (textarea.setRangeText) textarea.setRangeText(replacement, safe.start, safe.end, "end");
        else {
          textarea.value = value.slice(0, safe.start) + replacement + value.slice(safe.end);
          textarea.setSelectionRange?.(safe.start + replacement.length, safe.start + replacement.length);
        }
        applyInput(event);
      },
      paste: (event) => prepareInput("insertFromPaste", event?.clipboardData?.getData?.("text/plain")),
      cut: () => prepareInput("deleteByCut"),
      drop: (event) => prepareInput("insertFromDrop", event?.dataTransfer?.getData?.("text/plain")),
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
