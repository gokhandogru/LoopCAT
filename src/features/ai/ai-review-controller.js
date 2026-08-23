import { validateAiReviewControllerOptions } from "./ai-command-controller-contracts.js";

const RISK_LEVELS = new Set(["none", "low", "medium", "high", "critical"]);
const RISK_SCORES = { none: 0, low: 25, medium: 50, high: 75, critical: 100 };
const RISK_ORDER = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

/**
 * Owns active-segment and batch AI-review validation, consent, scope,
 * lifecycle, result normalization, review mutations, persistence,
 * presentation, secondary effects, and exact primary-failure recovery.
 * Provider adapters, records, prompt construction, repositories, and UI
 * primitives stay injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getSegments: () => any[], replaceSegments: (segments: any[]) => void },
 *   selection: { getActiveSegment: () => any, getActiveIndex: () => number },
 *   scope: { getVisibleSegments: () => any[], getDocumentSegments: () => any[], isLocked: (segment: any) => boolean },
 *   settings: { persist: () => Promise<any>, runtimeConfig: (settings: any) => any, assertReady: (settings: any, config: any, action: string) => void },
 *   providers: { get: (settings: any) => any, sharesExternally: (settings: any) => boolean },
 *   consent: { externalShare: (details: object) => boolean },
 *   context: { findTerms: (options: object) => Promise<any[]>, getTermBaseNames: () => string[] },
 *   domain: { reviewSegment: (options: object) => Promise<any>, parseRisk: (text: string) => any },
 *   lifecycle: { isRunning: () => boolean, isPromptBusy: () => boolean, sync: (state: { running: boolean, promptBusy: boolean, abortController: AbortController | null, progress?: any }) => void, createAbortController?: () => AbortController },
 *   persistence: { flush: (projectId: string) => Promise<unknown>, saveOne: (segment: any) => Promise<unknown>, saveMany: (segments: any[]) => Promise<unknown>, load: (projectId: string) => Promise<any[]> },
 *   mutation: { touch: (segment: any) => unknown, clearPending: (segment: any) => void, restore: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => unknown, prepareHistories: (segments: any[]) => any[] },
 *   presentation: { renderCommandCentre: () => void, renderAiProgress: () => void, renderOutput: (text: string, options?: object) => void, renderReview: () => void, updateRow: (index: number) => void, renderAll: () => void, refreshSidebar: () => Promise<unknown>, renderSegments: () => void, renderProjectProgress: () => void, renderHistory: () => void },
 *   activity: { logActive: (details: object) => Promise<unknown> | unknown, logBatch: (details: object) => Promise<unknown> | unknown },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   labels: { risk: (level: string) => string },
 *   redact: (value: any) => string,
 *   ids?: { next?: () => string },
 *   clock?: { now?: () => string },
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createAiReviewController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const selection = options?.selection;
  const scope = options?.scope;
  const settingsBoundary = options?.settings;
  const providers = options?.providers;
  const consent = options?.consent;
  const context = options?.context;
  const domain = options?.domain;
  const lifecycle = options?.lifecycle;
  const persistence = options?.persistence;
  const mutation = options?.mutation;
  const presentation = options?.presentation;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const status = options?.status;
  const labels = options?.labels;

  validateAiReviewControllerOptions(options, {
    editorSessionStore,
    selection,
    scope,
    settings: settingsBoundary,
    providers,
    consent,
    context,
    domain,
    lifecycle,
    persistence,
    mutation,
    presentation,
    activity,
    workspace,
    status,
    labels,
    redact: options?.redact
  });
  const createAbortController =
    typeof lifecycle.createAbortController === "function"
      ? lifecycle.createAbortController
      : () => new AbortController();
  const nextId =
    typeof options.ids?.next === "function"
      ? options.ids.next
      : () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()));
  const now = typeof options.clock?.now === "function" ? options.clock.now : () => new Date().toISOString();
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

  function normalizeRisk(reviewRisk = {}, reviewText = "") {
    const fallback = domain.parseRisk(reviewText || "");
    const source = reviewRisk && typeof reviewRisk === "object" ? reviewRisk : fallback;
    const level = RISK_LEVELS.has(String(source.level || "").trim())
      ? String(source.level || "").trim()
      : fallback.level;
    const score = Number.isFinite(Number(source.score))
      ? Math.min(100, Math.max(0, Math.round(Number(source.score))))
      : (RISK_SCORES[level] ?? RISK_SCORES.low);
    const issueCount = Number.isFinite(Number(source.issueCount))
      ? Math.max(0, Math.round(Number(source.issueCount)))
      : level === "none"
        ? 0
        : 1;
    return { level, score, issueCount, label: labels.risk(level) };
  }

  function riskFromResult(result = {}) {
    return normalizeRisk(result.reviewRisk, result.reviewText || result.text || result.rawOutput || "");
  }

  function riskLine(reviewRisk = {}) {
    const risk = normalizeRisk(reviewRisk);
    if (risk.level === "none") return "Risk: none";
    const issueText = risk.issueCount === 1 ? "1 issue" : `${risk.issueCount} issues`;
    return `Risk: ${risk.label.replace(/ risk$/i, "")} (${risk.score}/100, ${issueText})`;
  }

  function outputText(result = {}) {
    const text = String(result.reviewText || result.text || "").trim();
    return `${riskLine(riskFromResult(result))}\n\n${text}`.trim();
  }

  function commentBody(result = {}) {
    const provider = redact(result.provider || "AI").trim() || "AI";
    const model = redact(result.model || "").trim();
    const header = model ? `AI review by ${provider} (${model})` : `AI review by ${provider}`;
    return `${header}\n${riskLine(riskFromResult(result))}\n\n${String(result.reviewText || result.text || "").trim()}`.trim();
  }

  function returnedNoIssues(result = {}) {
    const text = String(result.reviewText || result.text || "")
      .trim()
      .replace(/[.!]+$/g, "")
      .toLocaleLowerCase("en-US");
    return text === "no issues found";
  }

  function highestRiskLevel(current = "none", next = "none") {
    const currentLevel = RISK_LEVELS.has(current) ? current : "none";
    const nextLevel = RISK_LEVELS.has(next) ? next : "none";
    return RISK_ORDER[nextLevel] > RISK_ORDER[currentLevel] ? nextLevel : currentLevel;
  }

  function appendComment(segment, result = {}) {
    const timestamp = now();
    const reviewRisk = riskFromResult(result);
    const body = commentBody(result);
    segment.reviewState = "needs-review";
    segment.aiReviewRisk = reviewRisk;
    segment.comments = [
      ...(segment.comments || []),
      {
        id: `comment-${nextId()}`,
        body,
        aiReviewRisk: reviewRisk,
        state: "open",
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];
    return body;
  }

  function restoreSnapshot(segment, snapshot) {
    mutation.restore(segment, snapshot);
    mutation.prepareHistory(segment);
  }

  function glossaryOptions(segment, project) {
    return {
      source: segment.source,
      sourceLang: project.sourceLang,
      targetLang: project.targetLang,
      termBaseNames: context.getTermBaseNames()
    };
  }

  function reviewRequest({ provider, project, segment, settings, config, glossaryTerms, signal = null }) {
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
      glossaryTerms,
      ...(signal ? { signal } : {})
    };
  }

  async function reviewActive() {
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const segment = selection.getActiveSegment();
    if (!segment) {
      status.set("Select a segment before running AI review.", "dirty");
      return false;
    }
    if (!String(segment.source || "").trim()) {
      status.set("The active segment has no source text.", "dirty");
      return false;
    }
    if (!String(segment.target || "").trim()) {
      status.set("The active segment has no target text to review.", "dirty");
      return false;
    }

    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "reviewing the active segment");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("AI review is not available for this provider.", "dirty");
      return false;
    }
    if (
      providers.sharesExternally(settings) &&
      !consent.externalShare({
        provider: provider.name || settings.providerId,
        includesSourceText: true,
        contextLabels: ["target text", "configured provider URL", "project glossary hints"]
      })
    ) {
      status.set("AI review canceled", "dirty");
      return false;
    }

    const snapshot = structuredClone(segment);
    promptBusy = true;
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set("Sending segment for AI review...");
    try {
      const glossaryTerms = await context.findTerms(glossaryOptions(segment, project));
      const result = await domain.reviewSegment(
        reviewRequest({ provider, project, segment, settings, config, glossaryTerms })
      );
      appendComment(segment, result);
      mutation.touch(segment);
      mutation.clearPending(segment);
      await persistence.saveOne(segment);
      try {
        await activity.logActive({
          segmentId: segment.id,
          provider: result.provider || provider.name || settings.providerId,
          model: result.model || settings.model,
          reviewRisk: riskFromResult(result).level
        });
      } catch (activityError) {
        logger.warn?.("AI review activity log failed.", activityError);
        workspace.markDirty();
      }
      presentation.renderOutput(outputText(result));
      presentation.renderReview();
      presentation.updateRow(selection.getActiveIndex());
      workspace.markDirty();
      status.set("AI review added to the active segment", "saved");
      return true;
    } catch (error) {
      restoreSnapshot(segment, snapshot);
      presentation.renderReview();
      presentation.updateRow(selection.getActiveIndex());
      const message = error.message || "AI review failed.";
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

  async function reviewBatch() {
    const project = editorSessionStore.getProject();
    if (!project || running || promptBusy || lifecycle.isRunning() || lifecycle.isPromptBusy()) return false;
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "running batch AI QA");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("Batch AI QA is not available for this provider.", "dirty");
      return false;
    }
    if (
      providers.sharesExternally(settings) &&
      !consent.externalShare({
        provider: provider.name || settings.providerId,
        includesSourceText: true,
        contextLabels: ["target text", "configured provider URL", "batch review text", "project glossary hints"]
      })
    ) {
      status.set("Batch AI QA canceled", "dirty");
      return false;
    }
    try {
      await persistence.flush(project.id);
    } catch (error) {
      status.set(error.message || "Save pending changes before batch AI QA failed", "dirty");
      return false;
    }

    const candidateSelection = selectSegments(settings);
    const initialProgress = {
      total: candidateSelection.candidates.length,
      completed: 0,
      failed: 0,
      skipped: candidateSelection.skipped.length
    };
    setProgress(initialProgress);
    presentation.renderAiProgress();
    if (!candidateSelection.candidates.length) {
      status.set(
        candidateSelection.skipped.length
          ? "No eligible translated draft segments for batch AI QA."
          : "No segments to review with local AI.",
        "saved"
      );
      return {
        ...initialProgress,
        commented: 0,
        noIssue: 0,
        riskCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        highestRisk: "none",
        failures: [],
        skippedSegments: candidateSelection.skipped,
        updatedSegmentIds: [],
        canceled: false
      };
    }

    const snapshots = new Map(candidateSelection.candidates.map((segment) => [segment.id, structuredClone(segment)]));
    const summary = {
      total: candidateSelection.candidates.length,
      completed: 0,
      commented: 0,
      noIssue: 0,
      failed: 0,
      skipped: candidateSelection.skipped.length,
      riskCounts: { critical: 0, high: 0, medium: 0, low: 0 },
      highestRisk: "none",
      failures: [],
      skippedSegments: candidateSelection.skipped,
      updatedSegmentIds: [],
      canceled: false
    };
    const updated = [];
    running = true;
    promptBusy = true;
    abortController = createAbortController();
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set(
      `Running batch AI QA on ${candidateSelection.candidates.length} segment${candidateSelection.candidates.length === 1 ? "" : "s"}...`
    );
    try {
      for (const segment of candidateSelection.candidates) {
        if (abortController.signal.aborted) {
          summary.canceled = true;
          break;
        }
        try {
          const glossaryTerms = await context.findTerms(glossaryOptions(segment, project));
          const result = await domain.reviewSegment(
            reviewRequest({
              provider,
              project,
              segment,
              settings,
              config,
              glossaryTerms,
              signal: abortController.signal
            })
          );
          if (returnedNoIssues(result)) {
            summary.noIssue += 1;
          } else {
            const reviewRisk = riskFromResult(result);
            appendComment(segment, { ...result, reviewRisk });
            mutation.touch(segment);
            mutation.clearPending(segment);
            updated.push(segment);
            summary.commented += 1;
            if (reviewRisk.level !== "none" && summary.riskCounts[reviewRisk.level] !== undefined) {
              summary.riskCounts[reviewRisk.level] += 1;
            }
            summary.highestRisk = highestRiskLevel(summary.highestRisk, reviewRisk.level);
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
            message: redact(error?.message || "AI QA failed for this segment.")
          });
        } finally {
          setProgress({ ...summary });
          presentation.renderAiProgress();
        }
      }
      if (updated.length) await persistence.saveMany(updated);
      try {
        await activity.logBatch({
          provider: provider.name || settings.providerId,
          model: settings.model,
          reviewedCount: summary.completed,
          commentedCount: summary.commented,
          noIssueCount: summary.noIssue,
          failedCount: summary.failed,
          skippedCount: summary.skipped,
          riskCounts: summary.riskCounts,
          highestRisk: summary.highestRisk,
          canceled: summary.canceled
        });
      } catch (activityError) {
        logger.warn?.("Batch AI QA activity log failed.", activityError);
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
      const noIssueText = summary.noIssue ? `; ${summary.noIssue} no issues found` : "";
      const highestRiskText =
        summary.highestRisk && summary.highestRisk !== "none" ? `; highest risk ${summary.highestRisk}` : "";
      const canceledText = summary.canceled ? " canceled" : "";
      const failureLines = summary.failures
        .slice(0, 4)
        .map((failure) => `Segment ${failure.segmentId}: ${failure.message}`);
      const riskLines = ["critical", "high", "medium", "low"]
        .filter((level) => summary.riskCounts[level])
        .map((level) => `${labels.risk(level)}: ${summary.riskCounts[level]}`);
      presentation.renderOutput(
        [
          `${summary.commented} review comment${summary.commented === 1 ? "" : "s"} saved.`,
          riskLines.join("\n"),
          `${summary.noIssue} segment${summary.noIssue === 1 ? "" : "s"} returned no issues.`,
          failureLines.join("\n")
        ]
          .filter(Boolean)
          .join("\n")
      );
      status.set(
        `Batch AI QA${canceledText}: ${summary.commented} review comment${summary.commented === 1 ? "" : "s"} saved${highestRiskText}${noIssueText}${failureText}${skippedText}`,
        summary.failed ? "dirty" : "saved"
      );
      return summary;
    } catch (error) {
      snapshots.forEach((snapshot, id) => {
        const segment = editorSessionStore.getSegments().find((item) => item.id === id);
        if (segment) restoreSnapshot(segment, snapshot);
      });
      presentation.renderSegments();
      presentation.renderProjectProgress();
      presentation.renderHistory();
      presentation.renderReview();
      const message = error.message || "Batch AI QA failed.";
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

  return Object.freeze({ cancel, reviewActive, reviewBatch });
}
