const OPERATIONS = Object.freeze({
  polish: Object.freeze({
    activeReadyAction: "polishing the active draft",
    activeUnavailable: "AI draft polishing is not available for this provider.",
    activeConsentLabels: [
      "current target draft",
      "project style instructions",
      "TM matches",
      "termbase hints",
      "configured provider URL"
    ],
    activeCanceled: "AI draft polish canceled",
    activeRunning: "Requesting AI draft polish...",
    activeUnchangedOutput: "AI did not propose a different polished draft.",
    activeUnchangedStatus: "AI did not propose a different polish.",
    activeSuggestionFailed: "AI polish suggestion could not be saved.",
    activeFailed: "AI draft polish failed.",
    activeSuccess: "AI polish suggestion ready for review",
    activeActivityWarning: "AI polish suggestion ready; activity log failed",
    batchReadyAction: "polishing draft batches",
    batchUnavailable: "Batch AI draft polish is not available for this provider.",
    batchEmptyEligible: "No eligible translated draft segments for batch AI polish.",
    batchEmpty: "No draft segments to polish with local AI.",
    batchConsentLabels: (count) => [
      `${count} source/target draft segments`,
      "project style instructions",
      "TM matches",
      "termbase hints",
      "configured provider URL"
    ],
    batchCanceled: "Batch AI polish canceled",
    batchFlushFailed: "Save pending changes before batch AI polish failed",
    batchRunning: (count) => `Polishing ${count} draft segment${count === 1 ? "" : "s"} with AI...`,
    batchFailure: "AI polish failed for this segment.",
    batchActivityWarning: "Batch AI polish activity log failed.",
    batchFailed: "Batch AI polish failed.",
    batchNoun: "polish",
    activityCountKey: "polishedCount"
  }),
  adapt: Object.freeze({
    activeReadyAction: "adapting the active draft",
    activeUnavailable: "AI draft adaptation is not available for this provider.",
    activeConsentLabels: [
      "current target draft",
      "adaptation mode",
      "project style instructions",
      "TM matches",
      "termbase hints",
      "configured provider URL"
    ],
    activeCanceled: "AI draft adaptation canceled",
    activeRunning: "Requesting AI draft adaptation...",
    activeUnchangedOutput: "AI did not propose a different adapted draft.",
    activeUnchangedStatus: "AI did not propose a different adaptation.",
    activeSuggestionFailed: "AI adaptation suggestion could not be saved.",
    activeFailed: "AI draft adaptation failed.",
    activeSuccess: "AI adaptation suggestion ready for review",
    activeActivityWarning: "AI adaptation suggestion ready; activity log failed",
    batchReadyAction: "adapting draft batches",
    batchUnavailable: "Batch AI draft adaptation is not available for this provider.",
    batchEmptyEligible: "No eligible translated draft segments for batch AI adaptation.",
    batchEmpty: "No draft segments to adapt with local AI.",
    batchConsentLabels: (count) => [
      `${count} source/target draft segments`,
      "adaptation mode",
      "project style instructions",
      "TM matches",
      "termbase hints",
      "configured provider URL"
    ],
    batchCanceled: "Batch AI adaptation canceled",
    batchFlushFailed: "Save pending changes before batch AI adaptation failed",
    batchRunning: (count) => `Adapting ${count} draft segment${count === 1 ? "" : "s"} with AI...`,
    batchFailure: "AI adaptation failed for this segment.",
    batchActivityWarning: "Batch AI adaptation activity log failed.",
    batchFailed: "Batch AI adaptation failed.",
    batchNoun: "adaptation",
    activityCountKey: "adaptedCount"
  })
});

/**
 * Owns active and batch AI draft polish/adaptation validation, consent,
 * translated-draft eligibility, TM/termbase/style/protected-token routing,
 * suggestion construction, lifecycle, persistence, secondary effects,
 * presentation, and recovery. Provider adapters, domain records, prompt
 * construction, and general suggestion storage stay injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[], replaceSegments: (segments: any[]) => void },
 *   selection: { getActiveSegment: () => any },
 *   scope: { getVisibleSegments: () => any[], getDocumentSegments: () => any[], isLocked: (segment: any) => boolean, getTags: (segment: any) => any[] },
 *   settings: { persist: () => Promise<any>, runtimeConfig: (settings: any) => any, assertReady: (settings: any, config: any, action: string) => void },
 *   providers: { get: (settings: any) => any, sharesExternally: (settings: any) => boolean },
 *   consent: { externalShare: (details: object) => boolean },
 *   context: { termsForSegment: (segment: any) => Promise<any[]>, tmMatchesForSegment: (segment: any) => Promise<any[]> },
 *   domain: { polish: (options: object) => Promise<any>, adapt: (options: object) => Promise<any> },
 *   lifecycle: { isRunning: () => boolean, isPromptBusy: () => boolean, sync: (state: { running: boolean, promptBusy: boolean, abortController: AbortController | null, progress?: any }) => void, createAbortController?: () => AbortController },
 *   suggestions: { append: (operation: string, segment: any, suggestion: object) => Promise<any>, normalize: (suggestion: object) => any, nextId: () => string },
 *   persistence: { flush: (projectId: string) => Promise<unknown>, saveMany: (segments: any[]) => Promise<unknown>, load: (projectId: string) => Promise<any[]> },
 *   mutation: { touch: (segment: any) => unknown, clearPending: (segment: any) => void, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown, prepareHistories: (segments: any[]) => any[] },
 *   presentation: { renderCommandCentre: () => void, renderAiProgress: () => void, renderOutput: (text: string, options?: object) => void, renderAll: () => void, refreshSidebar: () => Promise<unknown> },
 *   activity: { logBatch: (operation: string, details: object) => Promise<unknown> | unknown },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   redact: (value: any) => string,
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createAiDraftEditingController(options) {
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

  if (
    typeof editorSessionStore?.getProject !== "function" ||
    typeof editorSessionStore?.getSegments !== "function" ||
    typeof editorSessionStore?.replaceSegments !== "function" ||
    typeof selection?.getActiveSegment !== "function"
  ) {
    throw new TypeError("AiDraftEditingController requires EditorSessionStore and selection boundaries.");
  }
  if (
    typeof scope?.getVisibleSegments !== "function" ||
    typeof scope?.getDocumentSegments !== "function" ||
    typeof scope?.isLocked !== "function" ||
    typeof scope?.getTags !== "function"
  ) {
    throw new TypeError("AiDraftEditingController requires translated-draft scope boundaries.");
  }
  if (
    typeof settingsBoundary?.persist !== "function" ||
    typeof settingsBoundary?.runtimeConfig !== "function" ||
    typeof settingsBoundary?.assertReady !== "function" ||
    typeof providers?.get !== "function" ||
    typeof providers?.sharesExternally !== "function" ||
    typeof consent?.externalShare !== "function" ||
    typeof context?.termsForSegment !== "function" ||
    typeof context?.tmMatchesForSegment !== "function" ||
    typeof domain?.polish !== "function" ||
    typeof domain?.adapt !== "function"
  ) {
    throw new TypeError(
      "AiDraftEditingController requires settings, provider, consent, context, and domain boundaries."
    );
  }
  if (
    typeof lifecycle?.isRunning !== "function" ||
    typeof lifecycle?.isPromptBusy !== "function" ||
    typeof lifecycle?.sync !== "function"
  ) {
    throw new TypeError("AiDraftEditingController requires shared AI lifecycle boundaries.");
  }
  if (
    typeof suggestions?.append !== "function" ||
    typeof suggestions?.normalize !== "function" ||
    typeof suggestions?.nextId !== "function" ||
    typeof persistence?.flush !== "function" ||
    typeof persistence?.saveMany !== "function" ||
    typeof persistence?.load !== "function"
  ) {
    throw new TypeError("AiDraftEditingController requires suggestion and persistence boundaries.");
  }
  if (
    typeof mutation?.touch !== "function" ||
    typeof mutation?.clearPending !== "function" ||
    typeof mutation?.restore !== "function" ||
    typeof mutation?.prepareHistory !== "function" ||
    typeof mutation?.prepareHistories !== "function" ||
    typeof presentation?.renderCommandCentre !== "function" ||
    typeof presentation?.renderAiProgress !== "function" ||
    typeof presentation?.renderOutput !== "function" ||
    typeof presentation?.renderAll !== "function" ||
    typeof presentation?.refreshSidebar !== "function"
  ) {
    throw new TypeError("AiDraftEditingController requires mutation and presentation boundaries.");
  }
  if (
    typeof activity?.logBatch !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function" ||
    typeof options?.redact !== "function"
  ) {
    throw new TypeError("AiDraftEditingController requires activity, workspace, status, and redaction boundaries.");
  }

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

  async function promptContext(segment) {
    const [glossaryTerms, tmMatches] = await Promise.all([
      context.termsForSegment(segment),
      context.tmMatchesForSegment(segment)
    ]);
    return { glossaryTerms, tmMatches };
  }

  function providerRequest({ operation, provider, project, segment, settings, config, promptContext, signal = null }) {
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
      glossaryTerms: promptContext.glossaryTerms,
      tmMatches: promptContext.tmMatches,
      styleGuide: project.aiSettings?.styleGuide || "",
      ...(operation === "adapt" ? { adaptMode: settings.adaptMode } : {}),
      ...(signal ? { signal } : {})
    };
  }

  function suggestionRecord({ operation, segment, result, provider, settings, promptContext, batch }) {
    const firstLine =
      operation === "adapt"
        ? `${batch ? "Batch " : ""}AI draft adaptation suggestion (${result.adaptMode || settings.adaptMode || "simplify"}). Review before applying.`
        : `${batch ? "Batch " : ""}AI style and terminology polish suggestion. Review before applying.`;
    return {
      id: suggestions.nextId(),
      provider: result.provider || provider.name || "AI",
      model: result.model || settings.model,
      segmentId: segment.id,
      suggestedTarget: result.suggestedTarget,
      confidence: result.warnings?.length ? 65 : 82,
      explanation: [
        firstLine,
        ...(promptContext.tmMatches.length
          ? [`TM matches considered: ${Math.min(promptContext.tmMatches.length, 3)}`]
          : []),
        ...(promptContext.glossaryTerms.length
          ? [`Termbase hints considered: ${Math.min(promptContext.glossaryTerms.length, 12)}`]
          : []),
        ...(result.protectedTokens?.length
          ? [`Protected tokens considered: ${result.protectedTokens.join(", ")}`]
          : []),
        ...(result.warnings || [])
      ],
      status: "review"
    };
  }

  async function editActive(operation) {
    const definition = OPERATIONS[operation];
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const segment = selection.getActiveSegment();
    if (!segment) {
      status.set(`Select a segment before ${operation === "polish" ? "polishing" : "adapting"} a draft.`, "dirty");
      return false;
    }
    if (!String(segment.source || "").trim()) {
      status.set("The active segment has no source text.", "dirty");
      return false;
    }
    if (!String(segment.target || "").trim()) {
      status.set(`The active segment has no target draft to ${operation === "polish" ? "polish" : "adapt"}.`, "dirty");
      return false;
    }
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, definition.activeReadyAction);
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set(definition.activeUnavailable, "dirty");
      return false;
    }
    if (
      providers.sharesExternally(settings) &&
      !consent.externalShare({
        provider: provider.name || settings.providerId,
        includesSourceText: true,
        contextLabels: definition.activeConsentLabels
      })
    ) {
      status.set(definition.activeCanceled, "dirty");
      return false;
    }

    promptBusy = true;
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set(definition.activeRunning);
    try {
      const resolvedContext = await promptContext(segment);
      const result = await domain[operation](
        providerRequest({
          operation,
          provider,
          project,
          segment,
          settings,
          config,
          promptContext: resolvedContext
        })
      );
      if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
        presentation.renderOutput(definition.activeUnchangedOutput, { muted: false });
        status.set(definition.activeUnchangedStatus, "saved");
        return true;
      }
      const saved = await suggestions.append(
        operation,
        segment,
        suggestionRecord({
          operation,
          segment,
          result,
          provider,
          settings,
          promptContext: resolvedContext,
          batch: false
        })
      );
      presentation.renderOutput(result.suggestedTarget);
      if (saved?.ok) {
        status.set(
          saved.activityLogged ? definition.activeSuccess : definition.activeActivityWarning,
          saved.activityLogged ? "saved" : "dirty"
        );
        return true;
      }
      status.set(definition.activeSuggestionFailed, "dirty");
      return false;
    } catch (error) {
      const message = error.message || definition.activeFailed;
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

  async function editBatch(operation) {
    const definition = OPERATIONS[operation];
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, definition.batchReadyAction);
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set(definition.batchUnavailable, "dirty");
      return false;
    }
    const candidateSelection = selectSegments(settings);
    if (!candidateSelection.candidates.length) {
      status.set(candidateSelection.skipped.length ? definition.batchEmptyEligible : definition.batchEmpty, "saved");
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
        contextLabels: definition.batchConsentLabels(candidateSelection.candidates.length)
      })
    ) {
      status.set(definition.batchCanceled, "dirty");
      return false;
    }
    try {
      await persistence.flush(project.id);
    } catch (error) {
      status.set(error.message || definition.batchFlushFailed, "dirty");
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
    status.set(definition.batchRunning(summary.total));
    try {
      for (const segment of candidateSelection.candidates) {
        if (abortController.signal.aborted) {
          summary.canceled = true;
          break;
        }
        try {
          const resolvedContext = await promptContext(segment);
          const result = await domain[operation](
            providerRequest({
              operation,
              provider,
              project,
              segment,
              settings,
              config,
              promptContext: resolvedContext,
              signal: abortController.signal
            })
          );
          if (result.suggestedTarget.trim() === String(segment.target || "").trim() && !result.warnings?.length) {
            summary.unchanged += 1;
          } else {
            const suggestion = suggestions.normalize(
              suggestionRecord({
                operation,
                segment,
                result,
                provider,
                settings,
                promptContext: resolvedContext,
                batch: true
              })
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
            message: redact(error?.message || definition.batchFailure)
          });
        } finally {
          setProgress({ ...summary });
          presentation.renderAiProgress();
        }
      }
      if (updated.length) await persistence.saveMany(updated);
      let activityLogged = true;
      try {
        const activityDetails = {
          provider: provider.name || settings.providerId,
          model: settings.model,
          mode: settings.mode,
          [definition.activityCountKey]: summary.completed,
          suggestionCount: summary.suggested,
          unchangedCount: summary.unchanged,
          failedCount: summary.failed,
          skippedCount: summary.skipped,
          canceled: summary.canceled
        };
        if (operation === "adapt") activityDetails.adaptMode = settings.adaptMode;
        await activity.logBatch(operation, activityDetails);
      } catch (activityError) {
        activityLogged = false;
        logger.warn?.(definition.batchActivityWarning, activityError);
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
          `${summary.suggested} ${definition.batchNoun} suggestion${summary.suggested === 1 ? "" : "s"} saved.`,
          `${summary.unchanged} segment${summary.unchanged === 1 ? "" : "s"} unchanged.`,
          failureLines.join("\n")
        ]
          .filter(Boolean)
          .join("\n")
      );
      status.set(
        `Batch AI ${definition.batchNoun}${canceledText}: ${summary.suggested} suggestion${summary.suggested === 1 ? "" : "s"} saved${unchangedText}${failureText}${skippedText}${activityLogged ? "" : "; activity log failed"}`,
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
      const message = error.message || definition.batchFailed;
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

  return Object.freeze({
    polishActive: () => editActive("polish"),
    adaptActive: () => editActive("adapt"),
    polishBatch: () => editBatch("polish"),
    adaptBatch: () => editBatch("adapt"),
    cancel
  });
}
