/**
 * Owns full review-metadata normalization, optional comment creation,
 * persistence, activity logging, presentation updates, and failure recovery.
 * Segment records remain owned by EditorSessionStore and durable effects stay
 * behind injected boundaries.
 *
 * @param {{
 *   editorSessionStore: { getSegments: () => any[] },
 *   selection: { getActiveIndex: () => number },
 *   mutation: { touch: (segment: any) => unknown, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown },
 *   persistence: { clearPending: (segment: any) => unknown, save: (segment: any) => Promise<unknown> },
 *   activity: { log: (segment: any) => Promise<unknown> | unknown },
 *   presentation: { renderReview: (options?: { force?: boolean }) => void, updateRow: (index: number) => void, renderHistory: () => void },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   ids?: { comment?: () => string },
 *   clock?: { now?: () => string },
 *   testHooks?: { beforeSave?: (segment: any) => void },
 *   logger?: { warn?: (...values: any[]) => void }
 * }} options
 */
export function createReviewMetadataController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const selection = options?.selection;
  const mutation = options?.mutation;
  const persistence = options?.persistence;
  const activity = options?.activity;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;
  if (typeof editorSessionStore?.getSegments !== "function") {
    throw new TypeError("ReviewMetadataController requires the EditorSessionStore segment selector.");
  }
  if (typeof selection?.getActiveIndex !== "function") {
    throw new TypeError("ReviewMetadataController requires the active segment selection boundary.");
  }
  if (
    typeof mutation?.touch !== "function" ||
    typeof mutation?.restore !== "function" ||
    typeof mutation?.prepareHistory !== "function"
  ) {
    throw new TypeError("ReviewMetadataController requires segment mutation adapters.");
  }
  if (typeof persistence?.clearPending !== "function" || typeof persistence?.save !== "function") {
    throw new TypeError("ReviewMetadataController requires persistence boundaries.");
  }
  if (typeof activity?.log !== "function") {
    throw new TypeError("ReviewMetadataController requires the optional activity boundary.");
  }
  if (
    typeof presentation?.renderReview !== "function" ||
    typeof presentation?.updateRow !== "function" ||
    typeof presentation?.renderHistory !== "function"
  ) {
    throw new TypeError("ReviewMetadataController requires review presentation boundaries.");
  }
  if (typeof workspace?.markDirty !== "function" || typeof status?.set !== "function") {
    throw new TypeError("ReviewMetadataController requires workspace and status boundaries.");
  }

  const createCommentId =
    typeof options.ids?.comment === "function"
      ? options.ids.comment
      : () => `comment-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
  const now = typeof options.clock?.now === "function" ? options.clock.now : () => new Date().toISOString();
  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};
  const warn = typeof options.logger?.warn === "function" ? options.logger.warn.bind(options.logger) : () => {};

  function currentSegment() {
    return editorSessionStore.getSegments()[selection.getActiveIndex()] || null;
  }

  function applyValues(segment, values) {
    segment.reviewState = String(values?.reviewState || "");
    segment.reviewNote = String(values?.reviewNote || "").trim();
    const commentBody = String(values?.commentBody || "").trim();
    if (!commentBody) return;
    const timestamp = now();
    segment.comments = [
      ...(segment.comments || []),
      {
        id: createCommentId(),
        body: commentBody,
        state: "open",
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];
  }

  async function save(values = {}) {
    const segment = currentSegment();
    if (!segment) return undefined;
    const snapshot = structuredClone(segment);
    try {
      applyValues(segment, values);
      mutation.touch(segment);
      persistence.clearPending(segment);
      beforeSave(segment);
      await persistence.save(segment);
      try {
        await activity.log(segment);
      } catch (error) {
        warn("Review activity log failed.", error);
      }
      presentation.renderReview({ force: true });
      presentation.updateRow(selection.getActiveIndex());
      workspace.markDirty();
      status.set("Review saved", "saved");
    } catch (error) {
      mutation.restore(segment, snapshot);
      mutation.prepareHistory(segment);
      presentation.renderReview({ force: true });
      presentation.updateRow(selection.getActiveIndex());
      presentation.renderHistory();
      status.set(error?.message || "Review save failed", "dirty");
    }
    return undefined;
  }

  return Object.freeze({ save });
}
