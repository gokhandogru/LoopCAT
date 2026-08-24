import { validateAiSuggestionApplicationControllerOptions } from "./ai-suggestion-application-controller-contract.js";

/**
 * Owns reversible AI-suggestion application, persistence, activity warnings,
 * presentation, apply-and-next navigation, and exact failure recovery.
 * Suggestion records, EditorSessionStore, command implementations, target
 * mutations, repositories, and rendering remain injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[], replaceSegmentAt: (index: number, segment: any) => any },
 *   commands: { bus: { execute: (command: any) => Promise<unknown> }, create: (options: object) => any, changed: () => void },
 *   selection: { getActiveIndex: () => number, goToNextOpen: () => void },
 *   mutation: { applyTarget: (segment: any, target: string, status: string, origin: string) => void, touch: (segment: any) => unknown, restoreInPlace: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => any, prepareRestoreSnapshot: (nextSnapshot: any, currentSnapshot: any) => any },
 *   persistence: { flush: (projectId: string) => Promise<unknown>, clearPending: (segment: any) => unknown, save: (segment: any) => Promise<unknown> },
 *   activity: { log: (details: object) => Promise<unknown> | unknown },
 *   presentation: { renderSegments: () => void, renderProgress: () => void, renderHistory: () => void, renderSuggestions: () => void, refreshSidebar: () => Promise<unknown> | unknown, renderAll: () => void, focusTarget: () => void },
 *   workspace: { markDirty: () => void, markActivityWarningDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   clock?: { now: () => string },
 *   testHooks?: { beforeSave?: (segment: any) => void, beforeActivity?: (segment: any) => void },
 *   logger?: { warn?: (...values: any[]) => void }
 * }} options
 */
export function createAiSuggestionApplicationController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const commands = options?.commands;
  const selection = options?.selection;
  const mutation = options?.mutation;
  const persistence = options?.persistence;
  const activity = options?.activity;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;

  validateAiSuggestionApplicationControllerOptions(options);

  const now = typeof options.clock?.now === "function" ? options.clock.now : () => new Date().toISOString();
  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};
  const beforeActivity =
    typeof options.testHooks?.beforeActivity === "function" ? options.testHooks.beforeActivity : () => {};
  const warn = typeof options.logger?.warn === "function" ? options.logger.warn.bind(options.logger) : () => {};

  function currentSegment() {
    return editorSessionStore.getSegments()[selection.getActiveIndex()] || null;
  }

  function renderAppliedState() {
    presentation.renderSegments();
    presentation.renderProgress();
    presentation.renderHistory();
  }

  async function restoreSnapshot(segmentId, nextSnapshot) {
    const segments = editorSessionStore.getSegments();
    const index = segments.findIndex((item) => item.id === segmentId);
    if (index < 0) throw new Error("The affected segment is no longer available.");
    const currentSnapshot = structuredClone(segments[index]);
    try {
      const restored = mutation.prepareRestoreSnapshot(nextSnapshot, currentSnapshot);
      editorSessionStore.replaceSegmentAt(index, restored);
      persistence.clearPending(restored);
      await persistence.save(restored);
      renderAppliedState();
      presentation.renderSuggestions();
      await presentation.refreshSidebar();
      workspace.markDirty();
      return restored;
    } catch (error) {
      editorSessionStore.replaceSegmentAt(index, mutation.prepareHistory(currentSnapshot));
      presentation.renderAll();
      throw error;
    }
  }

  async function apply(suggestionId, applyOptions = {}) {
    const project = editorSessionStore.getProject();
    const segment = currentSegment();
    const suggestion = (segment?.aiSuggestions || []).find((item) => item.id === suggestionId);
    if (!project || !segment || !suggestion?.suggestedTarget) return false;
    if (segment.locked || segment.status === "confirmed") {
      status.set("Confirmed or locked segments must be reopened before applying an AI suggestion", "dirty");
      return false;
    }
    try {
      await persistence.flush(project.id);
    } catch (error) {
      status.set(error.message || "Save pending changes before applying AI suggestion failed", "dirty");
      return false;
    }

    const snapshot = structuredClone(segment);
    let activityLogged = true;
    try {
      const command = commands.create({
        projectId: project.id,
        segmentId: segment.id,
        suggestion,
        beforeSnapshot: snapshot,
        restoreSnapshot: (nextSnapshot) => restoreSnapshot(segment.id, nextSnapshot),
        applyFirst: async () => {
          mutation.applyTarget(segment, suggestion.suggestedTarget, "draft", "ai-suggestion");
          segment.aiApplication = {
            suggestionId: suggestion.id,
            origin: suggestion.origin || suggestion.provider || "AI",
            provider: suggestion.provider || "",
            model: suggestion.model || "",
            appliedAt: now(),
            reviewState: "needs-review"
          };
          segment.reviewState = "needs-review";
          mutation.touch(segment);
          persistence.clearPending(segment);
          beforeSave(segment);
          await persistence.save(segment);
          try {
            beforeActivity(segment);
            await activity.log({
              segmentId: segment.id,
              provider: suggestion.provider || "",
              model: suggestion.model || "",
              suggestionId: suggestion.id
            });
          } catch (activityError) {
            activityLogged = false;
            warn("AI suggestion activity log failed.", activityError);
            workspace.markActivityWarningDirty();
          }
          renderAppliedState();
          await presentation.refreshSidebar();
          workspace.markDirty();
          return { snapshot: structuredClone(segment) };
        }
      });
      await commands.bus.execute(command);
      commands.changed();
      status.set(
        activityLogged
          ? "AI suggestion applied; Undo is available"
          : "AI suggestion applied; activity log failed; Undo is available",
        activityLogged ? "saved" : "dirty"
      );
      if (applyOptions.andNext) selection.goToNextOpen();
      return true;
    } catch (error) {
      mutation.restoreInPlace(segment, snapshot);
      mutation.prepareHistory(segment);
      renderAppliedState();
      presentation.renderSuggestions();
      presentation.focusTarget();
      status.set(error.message || "AI suggestion apply failed", "dirty");
      return false;
    }
  }

  return Object.freeze({ apply });
}
