import { validateAiPretranslationControllerOptions } from "./ai-command-controller-contracts.js";

/**
 * Owns local/hosted AI batch-pretranslation validation, consent, selection,
 * lifecycle, provider execution, command/persistence sequencing, presentation,
 * secondary effects, and recovery. Provider adapters, records, context lookup,
 * storage, CommandBus, and UI primitives stay injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[], replaceSegments: (segments: any[]) => void },
 *   settings: { persist: () => Promise<any>, runtimeConfig: (settings: any) => any, assertReady: (settings: any, config: any, action: string) => void, projectDefaults: (project: any) => any },
 *   providers: { get: (settings: any) => any, sharesExternally: (settings: any) => boolean },
 *   consent: { externalShare: (details: object) => boolean, overwrite: () => boolean },
 *   scope: { getSegments: (settings: any) => any[], getOptions: (settings: any) => { selectedSegmentIds: string[], visibleSegmentIds: string[] } },
 *   domain: { selectSegments: (segments: any[], options: object) => { candidates: any[], skipped: any[] }, pretranslateSegments: (options: object) => Promise<any> },
 *   context: { glossaryTermsForSegment: (segment: any) => Promise<any[]> | any[], tmMatchesForSegment: (segment: any) => Promise<any[]> | any[], surroundingSegmentsForSegment: (segment: any, options?: object) => any[] },
 *   lifecycle: { isBusy: () => boolean, sync: (state: { running: boolean, abortController: AbortController | null, progress: any }) => void, createAbortController?: () => AbortController },
 *   commands: { bus: { execute: (command: any) => Promise<any> }, create: (options: object) => any, changed: () => void },
 *   persistence: { flush: (projectId: string) => Promise<unknown>, save: (segments: any[]) => Promise<unknown>, load: (projectId: string) => Promise<any[]> },
 *   mutation: { capturePatch: (segment: any) => any, applyPatch: (segment: any, patch: any) => void, clearPending: (segment: any) => void, recordHistory: (segment: any) => void, touch: (segment: any) => unknown, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown, prepareHistories: (segments: any[]) => any[] },
 *   restoration: { restorePatches: (patches: any[], context?: object) => Promise<unknown> | unknown },
 *   selection: { getActiveSegmentId: () => string },
 *   presentation: { invalidateFilters: () => void, renderAll: () => void, renderSegments: () => void, renderProjectProgress: () => void, renderHistory: () => void, renderAiProgress: () => void, renderCommandCentre: () => void, refreshSidebar: () => Promise<unknown> },
 *   activity: { log: (details: object) => Promise<unknown> | unknown },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   testHooks?: { beforeSave?: (segments: any[]) => void },
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createAiPretranslationController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const settingsBoundary = options?.settings;
  const providers = options?.providers;
  const consent = options?.consent;
  const scope = options?.scope;
  const domain = options?.domain;
  const context = options?.context;
  const lifecycle = options?.lifecycle;
  const commands = options?.commands;
  const persistence = options?.persistence;
  const mutation = options?.mutation;
  const restoration = options?.restoration;
  const selection = options?.selection;
  const presentation = options?.presentation;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const status = options?.status;

  validateAiPretranslationControllerOptions(options, {
    editorSessionStore,
    settings: settingsBoundary,
    providers,
    consent,
    scope,
    domain,
    context,
    lifecycle,
    commands,
    persistence,
    mutation,
    restoration,
    selection,
    presentation,
    activity,
    workspace,
    status
  });
  const createAbortController =
    typeof lifecycle.createAbortController === "function"
      ? lifecycle.createAbortController
      : () => new AbortController();
  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};
  const logger = options.logger || console;
  let running = false;
  let abortController = null;
  let progress = {};

  function syncLifecycle() {
    lifecycle.sync({ running, abortController, progress });
  }

  function setProgress(nextProgress) {
    progress = nextProgress;
    syncLifecycle();
  }

  function restoreSnapshots(beforeSnapshots) {
    beforeSnapshots.forEach((snapshot, segmentId) => {
      const segment = editorSessionStore.getSegments().find((item) => item.id === segmentId);
      if (!segment) return;
      mutation.restore(segment, snapshot);
      mutation.prepareHistory(segment);
    });
  }

  async function pretranslate() {
    const project = editorSessionStore.getProject();
    if (!project || running || lifecycle.isBusy()) return undefined;

    const configuredSettings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(configuredSettings);
      settingsBoundary.assertReady(configuredSettings, config, "pre-translating");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return undefined;
    }

    const provider = providers.get(configuredSettings);
    if (!provider) {
      status.set("Pre-translation is not available for this provider.", "dirty");
      return undefined;
    }

    if (providers.sharesExternally(configuredSettings)) {
      const projectSettings = settingsBoundary.projectDefaults(project);
      const contextLabels = [
        "configured provider URL",
        "batch segment text",
        configuredSettings.includeNearbyContext !== false ? "nearby segment context" : "",
        projectSettings.useTmContext !== false ? "TM matches" : "",
        projectSettings.useTermbaseContext !== false ? "termbase hints" : ""
      ].filter(Boolean);
      const accepted = consent.externalShare({
        provider: provider.name || configuredSettings.providerId,
        includesSourceText: true,
        contextLabels
      });
      if (!accepted) {
        status.set("AI pre-translation canceled", "dirty");
        return undefined;
      }
    }

    if (configuredSettings.overwriteExisting && !consent.overwrite()) {
      status.set("Local AI pre-translation canceled", "saved");
      return undefined;
    }

    try {
      await persistence.flush(project.id);
    } catch (error) {
      status.set(error.message || "Save pending changes before local AI pre-translation failed", "dirty");
      return undefined;
    }

    const scopedSegments = scope.getSegments(configuredSettings);
    const pretranslationOptions = scope.getOptions(configuredSettings);
    const candidateSelection = domain.selectSegments(scopedSegments, {
      ...pretranslationOptions,
      settings: configuredSettings,
      project
    });
    setProgress({
      total: candidateSelection.candidates.length,
      completed: 0,
      failed: 0,
      skipped: candidateSelection.skipped.length
    });
    if (!candidateSelection.candidates.length) {
      presentation.renderAiProgress();
      status.set(
        candidateSelection.skipped.length
          ? "No eligible segments for local AI pre-translation."
          : "No segments to pre-translate.",
        "saved"
      );
      return undefined;
    }

    const beforePatches = new Map(
      candidateSelection.candidates.map((segment) => [segment.id, mutation.capturePatch(segment)])
    );
    const beforeSnapshots = new Map(
      candidateSelection.candidates.map((segment) => [segment.id, structuredClone(segment)])
    );
    const activeSegmentId = selection.getActiveSegmentId() || candidateSelection.candidates[0].id;
    running = true;
    abortController = createAbortController();
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set(
      `Local AI pre-translating ${candidateSelection.candidates.length} segment${candidateSelection.candidates.length === 1 ? "" : "s"}...`
    );

    try {
      const summary = await domain.pretranslateSegments({
        segments: scopedSegments,
        provider,
        project,
        settings: configuredSettings,
        config,
        mode: configuredSettings.mode,
        sourceLanguage: configuredSettings.sourceLanguage,
        sourceCode: configuredSettings.sourceCode,
        targetLanguage: configuredSettings.targetLanguage,
        targetCode: configuredSettings.targetCode,
        glossaryTermsForSegment: context.glossaryTermsForSegment,
        tmMatchesForSegment: context.tmMatchesForSegment,
        surroundingSegmentsForSegment:
          configuredSettings.includeNearbyContext !== false
            ? (segment) =>
                context.surroundingSegmentsForSegment(segment, {
                  settings: configuredSettings,
                  segments: scopedSegments
                })
            : null,
        selectedSegmentIds: pretranslationOptions.selectedSegmentIds,
        visibleSegmentIds: pretranslationOptions.visibleSegmentIds,
        signal: abortController.signal,
        onProgress(nextProgress) {
          setProgress(nextProgress);
          presentation.renderAiProgress();
        }
      });
      const updated = summary.updatedSegmentIds
        .map((id) => editorSessionStore.getSegments().find((segment) => segment.id === id))
        .filter(Boolean);

      if (summary.canceled) {
        beforePatches.forEach((patch, segmentId) => {
          const segment = editorSessionStore.getSegments().find((item) => item.id === segmentId);
          if (segment) mutation.applyPatch(segment, patch);
        });
        presentation.invalidateFilters();
        presentation.renderAll();
        status.set("Local AI pre-translation canceled; no target changes were applied", "saved");
        return null;
      }

      updated.forEach((segment) => {
        mutation.clearPending(segment);
        mutation.recordHistory(segment);
        mutation.touch(segment);
      });
      if (!updated.length) {
        const failureText = summary.failed ? `; ${summary.failed} failed` : "";
        const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
        status.set(
          `Local AI pre-translation: no segments updated${failureText}${skippedText}`,
          summary.failed ? "dirty" : "saved"
        );
        return null;
      }

      const command = commands.create({
        projectId: project.id,
        segmentIds: updated.map((segment) => segment.id),
        beforePatches: updated.map((segment) => beforePatches.get(segment.id)),
        provenance: {
          origin: "ai",
          producer: "pretranslation",
          provider: provider.name || configuredSettings.providerId,
          providerId: configuredSettings.providerId,
          model: configuredSettings.model,
          failedCount: summary.failed,
          skippedCount: summary.skipped
        },
        restorePatches: (patches, restoreContext) =>
          restoration.restorePatches(patches, { ...restoreContext, activeSegmentId }),
        applyFirst: async () => {
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
        await activity.log({
          provider: provider.name || configuredSettings.providerId,
          model: configuredSettings.model,
          updatedCount: updated.length,
          failedCount: summary.failed,
          skippedCount: summary.skipped,
          canceled: summary.canceled
        });
      } catch (activityError) {
        logger.warn?.("Local AI pretranslation activity log failed.", activityError);
      }
      try {
        editorSessionStore.replaceSegments(mutation.prepareHistories(await persistence.load(project.id)));
        presentation.renderAll();
        await presentation.refreshSidebar();
      } catch (refreshError) {
        logger.warn?.("Local AI pretranslation refresh failed.", refreshError);
        presentation.renderAll();
      }
      workspace.markDirty();
      const failureText = summary.failed ? `; ${summary.failed} failed` : "";
      const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
      status.set(
        `Local AI pre-translation: ${updated.length} segment${updated.length === 1 ? "" : "s"} updated${failureText}${skippedText}; Undo is available`,
        summary.failed ? "dirty" : "saved"
      );
      return { ...commandExecution, summary };
    } catch (error) {
      restoreSnapshots(beforeSnapshots);
      presentation.invalidateFilters();
      presentation.renderSegments();
      presentation.renderProjectProgress();
      presentation.renderHistory();
      status.set(error.message || "Local AI pre-translation failed", "dirty");
      return null;
    } finally {
      running = false;
      abortController = null;
      syncLifecycle();
      presentation.renderCommandCentre();
    }
  }

  function cancel() {
    if (!running || !abortController) return false;
    abortController.abort();
    setProgress({ ...(progress || {}), canceled: true });
    presentation.renderAiProgress();
    status.set("Canceling local AI batch...", "dirty");
    return true;
  }

  return Object.freeze({ cancel, pretranslate });
}
