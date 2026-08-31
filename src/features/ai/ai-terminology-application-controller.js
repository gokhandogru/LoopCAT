import { validateAiTerminologyApplicationControllerOptions } from "./ai-command-controller-contracts.js";

/**
 * Owns active and batch AI terminology-application validation, consent,
 * translated-draft eligibility, glossary/protected-token routing, suggestion
 * construction, lifecycle, persistence, secondary effects, presentation, and
 * recovery. Provider adapters, domain records, prompt construction, and
 * general suggestion storage stay injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[], replaceSegments: (segments: any[]) => void },
 *   selection: { getActiveSegment: () => any, getActiveIndex: () => number },
 *   scope: { getVisibleSegments: () => any[], getDocumentSegments: () => any[], isLocked: (segment: any) => boolean, getTags: (segment: any) => any[] },
 *   settings: { persist: () => Promise<any>, runtimeConfig: (settings: any) => any, assertReady: (settings: any, config: any, action: string) => void },
 *   providers: { get: (settings: any) => any, sharesExternally: (settings: any) => boolean },
 *   consent: { externalShare: (details: object) => boolean },
 *   context: { termsForSegment: (segment: any) => Promise<any[]> },
 *   domain: { applyTerminology: (options: object) => Promise<any> },
 *   lifecycle: { isRunning: () => boolean, isPromptBusy: () => boolean, sync: (state: { running: boolean, promptBusy: boolean, abortController: AbortController | null, progress?: any }) => void, createAbortController?: () => AbortController },
 *   suggestions: { append: (segment: any, suggestion: object) => Promise<any>, normalize: (suggestion: object) => any, nextId: () => string },
 *   persistence: { flush: (projectId: string) => Promise<unknown>, saveMany: (segments: any[]) => Promise<unknown>, load: (projectId: string) => Promise<any[]> },
 *   mutation: { touch: (segment: any) => unknown, clearPending: (segment: any) => void, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown, prepareHistories: (segments: any[]) => any[] },
 *   presentation: { renderCommandCentre: () => void, renderAiProgress: () => void, renderOutput: (text: string, options?: object) => void, renderSuggestions: () => void, updateRow: (index: number) => void, renderAll: () => void, refreshSidebar: () => Promise<unknown> },
 *   activity: { logBatch: (details: object) => Promise<unknown> | unknown },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   redact: (value: any) => string,
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createAiTerminologyApplicationController(options) {
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

  validateAiTerminologyApplicationControllerOptions(options, {
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
      ...(signal ? { signal } : {})
    };
  }

  function suggestionRecord({ segment, result, provider, settings, glossaryTerms, batch = false }) {
    return {
      id: suggestions.nextId(),
      provider: result.provider || provider.name || "AI",
      model: result.model || settings.model,
      segmentId: segment.id,
      suggestedTarget: result.suggestedTarget,
      confidence: result.warnings?.length ? 65 : 82,
      explanation: [
        `${batch ? "Batch " : ""}AI terminology application suggestion. Review before applying.`,
        ...(glossaryTerms.length
          ? [`Termbase hits considered: ${Math.min(glossaryTerms.length, batch ? 12 : 16)}`]
          : []),
        ...(result.protectedTokens?.length
          ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`]
          : []),
        ...(result.warnings || [])
      ],
      status: "review"
    };
  }

  async function applyActive() {
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const segment = selection.getActiveSegment();
    if (!segment) {
      status.set("Select a segment before applying AI terminology.", "dirty");
      return false;
    }
    if (!String(segment.source || "").trim()) {
      status.set("The active segment has no source text.", "dirty");
      return false;
    }
    if (!String(segment.target || "").trim()) {
      status.set("The active segment has no target draft to revise.", "dirty");
      return false;
    }
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "applying terminology");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("AI terminology application is not available for this provider.", "dirty");
      return false;
    }
    let glossaryTerms = [];
    try {
      glossaryTerms = await context.termsForSegment(segment);
    } catch {
      glossaryTerms = [];
    }
    if (!glossaryTerms.length) {
      status.set("No matching project terminology found for the active segment.", "saved");
      presentation.renderOutput("No matching project terminology found for the active segment.", {
        muted: false
      });
      return true;
    }
    if (
      providers.sharesExternally(settings) &&
      !consent.externalShare({
        provider: provider.name || settings.providerId,
        includesSourceText: true,
        contextLabels: ["current target draft", "matching project terminology", "configured provider URL"]
      })
    ) {
      status.set("AI terminology application canceled", "dirty");
      return false;
    }

    const snapshot = structuredClone(segment);
    promptBusy = true;
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set("Applying project terminology with AI...");
    try {
      const result = await domain.applyTerminology(
        providerRequest({ provider, project, segment, settings, config, glossaryTerms })
      );
      if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
        presentation.renderOutput("AI did not propose a different terminology revision.", {
          muted: false
        });
        status.set("AI did not propose a different terminology revision.", "saved");
        return true;
      }
      const saved = await suggestions.append(
        segment,
        suggestionRecord({ segment, result, provider, settings, glossaryTerms })
      );
      presentation.renderOutput(result.suggestedTarget);
      if (saved?.ok) {
        status.set(
          saved.activityLogged
            ? "AI terminology suggestion ready for review"
            : "AI terminology suggestion ready; activity log failed",
          saved.activityLogged ? "saved" : "dirty"
        );
        return true;
      }
      status.set("AI terminology suggestion could not be saved.", "dirty");
      return false;
    } catch (error) {
      mutation.restore(segment, snapshot);
      mutation.prepareHistory(segment);
      presentation.renderSuggestions();
      presentation.updateRow(selection.getActiveIndex());
      const message = error.message || "AI terminology application failed.";
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

  async function applyBatch() {
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "applying terminology in batches");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("Batch AI terminology application is not available for this provider.", "dirty");
      return false;
    }
    const candidateSelection = selectSegments(settings);
    if (!candidateSelection.candidates.length) {
      status.set(
        candidateSelection.skipped.length
          ? "No eligible translated draft segments for batch AI terminology application."
          : "No draft segments to revise with local AI.",
        "saved"
      );
      return {
        total: 0,
        completed: 0,
        suggested: 0,
        unchanged: 0,
        noTerms: 0,
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
          "matching project terminology",
          "protected tags and placeholders",
          "configured provider URL"
        ]
      })
    ) {
      status.set("Batch AI terminology application canceled", "dirty");
      return false;
    }
    try {
      await persistence.flush(project.id);
    } catch (error) {
      status.set(error.message || "Save pending changes before batch AI terminology application failed", "dirty");
      return false;
    }

    const snapshots = new Map(candidateSelection.candidates.map((segment) => [segment.id, structuredClone(segment)]));
    const summary = {
      total: candidateSelection.candidates.length,
      completed: 0,
      suggested: 0,
      unchanged: 0,
      noTerms: 0,
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
    status.set(`Applying terminology to ${summary.total} draft segment${summary.total === 1 ? "" : "s"} with AI...`);
    try {
      for (const segment of candidateSelection.candidates) {
        if (abortController.signal.aborted) {
          summary.canceled = true;
          break;
        }
        try {
          const glossaryTerms = await context.termsForSegment(segment);
          if (!glossaryTerms.length) {
            summary.noTerms += 1;
            summary.completed += 1;
            continue;
          }
          const result = await domain.applyTerminology(
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
          if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
            summary.unchanged += 1;
          } else {
            const suggestion = suggestions.normalize(
              suggestionRecord({ segment, result, provider, settings, glossaryTerms, batch: true })
            );
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
            message: redact(error?.message || "AI terminology application failed for this segment.")
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
          appliedCount: summary.completed,
          suggestionCount: summary.suggested,
          unchangedCount: summary.unchanged,
          noTermCount: summary.noTerms,
          failedCount: summary.failed,
          skippedCount: summary.skipped,
          canceled: summary.canceled
        });
      } catch (activityError) {
        activityLogged = false;
        logger.warn?.("Batch AI terminology application activity log failed.", activityError);
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
      const noTermText = summary.noTerms ? `; ${summary.noTerms} no termbase hits` : "";
      const canceledText = summary.canceled ? " canceled" : "";
      const failureLines = summary.failures
        .slice(0, 4)
        .map((failure) => `Segment ${failure.segmentId}: ${failure.message}`);
      presentation.renderOutput(
        [
          `${summary.suggested} terminology suggestion${summary.suggested === 1 ? "" : "s"} saved.`,
          `${summary.unchanged} segment${summary.unchanged === 1 ? "" : "s"} unchanged.`,
          `${summary.noTerms} segment${summary.noTerms === 1 ? "" : "s"} had no matching termbase hits.`,
          failureLines.join("\n")
        ]
          .filter(Boolean)
          .join("\n")
      );
      status.set(
        `Batch AI terminology${canceledText}: ${summary.suggested} suggestion${summary.suggested === 1 ? "" : "s"} saved${unchangedText}${noTermText}${failureText}${skippedText}${activityLogged ? "" : "; activity log failed"}`,
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
      const message = error.message || "Batch AI terminology application failed.";
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

  return Object.freeze({ applyActive, applyBatch, cancel });
}
