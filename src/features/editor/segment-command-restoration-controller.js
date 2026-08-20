/**
 * Owns reversible segment command restoration for target patches and complete
 * segment snapshots. Segment records, target-state policy, autosave, durable
 * persistence, navigation, and presentation remain behind injected boundaries.
 *
 * @param {{
 *   editorSessionStore: { getSegments: () => any[], replaceSegmentAt: (index: number, segment: any) => unknown },
 *   targetState: { capturePatch: (segment: any) => any, applyPatch: (segment: any, patch: any) => any, prepareHistory: (segment: any) => any },
 *   autosave: { clear: (segment: any) => unknown },
 *   persistence: { save: (segment: any) => Promise<unknown>, saveMany: (segments: any[]) => Promise<unknown> },
 *   selection: { getActiveSegment: () => any, select: (index: number, segmentId: string) => unknown, selectGrid: (index: number, segmentId: string) => unknown, inspect: (segmentId: string) => unknown, normalize: (selection: any, targetLength: number) => any, focus: (selection?: any) => unknown, navigateNext: () => Promise<unknown> },
 *   filters: { invalidate: () => void },
 *   presentation: { renderSegments: (options?: object) => void, renderProgress: (options?: object) => void, renderHistory: () => void, renderAll: () => void, refreshContext: () => Promise<unknown> },
 *   workspace: { markDirty: () => void },
 *   clone: (value: any) => any,
 *   now: () => string
 * }} options
 */
export function createSegmentCommandRestorationController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const targetState = options?.targetState;
  const autosave = options?.autosave;
  const persistence = options?.persistence;
  const selection = options?.selection;
  const filters = options?.filters;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const clone = options?.clone;
  const now = options?.now;
  if (
    typeof editorSessionStore?.getSegments !== "function" ||
    typeof editorSessionStore?.replaceSegmentAt !== "function"
  ) {
    throw new TypeError("SegmentCommandRestorationController requires EditorSessionStore boundaries.");
  }
  if (
    typeof targetState?.capturePatch !== "function" ||
    typeof targetState?.applyPatch !== "function" ||
    typeof targetState?.prepareHistory !== "function"
  ) {
    throw new TypeError("SegmentCommandRestorationController requires target-state boundaries.");
  }
  if (
    typeof autosave?.clear !== "function" ||
    typeof persistence?.save !== "function" ||
    typeof persistence?.saveMany !== "function"
  ) {
    throw new TypeError("SegmentCommandRestorationController requires autosave and persistence boundaries.");
  }
  if (
    typeof selection?.getActiveSegment !== "function" ||
    typeof selection?.select !== "function" ||
    typeof selection?.selectGrid !== "function" ||
    typeof selection?.inspect !== "function" ||
    typeof selection?.normalize !== "function" ||
    typeof selection?.focus !== "function" ||
    typeof selection?.navigateNext !== "function"
  ) {
    throw new TypeError("SegmentCommandRestorationController requires selection and focus boundaries.");
  }
  if (
    typeof filters?.invalidate !== "function" ||
    typeof presentation?.renderSegments !== "function" ||
    typeof presentation?.renderProgress !== "function" ||
    typeof presentation?.renderHistory !== "function" ||
    typeof presentation?.renderAll !== "function" ||
    typeof presentation?.refreshContext !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof clone !== "function" ||
    typeof now !== "function"
  ) {
    throw new TypeError(
      "SegmentCommandRestorationController requires filter, presentation, workspace, clone, and clock boundaries."
    );
  }

  function segmentIndex(segmentId) {
    return editorSessionStore.getSegments().findIndex((segment) => segment.id === segmentId);
  }

  function prepareSnapshot(snapshot, current) {
    const restored = targetState.prepareHistory(clone(snapshot));
    const currentRevision = Number(current?.revision || 0);
    const snapshotRevision = Number(restored.revision || 0);
    restored.revision =
      Math.max(
        Number.isFinite(currentRevision) ? currentRevision : 0,
        Number.isFinite(snapshotRevision) ? snapshotRevision : 0
      ) + 1;
    restored.updatedAt = now();
    return restored;
  }

  async function restorePatch(segmentId, nextPatch, restoreOptions = {}) {
    const index = segmentIndex(segmentId);
    if (index < 0) throw new Error("The affected segment is no longer available.");
    const segment = editorSessionStore.getSegments()[index];
    const currentPatch = targetState.capturePatch(segment);
    const previousStatus = segment.status || (segment.target?.trim() ? "draft" : "empty");
    try {
      const restoredPatch = clone(nextPatch);
      restoredPatch.revision = Math.max(Number(currentPatch.revision || 0), Number(restoredPatch.revision || 0)) + 1;
      restoredPatch.updatedAt = now();
      targetState.applyPatch(segment, restoredPatch);
      autosave.clear(segment);
      await persistence.save(segment);
      selection.selectGrid(index, segment.id);
      selection.inspect(segment.id);
      filters.invalidate();
      presentation.renderSegments({ preserveScroll: true });
      presentation.renderProgress({ previousStatus, nextStatus: segment.status });
      presentation.renderHistory();
      await presentation.refreshContext();
      workspace.markDirty();
      const targetSelection = restoreOptions.selection
        ? selection.normalize(restoreOptions.selection, segment.target.length)
        : null;
      selection.focus(targetSelection);
      return {
        recoveryToken: segmentId,
        activeSegmentId: segment.id,
        focusTarget: Boolean(restoreOptions.focusTarget || targetSelection),
        selection: targetSelection
      };
    } catch (error) {
      targetState.applyPatch(segment, currentPatch);
      filters.invalidate();
      presentation.renderSegments({ preserveScroll: true });
      presentation.renderProgress();
      presentation.renderHistory();
      throw error;
    }
  }

  async function restorePatches(nextPatches, restoreOptions = {}) {
    const segmentIds = Array.isArray(restoreOptions.segmentIds) ? restoreOptions.segmentIds : [];
    const patches = Array.isArray(nextPatches) ? nextPatches : [];
    if (!segmentIds.length || segmentIds.length !== patches.length) {
      throw new Error("Batch target restoration requires matching segment IDs and patches.");
    }
    const currentById = new Map();
    const indexes = segmentIds.map((segmentId) => {
      const index = segmentIndex(segmentId);
      if (index < 0) throw new Error("An affected pretranslation segment is no longer available.");
      currentById.set(segmentId, targetState.capturePatch(editorSessionStore.getSegments()[index]));
      return index;
    });
    const previousActiveId = selection.getActiveSegment()?.id || "";
    try {
      const restored = patches.map((patch, offset) => {
        const segment = editorSessionStore.getSegments()[indexes[offset]];
        const currentPatch = currentById.get(segment.id);
        const restoredPatch = clone(patch);
        restoredPatch.revision = Math.max(Number(currentPatch?.revision || 0), Number(restoredPatch.revision || 0)) + 1;
        restoredPatch.updatedAt = now();
        targetState.applyPatch(segment, restoredPatch);
        autosave.clear(segment);
        return segment;
      });
      await persistence.saveMany(restored);
      const requestedActiveId = restoreOptions.activeSegmentId || previousActiveId || restored[0]?.id || "";
      const requestedIndex = segmentIndex(requestedActiveId);
      if (requestedIndex >= 0) {
        selection.select(requestedIndex, editorSessionStore.getSegments()[requestedIndex]?.id || "");
      }
      filters.invalidate();
      workspace.markDirty();
      presentation.renderAll();
      await presentation.refreshContext();
      selection.focus();
      return {
        patches: restored.map((segment) => targetState.capturePatch(segment)),
        activeSegmentId: selection.getActiveSegment()?.id || restored[0]?.id || "",
        affectedCount: restored.length,
        focusTarget: true
      };
    } catch (error) {
      currentById.forEach((patch, segmentId) => {
        const index = segmentIndex(segmentId);
        if (index >= 0) targetState.applyPatch(editorSessionStore.getSegments()[index], patch);
      });
      filters.invalidate();
      presentation.renderAll();
      throw error;
    }
  }

  async function restoreSnapshots(nextSnapshots, restoreOptions = {}) {
    const snapshots = Array.isArray(nextSnapshots) ? nextSnapshots : [];
    const currentById = new Map();
    const indexes = [];
    for (const snapshot of snapshots) {
      const index = segmentIndex(snapshot?.id);
      if (index < 0) throw new Error("An affected segment is no longer available.");
      indexes.push(index);
      currentById.set(snapshot.id, clone(editorSessionStore.getSegments()[index]));
    }
    const previousActiveId = selection.getActiveSegment()?.id || "";
    try {
      const restored = snapshots.map((snapshot, offset) => {
        const next = prepareSnapshot(snapshot, currentById.get(snapshot.id));
        editorSessionStore.replaceSegmentAt(indexes[offset], next);
        autosave.clear(next);
        return next;
      });
      await persistence.saveMany(restored);
      const requestedActiveId = restoreOptions.activeSegmentId || previousActiveId || restored[0]?.id || "";
      const requestedIndex = segmentIndex(requestedActiveId);
      if (requestedIndex >= 0) {
        selection.select(requestedIndex, editorSessionStore.getSegments()[requestedIndex]?.id || "");
      }
      workspace.markDirty();
      presentation.renderAll();
      await presentation.refreshContext();
      selection.focus();
      return {
        snapshots: restored.map((segment) => clone(segment)),
        activeSegmentId: selection.getActiveSegment()?.id || restored[0]?.id || ""
      };
    } catch (error) {
      for (const [segmentId, snapshot] of currentById) {
        const index = segmentIndex(segmentId);
        if (index >= 0) editorSessionStore.replaceSegmentAt(index, targetState.prepareHistory(snapshot));
      }
      presentation.renderAll();
      throw error;
    }
  }

  async function restoreSnapshot(segmentId, nextSnapshot, restoreOptions = {}) {
    const index = segmentIndex(segmentId);
    if (index < 0) throw new Error("The affected segment is no longer available.");
    const currentSnapshot = clone(editorSessionStore.getSegments()[index]);
    try {
      const restored = prepareSnapshot(nextSnapshot, currentSnapshot);
      editorSessionStore.replaceSegmentAt(index, restored);
      autosave.clear(restored);
      await persistence.save(restored);
      selection.selectGrid(index, restored.id);
      selection.inspect(restored.id);
      workspace.markDirty();
      presentation.renderAll();
      await presentation.refreshContext();
      if (restoreOptions.navigateNext) await selection.navigateNext();
      else selection.focus();
      return {
        snapshot: clone(restored),
        activeSegmentId: selection.getActiveSegment()?.id || restored.id
      };
    } catch (error) {
      editorSessionStore.replaceSegmentAt(index, targetState.prepareHistory(currentSnapshot));
      presentation.renderAll();
      throw error;
    }
  }

  return Object.freeze({ prepareSnapshot, restorePatch, restorePatches, restoreSnapshot, restoreSnapshots });
}
