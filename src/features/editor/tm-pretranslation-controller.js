/**
 * Owns TM batch-pretranslation threshold/busy state, eligible-candidate and
 * batched-match proposal construction, command/persistence sequencing,
 * provenance, presentation, best-effort secondary effects, and recovery.
 * Records, matching, storage, CommandBus, and dialog UI stay injected.
 *
 * @param {{
 *   pretranslateButton: any,
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[] },
 *   segments: { getDocumentSegments: () => any[], isLocked: (segment: any) => boolean },
 *   threshold: { request: () => Promise<any> | any },
 *   tm: { getNames: (project: any) => string[], findMatchesBatch: (options: any[]) => Promise<any[]> },
 *   commands: { bus: { execute: (command: any) => Promise<any> }, create: (options: object) => any, changed: () => void },
 *   persistence: { flush: (projectId: string) => Promise<unknown>, save: (segments: any[]) => Promise<unknown> },
 *   mutation: { capturePatch: (segment: any) => any, applyTarget: (segment: any, target: string, status: string, reason: string) => void, touch: (segment: any) => unknown, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown },
 *   restoration: { restorePatches: (patches: any[], context?: object) => Promise<unknown> | unknown },
 *   selection: { getActiveSegmentId: () => string, focusTarget: () => unknown },
 *   presentation: { yieldToUi: () => Promise<unknown>, renderSegments: (options?: object) => void, renderProgress: () => void, renderHistory: () => void, refreshSidebar: () => Promise<unknown> },
 *   activity: { log: (details: object) => Promise<unknown> | unknown },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   batchSize?: number,
 *   clock?: { now?: () => string },
 *   testHooks?: { beforeSave?: (segments: any[]) => void },
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createTmPretranslationController(options) {
  const pretranslateButton = options?.pretranslateButton;
  const editorSessionStore = options?.editorSessionStore;
  const segments = options?.segments;
  const threshold = options?.threshold;
  const tm = options?.tm;
  const commands = options?.commands;
  const persistence = options?.persistence;
  const mutation = options?.mutation;
  const restoration = options?.restoration;
  const selection = options?.selection;
  const presentation = options?.presentation;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const status = options?.status;
  if (
    !pretranslateButton?.addEventListener ||
    !pretranslateButton?.removeEventListener ||
    typeof pretranslateButton?.setAttribute !== "function"
  ) {
    throw new TypeError("TmPretranslationController requires the pretranslation button.");
  }
  if (typeof editorSessionStore?.getProject !== "function" || typeof editorSessionStore?.getSegments !== "function") {
    throw new TypeError("TmPretranslationController requires EditorSessionStore selectors.");
  }
  if (typeof segments?.getDocumentSegments !== "function" || typeof segments?.isLocked !== "function") {
    throw new TypeError("TmPretranslationController requires document-segment boundaries.");
  }
  if (
    typeof threshold?.request !== "function" ||
    typeof tm?.getNames !== "function" ||
    typeof tm?.findMatchesBatch !== "function"
  ) {
    throw new TypeError("TmPretranslationController requires threshold and TM lookup boundaries.");
  }
  if (
    typeof commands?.bus?.execute !== "function" ||
    typeof commands?.create !== "function" ||
    typeof commands?.changed !== "function"
  ) {
    throw new TypeError("TmPretranslationController requires TM pretranslation command boundaries.");
  }
  if (typeof persistence?.flush !== "function" || typeof persistence?.save !== "function") {
    throw new TypeError("TmPretranslationController requires persistence boundaries.");
  }
  if (
    typeof mutation?.capturePatch !== "function" ||
    typeof mutation?.applyTarget !== "function" ||
    typeof mutation?.touch !== "function" ||
    typeof mutation?.restore !== "function" ||
    typeof mutation?.prepareHistory !== "function"
  ) {
    throw new TypeError("TmPretranslationController requires target mutation adapters.");
  }
  if (typeof restoration?.restorePatches !== "function") {
    throw new TypeError("TmPretranslationController requires command restoration.");
  }
  if (typeof selection?.getActiveSegmentId !== "function" || typeof selection?.focusTarget !== "function") {
    throw new TypeError("TmPretranslationController requires segment selection boundaries.");
  }
  if (
    typeof presentation?.yieldToUi !== "function" ||
    typeof presentation?.renderSegments !== "function" ||
    typeof presentation?.renderProgress !== "function" ||
    typeof presentation?.renderHistory !== "function" ||
    typeof presentation?.refreshSidebar !== "function"
  ) {
    throw new TypeError("TmPretranslationController requires editor presentation boundaries.");
  }
  if (
    typeof activity?.log !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError("TmPretranslationController requires activity, workspace, and status boundaries.");
  }

  const batchSize = Math.max(1, Math.floor(Number(options.batchSize) || 100));
  const now = typeof options.clock?.now === "function" ? options.clock.now : () => new Date().toISOString();
  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};
  const logger = options.logger || console;
  let busy = false;
  let mounted = false;

  async function pretranslate() {
    if (!editorSessionStore.getProject() || busy) return null;
    const beforePatches = new Map();
    const beforeSnapshots = new Map();
    const updated = [];
    busy = true;
    try {
      const raw = await threshold.request();
      if (raw === null) return null;
      const matchThreshold = Number(raw);
      if (!Number.isFinite(matchThreshold) || matchThreshold < 0 || matchThreshold > 100) {
        status.set("Enter a match percentage between 0 and 100.", "dirty");
        return null;
      }
      const candidates = segments
        .getDocumentSegments()
        .filter(
          (segment) =>
            !segment.target.trim() &&
            segment.source.trim() &&
            segment.status !== "confirmed" &&
            !segments.isLocked(segment)
        );
      if (!candidates.length) {
        status.set("No empty segments to pretranslate.", "saved");
        return null;
      }

      pretranslateButton.disabled = true;
      pretranslateButton.setAttribute("aria-busy", "true");
      status.set("Pretranslating...");
      await presentation.yieldToUi();
      const tmNames = tm.getNames(editorSessionStore.getProject());
      const uniqueSources = Array.from(new Set(candidates.map((segment) => segment.source)));
      const matchesBySource = new Map();
      for (let offset = 0; offset < uniqueSources.length; offset += batchSize) {
        const sources = uniqueSources.slice(offset, offset + batchSize);
        const matchOptions = sources.map((source) => ({
          source,
          sourceLang: editorSessionStore.getProject().sourceLang,
          targetLang: editorSessionStore.getProject().targetLang,
          tmNames,
          limit: 1
        }));
        const batches = await tm.findMatchesBatch(matchOptions);
        sources.forEach((source, index) => matchesBySource.set(source, batches[index]?.[0] || null));
        const completed = Math.min(offset + sources.length, uniqueSources.length);
        status.set(`Pretranslating... ${completed}/${uniqueSources.length}`);
        await presentation.yieldToUi();
      }

      const proposals = [];
      for (const segment of candidates) {
        const match = matchesBySource.get(segment.source);
        if (!match || match.score < matchThreshold || !match.target?.trim()) continue;
        proposals.push({ segment, match });
      }
      if (!proposals.length) {
        status.set(`No TM matches at ${matchThreshold}% or higher.`, "saved");
        return null;
      }

      await persistence.flush(editorSessionStore.getProject().id);
      const activeSegmentId = selection.getActiveSegmentId() || proposals[0].segment.id;
      proposals.forEach(({ segment }) => {
        beforePatches.set(segment.id, mutation.capturePatch(segment));
        beforeSnapshots.set(segment.id, structuredClone(segment));
      });
      const command = commands.create({
        projectId: editorSessionStore.getProject().id,
        segmentIds: proposals.map(({ segment }) => segment.id),
        beforePatches: proposals.map(({ segment }) => beforePatches.get(segment.id)),
        provenance: {
          origin: "translation-memory",
          producer: "pretranslation",
          threshold: matchThreshold,
          matchCount: proposals.length
        },
        restorePatches: (patches, context) => restoration.restorePatches(patches, { ...context, activeSegmentId }),
        applyFirst: async () => {
          for (const { segment, match } of proposals) {
            mutation.applyTarget(segment, match.target, "draft", "pretranslate");
            segment.tmPretranslation = {
              score: Math.max(0, Math.min(100, Math.round(Number(match.score || 0)))),
              tmName: String(match.tmName || "").trim(),
              matchId: String(match.id || "").trim(),
              appliedAt: now()
            };
            Reflect.deleteProperty(segment, "aiPretranslation");
            mutation.touch(segment);
            updated.push(segment);
          }
          beforeSave(updated);
          await persistence.save(updated);
          return {
            patches: updated.map((segment) => mutation.capturePatch(segment)),
            activeSegmentId,
            affectedCount: updated.length
          };
        }
      });
      const commandExecution = await commands.bus.execute(command);
      commands.changed();
      try {
        await activity.log({ threshold: matchThreshold, updatedCount: updated.length });
      } catch (activityError) {
        logger.warn?.("Pretranslation activity log failed.", activityError);
      }
      presentation.renderSegments({ preserveScroll: true });
      presentation.renderProgress();
      try {
        await presentation.refreshSidebar();
      } catch (refreshError) {
        logger.warn?.("TM pretranslation sidebar refresh failed.", refreshError);
      }
      workspace.markDirty();
      status.set(
        `Pretranslated ${updated.length} segment${updated.length === 1 ? "" : "s"} at ${matchThreshold}%+; Undo is available`,
        "saved"
      );
      return commandExecution;
    } catch (error) {
      beforeSnapshots.forEach((snapshot, segmentId) => {
        const segment = editorSessionStore.getSegments().find((item) => item.id === segmentId);
        if (!segment) return;
        mutation.restore(segment, snapshot);
        mutation.prepareHistory(segment);
      });
      presentation.renderSegments();
      presentation.renderProgress();
      presentation.renderHistory();
      selection.focusTarget();
      status.set(error.message || "TM pretranslation failed", "dirty");
      return null;
    } finally {
      busy = false;
      pretranslateButton.disabled = false;
      pretranslateButton.setAttribute("aria-busy", "false");
    }
  }

  const handlePretranslate = () => void pretranslate();

  function mount() {
    if (mounted) return false;
    pretranslateButton.addEventListener("click", handlePretranslate);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    pretranslateButton.removeEventListener("click", handlePretranslate);
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, pretranslate, unmount });
}
