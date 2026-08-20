const SEGMENT_HISTORY_LIMIT = 25;
const SEGMENT_TYPING_HISTORY_WINDOW_MS = 30000;

/**
 * Owns target-history, reversible patch, revision, and filter-invalidating
 * segment mutation policy. Commands, persistence, autosave, and rendering
 * remain behind injected boundaries.
 *
 * @param {{
 *   getSegments: () => any[],
 *   createId: (prefix: string) => string,
 *   nowIso: () => string,
 *   nowMs: () => number,
 *   clone: (value: any) => any,
 *   invalidateFilters: () => void
 * }} options
 */
export function createSegmentTargetStateService(options) {
  const getSegments = options?.getSegments;
  const createId = options?.createId;
  const nowIso = options?.nowIso;
  const nowMs = options?.nowMs;
  const clone = options?.clone;
  const invalidateFilters = options?.invalidateFilters;
  if (
    typeof getSegments !== "function" ||
    typeof createId !== "function" ||
    typeof nowIso !== "function" ||
    typeof nowMs !== "function" ||
    typeof clone !== "function" ||
    typeof invalidateFilters !== "function"
  ) {
    throw new TypeError("SegmentTargetStateService requires segment, ID, clock, clone, and filter boundaries.");
  }

  function setHiddenField(record, field, value) {
    if (!record) return;
    Object.defineProperty(record, field, {
      value,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  function prepareHistory(segment) {
    if (!segment) return segment;
    segment.targetHistory = Array.isArray(segment.targetHistory) ? segment.targetHistory : [];
    if (!Object.prototype.hasOwnProperty.call(segment, "__historyTarget")) {
      setHiddenField(segment, "__historyTarget", segment.target || "");
    }
    if (!Object.prototype.hasOwnProperty.call(segment, "__historyStatus")) {
      setHiddenField(segment, "__historyStatus", segment.status || "empty");
    }
    return segment;
  }

  function prepareHistories(segments = getSegments()) {
    (segments || []).forEach(prepareHistory);
    return segments;
  }

  function recordHistory(segment, nextTarget, nextStatus, reason = "edit") {
    prepareHistory(segment);
    const fromTarget = segment.__historyTarget || "";
    const fromStatus = segment.__historyStatus || "empty";
    const toTarget = String(nextTarget || "");
    const toStatus = nextStatus || (toTarget.trim() ? "draft" : "empty");
    if (fromTarget === toTarget && fromStatus === toStatus) return;

    const now = nowIso();
    const history = Array.isArray(segment.targetHistory) ? [...segment.targetHistory] : [];
    const last = history[history.length - 1];
    const canCoalesceTyping =
      reason === "edit" &&
      last?.reason === "edit" &&
      last.toTarget === fromTarget &&
      last.toStatus === fromStatus &&
      nowMs() - Date.parse(last.updatedAt || last.createdAt || 0) <= SEGMENT_TYPING_HISTORY_WINDOW_MS;

    if (canCoalesceTyping) {
      last.toTarget = toTarget;
      last.toStatus = toStatus;
      last.updatedAt = now;
    } else {
      history.push({
        id: createId("target-history"),
        reason,
        fromTarget,
        toTarget,
        fromStatus,
        toStatus,
        revisionBefore: Number(segment.revision || 0),
        createdAt: now,
        updatedAt: now
      });
    }
    segment.targetHistory = history.slice(-SEGMENT_HISTORY_LIMIT);
    segment.__historyTarget = toTarget;
    segment.__historyStatus = toStatus;
  }

  function setTarget(segment, target, status, reason = "edit") {
    if (!segment) return;
    const nextTarget = String(target || "");
    const nextStatus = status || (nextTarget.trim() ? "draft" : "empty");
    recordHistory(segment, nextTarget, nextStatus, reason);
    segment.target = nextTarget;
    segment.status = nextStatus;
    if (reason !== "pretranslate") delete segment.tmPretranslation;
  }

  function optionalField(segment, field) {
    const present = Object.prototype.hasOwnProperty.call(segment, field);
    return { present, value: present ? clone(segment[field]) : null };
  }

  function capturePatch(segment) {
    return {
      target: String(segment?.target || ""),
      status: segment?.status || "empty",
      targetHistory: clone(Array.isArray(segment?.targetHistory) ? segment.targetHistory : []),
      revision: Number(segment?.revision || 0),
      updatedAt: segment?.updatedAt || "",
      tmPretranslation: optionalField(segment, "tmPretranslation"),
      aiPretranslation: optionalField(segment, "aiPretranslation"),
      reviewState: optionalField(segment, "reviewState"),
      aiApplication: optionalField(segment, "aiApplication")
    };
  }

  function applyOptionalField(segment, field, patch) {
    if (patch?.present) segment[field] = clone(patch.value);
    else Reflect.deleteProperty(segment, field);
  }

  function applyPatch(segment, patch) {
    segment.target = String(patch?.target || "");
    segment.status = patch?.status || (segment.target.trim() ? "draft" : "empty");
    segment.targetHistory = clone(Array.isArray(patch?.targetHistory) ? patch.targetHistory : []);
    segment.revision = Number(patch?.revision || 0);
    segment.updatedAt = patch?.updatedAt || nowIso();
    applyOptionalField(segment, "tmPretranslation", patch?.tmPretranslation);
    applyOptionalField(segment, "aiPretranslation", patch?.aiPretranslation);
    applyOptionalField(segment, "reviewState", patch?.reviewState);
    applyOptionalField(segment, "aiApplication", patch?.aiApplication);
    setHiddenField(segment, "__historyTarget", segment.target);
    setHiddenField(segment, "__historyStatus", segment.status);
    return segment;
  }

  function touch(segment, options = {}) {
    if (!segment) return segment;
    const revision = Number(segment.revision || 0);
    segment.revision = (Number.isFinite(revision) ? revision : 0) + 1;
    segment.updatedAt = nowIso();
    if (options.invalidateFilters !== false) invalidateFilters();
    return segment;
  }

  return Object.freeze({
    setHiddenField,
    prepareHistory,
    prepareHistories,
    recordHistory,
    setTarget,
    capturePatch,
    applyPatch,
    touch
  });
}
