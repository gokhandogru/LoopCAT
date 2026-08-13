/**
 * Owns discrete target-producer command, selection, rendering, autosave, and
 * recovery orchestration. Segment records remain owned by EditorSessionStore;
 * mutation, persistence, and command restoration stay behind injected
 * application boundaries.
 *
 * @param {{
 *   copySourceElement: any,
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[] },
 *   commands: { bus: { execute: (command: any) => Promise<any> }, createCopySource: (options: object) => any, createTmTarget: (options: object) => any, createProtectedTag: (options: object) => any, changed: () => void },
 *   editLifecycle: { finalize: (segmentId: string) => unknown },
 *   persistence: { clearPending: (segment: any, options?: object) => unknown, debounce: (segment: any) => unknown },
 *   selection: { getActiveIndex: () => number, active: (segment: any) => { start: number, end: number } | null, normalize: (selection: any, targetLength: number) => { start: number, end: number } | null, focus: (selection?: { start: number, end: number } | null) => unknown },
 *   filters: { matches: (segment: any) => boolean },
 *   mutation: { capturePatch: (segment: any) => any, applyTarget: (segment: any, target: string, status: string, reason: string) => void, touch: (segment: any) => unknown, restorePatch: (segment: any, patch: any) => unknown, invalidateFilters: () => void },
 *   restoration: { restorePatch: (segmentId: string, patch: any, context?: object) => Promise<unknown> | unknown },
 *   view: { renderSegments: (options?: object) => void, renderProgress: (options?: object) => void, renderHistory: () => void },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void }
 * }} options
 */
export function createTargetProducerController(options) {
  const copySourceElement = options?.copySourceElement;
  const editorSessionStore = options?.editorSessionStore;
  const commands = options?.commands;
  const editLifecycle = options?.editLifecycle;
  const persistence = options?.persistence;
  const selection = options?.selection;
  const filters = options?.filters;
  const mutation = options?.mutation;
  const restoration = options?.restoration;
  const view = options?.view;
  const workspace = options?.workspace;
  const status = options?.status;
  if (!copySourceElement?.addEventListener || !copySourceElement?.removeEventListener) {
    throw new TypeError("TargetProducerController requires the Copy Source button.");
  }
  if (typeof editorSessionStore?.getProject !== "function" || typeof editorSessionStore?.getSegments !== "function") {
    throw new TypeError("TargetProducerController requires EditorSessionStore selectors.");
  }
  if (
    typeof commands?.bus?.execute !== "function" ||
    typeof commands?.createCopySource !== "function" ||
    typeof commands?.createTmTarget !== "function" ||
    typeof commands?.createProtectedTag !== "function" ||
    typeof commands?.changed !== "function"
  ) {
    throw new TypeError("TargetProducerController requires discrete target command boundaries.");
  }
  if (typeof editLifecycle?.finalize !== "function") {
    throw new TypeError("TargetProducerController requires EditTarget finalization.");
  }
  if (typeof persistence?.clearPending !== "function" || typeof persistence?.debounce !== "function") {
    throw new TypeError("TargetProducerController requires AutosaveService boundaries.");
  }
  if (
    typeof selection?.getActiveIndex !== "function" ||
    typeof selection?.active !== "function" ||
    typeof selection?.normalize !== "function" ||
    typeof selection?.focus !== "function"
  ) {
    throw new TypeError("TargetProducerController requires target selection boundaries.");
  }
  if (typeof filters?.matches !== "function") {
    throw new TypeError("TargetProducerController requires the checked filter boundary.");
  }
  if (
    typeof mutation?.capturePatch !== "function" ||
    typeof mutation?.applyTarget !== "function" ||
    typeof mutation?.touch !== "function" ||
    typeof mutation?.restorePatch !== "function" ||
    typeof mutation?.invalidateFilters !== "function"
  ) {
    throw new TypeError("TargetProducerController requires target mutation adapters.");
  }
  if (typeof restoration?.restorePatch !== "function") {
    throw new TypeError("TargetProducerController requires command restoration.");
  }
  if (
    typeof view?.renderSegments !== "function" ||
    typeof view?.renderProgress !== "function" ||
    typeof view?.renderHistory !== "function"
  ) {
    throw new TypeError("TargetProducerController requires editor rendering boundaries.");
  }
  if (typeof workspace?.markDirty !== "function" || typeof status?.set !== "function") {
    throw new TypeError("TargetProducerController requires workspace and status boundaries.");
  }

  let mounted = false;

  function currentSegment() {
    return editorSessionStore.getSegments()[selection.getActiveIndex()] || null;
  }

  async function run({ createCommand, target, reason, provenance, targetSelection = null, successMessage }) {
    const segment = currentSegment();
    const projectId = editorSessionStore.getProject()?.id || segment?.projectId || "";
    if (!segment || !projectId || typeof createCommand !== "function") return null;

    editLifecycle.finalize(segment.id);
    persistence.clearPending(segment, { finalizeEdit: false });
    const beforePatch = mutation.capturePatch(segment);
    const beforeSelection = selection.active(segment);
    const nextTarget = String(target || "");
    const nextSelection = selection.normalize(targetSelection, nextTarget.length) || {
      start: nextTarget.length,
      end: nextTarget.length
    };
    const previousStatus = segment.status || (segment.target?.trim() ? "draft" : "empty");
    const passedFiltersBefore = filters.matches(segment);

    try {
      const command = createCommand({
        projectId,
        segmentId: segment.id,
        beforePatch,
        beforeSelection,
        provenance,
        restorePatch: (patch, context) =>
          restoration.restorePatch(segment.id, patch, { ...context, focusTarget: true }),
        applyFirst: () => {
          mutation.applyTarget(segment, nextTarget, nextTarget.trim() ? "draft" : "empty", reason);
          mutation.touch(segment);
          const passedFiltersAfter = filters.matches(segment);
          if (passedFiltersBefore !== passedFiltersAfter) view.renderSegments({ preserveScroll: true });
          else view.renderSegments();
          view.renderProgress({ previousStatus, nextStatus: segment.status });
          view.renderHistory();
          workspace.markDirty();
          persistence.debounce(segment);
          selection.focus(nextSelection);
          return {
            patch: mutation.capturePatch(segment),
            activeSegmentId: segment.id,
            focusTarget: true,
            selection: nextSelection
          };
        }
      });
      const result = await commands.bus.execute(command);
      commands.changed();
      if (successMessage) status.set(`${successMessage}; Undo is available`, "dirty");
      return result;
    } catch (error) {
      mutation.restorePatch(segment, beforePatch);
      mutation.invalidateFilters();
      view.renderSegments({ preserveScroll: true });
      view.renderProgress();
      view.renderHistory();
      selection.focus(beforeSelection);
      status.set(`${error?.message || "Target change failed"}; existing work was preserved`, "dirty");
      return null;
    }
  }

  function insertTmTarget(target, insertOptions = {}) {
    const channel = insertOptions.channel === "concordance" ? "concordance" : "match";
    return run({
      createCommand: commands.createTmTarget,
      target,
      reason: "insert-target",
      provenance: {
        origin: "translation-memory",
        channel,
        ...(insertOptions.resourceId ? { resourceId: String(insertOptions.resourceId) } : {})
      },
      successMessage: channel === "concordance" ? "Concordance target inserted" : "TM target inserted"
    });
  }

  function copySourceToTarget() {
    const segment = currentSegment();
    if (!segment) return Promise.resolve(null);
    return run({
      createCommand: commands.createCopySource,
      target: segment.source,
      reason: "copy-source",
      provenance: { origin: "user", producer: "copy-source" },
      successMessage: "Source copied to target"
    });
  }

  function insertProtectedTag(tagText) {
    const segment = currentSegment();
    if (!segment) return Promise.resolve(null);
    const current = segment.target || "";
    const selected = selection.active(segment) || { start: current.length, end: current.length };
    const nextTarget = `${current.slice(0, selected.start)}${tagText}${current.slice(selected.end)}`;
    const nextPosition = selected.start + String(tagText || "").length;
    return run({
      createCommand: commands.createProtectedTag,
      target: nextTarget,
      reason: "insert-tag",
      provenance: { origin: "user", producer: "protected-tag" },
      targetSelection: { start: nextPosition, end: nextPosition },
      successMessage: "Protected tag inserted"
    });
  }

  const handleCopySource = () => void copySourceToTarget();

  function mount() {
    if (mounted) return false;
    copySourceElement.addEventListener("click", handleCopySource);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    copySourceElement.removeEventListener("click", handleCopySource);
    mounted = false;
    return true;
  }

  return Object.freeze({
    copySourceToTarget,
    insertProtectedTag,
    insertTmTarget,
    mount,
    unmount
  });
}
