/**
 * Owns the portable AI-suggestion storage shape and append/persistence flow,
 * including optional activity warnings and exact primary-failure recovery.
 * Segment records, repositories, history mutation, redaction, IDs, clocks,
 * presentation, workspace, and status remain injected.
 *
 * @param {{
 *   mutation: { touch: (segment: any) => unknown, restoreInPlace: (segment: any, snapshot: any) => void, prepareHistory: (segment: any) => any },
 *   persistence: { clearPending: (segment: any) => unknown, save: (segment: any) => Promise<unknown> },
 *   activity: { log: (type: string, message: string, details: object) => Promise<unknown> | unknown },
 *   presentation: { renderSuggestions: () => void, renderHistory: () => void },
 *   workspace: { markDirty: () => void, markActivityWarningDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   redact: (value: string) => string,
 *   ids: { suggestion: () => string },
 *   clock?: { now: () => string },
 *   testHooks?: { beforeSave?: (segment: any) => void, beforeActivity?: (segment: any) => void },
 *   logger?: { warn?: (...values: any[]) => void }
 * }} options
 */
export function createAiSuggestionPersistenceController(options) {
  const mutation = options?.mutation;
  const persistence = options?.persistence;
  const activity = options?.activity;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;

  if (
    typeof mutation?.touch !== "function" ||
    typeof mutation?.restoreInPlace !== "function" ||
    typeof mutation?.prepareHistory !== "function"
  ) {
    throw new TypeError("AiSuggestionPersistenceController requires segment mutation boundaries.");
  }
  if (typeof persistence?.clearPending !== "function" || typeof persistence?.save !== "function") {
    throw new TypeError("AiSuggestionPersistenceController requires persistence boundaries.");
  }
  if (
    typeof activity?.log !== "function" ||
    typeof presentation?.renderSuggestions !== "function" ||
    typeof presentation?.renderHistory !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof workspace?.markActivityWarningDirty !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "AiSuggestionPersistenceController requires activity, presentation, workspace, and status boundaries."
    );
  }
  if (typeof options?.redact !== "function" || typeof options?.ids?.suggestion !== "function") {
    throw new TypeError("AiSuggestionPersistenceController requires redaction and ID boundaries.");
  }

  const now = typeof options.clock?.now === "function" ? options.clock.now : () => new Date().toISOString();
  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};
  const beforeActivity =
    typeof options.testHooks?.beforeActivity === "function" ? options.testHooks.beforeActivity : () => {};
  const warn = typeof options.logger?.warn === "function" ? options.logger.warn.bind(options.logger) : () => {};

  /** @param {any} suggestion */
  function normalize(suggestion = {}) {
    const source = suggestion && typeof suggestion === "object" ? suggestion : {};
    const confidence = Number(source.confidence);
    return {
      id: String(source.id || options.ids.suggestion()),
      provider: options.redact(source.provider || "AI").trim() || "AI",
      model: options.redact(source.model || "").trim(),
      segmentId: String(source.segmentId || "").trim(),
      suggestedTarget: String(source.suggestedTarget || ""),
      confidence: Number.isFinite(confidence) ? confidence : 0,
      explanation: Array.isArray(source.explanation)
        ? source.explanation
            .map((item) => options.redact(item || "").trim())
            .filter(Boolean)
            .slice(0, 8)
        : [],
      status: options.redact(source.status || "review").trim() || "review",
      origin: options.redact(source.origin || source.provider || "AI").trim() || "AI",
      scope: options.redact(source.scope || "active segment").trim() || "active segment",
      reviewState: options.redact(source.reviewState || "suggested").trim() || "suggested",
      contextDisclosure: Array.isArray(source.contextDisclosure)
        ? source.contextDisclosure
            .map((item) => options.redact(item || "").trim())
            .filter(Boolean)
            .slice(0, 8)
        : [],
      createdAt: String(source.createdAt || now()).trim()
    };
  }

  async function append(segment, suggestion, activityType, activityMessage) {
    if (!segment || !suggestion) return false;
    const safeSuggestion = normalize(suggestion);
    const snapshot = structuredClone(segment);
    let activityLogged = true;
    try {
      segment.aiSuggestions = [...(segment.aiSuggestions || []), safeSuggestion];
      mutation.touch(segment);
      persistence.clearPending(segment);
      beforeSave(segment);
      await persistence.save(segment);
      try {
        beforeActivity(segment);
        await activity.log(activityType, activityMessage, {
          segmentId: segment.id,
          provider: safeSuggestion.provider,
          model: safeSuggestion.model
        });
      } catch (activityError) {
        activityLogged = false;
        warn("AI suggestion activity log failed.", activityError);
        workspace.markActivityWarningDirty();
      }
      presentation.renderSuggestions();
      workspace.markDirty();
      if (!activityLogged) status.set(`${activityMessage}; activity log failed`, "dirty");
      return { ok: true, activityLogged };
    } catch (error) {
      mutation.restoreInPlace(segment, snapshot);
      mutation.prepareHistory(segment);
      presentation.renderSuggestions();
      presentation.renderHistory();
      status.set(error.message || "AI suggestion save failed", "dirty");
      return false;
    }
  }

  return Object.freeze({ append, normalize });
}
