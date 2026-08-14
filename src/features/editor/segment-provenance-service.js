/**
 * Owns read-only AI/TM segment provenance classification and badge metadata.
 * Filter state, DOM construction, generation, commands, persistence, and
 * activity remain behind injected boundaries.
 *
 * @param {{ localization: { source: (text: string, values?: object) => string, label: (key: string, values?: object) => string } }} options
 */
export function createSegmentProvenanceService(options) {
  const localization = options?.localization;
  if (typeof localization?.source !== "function" || typeof localization?.label !== "function") {
    throw new TypeError("SegmentProvenanceService requires a localization boundary.");
  }

  function aiRiskLevel(segment = {}) {
    const level = String(segment.aiReviewRisk?.level || "").trim();
    return ["low", "medium", "high", "critical"].includes(level) ? level : "";
  }

  function hasAiDraft(segment = {}) {
    return Boolean(segment.aiPretranslation?.provider || segment.aiPretranslation?.model);
  }

  function aiBadge(segment = {}) {
    return {
      className: "ai-initiated",
      text: localization.source("AI initiated"),
      title: segment.aiPretranslation?.model
        ? localization.label("aiInitiatedPretranslationModel", { model: segment.aiPretranslation.model })
        : localization.label("aiInitiatedPretranslation")
    };
  }

  function tmScore(segment = {}) {
    const score = Number(segment.tmPretranslation?.score);
    if (!Number.isFinite(score)) return null;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function hasTmPretranslation(segment = {}) {
    return tmScore(segment) !== null;
  }

  function tmBadge(segment = {}) {
    const score = tmScore(segment);
    const tmName = String(segment.tmPretranslation?.tmName || "").trim();
    return {
      className: "tm-pretranslation",
      text: `TM ${score}%`,
      title: tmName
        ? localization.source("TM pretranslation match: {value1}% from {value2}", {
            value1: score,
            value2: tmName
          })
        : localization.source("TM pretranslation match: {value1}%", { value1: score })
    };
  }

  function hasAiSuggestions(segment = {}) {
    return Array.isArray(segment.aiSuggestions) && segment.aiSuggestions.length > 0;
  }

  return Object.freeze({ aiRiskLevel, hasAiDraft, aiBadge, tmScore, hasTmPretranslation, tmBadge, hasAiSuggestions });
}
