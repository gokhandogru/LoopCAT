/**
 * Owns target-replacement inputs and actions, protected-token proposal
 * construction, ReplaceTargets command/persistence sequencing, presentation,
 * activity, status, and failure recovery. Segment records remain owned by
 * EditorSessionStore and all domain mutations stay behind injected boundaries.
 *
 * @param {{
 *   elements: { menu: any, findInput: any, replacementInput: any, visibleButton: any, allButton: any },
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[] },
 *   filters: { getOptions: () => { regex: boolean, caseSensitive: boolean }, getIndexes: (scope: string) => number[] },
 *   transform: { replace: (target: string, findText: string, replacement: string, options: object) => { text: string, count: number } },
 *   commands: { bus: { execute: (command: any) => Promise<any> }, create: (options: object) => any, changed: () => void },
 *   persistence: { flush: (projectId: string) => Promise<unknown>, clearPending: (segment: any) => unknown, save: (segments: any[]) => Promise<unknown> },
 *   mutation: { applyTarget: (segment: any, target: string, status: string, reason: string) => void, touch: (segment: any) => unknown, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown, hasTagIssue: (segment: any) => boolean },
 *   restoration: { restoreSnapshots: (snapshots: any[], options?: object) => Promise<unknown> | unknown },
 *   selection: { getActiveSegmentId: () => string, focusTarget: () => unknown },
 *   presentation: { renderSegments: (options?: object) => void, renderProgress: () => void, refreshSidebar: () => Promise<unknown>, renderHistory: () => void },
 *   activity: { log: (details: object) => Promise<unknown> | unknown },
 *   status: { set: (message: string, mode?: string) => void },
 *   testHooks?: { beforeSave?: (segments: any[]) => void },
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createTargetReplacementController(options) {
  const elements = options?.elements;
  const editorSessionStore = options?.editorSessionStore;
  const filters = options?.filters;
  const transform = options?.transform;
  const commands = options?.commands;
  const persistence = options?.persistence;
  const mutation = options?.mutation;
  const restoration = options?.restoration;
  const selection = options?.selection;
  const presentation = options?.presentation;
  const activity = options?.activity;
  const status = options?.status;
  if (
    !elements?.menu ||
    !("open" in elements.menu) ||
    !elements?.findInput?.focus ||
    !elements?.visibleButton?.addEventListener ||
    !elements?.visibleButton?.removeEventListener ||
    !elements?.allButton?.addEventListener ||
    !elements?.allButton?.removeEventListener
  ) {
    throw new TypeError("TargetReplacementController requires replacement inputs and action buttons.");
  }
  if (typeof editorSessionStore?.getProject !== "function" || typeof editorSessionStore?.getSegments !== "function") {
    throw new TypeError("TargetReplacementController requires EditorSessionStore selectors.");
  }
  if (
    typeof filters?.getOptions !== "function" ||
    typeof filters?.getIndexes !== "function" ||
    typeof transform?.replace !== "function"
  ) {
    throw new TypeError("TargetReplacementController requires filter and protected-token replacement boundaries.");
  }
  if (
    typeof commands?.bus?.execute !== "function" ||
    typeof commands?.create !== "function" ||
    typeof commands?.changed !== "function"
  ) {
    throw new TypeError("TargetReplacementController requires ReplaceTargets command boundaries.");
  }
  if (
    typeof persistence?.flush !== "function" ||
    typeof persistence?.clearPending !== "function" ||
    typeof persistence?.save !== "function"
  ) {
    throw new TypeError("TargetReplacementController requires persistence boundaries.");
  }
  if (
    typeof mutation?.applyTarget !== "function" ||
    typeof mutation?.touch !== "function" ||
    typeof mutation?.restore !== "function" ||
    typeof mutation?.prepareHistory !== "function" ||
    typeof mutation?.hasTagIssue !== "function"
  ) {
    throw new TypeError("TargetReplacementController requires target mutation adapters.");
  }
  if (typeof restoration?.restoreSnapshots !== "function") {
    throw new TypeError("TargetReplacementController requires command restoration.");
  }
  if (typeof selection?.getActiveSegmentId !== "function" || typeof selection?.focusTarget !== "function") {
    throw new TypeError("TargetReplacementController requires segment selection boundaries.");
  }
  if (
    typeof presentation?.renderSegments !== "function" ||
    typeof presentation?.renderProgress !== "function" ||
    typeof presentation?.refreshSidebar !== "function" ||
    typeof presentation?.renderHistory !== "function"
  ) {
    throw new TypeError("TargetReplacementController requires editor presentation boundaries.");
  }
  if (typeof activity?.log !== "function" || typeof status?.set !== "function") {
    throw new TypeError("TargetReplacementController requires activity and status boundaries.");
  }

  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};
  const logger = options.logger || console;
  let mounted = false;

  async function replace(scope = "visible") {
    const project = editorSessionStore.getProject();
    if (!project) return { segmentCount: 0, replacementCount: 0 };
    const findText = elements.findInput.value;
    const replacement = elements.replacementInput.value;
    if (!findText) {
      status.set("Enter target text to replace.", "dirty");
      elements.findInput.focus();
      return { segmentCount: 0, replacementCount: 0 };
    }
    const replaceOptions = filters.getOptions();
    const indexes = filters.getIndexes(scope);
    let replacementCount = 0;
    const proposals = [];
    try {
      indexes.forEach((index) => {
        const segment = editorSessionStore.getSegments()[index];
        if (!segment) return;
        const result = transform.replace(segment.target || "", findText, replacement, replaceOptions);
        if (!result.count || result.text === segment.target) return;
        proposals.push({ segment, text: result.text, count: result.count });
        replacementCount += result.count;
      });
    } catch (error) {
      status.set(error.message || "Replace failed.", "dirty");
      return { segmentCount: 0, replacementCount: 0 };
    }
    if (!proposals.length) {
      status.set(`No target matches in ${scope === "all" ? "the project" : "the visible segments"}.`, "saved");
      return { segmentCount: 0, replacementCount: 0 };
    }

    const snapshots = new Map();
    const updated = [];
    try {
      await persistence.flush(editorSessionStore.getProject().id);
      proposals.forEach(({ segment }) => snapshots.set(segment.id, structuredClone(segment)));
      const command = commands.create({
        projectId: editorSessionStore.getProject().id,
        segmentIds: proposals.map(({ segment }) => segment.id),
        beforeSnapshots: proposals.map(({ segment }) => snapshots.get(segment.id)),
        restoreSnapshots: (nextSnapshots) =>
          restoration.restoreSnapshots(nextSnapshots, { activeSegmentId: selection.getActiveSegmentId() }),
        applyFirst: async () => {
          proposals.forEach(({ segment, text }) => {
            mutation.applyTarget(segment, text, text.trim() ? "draft" : "empty", "replace");
            mutation.touch(segment);
            updated.push(segment);
          });
          updated.forEach(persistence.clearPending);
          beforeSave(updated);
          await persistence.save(updated);
          presentation.renderSegments({ preserveScroll: true });
          presentation.renderProgress();
          await presentation.refreshSidebar();
          try {
            await activity.log({
              scope,
              segmentCount: updated.length,
              replacementCount,
              regex: replaceOptions.regex,
              caseSensitive: replaceOptions.caseSensitive
            });
          } catch (activityError) {
            logger.warn?.("Replace activity log failed.", activityError);
          }
          return {
            snapshots: updated.map((segment) => structuredClone(segment)),
            activeSegmentId: selection.getActiveSegmentId() || updated[0]?.id || ""
          };
        }
      });
      await commands.bus.execute(command);
      commands.changed();
      const tagIssueCount = updated.filter(mutation.hasTagIssue).length;
      const warning = tagIssueCount
        ? ` ${tagIssueCount} segment${tagIssueCount === 1 ? "" : "s"} still need tag QA.`
        : "";
      status.set(
        `Replaced ${replacementCount} match${replacementCount === 1 ? "" : "es"} in ${updated.length} target segment${updated.length === 1 ? "" : "s"}.${warning} Undo is available.`,
        tagIssueCount ? "dirty" : "saved"
      );
      return { segmentCount: updated.length, replacementCount };
    } catch (error) {
      updated.forEach((segment) => {
        const snapshot = snapshots.get(segment.id);
        if (!snapshot) return;
        mutation.restore(segment, snapshot);
        mutation.prepareHistory(segment);
      });
      presentation.renderSegments({ preserveScroll: true });
      presentation.renderProgress();
      presentation.renderHistory();
      selection.focusTarget();
      status.set(error.message || "Replace failed.", "dirty");
      return { segmentCount: 0, replacementCount: 0 };
    }
  }

  const handleVisible = () => void replace("visible");
  const handleAll = () => void replace("all");

  function open() {
    elements.menu.open = true;
    elements.findInput.focus();
  }

  function mount() {
    if (mounted) return false;
    elements.visibleButton.addEventListener("click", handleVisible);
    elements.allButton.addEventListener("click", handleAll);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    elements.visibleButton.removeEventListener("click", handleVisible);
    elements.allButton.removeEventListener("click", handleAll);
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, open, replace, unmount });
}
