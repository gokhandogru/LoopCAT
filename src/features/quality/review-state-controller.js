/**
 * Owns quick review-state toggle, command, persistence, optional activity,
 * presentation synchronization, and failure-recovery orchestration. Segment
 * records remain owned by EditorSessionStore and all effects stay injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[] },
 *   commands: { bus: { execute: (command: any) => Promise<unknown> }, create: (options: object) => any, changed: () => void },
 *   selection: { getActiveIndex: () => number },
 *   mutation: { toggle: (segment: any, reviewState: string) => void, touch: (segment: any) => unknown, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown },
 *   persistence: { clearPending: (segment: any) => unknown, save: (segment: any) => Promise<unknown> },
 *   restoration: { restoreCommand: (segmentId: string, snapshot: any) => Promise<unknown> | unknown },
 *   activity: { log: (segment: any, project: any, summary: string) => Promise<unknown> | unknown },
 *   presentation: { syncState: (reviewState: string) => void, renderReview: () => void, updateRow: (index: number) => void, renderHistory: () => void },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   describeState: (reviewState: string) => string,
 *   testHooks?: { beforeSave?: (segment: any) => void },
 *   logger?: { warn?: (...values: any[]) => void }
 * }} options
 */
export function createReviewStateController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const commands = options?.commands;
  const selection = options?.selection;
  const mutation = options?.mutation;
  const persistence = options?.persistence;
  const restoration = options?.restoration;
  const activity = options?.activity;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;
  if (typeof editorSessionStore?.getProject !== "function" || typeof editorSessionStore?.getSegments !== "function") {
    throw new TypeError("ReviewStateController requires EditorSessionStore selectors.");
  }
  if (
    typeof commands?.bus?.execute !== "function" ||
    typeof commands?.create !== "function" ||
    typeof commands?.changed !== "function"
  ) {
    throw new TypeError("ReviewStateController requires CommandBus and ChangeReviewState boundaries.");
  }
  if (typeof selection?.getActiveIndex !== "function") {
    throw new TypeError("ReviewStateController requires the active segment selection boundary.");
  }
  if (
    typeof mutation?.toggle !== "function" ||
    typeof mutation?.touch !== "function" ||
    typeof mutation?.restore !== "function" ||
    typeof mutation?.prepareHistory !== "function"
  ) {
    throw new TypeError("ReviewStateController requires segment mutation adapters.");
  }
  if (typeof persistence?.clearPending !== "function" || typeof persistence?.save !== "function") {
    throw new TypeError("ReviewStateController requires persistence boundaries.");
  }
  if (typeof restoration?.restoreCommand !== "function" || typeof activity?.log !== "function") {
    throw new TypeError("ReviewStateController requires restoration and activity boundaries.");
  }
  if (
    typeof presentation?.syncState !== "function" ||
    typeof presentation?.renderReview !== "function" ||
    typeof presentation?.updateRow !== "function" ||
    typeof presentation?.renderHistory !== "function"
  ) {
    throw new TypeError("ReviewStateController requires review presentation boundaries.");
  }
  if (
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function" ||
    typeof options.describeState !== "function"
  ) {
    throw new TypeError("ReviewStateController requires workspace, status, and label boundaries.");
  }

  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};
  const warn = typeof options.logger?.warn === "function" ? options.logger.warn.bind(options.logger) : () => {};

  function currentSegment() {
    return editorSessionStore.getSegments()[selection.getActiveIndex()] || null;
  }

  function stateSummary(reviewState) {
    return reviewState ? `Marked ${options.describeState(reviewState)}` : "Review state cleared";
  }

  async function setState(reviewState) {
    const segment = currentSegment();
    const project = editorSessionStore.getProject();
    if (!project || !segment) return undefined;
    const snapshot = structuredClone(segment);
    try {
      const command = commands.create({
        projectId: project.id,
        segmentId: segment.id,
        beforeSnapshot: snapshot,
        restoreSnapshot: (nextSnapshot) => restoration.restoreCommand(segment.id, nextSnapshot),
        applyFirst: async () => {
          mutation.toggle(segment, reviewState);
          mutation.touch(segment);
          presentation.syncState(segment.reviewState || "");
          persistence.clearPending(segment);
          beforeSave(segment);
          await persistence.save(segment);
          const summary = stateSummary(segment.reviewState);
          try {
            await activity.log(segment, project, summary);
          } catch (error) {
            warn("Review activity log failed.", error);
          }
          presentation.updateRow(selection.getActiveIndex());
          workspace.markDirty();
          return { snapshot: structuredClone(segment), activeSegmentId: segment.id };
        }
      });
      await commands.bus.execute(command);
      commands.changed();
      status.set(`${stateSummary(segment.reviewState)}; Undo is available`, "saved");
    } catch (error) {
      mutation.restore(segment, snapshot);
      mutation.prepareHistory(segment);
      presentation.renderReview();
      presentation.updateRow(selection.getActiveIndex());
      presentation.renderHistory();
      status.set(error?.message || "Review state save failed", "dirty");
    }
    return undefined;
  }

  return Object.freeze({ setState });
}
