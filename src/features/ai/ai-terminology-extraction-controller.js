/**
 * Owns active and batch AI terminology-extraction validation, consent, source
 * scope, lifecycle, provider execution, term persistence sequencing,
 * activity, presentation, and final cleanup. Provider adapters, prompt
 * construction, term normalization/deduplication/storage, records, and
 * repositories stay injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[] },
 *   selection: { getActiveSegment: () => any },
 *   scope: { getVisibleSegments: () => any[], getDocumentSegments: () => any[] },
 *   termbase: { getSelectedName: () => string, saveCandidates: (terms: any[], termBaseName: string) => Promise<{ savedTerms: any[], duplicateCount: number }> },
 *   settings: { persist: () => Promise<any>, runtimeConfig: (settings: any) => any, assertReady: (settings: any, config: any, action: string) => void },
 *   providers: { get: (settings: any) => any, sharesExternally: (settings: any) => boolean },
 *   consent: { externalShare: (details: object) => boolean },
 *   domain: { extractSegmentTerms: (options: object) => Promise<any> },
 *   lifecycle: { isRunning: () => boolean, isPromptBusy: () => boolean, sync: (state: { running: boolean, promptBusy: boolean, abortController: AbortController | null, progress?: any }) => void, createAbortController?: () => AbortController },
 *   presentation: { renderCommandCentre: () => void, renderAiProgress: () => void, renderOutput: (text: string, options?: object) => void, refreshProjectTerms: () => Promise<unknown>, refreshTerms: () => Promise<unknown> },
 *   activity: { logActive: (details: object) => Promise<unknown> | unknown, logBatch: (details: object) => Promise<unknown> | unknown },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createAiTerminologyExtractionController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const selection = options?.selection;
  const scope = options?.scope;
  const termbase = options?.termbase;
  const settingsBoundary = options?.settings;
  const providers = options?.providers;
  const consent = options?.consent;
  const domain = options?.domain;
  const lifecycle = options?.lifecycle;
  const presentation = options?.presentation;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const status = options?.status;

  if (
    typeof editorSessionStore?.getProject !== "function" ||
    typeof editorSessionStore?.getSegments !== "function" ||
    typeof selection?.getActiveSegment !== "function" ||
    typeof scope?.getVisibleSegments !== "function" ||
    typeof scope?.getDocumentSegments !== "function"
  ) {
    throw new TypeError(
      "AiTerminologyExtractionController requires EditorSessionStore, selection, and scope boundaries."
    );
  }
  if (
    typeof termbase?.getSelectedName !== "function" ||
    typeof termbase?.saveCandidates !== "function" ||
    typeof settingsBoundary?.persist !== "function" ||
    typeof settingsBoundary?.runtimeConfig !== "function" ||
    typeof settingsBoundary?.assertReady !== "function" ||
    typeof providers?.get !== "function" ||
    typeof providers?.sharesExternally !== "function" ||
    typeof consent?.externalShare !== "function" ||
    typeof domain?.extractSegmentTerms !== "function"
  ) {
    throw new TypeError(
      "AiTerminologyExtractionController requires termbase, settings, provider, consent, and domain boundaries."
    );
  }
  if (
    typeof lifecycle?.isRunning !== "function" ||
    typeof lifecycle?.isPromptBusy !== "function" ||
    typeof lifecycle?.sync !== "function"
  ) {
    throw new TypeError("AiTerminologyExtractionController requires shared AI lifecycle boundaries.");
  }
  if (
    typeof presentation?.renderCommandCentre !== "function" ||
    typeof presentation?.renderAiProgress !== "function" ||
    typeof presentation?.renderOutput !== "function" ||
    typeof presentation?.refreshProjectTerms !== "function" ||
    typeof presentation?.refreshTerms !== "function" ||
    typeof activity?.logActive !== "function" ||
    typeof activity?.logBatch !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "AiTerminologyExtractionController requires presentation, activity, workspace, and status boundaries."
    );
  }

  const createAbortController =
    typeof lifecycle.createAbortController === "function"
      ? lifecycle.createAbortController
      : () => new AbortController();
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
    return {
      provider,
      project,
      segment,
      settings,
      config,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      ...(signal ? { signal } : {})
    };
  }

  function savedTermOutput(savedTerms) {
    return savedTerms
      .map((term) => `${term.sourceTerm} -> ${term.targetTerm}${term.notes ? ` (${term.notes})` : ""}`)
      .join("\n");
  }

  async function refreshTermsAfterExtraction(batch = false) {
    try {
      await presentation.refreshProjectTerms();
      await presentation.refreshTerms();
    } catch (refreshError) {
      logger.warn?.(
        batch ? "Term refresh failed after batch AI extraction." : "Term refresh failed after AI extraction.",
        refreshError
      );
    }
  }

  async function extractActive() {
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const segment = selection.getActiveSegment();
    if (!segment) {
      status.set("Select a segment before extracting AI terms.", "dirty");
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
      settingsBoundary.assertReady(settings, config, "extracting terminology");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("AI term extraction is not available for this provider.", "dirty");
      return false;
    }
    const termBaseName = termbase.getSelectedName();
    if (
      providers.sharesExternally(settings) &&
      !consent.externalShare({
        provider: provider.name || settings.providerId,
        includesSourceText: true,
        contextLabels: ["current target draft", "configured provider URL", `termbase ${termBaseName}`]
      })
    ) {
      status.set("AI term extraction canceled", "dirty");
      return false;
    }

    promptBusy = true;
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set("Extracting AI terminology candidates...");
    try {
      const result = await domain.extractSegmentTerms(
        providerRequest({ provider, project, segment, settings, config })
      );
      const { savedTerms } = await termbase.saveCandidates(result.terms || [], termBaseName);
      if (!savedTerms.length) {
        presentation.renderOutput(
          result.terms?.length
            ? "AI term candidates already exist in the current termbase."
            : "AI did not find reusable term candidates in the active segment.",
          { muted: false }
        );
        status.set(
          result.terms?.length ? "AI term candidates already exist" : "AI did not find term candidates",
          "saved"
        );
        return true;
      }
      let activityLogged = true;
      try {
        await activity.logActive({
          segmentId: segment.id,
          provider: result.provider || provider.name || settings.providerId,
          model: result.model || settings.model,
          termBaseName,
          termCount: savedTerms.length
        });
      } catch (activityError) {
        activityLogged = false;
        logger.warn?.("AI term extraction activity log failed.", activityError);
        workspace.markDirty();
      }
      await refreshTermsAfterExtraction(false);
      presentation.renderOutput(savedTermOutput(savedTerms));
      status.set(
        activityLogged
          ? `Saved ${savedTerms.length} AI term candidate${savedTerms.length === 1 ? "" : "s"}`
          : `Saved ${savedTerms.length} AI term candidate${savedTerms.length === 1 ? "" : "s"}; activity log failed`,
        activityLogged ? "saved" : "dirty"
      );
      return true;
    } catch (error) {
      const message = error.message || "AI term extraction failed.";
      presentation.renderOutput(message, { muted: false });
      status.set(message, "dirty");
      return false;
    } finally {
      promptBusy = false;
      syncLifecycle();
      presentation.renderCommandCentre();
    }
  }

  function scopedSegments(settings = {}) {
    const mode = settings.mode || "untranslated";
    if (mode === "selected") return selection.getActiveSegment() ? [selection.getActiveSegment()] : [];
    if (mode === "visible") return scope.getVisibleSegments();
    if (mode === "project") return editorSessionStore.getSegments();
    if (mode === "untranslated") {
      return scope.getDocumentSegments().filter((segment) => !String(segment.target || "").trim());
    }
    return scope.getDocumentSegments();
  }

  async function extractBatch() {
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "extracting batch terminology");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("Batch AI term extraction is not available for this provider.", "dirty");
      return false;
    }
    const segments = scopedSegments(settings).filter((segment) => String(segment?.source || "").trim());
    if (!segments.length) {
      status.set("No source segments are available for batch AI term extraction.", "dirty");
      return false;
    }
    const termBaseName = termbase.getSelectedName();
    if (
      providers.sharesExternally(settings) &&
      !consent.externalShare({
        provider: provider.name || settings.providerId,
        includesSourceText: true,
        contextLabels: [
          `${segments.length} segment source/target snippets`,
          "configured provider URL",
          `termbase ${termBaseName}`
        ]
      })
    ) {
      status.set("Batch AI term extraction canceled", "dirty");
      return false;
    }

    running = true;
    promptBusy = true;
    abortController = createAbortController();
    progress = {
      total: segments.length,
      completed: 0,
      failed: 0,
      skipped: 0,
      skippedSegments: 0,
      canceled: false
    };
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set(`Extracting AI terms from ${segments.length} segment${segments.length === 1 ? "" : "s"}...`);
    const allCandidates = [];
    const failures = [];
    try {
      for (const segment of segments) {
        if (abortController.signal.aborted) break;
        try {
          const result = await domain.extractSegmentTerms(
            providerRequest({
              provider,
              project,
              segment,
              settings,
              config,
              signal: abortController.signal
            })
          );
          allCandidates.push(...(result.terms || []));
          progress.completed += 1;
        } catch (error) {
          if (abortController.signal.aborted || String(error?.message || "").includes("canceled")) break;
          failures.push({ segmentId: segment.id, error: error.message || String(error) });
          progress.failed += 1;
        }
        setProgress({ ...progress });
        presentation.renderAiProgress();
      }
      progress.canceled = abortController.signal.aborted;
      setProgress({ ...progress });
      const { savedTerms, duplicateCount } = await termbase.saveCandidates(allCandidates, termBaseName);
      let activityLogged = true;
      try {
        await activity.logBatch({
          provider: provider.name || settings.providerId,
          model: settings.model,
          mode: settings.mode,
          termBaseName,
          segmentCount: segments.length,
          completed: progress.completed,
          failed: progress.failed,
          savedTermCount: savedTerms.length,
          duplicateCount
        });
      } catch (activityError) {
        activityLogged = false;
        logger.warn?.("Batch AI term extraction activity log failed.", activityError);
        workspace.markDirty();
      }
      await refreshTermsAfterExtraction(true);
      const statusPieces = [`saved ${savedTerms.length}`, `duplicates ${duplicateCount}`, `failed ${failures.length}`];
      if (progress.canceled) statusPieces.push("canceled");
      const savedText = savedTerms.length ? savedTermOutput(savedTerms) : "No new AI term candidates were saved.";
      const failureText = failures.length
        ? `\n\nFailures:\n${failures
            .slice(0, 5)
            .map((failure) => `- ${failure.segmentId}: ${failure.error}`)
            .join("\n")}`
        : "";
      presentation.renderOutput(`${savedText}${failureText}`, {
        muted: !savedTerms.length && !failures.length
      });
      status.set(
        `${progress.canceled ? "Canceled" : "Finished"} batch AI term extraction: ${statusPieces.join(", ")}${activityLogged ? "" : "; activity log failed"}`,
        failures.length || !activityLogged || progress.canceled ? "dirty" : "saved"
      );
      return { savedTerms, failures, duplicateCount, canceled: progress.canceled };
    } catch (error) {
      const message = error.message || "Batch AI term extraction failed.";
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

  return Object.freeze({ extractActive, extractBatch, cancel });
}
