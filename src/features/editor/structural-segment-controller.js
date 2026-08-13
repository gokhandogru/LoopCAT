function inlineCodeRanges(text) {
  return Array.from(String(text || "").matchAll(/<(g|b|i|u)\b[^>]*>[\s\S]*?<\/\1>/gi)).map((match) => ({
    start: match.index || 0,
    end: (match.index || 0) + match[0].length
  }));
}

function normalizeOrder(segments) {
  const ordered = segments
    .map((segment, order) => ({ segment, order }))
    .sort(
      (left, right) => Number(left.segment.index || 0) - Number(right.segment.index || 0) || left.order - right.order
    )
    .map(({ segment }) => segment);
  const documentCounts = new Map();
  ordered.forEach((segment, index) => {
    segment.index = index;
    const documentIndex = documentCounts.get(segment.documentId) || 0;
    segment.documentIndex = documentIndex;
    documentCounts.set(segment.documentId, documentIndex + 1);
  });
  return ordered;
}

/**
 * Owns structural segment split/merge validation, command execution, atomic
 * persistence/restoration, ordering, selection, rendering, and action events.
 * Project and segment records remain owned by EditorSessionStore and all domain
 * mutations and durable effects stay behind injected boundaries.
 *
 * @param {{
 *   elements: { splitButton: any, mergeButton: any },
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[], replaceSegments: (segments: any[]) => unknown },
 *   commands: { bus: { execute: (command: any) => Promise<any> }, createSplit: (options: object) => any, createMerge: (options: object) => any, setProjectId: (projectId: string) => void, changed: () => void },
 *   selection: { getActiveIndex: () => number, findEditor: (index: number) => any, select: (index: number) => unknown, focusTarget: () => unknown },
 *   mutation: { applyTarget: (segment: any, target: string, status: string, reason: string) => void, touch: (segment: any) => unknown, detectTags: (text: string) => any[], prepareHistoryStates: (segments: any[]) => any[], prepareRestoreSnapshot: (snapshot: any, current: any) => any },
 *   persistence: { flush: (projectId: string) => Promise<unknown>, saveStructure: (segments: any[], deleteSegmentIds?: string[]) => Promise<any[]>, discardPending: (segmentId: string) => unknown },
 *   view: { invalidateFilters: () => void, renderAll: () => void },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   ids?: { segment?: () => string },
 *   clock?: { now?: () => string },
 *   testHooks?: { beforeSplitSave?: (segment: any) => void, beforeMergeSave?: (segment: any) => void }
 * }} options
 */
export function createStructuralSegmentController(options) {
  const elements = options?.elements;
  const editorSessionStore = options?.editorSessionStore;
  const commands = options?.commands;
  const selection = options?.selection;
  const mutation = options?.mutation;
  const persistence = options?.persistence;
  const view = options?.view;
  const workspace = options?.workspace;
  const status = options?.status;
  if (
    !elements?.splitButton?.addEventListener ||
    !elements?.splitButton?.removeEventListener ||
    !elements?.mergeButton?.addEventListener ||
    !elements?.mergeButton?.removeEventListener
  ) {
    throw new TypeError("StructuralSegmentController requires the split and merge buttons.");
  }
  if (
    typeof editorSessionStore?.getProject !== "function" ||
    typeof editorSessionStore?.getSegments !== "function" ||
    typeof editorSessionStore?.replaceSegments !== "function"
  ) {
    throw new TypeError("StructuralSegmentController requires EditorSessionStore boundaries.");
  }
  if (
    typeof commands?.bus?.execute !== "function" ||
    typeof commands?.createSplit !== "function" ||
    typeof commands?.createMerge !== "function" ||
    typeof commands?.setProjectId !== "function" ||
    typeof commands?.changed !== "function"
  ) {
    throw new TypeError("StructuralSegmentController requires typed structural command boundaries.");
  }
  if (
    typeof selection?.getActiveIndex !== "function" ||
    typeof selection?.findEditor !== "function" ||
    typeof selection?.select !== "function" ||
    typeof selection?.focusTarget !== "function"
  ) {
    throw new TypeError("StructuralSegmentController requires segment selection boundaries.");
  }
  if (
    typeof mutation?.applyTarget !== "function" ||
    typeof mutation?.touch !== "function" ||
    typeof mutation?.detectTags !== "function" ||
    typeof mutation?.prepareHistoryStates !== "function" ||
    typeof mutation?.prepareRestoreSnapshot !== "function"
  ) {
    throw new TypeError("StructuralSegmentController requires structural mutation adapters.");
  }
  if (
    typeof persistence?.flush !== "function" ||
    typeof persistence?.saveStructure !== "function" ||
    typeof persistence?.discardPending !== "function"
  ) {
    throw new TypeError("StructuralSegmentController requires atomic persistence boundaries.");
  }
  if (
    typeof view?.invalidateFilters !== "function" ||
    typeof view?.renderAll !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError("StructuralSegmentController requires view, workspace, and status boundaries.");
  }

  const createSegmentId =
    typeof options.ids?.segment === "function"
      ? options.ids.segment
      : () => `segment-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
  const now = typeof options.clock?.now === "function" ? options.clock.now : () => new Date().toISOString();
  const beforeSplitSave =
    typeof options.testHooks?.beforeSplitSave === "function" ? options.testHooks.beforeSplitSave : () => {};
  const beforeMergeSave =
    typeof options.testHooks?.beforeMergeSave === "function" ? options.testHooks.beforeMergeSave : () => {};
  let mounted = false;

  function currentSegment() {
    return editorSessionStore.getSegments()[selection.getActiveIndex()] || null;
  }

  function splitProtectedRanges(text) {
    return [
      ...mutation.detectTags(text).map((tag) => ({
        start: tag.index,
        end: tag.index + tag.text.length
      })),
      ...inlineCodeRanges(text)
    ];
  }

  function safeSplitIndex(text, preferredIndex) {
    const value = String(text || "");
    const max = value.length - 1;
    if (max <= 0) return 0;
    const preferred = Math.min(Math.max(Math.round(preferredIndex), 1), max);
    const ranges = splitProtectedRanges(value);
    const safe = (index) => {
      if (index <= 0 || index >= value.length) return false;
      if (!/\s/u.test(value[index] || value[index - 1] || "")) return false;
      return !ranges.some((range) => index > range.start && index < range.end);
    };
    for (let offset = 0; offset < value.length; offset += 1) {
      const left = preferred - offset;
      const right = preferred + offset;
      if (safe(left)) return left;
      if (safe(right)) return right;
    }
    return ranges.some((range) => preferred > range.start && preferred < range.end) ? 0 : preferred;
  }

  function mappedSourceSplitIndex(source, target, targetCursor) {
    const sourceText = String(source || "");
    const targetText = String(target || "");
    if (!targetText.trim()) return safeSplitIndex(sourceText, sourceText.length / 2);
    const ratio = Math.min(Math.max(targetCursor / targetText.length, 0), 1);
    return safeSplitIndex(sourceText, sourceText.length * ratio);
  }

  function canSplit(segment) {
    if (!segment?.structure) return true;
    return segment.structure.type === "paragraph";
  }

  function canMerge(segment, next) {
    if (!segment || !next || segment.documentId !== next.documentId) return false;
    if (!segment.structure && !next.structure) return true;
    if (segment.structure?.type !== "paragraph" || next.structure?.type !== "paragraph") return false;
    return (
      (segment.structure.partPath || "word/document.xml") === (next.structure.partPath || "word/document.xml") &&
      segment.structure.paragraphIndex === next.structure.paragraphIndex
    );
  }

  function nextForMerge(segment = currentSegment()) {
    if (!segment) return null;
    return (
      editorSessionStore
        .getSegments()
        .find((item) => item.index > segment.index && item.documentId === segment.documentId) || null
    );
  }

  async function restoreSplit(nextSnapshots, restoreOptions = {}) {
    const project = editorSessionStore.getProject();
    if (!project?.id) throw new Error("The split segment project is no longer open.");
    const snapshots = Array.isArray(nextSnapshots) ? nextSnapshots : [];
    const snapshotIds = new Set();
    snapshots.forEach((snapshot) => {
      if (!snapshot?.id || snapshot.projectId !== project.id || snapshotIds.has(snapshot.id)) {
        throw new Error("The split segment snapshot is invalid for the current project.");
      }
      snapshotIds.add(snapshot.id);
    });
    if (!snapshots.length || !snapshotIds.has(restoreOptions.originalSegmentId)) {
      throw new Error("The split segment snapshot does not contain the original segment.");
    }

    const currentSnapshots = editorSessionStore.getSegments().map((segment) => structuredClone(segment));
    const currentById = new Map(currentSnapshots.map((segment) => [segment.id, segment]));
    if (!currentById.has(restoreOptions.originalSegmentId)) {
      throw new Error("The original split segment is no longer available.");
    }
    const preserved = currentSnapshots.filter(
      (segment) => !snapshotIds.has(segment.id) && segment.id !== restoreOptions.createdSegmentId
    );
    const restored = normalizeOrder(
      [...snapshots, ...preserved].map((snapshot) =>
        mutation.prepareRestoreSnapshot(snapshot, currentById.get(snapshot.id))
      )
    );
    const deleteSegmentIds =
      restoreOptions.direction === "undo" && currentById.has(restoreOptions.createdSegmentId)
        ? [restoreOptions.createdSegmentId]
        : [];
    const savedSegments = await persistence.saveStructure(restored, deleteSegmentIds);
    deleteSegmentIds.forEach((segmentId) => persistence.discardPending(segmentId));
    editorSessionStore.replaceSegments(mutation.prepareHistoryStates(savedSegments));
    const requestedIndex = editorSessionStore
      .getSegments()
      .findIndex((segment) => segment.id === restoreOptions.activeSegmentId);
    selection.select(requestedIndex >= 0 ? requestedIndex : Math.max(0, selection.getActiveIndex()));
    view.invalidateFilters();
    workspace.markDirty();
    return {
      segments: editorSessionStore.getSegments().map((segment) => structuredClone(segment)),
      activeSegmentId: currentSegment()?.id || restoreOptions.activeSegmentId || restoreOptions.originalSegmentId,
      affectedCount: 2,
      focusTarget: true
    };
  }

  async function restoreMerge(nextSnapshots, restoreOptions = {}) {
    const project = editorSessionStore.getProject();
    if (!project?.id) throw new Error("The merged segment project is no longer open.");
    const snapshots = Array.isArray(nextSnapshots) ? nextSnapshots : [];
    const snapshotIds = new Set();
    snapshots.forEach((snapshot) => {
      if (!snapshot?.id || snapshot.projectId !== project.id || snapshotIds.has(snapshot.id)) {
        throw new Error("The merged segment snapshot is invalid for the current project.");
      }
      snapshotIds.add(snapshot.id);
    });
    if (!snapshots.length || !snapshotIds.has(restoreOptions.segmentId)) {
      throw new Error("The merged segment snapshot does not contain the surviving segment.");
    }
    const expectsMergedSegment = restoreOptions.direction === "undo";
    if (snapshotIds.has(restoreOptions.mergedSegmentId) !== expectsMergedSegment) {
      throw new Error("The merged segment snapshot does not match the requested restore direction.");
    }

    const currentSnapshots = editorSessionStore.getSegments().map((segment) => structuredClone(segment));
    const currentById = new Map(currentSnapshots.map((segment) => [segment.id, segment]));
    if (!currentById.has(restoreOptions.segmentId)) {
      throw new Error("The surviving merged segment is no longer available.");
    }
    const preserved = currentSnapshots.filter(
      (segment) => !snapshotIds.has(segment.id) && segment.id !== restoreOptions.mergedSegmentId
    );
    const restored = normalizeOrder(
      [...snapshots, ...preserved].map((snapshot) =>
        mutation.prepareRestoreSnapshot(snapshot, currentById.get(snapshot.id))
      )
    );
    const deleteSegmentIds =
      restoreOptions.direction === "redo" && currentById.has(restoreOptions.mergedSegmentId)
        ? [restoreOptions.mergedSegmentId]
        : [];
    const savedSegments = await persistence.saveStructure(restored, deleteSegmentIds);
    deleteSegmentIds.forEach((segmentId) => persistence.discardPending(segmentId));
    editorSessionStore.replaceSegments(mutation.prepareHistoryStates(savedSegments));
    const requestedIndex = editorSessionStore
      .getSegments()
      .findIndex((segment) => segment.id === restoreOptions.activeSegmentId);
    selection.select(requestedIndex >= 0 ? requestedIndex : Math.max(0, selection.getActiveIndex()));
    view.invalidateFilters();
    workspace.markDirty();
    return {
      segments: editorSessionStore.getSegments().map((segment) => structuredClone(segment)),
      activeSegmentId: currentSegment()?.id || restoreOptions.activeSegmentId || restoreOptions.segmentId,
      affectedCount: 2,
      focusTarget: true
    };
  }

  async function split() {
    const segment = currentSegment();
    const activeIndex = selection.getActiveIndex();
    const editor = selection.findEditor(activeIndex);
    const project = editorSessionStore.getProject();
    if (!segment || !editor || !project?.id) return null;
    if (!canSplit(segment)) {
      status.set("Split is unavailable for structure-preserving localization files.", "dirty");
      return null;
    }
    const source = segment.source || "";
    const target = segment.target || "";
    const targetCursor = editor.selectionStart || 0;
    const sourceCursor = mappedSourceSplitIndex(source, target, targetCursor);
    if (sourceCursor <= 0 || sourceCursor >= source.length) {
      status.set("Place the cursor in the target/source-equivalent position before splitting.", "dirty");
      return null;
    }
    const firstSource = source.slice(0, sourceCursor).trim();
    const secondSource = source.slice(sourceCursor).trim();
    if (!firstSource || !secondSource) return null;
    const targetSplit = target.trim() ? Math.min(targetCursor, target.length) : 0;
    const firstTarget = target.slice(0, targetSplit).trim();
    const secondTarget = target.slice(targetSplit).trim();
    try {
      await persistence.flush(project.id);
    } catch (error) {
      status.set(error?.message || "Save pending changes before splitting failed", "dirty");
      return null;
    }

    const beforeSegments = editorSessionStore.getSegments().map((item) => structuredClone(item));
    const createdSegmentId = createSegmentId();
    const createdAt = now();
    const command = commands.createSplit({
      projectId: project.id,
      segmentId: segment.id,
      createdSegmentId,
      beforeSegments,
      restoreSegments: restoreSplit,
      applyFirst: async () => {
        const nextSegments = beforeSegments.map((item) => structuredClone(item));
        const firstSegment = nextSegments.find((item) => item.id === segment.id);
        if (!firstSegment) throw new Error("The segment to split is no longer available.");
        const secondSegment = {
          ...structuredClone(firstSegment),
          id: createdSegmentId,
          index: Number(firstSegment.index || 0) + 0.5,
          documentIndex: Number(firstSegment.documentIndex || 0) + 0.5,
          source: secondSource,
          target: secondTarget,
          status: secondTarget ? "draft" : "empty",
          tags: mutation.detectTags(secondSource),
          revision: 1,
          createdAt,
          updatedAt: createdAt
        };
        firstSegment.source = firstSource;
        mutation.applyTarget(firstSegment, firstTarget, firstTarget ? "draft" : "empty", "split");
        firstSegment.tags = mutation.detectTags(firstSource);
        mutation.touch(firstSegment);
        const ordered = normalizeOrder([...nextSegments, secondSegment]);
        beforeSplitSave(segment);
        const savedSegments = await persistence.saveStructure(ordered);
        editorSessionStore.replaceSegments(mutation.prepareHistoryStates(savedSegments));
        selection.select(editorSessionStore.getSegments().findIndex((item) => item.id === createdSegmentId));
        view.invalidateFilters();
        workspace.markDirty();
        return {
          segments: editorSessionStore.getSegments().map((item) => structuredClone(item)),
          activeSegmentId: createdSegmentId,
          affectedCount: 2,
          focusTarget: true
        };
      }
    });
    if (!command) {
      status.set("The reversible segment split service is unavailable.", "dirty");
      return null;
    }

    let execution;
    try {
      execution = await commands.bus.execute(command);
    } catch (error) {
      editorSessionStore.replaceSegments(mutation.prepareHistoryStates(beforeSegments));
      selection.select(
        Math.max(
          0,
          editorSessionStore.getSegments().findIndex((item) => item.id === segment.id)
        )
      );
      view.invalidateFilters();
      view.renderAll();
      selection.focusTarget();
      status.set(error?.message || "Segment split failed", "dirty");
      return null;
    }
    commands.setProjectId(project.id);
    view.renderAll();
    commands.changed();
    status.set("Segment split; Undo is available", "saved");
    selection.focusTarget();
    return execution;
  }

  async function merge() {
    const segment = currentSegment();
    const project = editorSessionStore.getProject();
    if (!segment || !project?.id) return null;
    const next = nextForMerge(segment);
    if (!next) return null;
    if (!canMerge(segment, next)) {
      status.set("Merge is available only for unstructured text or DOCX segments from the same paragraph.", "dirty");
      return null;
    }
    try {
      await persistence.flush(project.id);
    } catch (error) {
      status.set(error?.message || "Save pending changes before merging failed", "dirty");
      return null;
    }

    const beforeSegments = editorSessionStore.getSegments().map((item) => structuredClone(item));
    const segmentId = segment.id;
    const mergedSegmentId = next.id;
    const command = commands.createMerge({
      projectId: project.id,
      segmentId,
      mergedSegmentId,
      beforeSegments,
      restoreSegments: restoreMerge,
      applyFirst: async () => {
        const nextSegments = beforeSegments.map((item) => structuredClone(item));
        const survivingSegment = nextSegments.find((item) => item.id === segmentId);
        const mergedSegment = nextSegments.find((item) => item.id === mergedSegmentId);
        if (!survivingSegment || !mergedSegment || !canMerge(survivingSegment, mergedSegment)) {
          throw new Error("The segments to merge are no longer available in a compatible structure.");
        }
        survivingSegment.source = `${survivingSegment.source} ${mergedSegment.source}`.trim();
        const mergedTarget = `${survivingSegment.target || ""} ${mergedSegment.target || ""}`.trim();
        mutation.applyTarget(survivingSegment, mergedTarget, mergedTarget ? "draft" : "empty", "merge");
        survivingSegment.tags = mutation.detectTags(survivingSegment.source);
        mutation.touch(survivingSegment);
        const ordered = normalizeOrder(nextSegments.filter((item) => item.id !== mergedSegmentId));
        beforeMergeSave(segment);
        const savedSegments = await persistence.saveStructure(ordered, [mergedSegmentId]);
        editorSessionStore.replaceSegments(mutation.prepareHistoryStates(savedSegments));
        selection.select(editorSessionStore.getSegments().findIndex((item) => item.id === segmentId));
        view.invalidateFilters();
        workspace.markDirty();
        return {
          segments: editorSessionStore.getSegments().map((item) => structuredClone(item)),
          activeSegmentId: segmentId,
          affectedCount: 2,
          focusTarget: true
        };
      }
    });
    if (!command) {
      status.set("The reversible segment merge service is unavailable.", "dirty");
      return null;
    }

    let execution;
    try {
      execution = await commands.bus.execute(command);
    } catch (error) {
      editorSessionStore.replaceSegments(mutation.prepareHistoryStates(beforeSegments));
      selection.select(
        Math.max(
          0,
          editorSessionStore.getSegments().findIndex((item) => item.id === segmentId)
        )
      );
      view.invalidateFilters();
      view.renderAll();
      selection.focusTarget();
      status.set(error?.message || "Segment merge failed", "dirty");
      return null;
    }
    commands.setProjectId(project.id);
    view.renderAll();
    commands.changed();
    status.set("Segments merged; Undo is available", "saved");
    selection.focusTarget();
    return execution;
  }

  const handleSplit = () => void split();
  const handleMerge = () => void merge();

  function mount() {
    if (mounted) return false;
    elements.splitButton.addEventListener("click", handleSplit);
    elements.mergeButton.addEventListener("click", handleMerge);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    elements.splitButton.removeEventListener("click", handleSplit);
    elements.mergeButton.removeEventListener("click", handleMerge);
    mounted = false;
    return true;
  }

  return Object.freeze({
    canMerge,
    canSplit,
    mappedSourceSplitIndex,
    merge,
    mount,
    nextForMerge,
    restoreMerge,
    restoreSplit,
    split,
    splitProtectedRanges,
    unmount
  });
}
