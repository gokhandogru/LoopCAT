function createSnapshotCommand({
  id,
  label,
  undoLabel,
  projectId,
  segmentId,
  beforeSnapshot,
  applyFirst,
  restoreSnapshot,
  provenance = { origin: "user" }
}) {
  if (
    !id ||
    !projectId ||
    !segmentId ||
    !beforeSnapshot ||
    typeof applyFirst !== "function" ||
    typeof restoreSnapshot !== "function"
  ) {
    throw new TypeError(
      `${label || id || "Segment command"} requires project, segment, snapshot, apply, and restore boundaries.`
    );
  }

  let appliedSnapshot = null;
  return {
    id,
    label,
    undoLabel,
    projectId,
    scope: "segment",
    affectedIds: [segmentId],
    provenance,
    async execute() {
      if (appliedSnapshot) {
        return restoreSnapshot(structuredClone(appliedSnapshot), { direction: "redo" });
      }
      const result = await applyFirst();
      if (!result?.snapshot) throw new Error(`${label} did not return a recoverable segment snapshot.`);
      appliedSnapshot = structuredClone(result.snapshot);
      return { ...result, recoveryToken: segmentId };
    },
    undo() {
      return restoreSnapshot(structuredClone(beforeSnapshot), { direction: "undo" });
    }
  };
}

export function createEditTargetCommand({ projectId, segmentId, beforePatch, restorePatch }) {
  if (!projectId || !segmentId || !beforePatch || typeof restorePatch !== "function") {
    throw new TypeError("EditTarget requires project, segment, target-state patch, and restore boundaries.");
  }

  const originalPatch = structuredClone(beforePatch);
  let appliedPatch = null;
  let activeSegmentId = segmentId;

  return Object.freeze({
    id: "edit-target",
    label: "Edit target",
    undoLabel: "Undo target edit",
    projectId,
    scope: "segment",
    affectedIds: Object.freeze([segmentId]),
    provenance: Object.freeze({ origin: "user" }),
    captureAppliedPatch(nextPatch, context = {}) {
      if (!nextPatch) throw new TypeError("EditTarget requires an applied target-state patch.");
      appliedPatch = structuredClone(nextPatch);
      activeSegmentId = context.activeSegmentId || activeSegmentId;
    },
    hasAppliedPatch() {
      return Boolean(appliedPatch);
    },
    appliedResult() {
      if (!appliedPatch) throw new Error("EditTarget cannot be recorded before an edit is captured.");
      return { recoveryToken: segmentId, activeSegmentId };
    },
    execute() {
      if (!appliedPatch) throw new Error("EditTarget cannot be redone before an edit is captured.");
      return restorePatch(structuredClone(appliedPatch), { direction: "redo", activeSegmentId });
    },
    undo() {
      return restorePatch(structuredClone(originalPatch), { direction: "undo", activeSegmentId: segmentId });
    }
  });
}

function createTargetProducerCommand({
  id,
  label,
  undoLabel,
  projectId,
  segmentId,
  beforePatch,
  beforeSelection,
  applyFirst,
  restorePatch,
  provenance
}) {
  if (
    !id ||
    !projectId ||
    !segmentId ||
    !beforePatch ||
    typeof applyFirst !== "function" ||
    typeof restorePatch !== "function"
  ) {
    throw new TypeError(
      `${label || id || "Target producer"} requires project, segment, target-state patch, apply, and restore boundaries.`
    );
  }

  const originalPatch = structuredClone(beforePatch);
  const originalSelection = beforeSelection ? structuredClone(beforeSelection) : null;
  let appliedPatch = null;
  let appliedSelection = null;

  return Object.freeze({
    id,
    label,
    undoLabel,
    projectId,
    scope: "segment",
    affectedIds: Object.freeze([segmentId]),
    provenance: Object.freeze({ ...(provenance || { origin: "user" }) }),
    async execute() {
      if (appliedPatch) {
        return restorePatch(structuredClone(appliedPatch), {
          direction: "redo",
          activeSegmentId: segmentId,
          selection: appliedSelection ? structuredClone(appliedSelection) : null
        });
      }
      const result = await applyFirst();
      if (!result?.patch) throw new Error(`${label} did not return a recoverable target-state patch.`);
      appliedPatch = structuredClone(result.patch);
      appliedSelection = result.selection ? structuredClone(result.selection) : null;
      return { ...result, recoveryToken: segmentId };
    },
    undo() {
      return restorePatch(structuredClone(originalPatch), {
        direction: "undo",
        activeSegmentId: segmentId,
        selection: originalSelection ? structuredClone(originalSelection) : null
      });
    }
  });
}

export function createCopySourceToTargetCommand(options) {
  return createTargetProducerCommand({
    ...options,
    id: "copy-source-to-target",
    label: "Copy source to target",
    undoLabel: "Undo copy source"
  });
}

export function createInsertTmTargetCommand(options) {
  return createTargetProducerCommand({
    ...options,
    id: "insert-tm-target",
    label: "Insert translation-memory target",
    undoLabel: "Undo TM target insertion"
  });
}

export function createInsertTermTargetCommand(options) {
  return createTargetProducerCommand({
    ...options,
    id: "insert-term-target",
    label: "Insert termbase target",
    undoLabel: "Undo term insertion"
  });
}

export function createInsertProtectedTagCommand(options) {
  return createTargetProducerCommand({
    ...options,
    id: "insert-protected-tag",
    label: "Insert protected tag",
    undoLabel: "Undo protected-tag insertion"
  });
}

const BATCH_RECEIPT_ID_LIMIT = 100;

function createBatchTargetCommand({
  id,
  label,
  undoLabel,
  projectId,
  segmentIds,
  beforePatches,
  applyFirst,
  restorePatches,
  provenance
}) {
  const affectedSegmentIds = Array.isArray(segmentIds) ? [...segmentIds] : [];
  const before = Array.isArray(beforePatches) ? structuredClone(beforePatches) : [];
  if (
    !id ||
    !projectId ||
    !affectedSegmentIds.length ||
    affectedSegmentIds.length !== before.length ||
    typeof applyFirst !== "function" ||
    typeof restorePatches !== "function"
  ) {
    throw new TypeError(
      `${label || id || "Batch target command"} requires matching segment IDs/patches and apply/restore boundaries.`
    );
  }

  let appliedPatches = null;
  return Object.freeze({
    id,
    label,
    undoLabel,
    projectId,
    scope: "selection",
    affectedIds: Object.freeze(affectedSegmentIds.slice(0, BATCH_RECEIPT_ID_LIMIT)),
    provenance: Object.freeze({
      ...(provenance || { origin: "user" }),
      affectedCount: affectedSegmentIds.length,
      affectedIdsTruncated: affectedSegmentIds.length > BATCH_RECEIPT_ID_LIMIT
    }),
    async execute() {
      if (appliedPatches) {
        return restorePatches(structuredClone(appliedPatches), {
          direction: "redo",
          segmentIds: [...affectedSegmentIds]
        });
      }
      const result = await applyFirst();
      if (!Array.isArray(result?.patches) || result.patches.length !== affectedSegmentIds.length) {
        throw new Error(`${label} did not return a recoverable patch for every affected segment.`);
      }
      appliedPatches = structuredClone(result.patches);
      return { ...result, recoveryToken: `${id}:${affectedSegmentIds.length}` };
    },
    undo() {
      return restorePatches(structuredClone(before), {
        direction: "undo",
        segmentIds: [...affectedSegmentIds]
      });
    }
  });
}

export function createTmPretranslationCommand(options) {
  return createBatchTargetCommand({
    ...options,
    id: "tm-pretranslate",
    label: "TM pretranslation",
    undoLabel: "Undo TM pretranslation"
  });
}

export function createAiPretranslationCommand(options) {
  return createBatchTargetCommand({
    ...options,
    id: "ai-pretranslate",
    label: "AI pretranslation",
    undoLabel: "Undo AI pretranslation"
  });
}

export function createSplitSegmentCommand({
  projectId,
  segmentId,
  createdSegmentId,
  beforeSegments,
  applyFirst,
  restoreSegments
}) {
  const before = Array.isArray(beforeSegments) ? structuredClone(beforeSegments) : [];
  if (
    !projectId ||
    !segmentId ||
    !createdSegmentId ||
    segmentId === createdSegmentId ||
    !before.length ||
    !before.some((segment) => segment?.id === segmentId) ||
    before.some((segment) => segment?.id === createdSegmentId) ||
    typeof applyFirst !== "function" ||
    typeof restoreSegments !== "function"
  ) {
    throw new TypeError(
      "SplitSegment requires original/created IDs, the project segment snapshot, and atomic apply/restore boundaries."
    );
  }

  let appliedSegments = null;
  return Object.freeze({
    id: "split-segment",
    label: "Split segment",
    undoLabel: "Undo segment split",
    projectId,
    scope: "segment",
    affectedIds: Object.freeze([segmentId, createdSegmentId]),
    provenance: Object.freeze({ origin: "user", operation: "split", affectedCount: 2 }),
    async execute() {
      if (appliedSegments) {
        return restoreSegments(structuredClone(appliedSegments), {
          direction: "redo",
          activeSegmentId: createdSegmentId,
          originalSegmentId: segmentId,
          createdSegmentId
        });
      }
      const result = await applyFirst();
      if (
        !Array.isArray(result?.segments) ||
        !result.segments.some((segment) => segment?.id === segmentId) ||
        !result.segments.some((segment) => segment?.id === createdSegmentId)
      ) {
        throw new Error("Split segment did not return both recoverable structural segment records.");
      }
      appliedSegments = structuredClone(result.segments);
      return { ...result, recoveryToken: `split:${segmentId}:${createdSegmentId}` };
    },
    undo() {
      return restoreSegments(structuredClone(before), {
        direction: "undo",
        activeSegmentId: segmentId,
        originalSegmentId: segmentId,
        createdSegmentId
      });
    }
  });
}

export function createMergeSegmentCommand({
  projectId,
  segmentId,
  mergedSegmentId,
  beforeSegments,
  applyFirst,
  restoreSegments
}) {
  const before = Array.isArray(beforeSegments) ? structuredClone(beforeSegments) : [];
  if (
    !projectId ||
    !segmentId ||
    !mergedSegmentId ||
    segmentId === mergedSegmentId ||
    !before.length ||
    !before.some((segment) => segment?.id === segmentId) ||
    !before.some((segment) => segment?.id === mergedSegmentId) ||
    typeof applyFirst !== "function" ||
    typeof restoreSegments !== "function"
  ) {
    throw new TypeError(
      "MergeSegment requires surviving/merged IDs, the project segment snapshot, and atomic apply/restore boundaries."
    );
  }

  let appliedSegments = null;
  return Object.freeze({
    id: "merge-segments",
    label: "Merge segments",
    undoLabel: "Undo segment merge",
    projectId,
    scope: "segment",
    affectedIds: Object.freeze([segmentId, mergedSegmentId]),
    provenance: Object.freeze({ origin: "user", operation: "merge", affectedCount: 2 }),
    async execute() {
      if (appliedSegments) {
        return restoreSegments(structuredClone(appliedSegments), {
          direction: "redo",
          activeSegmentId: segmentId,
          segmentId,
          mergedSegmentId
        });
      }
      const result = await applyFirst();
      if (
        !Array.isArray(result?.segments) ||
        !result.segments.some((segment) => segment?.id === segmentId) ||
        result.segments.some((segment) => segment?.id === mergedSegmentId)
      ) {
        throw new Error("Merge segment did not return a recoverable structural segment set.");
      }
      appliedSegments = structuredClone(result.segments);
      return { ...result, recoveryToken: `merge:${segmentId}:${mergedSegmentId}` };
    },
    undo() {
      return restoreSegments(structuredClone(before), {
        direction: "undo",
        activeSegmentId: segmentId,
        segmentId,
        mergedSegmentId
      });
    }
  });
}

export function createConfirmSegmentCommand(options) {
  return createSnapshotCommand({
    ...options,
    id: "confirm-segment",
    label: "Confirm segment",
    undoLabel: "Undo segment confirmation"
  });
}

export function createChangeReviewStateCommand(options) {
  return createSnapshotCommand({
    ...options,
    id: "change-review-state",
    label: "Change review state",
    undoLabel: "Undo review-state change"
  });
}

export function createReplaceTargetsCommand({ projectId, segmentIds, beforeSnapshots, applyFirst, restoreSnapshots }) {
  const affectedIds = Array.isArray(segmentIds) ? [...segmentIds] : [];
  const before = Array.isArray(beforeSnapshots) ? structuredClone(beforeSnapshots) : [];
  if (
    !projectId ||
    !affectedIds.length ||
    affectedIds.length !== before.length ||
    typeof applyFirst !== "function" ||
    typeof restoreSnapshots !== "function"
  ) {
    throw new TypeError("ReplaceTargets requires matching segment IDs/snapshots and apply/restore boundaries.");
  }

  let appliedSnapshots = null;
  return {
    id: "replace-targets",
    label: "Replace target text",
    undoLabel: "Undo target replacement",
    projectId,
    scope: affectedIds.length === 1 ? "segment" : "selection",
    affectedIds,
    provenance: { origin: "user" },
    async execute() {
      if (appliedSnapshots) {
        return restoreSnapshots(structuredClone(appliedSnapshots), { direction: "redo" });
      }
      const result = await applyFirst();
      if (!Array.isArray(result?.snapshots) || result.snapshots.length !== affectedIds.length) {
        throw new Error("Replace target text did not return recoverable segment snapshots.");
      }
      appliedSnapshots = structuredClone(result.snapshots);
      return { ...result, recoveryToken: `replace:${affectedIds.length}` };
    },
    undo() {
      return restoreSnapshots(structuredClone(before), { direction: "undo" });
    }
  };
}
