function errorMessage(error, fallback) {
  return error?.message || String(error || fallback) || fallback;
}

/**
 * Owns segment-confirmation UI, busy, validation, command, navigation, and
 * recovery orchestration. Segment records remain owned by EditorSessionStore;
 * mutations, persistence, TM/activity effects, rendering, and workspace state
 * stay behind injected application boundaries.
 *
 * @param {{
 *   element: any,
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[] },
 *   commands: { bus: { execute: (command: any) => Promise<unknown> }, create: (options: object) => any, changed: () => void },
 *   selection: { getActiveIndex: () => number, focusTarget: () => void, goToNextOpen: () => Promise<unknown> },
 *   validation: { missingTags: (segment: any) => any[], tagLabel: (tag: any) => string },
 *   filters: { matches: (segment: any) => boolean },
 *   mutation: { confirm: (segment: any) => void, restore: (segment: any, snapshot: any) => void, preparePersistedRollback: (segment: any, savedRevision: number) => void },
 *   persistence: { clearPending: (segment: any) => void, save: (segment: any) => Promise<unknown>, saveToTm: (segment: any, project: any) => Promise<unknown>, logActivity: (segment: any, project: any) => Promise<unknown> },
 *   restoration: { restoreCommand: (segmentId: string, snapshot: any, options: { navigateNext: boolean }) => Promise<unknown> | unknown },
 *   view: { updateRow: (index: number) => void, renderSegments: (options?: object) => void, renderProgress: (options?: object) => void, scheduleHistory: () => void, renderHistory: () => void },
 *   workspace: { markDirty: (projectId?: string) => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   testHooks?: { beforeSave?: (segment: any) => void, afterSave?: (segment: any) => void, beforeActivity?: (segment: any) => void },
 *   logger?: { warn?: (...values: any[]) => void }
 * }} options
 */
export function createSegmentConfirmationController(options) {
  const element = options?.element;
  const editorSessionStore = options?.editorSessionStore;
  const commands = options?.commands;
  const selection = options?.selection;
  const validation = options?.validation;
  const filters = options?.filters;
  const mutation = options?.mutation;
  const persistence = options?.persistence;
  const restoration = options?.restoration;
  const view = options?.view;
  const workspace = options?.workspace;
  const status = options?.status;
  if (!element?.addEventListener || !element?.setAttribute) {
    throw new TypeError("SegmentConfirmationController requires the Confirm button.");
  }
  if (typeof editorSessionStore?.getProject !== "function" || typeof editorSessionStore?.getSegments !== "function") {
    throw new TypeError("SegmentConfirmationController requires EditorSessionStore selectors.");
  }
  if (
    typeof commands?.bus?.execute !== "function" ||
    typeof commands?.create !== "function" ||
    typeof commands?.changed !== "function"
  ) {
    throw new TypeError("SegmentConfirmationController requires CommandBus and ConfirmSegment boundaries.");
  }
  if (
    typeof selection?.getActiveIndex !== "function" ||
    typeof selection?.focusTarget !== "function" ||
    typeof selection?.goToNextOpen !== "function"
  ) {
    throw new TypeError("SegmentConfirmationController requires selection and navigation boundaries.");
  }
  if (typeof validation?.missingTags !== "function" || typeof validation?.tagLabel !== "function") {
    throw new TypeError("SegmentConfirmationController requires protected-tag validation boundaries.");
  }
  if (typeof filters?.matches !== "function") {
    throw new TypeError("SegmentConfirmationController requires the checked filter boundary.");
  }
  if (
    typeof mutation?.confirm !== "function" ||
    typeof mutation?.restore !== "function" ||
    typeof mutation?.preparePersistedRollback !== "function"
  ) {
    throw new TypeError("SegmentConfirmationController requires segment mutation adapters.");
  }
  if (
    typeof persistence?.clearPending !== "function" ||
    typeof persistence?.save !== "function" ||
    typeof persistence?.saveToTm !== "function" ||
    typeof persistence?.logActivity !== "function"
  ) {
    throw new TypeError("SegmentConfirmationController requires persistence and secondary-effect boundaries.");
  }
  if (typeof restoration?.restoreCommand !== "function") {
    throw new TypeError("SegmentConfirmationController requires command restoration.");
  }
  if (
    typeof view?.updateRow !== "function" ||
    typeof view?.renderSegments !== "function" ||
    typeof view?.renderProgress !== "function" ||
    typeof view?.scheduleHistory !== "function" ||
    typeof view?.renderHistory !== "function"
  ) {
    throw new TypeError("SegmentConfirmationController requires editor rendering boundaries.");
  }
  if (typeof workspace?.markDirty !== "function" || typeof status?.set !== "function") {
    throw new TypeError("SegmentConfirmationController requires workspace and status boundaries.");
  }

  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};
  const afterSave = typeof options.testHooks?.afterSave === "function" ? options.testHooks.afterSave : () => {};
  const beforeActivity =
    typeof options.testHooks?.beforeActivity === "function" ? options.testHooks.beforeActivity : () => {};
  const warn = typeof options.logger?.warn === "function" ? options.logger.warn.bind(options.logger) : () => {};
  const confirmingSegmentIds = new Set();
  let mounted = false;

  function currentSegment() {
    return editorSessionStore.getSegments()[selection.getActiveIndex()] || null;
  }

  function currentSegmentId() {
    return currentSegment()?.id || "";
  }

  function renderBusy() {
    const segmentId = currentSegmentId();
    const busy = Boolean(segmentId && confirmingSegmentIds.has(segmentId));
    element.disabled = busy;
    element.setAttribute("aria-busy", String(busy));
    return busy;
  }

  function renderFailure() {
    view.renderSegments({ preserveScroll: true });
    view.renderProgress();
    view.renderHistory();
    selection.focusTarget();
  }

  function settledSecondary(run, warningLabel) {
    let result;
    try {
      result = run();
    } catch (error) {
      result = Promise.reject(error);
    }
    return Promise.resolve(result)
      .then(() => true)
      .catch((error) => {
        warn(warningLabel, error);
        return false;
      });
  }

  async function confirm() {
    const segmentIndex = selection.getActiveIndex();
    const segment = editorSessionStore.getSegments()[segmentIndex];
    const project = editorSessionStore.getProject();
    if (!segment || !project || !String(segment.target || "").trim()) return undefined;
    if (confirmingSegmentIds.has(segment.id)) return undefined;

    const missing = validation.missingTags(segment);
    if (missing.length) {
      status.set(`Cannot confirm: missing ${missing.map(validation.tagLabel).join(", ")}`, "dirty");
      view.updateRow(segmentIndex);
      selection.focusTarget();
      return undefined;
    }

    const previousStatus = segment.status;
    const passedFiltersBefore = filters.matches(segment);
    const previous = structuredClone(segment);
    let savedConfirmedRevision = 0;
    const warnings = [];
    confirmingSegmentIds.add(segment.id);
    renderBusy();

    try {
      const command = commands.create({
        projectId: project.id,
        segmentId: segment.id,
        beforeSnapshot: previous,
        restoreSnapshot: (snapshot, context) =>
          restoration.restoreCommand(segment.id, snapshot, { navigateNext: context.direction === "redo" }),
        applyFirst: async () => {
          mutation.confirm(segment);
          persistence.clearPending(segment);
          status.set("Saving...");
          if (passedFiltersBefore !== filters.matches(segment)) view.renderSegments({ preserveScroll: true });
          else view.updateRow(segmentIndex);
          view.renderProgress({ previousStatus, nextStatus: segment.status });
          view.scheduleHistory();
          beforeSave(segment);
          await persistence.save(segment);
          savedConfirmedRevision = Number(segment.revision || 0);
          afterSave(segment);
          workspace.markDirty(project.id);

          const navigation = selection.goToNextOpen().catch((error) => {
            warn("Confirm navigation refresh failed.", error);
            selection.focusTarget();
          });
          renderBusy();

          const tmResult = settledSecondary(() => persistence.saveToTm(segment, project), "Confirm TM save failed.");
          const activityResult = Promise.resolve()
            .then(() => {
              beforeActivity(segment);
              return persistence.logActivity(segment, project);
            })
            .then(() => true)
            .catch((error) => {
              warn("Confirm activity log failed.", error);
              return false;
            });
          const [tmSaved, activitySaved] = await Promise.all([tmResult, activityResult, navigation]);
          if (!tmSaved) warnings.push("TM save failed");
          if (!activitySaved) warnings.push("activity log failed");
          return {
            snapshot: structuredClone(segment),
            activeSegmentId: currentSegmentId() || segment.id
          };
        }
      });

      await commands.bus.execute(command);
      commands.changed();
      status.set(
        warnings.length ? `Saved; ${warnings.join("; ")}; Undo is available` : "Saved; Undo is available",
        warnings.length ? "dirty" : "saved"
      );
      return true;
    } catch (error) {
      mutation.restore(segment, previous);
      if (savedConfirmedRevision) {
        mutation.preparePersistedRollback(segment, savedConfirmedRevision);
        try {
          await persistence.save(segment);
        } catch (rollbackError) {
          status.set(
            `${errorMessage(error, "Confirm segment failed")}; rollback save failed: ${errorMessage(rollbackError, "Rollback failed")}`,
            "dirty"
          );
          renderFailure();
          return false;
        }
      }
      status.set(errorMessage(error, "Confirm segment failed"), "dirty");
      renderFailure();
      return false;
    } finally {
      confirmingSegmentIds.delete(segment.id);
      renderBusy();
    }
  }

  const handleClick = () => void confirm();

  function mount() {
    if (mounted) return false;
    element.addEventListener("click", handleClick);
    mounted = true;
    renderBusy();
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    element.removeEventListener("click", handleClick);
    mounted = false;
    return true;
  }

  return Object.freeze({
    confirm,
    isBusy: (segmentId) => confirmingSegmentIds.has(segmentId),
    mount,
    renderBusy,
    unmount
  });
}
