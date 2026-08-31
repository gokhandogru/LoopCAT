import { validateAiAlternativesControllerOptions } from "./ai-command-controller-contracts.js";

/**
 * Owns active and batch AI target-alternatives validation, consent, scoped
 * eligibility, glossary/protected-token routing, variant filtering,
 * suggestion construction, lifecycle, persistence, secondary effects,
 * presentation, and recovery. Provider adapters, domain records, prompt
 * construction, and general suggestion storage stay injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[], replaceSegments: (segments: any[]) => void },
 *   selection: { getActiveSegment: () => any, getActiveIndex: () => number },
 *   scope: { getVisibleSegments: () => any[], getDocumentSegments: () => any[], isLocked: (segment: any) => boolean, getTags: (segment: any) => any[] },
 *   settings: { persist: () => Promise<any>, runtimeConfig: (settings: any) => any, assertReady: (settings: any, config: any, action: string) => void },
 *   providers: { get: (settings: any) => any, sharesExternally: (settings: any) => boolean },
 *   consent: { externalShare: (details: object) => boolean },
 *   context: { activeTerms: (project: any, segment: any) => Promise<any[]>, batchTerms: (segment: any) => Promise<any[]> },
 *   domain: { suggestSegmentVariants: (options: object) => Promise<any> },
 *   lifecycle: { isRunning: () => boolean, isPromptBusy: () => boolean, sync: (state: { running: boolean, promptBusy: boolean, abortController: AbortController | null, progress?: any }) => void, createAbortController?: () => AbortController },
 *   suggestions: { normalize: (suggestion: object) => any, nextId: () => string },
 *   persistence: { flush: (projectId: string) => Promise<unknown>, saveOne: (segment: any) => Promise<unknown>, saveMany: (segments: any[]) => Promise<unknown>, load: (projectId: string) => Promise<any[]> },
 *   mutation: { touch: (segment: any) => unknown, clearPending: (segment: any) => void, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown, prepareHistories: (segments: any[]) => any[] },
 *   presentation: { renderCommandCentre: () => void, renderAiProgress: () => void, renderOutput: (text: string, options?: object) => void, renderSuggestions: () => void, updateRow: (index: number) => void, renderAll: () => void, refreshSidebar: () => Promise<unknown> },
 *   activity: { logActive: (details: object) => Promise<unknown> | unknown, logBatch: (details: object) => Promise<unknown> | unknown },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   redact: (value: any) => string,
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createAiAlternativesController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const selection = options?.selection;
  const scope = options?.scope;
  const settingsBoundary = options?.settings;
  const providers = options?.providers;
  const consent = options?.consent;
  const context = options?.context;
  const domain = options?.domain;
  const lifecycle = options?.lifecycle;
  const suggestions = options?.suggestions;
  const persistence = options?.persistence;
  const mutation = options?.mutation;
  const presentation = options?.presentation;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const status = options?.status;

  validateAiAlternativesControllerOptions(options, {
    editorSessionStore,
    selection,
    scope,
    settings: settingsBoundary,
    providers,
    consent,
    context,
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

  function providerRequest({ provider, project, segment, settings, config, glossaryTerms, signal = null }) {
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
      glossaryTerms,
      variantMode: settings.variantMode,
      ...(signal ? { signal } : {})
    };
  }

  function distinctVariants(result, segment) {
    const currentTarget = String(segment.target || "").trim();
    return (result.variants || []).filter((variant) => {
      const suggestedTarget = String(variant.suggestedTarget || "").trim();
      return suggestedTarget && (!currentTarget || suggestedTarget !== currentTarget);
    });
  }

  function suggestionRecord({ segment, result, provider, settings, variant, prefix, glossaryTerms = [] }) {
    return {
      id: suggestions.nextId(),
      provider: result.provider || provider.name || "AI",
      model: result.model || settings.model,
      segmentId: segment.id,
      suggestedTarget: variant.suggestedTarget,
      confidence: variant.warnings?.length ? 65 : 75,
      explanation: [
        `${prefix}AI ${variant.label || "alternative"} suggestion. Review before applying.`,
        ...(prefix ? [`Alternative style: ${settings.variantMode || "standard"}.`] : []),
        ...(glossaryTerms.length ? [`Termbase hints considered: ${Math.min(glossaryTerms.length, 12)}`] : []),
        ...(result.protectedTokens?.length
          ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`]
          : []),
        ...(variant.warnings || [])
      ],
      status: "review"
    };
  }

  async function suggestActive() {
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const segment = selection.getActiveSegment();
    if (!segment) {
      status.set("Select a segment before requesting AI alternatives.", "dirty");
      return false;
    }
    if (!String(segment.source || "").trim()) {
      status.set("The active segment has no source text.", "dirty");
      return false;
    }
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "suggesting translation alternatives");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("AI alternatives are not available for this provider.", "dirty");
      return false;
    }
    if (
      providers.sharesExternally(settings) &&
      !consent.externalShare({
        provider: provider.name || settings.providerId,
        includesSourceText: true,
        contextLabels: ["current target draft", "configured provider URL", "project glossary hints"]
      })
    ) {
      status.set("AI alternatives canceled", "dirty");
      return false;
    }

    const snapshot = structuredClone(segment);
    promptBusy = true;
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set("Requesting AI translation alternatives...");
    try {
      const glossaryTerms = await context.activeTerms(project, segment);
      const result = await domain.suggestSegmentVariants(
        providerRequest({ provider, project, segment, settings, config, glossaryTerms })
      );
      const variants = distinctVariants(result, segment);
      if (!variants.length) {
        presentation.renderOutput("AI did not propose alternatives different from the current target.", {
          muted: false
        });
        status.set("AI did not propose different alternatives.", "saved");
        return true;
      }
      const savedSuggestions = variants.map((variant) =>
        suggestions.normalize(suggestionRecord({ segment, result, provider, settings, variant, prefix: "" }))
      );
      segment.aiSuggestions = [...(segment.aiSuggestions || []), ...savedSuggestions];
      mutation.touch(segment);
      mutation.clearPending(segment);
      await persistence.saveOne(segment);
      let activityLogged = true;
      try {
        await activity.logActive({
          segmentId: segment.id,
          provider: result.provider || provider.name || settings.providerId,
          model: result.model || settings.model,
          suggestionCount: savedSuggestions.length,
          variantMode: settings.variantMode
        });
      } catch (activityError) {
        activityLogged = false;
        logger.warn?.("AI alternatives activity log failed.", activityError);
        workspace.markDirty();
      }
      presentation.renderOutput(
        variants.map((variant) => `${variant.label || "Alternative"}: ${variant.suggestedTarget}`).join("\n")
      );
      presentation.renderSuggestions();
      presentation.updateRow(selection.getActiveIndex());
      workspace.markDirty();
      status.set(
        activityLogged ? "AI alternatives ready for review" : "AI alternatives ready; activity log failed",
        activityLogged ? "saved" : "dirty"
      );
      return true;
    } catch (error) {
      mutation.restore(segment, snapshot);
      mutation.prepareHistory(segment);
      presentation.renderSuggestions();
      presentation.updateRow(selection.getActiveIndex());
      const message = error.message || "AI alternatives failed.";
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
    if (mode === "untranslated") {
      return scope.getDocumentSegments().filter((segment) => !String(segment.target || "").trim());
    }
    return scope.getDocumentSegments();
  }

  function skipReason(segment = {}) {
    if (!String(segment.source || "").trim()) return "empty-source";
    if (!String(segment.target || "").trim()) return "empty-target";
    if (scope.isLocked(segment)) return "locked";
    if (segment.status === "confirmed") return "confirmed";
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

  async function suggestBatch() {
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "suggesting batch translation alternatives");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("Batch AI alternatives are not available for this provider.", "dirty");
      return false;
    }
    const candidateSelection = selectSegments(settings);
    if (!candidateSelection.candidates.length) {
      status.set(
        candidateSelection.skipped.length
          ? "No eligible translated draft segments for batch AI alternatives."
          : "No draft segments to suggest alternatives for with local AI.",
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
          `${candidateSelection.candidates.length} source/target draft segments`,
          "alternative style",
          "project glossary hints",
          "protected tags and placeholders",
          "configured provider URL"
        ]
      })
    ) {
      status.set("Batch AI alternatives canceled", "dirty");
      return false;
    }
    try {
      await persistence.flush(project.id);
    } catch (error) {
      status.set(error.message || "Save pending changes before batch AI alternatives failed", "dirty");
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
    status.set(
      `Suggesting alternatives for ${summary.total} draft segment${summary.total === 1 ? "" : "s"} with AI...`
    );
    try {
      for (const segment of candidateSelection.candidates) {
        if (abortController.signal.aborted) {
          summary.canceled = true;
          break;
        }
        try {
          const glossaryTerms = await context.batchTerms(segment);
          const result = await domain.suggestSegmentVariants(
            providerRequest({
              provider,
              project,
              segment,
              settings,
              config,
              glossaryTerms,
              signal: abortController.signal
            })
          );
          const variants = distinctVariants(result, segment);
          if (!variants.length) {
            summary.unchanged += 1;
          } else {
            const savedSuggestions = variants.map((variant) =>
              suggestions.normalize(
                suggestionRecord({
                  segment,
                  result,
                  provider,
                  settings,
                  variant,
                  prefix: "Batch ",
                  glossaryTerms
                })
              )
            );
            segment.aiSuggestions = [...(segment.aiSuggestions || []), ...savedSuggestions];
            mutation.touch(segment);
            mutation.clearPending(segment);
            updated.push(segment);
            summary.suggested += savedSuggestions.length;
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
            message: redact(error?.message || "AI alternatives failed for this segment.")
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
          variantMode: settings.variantMode,
          processedCount: summary.completed,
          suggestionCount: summary.suggested,
          unchangedCount: summary.unchanged,
          failedCount: summary.failed,
          skippedCount: summary.skipped,
          canceled: summary.canceled
        });
      } catch (activityError) {
        activityLogged = false;
        logger.warn?.("Batch AI alternatives activity log failed.", activityError);
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
          `${summary.suggested} alternative suggestion${summary.suggested === 1 ? "" : "s"} saved.`,
          `${summary.unchanged} segment${summary.unchanged === 1 ? "" : "s"} unchanged.`,
          failureLines.join("\n")
        ]
          .filter(Boolean)
          .join("\n")
      );
      status.set(
        `Batch AI alternatives${canceledText}: ${summary.suggested} suggestion${summary.suggested === 1 ? "" : "s"} saved${unchangedText}${failureText}${skippedText}${activityLogged ? "" : "; activity log failed"}`,
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
      const message = error.message || "Batch AI alternatives failed.";
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
    status.set("Canceling local AI batch...", "dirty");
    return true;
  }

  return Object.freeze({ suggestActive, suggestBatch, cancel });
}
