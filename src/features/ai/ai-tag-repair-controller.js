import { validateAiTagRepairControllerOptions } from "./ai-command-controller-contracts.js";

/**
 * Owns active and batch AI protected-tag repair validation, consent, scoped
 * eligibility, protected-token routing, suggestion construction, lifecycle,
 * persistence, secondary effects, presentation, and recovery. Provider
 * adapters, domain records, prompt construction, and suggestion storage stay
 * injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[], replaceSegments: (segments: any[]) => void },
 *   selection: { getActiveSegment: () => any },
 *   scope: { getVisibleSegments: () => any[], getDocumentSegments: () => any[], isLocked: (segment: any) => boolean, getTags: (segment: any) => any[], getMissingTags: (segment: any) => any[], tagText: (tag: any) => string },
 *   settings: { persist: () => Promise<any>, runtimeConfig: (settings: any) => any, assertReady: (settings: any, config: any, action: string) => void },
 *   providers: { get: (settings: any) => any, sharesExternally: (settings: any) => boolean },
 *   consent: { externalShare: (details: object) => boolean },
 *   domain: { repairSegmentTags: (options: object) => Promise<any> },
 *   lifecycle: { isRunning: () => boolean, isPromptBusy: () => boolean, sync: (state: { running: boolean, promptBusy: boolean, abortController: AbortController | null, progress?: any }) => void, createAbortController?: () => AbortController },
 *   suggestions: { append: (segment: any, suggestion: object) => Promise<any>, normalize: (suggestion: object) => any, nextId: () => string },
 *   persistence: { flush: (projectId: string) => Promise<unknown>, saveMany: (segments: any[]) => Promise<unknown>, load: (projectId: string) => Promise<any[]> },
 *   mutation: { touch: (segment: any) => unknown, clearPending: (segment: any) => void, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown, prepareHistories: (segments: any[]) => any[] },
 *   presentation: { renderCommandCentre: () => void, renderAiProgress: () => void, renderOutput: (text: string, options?: object) => void, renderAll: () => void, refreshSidebar: () => Promise<unknown> },
 *   activity: { logBatch: (details: object) => Promise<unknown> | unknown },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   redact: (value: any) => string,
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createAiTagRepairController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const selection = options?.selection;
  const scope = options?.scope;
  const settingsBoundary = options?.settings;
  const providers = options?.providers;
  const consent = options?.consent;
  const domain = options?.domain;
  const lifecycle = options?.lifecycle;
  const suggestions = options?.suggestions;
  const persistence = options?.persistence;
  const mutation = options?.mutation;
  const presentation = options?.presentation;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const status = options?.status;

  validateAiTagRepairControllerOptions(options, {
    editorSessionStore,
    selection,
    scope,
    settings: settingsBoundary,
    providers,
    consent,
    domain,
    lifecycle,
    suggestions,
    persistence,
    mutation,
    presentation,
    activity,
    workspace,
    status,
    redact: options?.redact
  });
  const createAbortController =
    typeof lifecycle.createAbortController === "function"
      ? lifecycle.createAbortController
      : () => new AbortController();
  const redact = options.redact;
  const logger = options.logger || console;
  let running = false;
  let promptBusy = false;
  let abortController = null;
  let progress;

  function syncLifecycle() {
    lifecycle.sync({ running, promptBusy, abortController, progress });
  }

  function setProgress(nextProgress) {
    progress = nextProgress;
    syncLifecycle();
  }

  function providerRequest({ provider, project, segment, settings, config, signal = null }) {
    const tags = scope.getTags(segment);
    return {
      provider,
      project,
      segment: { ...segment, tags },
      settings,
      config,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      protectedTokens: tags.map((tag) => tag.text || tag.label || "").filter(Boolean),
      ...(signal ? { signal } : {})
    };
  }

  function activeSuggestion(segment, result, provider, settings) {
    return {
      id: suggestions.nextId(),
      provider: result.provider || provider.name || "AI",
      model: result.model || settings.model,
      segmentId: segment.id,
      suggestedTarget: result.suggestedTarget,
      confidence: result.warnings?.length ? 60 : 80,
      explanation: [
        "AI tag repair suggestion. Review before applying.",
        ...(result.protectedTokens?.length
          ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`]
          : []),
        ...(result.warnings || [])
      ],
      status: "review"
    };
  }

  async function repairActive() {
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const segment = selection.getActiveSegment();
    if (!segment) {
      status.set("Select a segment before requesting AI tag repair.", "dirty");
      return false;
    }
    if (!String(segment.source || "").trim()) {
      status.set("The active segment has no source text.", "dirty");
      return false;
    }
    if (!String(segment.target || "").trim()) {
      status.set("The active segment has no target text to repair.", "dirty");
      return false;
    }
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "suggesting a tag repair");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("AI tag repair is not available for this provider.", "dirty");
      return false;
    }
    if (
      providers.sharesExternally(settings) &&
      !consent.externalShare({
        provider: provider.name || settings.providerId,
        includesSourceText: true,
        contextLabels: ["target text", "protected tags and placeholders", "configured provider URL"]
      })
    ) {
      status.set("AI tag repair canceled", "dirty");
      return false;
    }

    promptBusy = true;
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set("Requesting AI tag repair suggestion...");
    try {
      const result = await domain.repairSegmentTags(providerRequest({ provider, project, segment, settings, config }));
      if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
        presentation.renderOutput("AI did not propose a different tag repair.", { muted: false });
        status.set("AI did not propose a different tag repair.", "saved");
        return true;
      }
      const saved = await suggestions.append(segment, activeSuggestion(segment, result, provider, settings));
      presentation.renderOutput(result.suggestedTarget);
      if (saved?.ok) {
        status.set(
          saved.activityLogged
            ? "AI tag repair suggestion ready for review"
            : "AI tag repair suggestion ready; activity log failed",
          saved.activityLogged ? "saved" : "dirty"
        );
        return true;
      }
      status.set("AI tag repair suggestion could not be saved.", "dirty");
      return false;
    } catch (error) {
      const message = error.message || "AI tag repair failed.";
      presentation.renderOutput(message, { muted: false });
      status.set(message, "dirty");
      return false;
    } finally {
      promptBusy = false;
      syncLifecycle();
      presentation.renderCommandCentre();
    }
  }

  function scopeSegments(settings = {}) {
    const mode = settings.mode || "untranslated";
    if (mode === "selected") return selection.getActiveSegment() ? [selection.getActiveSegment()] : [];
    if (mode === "visible") return scope.getVisibleSegments();
    if (mode === "project") return editorSessionStore.getSegments();
    return scope.getDocumentSegments();
  }

  function skipReason(segment = {}) {
    if (!String(segment.source || "").trim()) return "empty-source";
    if (!String(segment.target || "").trim()) return "empty-target";
    if (scope.isLocked(segment)) return "locked";
    if (segment.status === "confirmed") return "confirmed";
    if (!scope.getTags(segment).length) return "no-protected-tags";
    if (!scope.getMissingTags(segment).length) return "no-tag-mismatch";
    return "";
  }

  function selectSegments(settings = {}) {
    const skipped = [];
    const candidates = [];
    scopeSegments(settings).forEach((segment) => {
      const reason = skipReason(segment);
      if (reason) skipped.push({ segmentId: segment.id || "", reason });
      else candidates.push(segment);
    });
    return { candidates, skipped, mode: settings.mode || "untranslated" };
  }

  function batchSuggestion(segment, result, provider, settings, missingTokens) {
    return suggestions.normalize({
      id: suggestions.nextId(),
      provider: result.provider || provider.name || "AI",
      model: result.model || settings.model,
      segmentId: segment.id,
      suggestedTarget: result.suggestedTarget,
      confidence: result.warnings?.length ? 60 : 80,
      explanation: [
        "Batch AI tag repair suggestion. Review before applying.",
        ...(missingTokens.length ? [`Missing tokens detected: ${missingTokens.join(", ")}`] : []),
        ...(result.protectedTokens?.length
          ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`]
          : []),
        ...(result.warnings || [])
      ],
      status: "review"
    });
  }

  async function repairBatch() {
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "repairing tag batches");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("Batch AI tag repair is not available for this provider.", "dirty");
      return false;
    }
    const candidateSelection = selectSegments(settings);
    if (!candidateSelection.candidates.length) {
      status.set(
        candidateSelection.skipped.length
          ? "No protected tag mismatches are eligible for batch AI repair."
          : "No translated segments to repair with local AI.",
        "saved"
      );
      return {
        total: 0,
        completed: 0,
        suggested: 0,
        unchanged: 0,
        failed: 0,
        skipped: candidateSelection.skipped.length,
        failures: [],
        skippedSegments: candidateSelection.skipped,
        updatedSegmentIds: [],
        canceled: false
      };
    }
    if (
      providers.sharesExternally(settings) &&
      !consent.externalShare({
        provider: provider.name || settings.providerId,
        includesSourceText: true,
        contextLabels: [
          `${candidateSelection.candidates.length} source/target segments with protected tag mismatches`,
          "protected tags and placeholders",
          "configured provider URL"
        ]
      })
    ) {
      status.set("Batch AI tag repair canceled", "dirty");
      return false;
    }
    try {
      await persistence.flush(project.id);
    } catch (error) {
      status.set(error.message || "Save pending changes before batch AI tag repair failed", "dirty");
      return false;
    }

    const snapshots = new Map(candidateSelection.candidates.map((segment) => [segment.id, structuredClone(segment)]));
    const summary = {
      total: candidateSelection.candidates.length,
      completed: 0,
      suggested: 0,
      unchanged: 0,
      failed: 0,
      skipped: candidateSelection.skipped.length,
      failures: [],
      skippedSegments: candidateSelection.skipped,
      updatedSegmentIds: [],
      canceled: false
    };
    const updated = [];
    running = true;
    promptBusy = true;
    abortController = createAbortController();
    progress = {
      total: summary.total,
      completed: 0,
      failed: 0,
      skipped: summary.skipped,
      canceled: false
    };
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set(`Repairing protected tags in ${summary.total} segment${summary.total === 1 ? "" : "s"} with AI...`);
    try {
      for (const segment of candidateSelection.candidates) {
        if (abortController.signal.aborted) {
          summary.canceled = true;
          break;
        }
        try {
          const missingTokens = scope.getMissingTags(segment).map(scope.tagText).filter(Boolean);
          const result = await domain.repairSegmentTags(
            providerRequest({
              provider,
              project,
              segment,
              settings,
              config,
              signal: abortController.signal
            })
          );
          if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
            summary.unchanged += 1;
          } else {
            const suggestion = batchSuggestion(segment, result, provider, settings, missingTokens);
            segment.aiSuggestions = [...(segment.aiSuggestions || []), suggestion];
            mutation.touch(segment);
            mutation.clearPending(segment);
            updated.push(segment);
            summary.suggested += 1;
            summary.updatedSegmentIds.push(segment.id || "");
          }
          summary.completed += 1;
        } catch (error) {
          if (abortController.signal.aborted || String(error?.message || "").includes("canceled")) {
            summary.canceled = true;
            break;
          }
          summary.failed += 1;
          summary.failures.push({
            segmentId: segment.id || "",
            message: redact(error?.message || "AI tag repair failed for this segment.")
          });
        } finally {
          setProgress({ ...summary });
          presentation.renderAiProgress();
        }
      }
      if (updated.length) await persistence.saveMany(updated);
      let activityLogged = true;
      try {
        await activity.logBatch({
          provider: provider.name || settings.providerId,
          model: settings.model,
          mode: settings.mode,
          repairedCount: summary.completed,
          suggestionCount: summary.suggested,
          unchangedCount: summary.unchanged,
          failedCount: summary.failed,
          skippedCount: summary.skipped,
          canceled: summary.canceled
        });
      } catch (activityError) {
        activityLogged = false;
        logger.warn?.("Batch AI tag repair activity log failed.", activityError);
        if (updated.length) workspace.markDirty();
      }
      if (updated.length) {
        editorSessionStore.replaceSegments(mutation.prepareHistories(await persistence.load(project.id)));
        presentation.renderAll();
        await presentation.refreshSidebar();
        workspace.markDirty();
      } else {
        presentation.renderAiProgress();
      }
      const failureText = summary.failed ? `; ${summary.failed} failed` : "";
      const skippedText = summary.skipped ? `; ${summary.skipped} skipped` : "";
      const unchangedText = summary.unchanged ? `; ${summary.unchanged} unchanged` : "";
      const canceledText = summary.canceled ? " canceled" : "";
      const failureLines = summary.failures
        .slice(0, 4)
        .map((failure) => `Segment ${failure.segmentId}: ${failure.message}`);
      presentation.renderOutput(
        [
          `${summary.suggested} tag repair suggestion${summary.suggested === 1 ? "" : "s"} saved.`,
          `${summary.unchanged} segment${summary.unchanged === 1 ? "" : "s"} unchanged.`,
          failureLines.join("\n")
        ]
          .filter(Boolean)
          .join("\n")
      );
      status.set(
        `Batch AI tag repair${canceledText}: ${summary.suggested} suggestion${summary.suggested === 1 ? "" : "s"} saved${unchangedText}${failureText}${skippedText}${activityLogged ? "" : "; activity log failed"}`,
        summary.failed || !activityLogged || summary.canceled ? "dirty" : "saved"
      );
      return summary;
    } catch (error) {
      snapshots.forEach((snapshot, id) => {
        const segment = editorSessionStore.getSegments().find((item) => item.id === id);
        if (!segment) return;
        mutation.restore(segment, snapshot);
        mutation.prepareHistory(segment);
      });
      presentation.renderAll();
      const message = error.message || "Batch AI tag repair failed.";
      presentation.renderOutput(message, { muted: false });
      status.set(message, "dirty");
      return false;
    } finally {
      running = false;
      promptBusy = false;
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

  return Object.freeze({ cancel, repairActive, repairBatch });
}
