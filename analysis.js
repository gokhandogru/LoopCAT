(() => {
function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function normalize(text) {
  return window.CatHan.tm?.normalizeText
    ? window.CatHan.tm.normalizeText(text)
    : String(text || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function leverageBand(score) {
  if (score >= 100) return "exact";
  if (score >= 95) return "fuzzy95";
  if (score >= 85) return "fuzzy85";
  if (score >= 75) return "fuzzy75";
  if (score >= 50) return "fuzzy50";
  return "none";
}

function bestTmScore(segment, tmEntries) {
  if (!segment?.source || !tmEntries?.length) return 0;
  const similarity = window.CatHan.tm?.similarity || (() => 0);
  return tmEntries.reduce((best, entry) => Math.max(best, similarity(segment.source, entry.source)), 0);
}

const AI_RISK_ORDER = { low: 1, medium: 2, high: 3, critical: 4 };

function aiReviewRiskLevel(value) {
  const level = String(value?.level || "").trim().toLowerCase();
  return AI_RISK_ORDER[level] ? level : "";
}

function segmentAiReviewRiskLevel(segment = {}) {
  const comments = Array.isArray(segment.comments) ? segment.comments : [];
  const risks = [segment.aiReviewRisk, ...comments.map((comment) => comment?.aiReviewRisk)]
    .map(aiReviewRiskLevel)
    .filter(Boolean);
  return risks.reduce((highest, level) => (AI_RISK_ORDER[level] > (AI_RISK_ORDER[highest] || 0) ? level : highest), "");
}

function segmentHasAiDraft(segment = {}) {
  return Boolean(segment.aiPretranslation?.provider || segment.aiPretranslation?.model);
}

function analyzeProject(project, segments = [], tmEntries = []) {
  const bySource = new Map();
  const files = new Map();
  const totals = {
    files: 0,
    segments: segments.length,
    words: 0,
    confirmed: 0,
    untranslated: 0,
    needsReview: 0,
    reviewed: 0,
    blocked: 0,
    comments: 0,
    repetitions: 0,
    aiDrafts: 0,
    aiSuggestionSegments: 0,
    aiSuggestions: 0,
    aiReviewRisk: 0,
    highAiRisk: 0
  };
  const leverage = { exact: 0, fuzzy95: 0, fuzzy85: 0, fuzzy75: 0, fuzzy50: 0, none: 0 };
  const ai = {
    drafts: 0,
    suggestionSegments: 0,
    suggestions: 0,
    reviewRisk: 0,
    highRisk: 0,
    risk: { critical: 0, high: 0, medium: 0, low: 0 }
  };

  segments.forEach((segment) => {
    const words = wordCount(segment.source);
    const key = normalize(segment.source);
    const sourceCount = bySource.get(key) || 0;
    bySource.set(key, sourceCount + 1);
    if (sourceCount > 0) totals.repetitions += 1;

    totals.words += words;
    if (segment.status === "confirmed") totals.confirmed += 1;
    if (!String(segment.target || "").trim()) totals.untranslated += 1;
    if (segment.reviewState === "needs-review") totals.needsReview += 1;
    if (segment.reviewState === "reviewed") totals.reviewed += 1;
    if (segment.reviewState === "blocked") totals.blocked += 1;
    totals.comments += (segment.comments || []).length + (segment.reviewNote ? 1 : 0);
    const aiSuggestionCount = Array.isArray(segment.aiSuggestions) ? segment.aiSuggestions.length : 0;
    const riskLevel = segmentAiReviewRiskLevel(segment);
    if (segmentHasAiDraft(segment)) {
      ai.drafts += 1;
      totals.aiDrafts += 1;
    }
    if (aiSuggestionCount) {
      ai.suggestionSegments += 1;
      ai.suggestions += aiSuggestionCount;
      totals.aiSuggestionSegments += 1;
      totals.aiSuggestions += aiSuggestionCount;
    }
    if (riskLevel) {
      ai.reviewRisk += 1;
      totals.aiReviewRisk += 1;
      ai.risk[riskLevel] += 1;
      if (riskLevel === "high" || riskLevel === "critical") {
        ai.highRisk += 1;
        totals.highAiRisk += 1;
      }
    }

    const documentId = segment.documentId || "default-document";
    if (!files.has(documentId)) {
      files.set(documentId, {
        id: documentId,
        name: segment.documentName || "Document",
        type: segment.documentType || "file",
        segments: 0,
        words: 0,
        confirmed: 0,
        untranslated: 0,
        reviewItems: 0,
        aiDrafts: 0,
        aiSuggestions: 0,
        aiReviewRisk: 0,
        highAiRisk: 0
      });
    }
    const file = files.get(documentId);
    file.segments += 1;
    file.words += words;
    if (segment.status === "confirmed") file.confirmed += 1;
    if (!String(segment.target || "").trim()) file.untranslated += 1;
    if (segment.reviewState || segment.reviewNote || (segment.comments || []).length) file.reviewItems += 1;
    if (segmentHasAiDraft(segment)) file.aiDrafts += 1;
    file.aiSuggestions += aiSuggestionCount;
    if (riskLevel) file.aiReviewRisk += 1;
    if (riskLevel === "high" || riskLevel === "critical") file.highAiRisk += 1;

    leverage[leverageBand(bestTmScore(segment, tmEntries))] += 1;
  });

  totals.files = files.size;
  const confirmedPercent = totals.segments ? Math.round((totals.confirmed / totals.segments) * 100) : 0;
  return {
    projectId: project?.id || "",
    generatedAt: new Date().toISOString(),
    totals: { ...totals, confirmedPercent },
    ai,
    leverage,
    files: Array.from(files.values())
  };
}

window.CatHan = window.CatHan || {};
window.CatHan.analysis = { analyzeProject, leverageBand };
})();
