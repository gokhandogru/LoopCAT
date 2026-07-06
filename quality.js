(() => {
const QUALITY_STANDARDS = new Set(["student-review", "freelance-delivery", "agency-delivery", "regulated"]);
const REVIEW_DEPTHS = new Set(["targeted", "full", "lqa"]);
const RISK_TOLERANCES = new Set(["balanced", "strict", "regulated"]);
const TERMINOLOGY_STRICTNESS = new Set(["standard", "strict"]);
const AI_DISCLOSURE_MODES = new Set(["not-used", "local-only", "hosted-disclosed", "client-approved"]);
const QUALITY_CATEGORIES = new Set(["accuracy", "terminology", "fluency", "style", "locale", "formatting", "compliance", "review"]);
const QUALITY_CATEGORY_LABELS = {
  accuracy: "Accuracy",
  terminology: "Terminology",
  fluency: "Fluency",
  style: "Style",
  locale: "Locale",
  formatting: "Formatting",
  compliance: "Compliance",
  review: "Review"
};
const AI_RISK_ORDER = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
const AI_RISK_POINTS = { low: 10, medium: 22, high: 38, critical: 52 };

function cleanText(value, fallback = "") {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean || fallback;
}

function selectValue(value, allowed, fallback) {
  const clean = cleanText(value);
  return allowed.has(clean) ? clean : fallback;
}

function qualityCategory(value, fallback = "review") {
  return selectValue(String(value || "").toLowerCase(), QUALITY_CATEGORIES, fallback);
}

function qualityCategoryLabel(value) {
  const category = qualityCategory(value);
  return QUALITY_CATEGORY_LABELS[category] || category;
}

function defaultQualityProfile(profile = {}) {
  const source = profile && typeof profile === "object" ? profile : {};
  return {
    standard: selectValue(source.standard, QUALITY_STANDARDS, "freelance-delivery"),
    reviewDepth: selectValue(source.reviewDepth, REVIEW_DEPTHS, "targeted"),
    riskTolerance: selectValue(source.riskTolerance, RISK_TOLERANCES, "balanced"),
    terminologyStrictness: selectValue(source.terminologyStrictness, TERMINOLOGY_STRICTNESS, "standard"),
    aiDisclosure: selectValue(source.aiDisclosure, AI_DISCLOSURE_MODES, "local-only"),
    audience: cleanText(source.audience).slice(0, 120),
    tone: cleanText(source.tone, "Neutral").slice(0, 80)
  };
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function countBy(items, keyFn) {
  return (items || []).reduce((counts, item) => {
    const key = keyFn(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function riskLevelForScore(score) {
  const value = Number(score) || 0;
  if (value >= 76) return "critical";
  if (value >= 56) return "high";
  if (value >= 31) return "medium";
  if (value > 0) return "low";
  return "clear";
}

function clampScore(score) {
  return Math.min(100, Math.max(0, Math.round(Number(score) || 0)));
}

function segmentHasAiDraft(segment = {}) {
  return Boolean(segment.aiPretranslation?.provider || segment.aiPretranslation?.model);
}

function aiReviewRiskLevel(value) {
  const level = cleanText(value?.level).toLowerCase();
  return AI_RISK_ORDER[level] ? level : "";
}

function segmentAiReviewRiskLevel(segment = {}) {
  const comments = Array.isArray(segment.comments) ? segment.comments : [];
  const levels = [segment.aiReviewRisk, ...comments.map((comment) => comment?.aiReviewRisk)]
    .map(aiReviewRiskLevel)
    .filter(Boolean);
  return levels.reduce((highest, level) => (
    AI_RISK_ORDER[level] > (AI_RISK_ORDER[highest] || 0) ? level : highest
  ), "");
}

function bestTmScore(segment, tmEntries = []) {
  if (!segment?.source || !tmEntries?.length) return 0;
  const similarity = window.CatHan?.tm?.similarity || (() => 0);
  return tmEntries.reduce((best, entry) => Math.max(best, similarity(segment.source, entry.source)), 0);
}

function qaChecksBySegment(qaChecks = []) {
  const map = new Map();
  qaChecks.forEach((check) => {
    const segmentId = check?.segmentId || "";
    if (!segmentId) return;
    if (!map.has(segmentId)) map.set(segmentId, []);
    map.get(segmentId).push(check);
  });
  return map;
}

function qaWeight(check = {}, profile = defaultQualityProfile()) {
  const severityWeight = { error: 34, warning: 18, info: 7 }[check.severity] || 10;
  const typeWeight = {
    empty: 20,
    tag: 20,
    "forbidden-term": 22,
    number: 16,
    term: profile.terminologyStrictness === "strict" ? 16 : 8,
    copy: 8,
    punctuation: 3
  }[check.type] || 0;
  return severityWeight + typeWeight;
}

function qaCategory(check = {}) {
  return {
    empty: "accuracy",
    tag: "formatting",
    "forbidden-term": "terminology",
    number: "accuracy",
    term: "terminology",
    copy: "accuracy",
    punctuation: "fluency"
  }[check.type] || "review";
}

function categoryScoresForReasons(reasons = []) {
  return reasons.reduce((scores, reason) => {
    const category = qualityCategory(reason?.category);
    scores[category] = (scores[category] || 0) + (Number(reason?.score) || 0);
    return scores;
  }, {});
}

function topCategoryForReasons(reasons = []) {
  const entries = Object.entries(categoryScoresForReasons(reasons));
  if (!entries.length) return "review";
  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function addReason(reasons, score, type, label, detail = "", category = "review") {
  if (!score) return 0;
  reasons.push({
    type,
    score,
    category: qualityCategory(category),
    label,
    detail
  });
  return score;
}

function scoreSegment(segment = {}, index = 0, context = {}) {
  const profile = defaultQualityProfile(context.profile);
  const qaForSegment = context.qaBySegment?.get(segment.id) || [];
  const reasons = [];
  let score = 0;

  qaForSegment.forEach((check) => {
    score += addReason(
      reasons,
      qaWeight(check, profile),
      `qa-${check.type || "issue"}`,
      check.message || `QA ${check.type || "issue"}`,
      check.fixHint || "",
      qaCategory(check)
    );
  });

  if (!String(segment.target || "").trim()) {
    score += addReason(reasons, 32, "untranslated", "Target is still empty.", "", "accuracy");
  }
  if (segment.status !== "confirmed" && String(segment.target || "").trim()) {
    score += addReason(reasons, profile.riskTolerance === "balanced" ? 6 : 12, "unconfirmed", "Target is not confirmed.", "", "review");
  }
  if (segment.reviewState === "needs-review") {
    score += addReason(reasons, 24, "needs-review", "Marked needs review.", "", "review");
  }
  if (segment.reviewState === "blocked") {
    score += addReason(reasons, 42, "blocked", "Marked blocked.", "", "compliance");
  }
  const comments = Array.isArray(segment.comments) ? segment.comments : [];
  const commentCount = comments.length + (segment.reviewNote ? 1 : 0);
  if (commentCount) {
    score += addReason(reasons, Math.min(18, 6 + commentCount * 3), "comments", `${commentCount} review note${commentCount === 1 ? "" : "s"}.`, "", "review");
  }
  comments
    .filter((comment) => comment?.qualityDecision?.category)
    .forEach((comment) => {
      const category = qualityCategory(comment.qualityDecision.category);
      const severity = cleanText(comment.qualityDecision.severity).toLowerCase();
      const severityScore = { low: 4, medium: 9, high: 16, critical: 26 }[severity] || 8;
      const severityLabel = severity ? `${severity[0].toUpperCase()}${severity.slice(1)} ` : "";
      score += addReason(
        reasons,
        severityScore,
        "quality-decision",
        `${qualityCategoryLabel(category)} ${severityLabel}decision recorded.`,
        "",
        category
      );
    });

  const aiRisk = segmentAiReviewRiskLevel(segment);
  if (aiRisk) {
    score += addReason(reasons, AI_RISK_POINTS[aiRisk], "ai-risk", `${aiRisk[0].toUpperCase()}${aiRisk.slice(1)} AI review risk.`, "", "review");
  }
  if (segmentHasAiDraft(segment)) {
    score += addReason(reasons, segment.status === "confirmed" ? 4 : 12, "ai-draft", "AI-initiated draft needs human accountability.", "", "review");
  }
  const aiSuggestionCount = Array.isArray(segment.aiSuggestions) ? segment.aiSuggestions.length : 0;
  if (aiSuggestionCount) {
    score += addReason(reasons, Math.min(16, aiSuggestionCount * 5), "ai-suggestions", `${aiSuggestionCount} unapplied AI suggestion${aiSuggestionCount === 1 ? "" : "s"}.`, "", "review");
  }

  const historyCount = Array.isArray(segment.targetHistory) ? segment.targetHistory.length : 0;
  if (historyCount >= 4) {
    score += addReason(reasons, Math.min(18, historyCount * 2), "revision-density", `${historyCount} target revisions.`, "", "fluency");
  }

  const tmScore = bestTmScore(segment, context.tmEntries || []);
  if (tmScore > 0 && tmScore < 75 && segment.status !== "confirmed") {
    score += addReason(reasons, 6, "low-tm-leverage", `Best TM match is ${Math.round(tmScore)}%.`, "", "accuracy");
  }

  if (profile.reviewDepth === "full" && segment.status !== "confirmed") {
    score += addReason(reasons, 4, "full-review", "Full review profile includes open drafts.", "", "review");
  }
  if (profile.reviewDepth === "lqa" && (segment.status !== "confirmed" || commentCount || aiRisk)) {
    score += addReason(reasons, 8, "lqa-review", "LQA profile requires evidence-backed review.", "", "review");
  }
  if (profile.riskTolerance === "regulated" && score > 0) {
    score += addReason(reasons, 10, "regulated-profile", "Regulated profile raises unresolved-risk priority.", "", "compliance");
  } else if (profile.riskTolerance === "strict" && score > 0) {
    score += addReason(reasons, 5, "strict-profile", "Strict profile raises unresolved-risk priority.", "", "review");
  }

  const finalScore = clampScore(score);
  const sortedReasons = reasons.sort((a, b) => b.score - a.score);
  const categoryScores = categoryScoresForReasons(sortedReasons);
  const categoryCounts = countBy(sortedReasons, (reason) => reason.category);
  return {
    segmentId: segment.id || "",
    documentId: segment.documentId || "",
    documentName: segment.documentName || "Document",
    index,
    label: String(index + 1),
    status: segment.status || "",
    reviewState: segment.reviewState || "",
    sourceWords: wordCount(segment.source),
    score: finalScore,
    level: riskLevelForScore(finalScore),
    category: topCategoryForReasons(sortedReasons),
    categoryCounts,
    categoryScores,
    reasons: sortedReasons.slice(0, 8)
  };
}

function buildRiskQueue({ project = null, segments = [], qaChecks = [], tmEntries = [], profile = null } = {}) {
  const activeProfile = defaultQualityProfile(profile || project?.qualityProfile);
  const qaBySegment = qaChecksBySegment(qaChecks);
  const items = (Array.isArray(segments) ? segments : [])
    .map((segment, index) => scoreSegment(segment, index, { profile: activeProfile, qaBySegment, tmEntries }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const byLevel = { critical: 0, high: 0, medium: 0, low: 0, clear: 0 };
  items.forEach((item) => {
    byLevel[item.level] = (byLevel[item.level] || 0) + 1;
  });
  const byCategory = {};
  const categoryScores = {};
  items.forEach((item) => {
    const itemCategoryCounts = Object.keys(item.categoryCounts || {}).length
      ? item.categoryCounts
      : { [qualityCategory(item.category)]: 1 };
    Object.entries(itemCategoryCounts).forEach(([signalCategory, count]) => {
      const cleanCategory = qualityCategory(signalCategory);
      byCategory[cleanCategory] = (byCategory[cleanCategory] || 0) + (Number(count) || 0);
    });
    Object.entries(item.categoryScores || {}).forEach(([signalCategory, signalScore]) => {
      const cleanCategory = qualityCategory(signalCategory);
      categoryScores[cleanCategory] = (categoryScores[cleanCategory] || 0) + (Number(signalScore) || 0);
    });
  });
  const highRiskCount = byLevel.critical + byLevel.high;
  const averageScore = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
    : 0;
  return {
    generatedAt: new Date().toISOString(),
    projectId: project?.id || "",
    profile: activeProfile,
    totalSegments: Array.isArray(segments) ? segments.length : 0,
    totalRiskItems: items.length,
    highRiskCount,
    averageScore,
    byLevel,
    byCategory,
    categoryScores,
    items
  };
}

function qualityConfidenceScore({ riskQueue, qaChecks = [], totals = {}, validation = null } = {}) {
  const totalSegments = Number(totals.segments || riskQueue?.totalSegments || 0);
  if (!totalSegments) return 0;
  const highRiskRatio = Number(riskQueue?.highRiskCount || 0) / totalSegments;
  const qaErrorRatio = (qaChecks || []).filter((check) => check.severity === "error").length / totalSegments;
  const untranslatedRatio = Number(totals.untranslated || 0) / totalSegments;
  const validationPenalty = (validation?.errors?.length || 0) * 12 + (validation?.risky?.length || 0) * 6;
  const riskPenalty = (riskQueue?.averageScore || 0) * 0.55 + highRiskRatio * 34 + qaErrorRatio * 26 + untranslatedRatio * 28 + validationPenalty;
  return clampScore(100 - riskPenalty);
}

function estimatePostEditingEffort({ riskQueue, qaChecks = [], totals = {} } = {}) {
  const totalSegments = Number(totals.segments || riskQueue?.totalSegments || 0);
  if (!totalSegments) return { label: "No segments", score: 0, drivers: ["No segment data."] };
  const qaDensity = (qaChecks || []).length / totalSegments;
  const highRiskRatio = Number(riskQueue?.highRiskCount || 0) / totalSegments;
  const untranslatedRatio = Number(totals.untranslated || 0) / totalSegments;
  const unconfirmedRatio = Math.max(0, totalSegments - Number(totals.confirmed || 0)) / totalSegments;
  const score = clampScore((riskQueue?.averageScore || 0) * 0.6 + qaDensity * 10 + highRiskRatio * 36 + untranslatedRatio * 32 + unconfirmedRatio * 12);
  const label = score >= 67 ? "Heavy post-editing" : score >= 34 ? "Moderate post-editing" : "Light post-editing";
  const drivers = [];
  if (riskQueue?.highRiskCount) drivers.push(`${riskQueue.highRiskCount} high or critical risk segment${riskQueue.highRiskCount === 1 ? "" : "s"}.`);
  if (qaChecks.length) drivers.push(`${qaChecks.length} QA issue${qaChecks.length === 1 ? "" : "s"}.`);
  if (totals.untranslated) drivers.push(`${totals.untranslated} untranslated segment${totals.untranslated === 1 ? "" : "s"}.`);
  if (!drivers.length) drivers.push("No major unresolved quality signals.");
  return { label, score, drivers };
}

function buildQualityPassportData({
  project = null,
  segments = [],
  qaChecks = [],
  validation = null,
  analysis = null,
  terms = [],
  activityEvents = [],
  tmEntries = [],
  tmEntryCount = 0,
  termCount = 0,
  profile = null
} = {}) {
  const activeProfile = defaultQualityProfile(profile || project?.qualityProfile);
  const riskQueue = buildRiskQueue({ project, segments, qaChecks, tmEntries, profile: activeProfile });
  const totals = analysis?.totals || {
    segments: segments.length,
    words: segments.reduce((sum, segment) => sum + wordCount(segment.source), 0),
    confirmed: segments.filter((segment) => segment.status === "confirmed").length,
    untranslated: segments.filter((segment) => !String(segment.target || "").trim()).length,
    comments: segments.reduce((sum, segment) => sum + (segment.comments?.length || 0) + (segment.reviewNote ? 1 : 0), 0),
    aiDrafts: segments.filter(segmentHasAiDraft).length
  };
  const reviewByState = countBy(segments.filter((segment) => segment.reviewState), (segment) => segment.reviewState);
  const aiProviderCounts = countBy(activityEvents.filter((event) => /^ai(?:$|-)/i.test(event.type || "")), (event) => (
    event.detail?.provider || event.detail?.configuredProvider || event.detail?.model || "AI"
  ));
  const confidenceScore = qualityConfidenceScore({ riskQueue, qaChecks, totals, validation });
  const postEditingEffort = estimatePostEditingEffort({ riskQueue, qaChecks, totals });
  return {
    generatedAt: new Date().toISOString(),
    projectId: project?.id || "",
    profile: activeProfile,
    totals,
    analysis,
    validation,
    qaChecks,
    qaBySeverity: countBy(qaChecks, (check) => check.severity),
    qaByType: countBy(qaChecks, (check) => check.type),
    reviewByState,
    riskQueue,
    confidenceScore,
    postEditingEffort,
    tmEntryCount,
    termCount: termCount || terms.length,
    forbiddenTermCount: (terms || []).filter((term) => term.isForbidden).length,
    aiProviderCounts,
    ai: analysis?.ai || {}
  };
}

window.CatHan = window.CatHan || {};
window.CatHan.quality = {
  buildQualityPassportData,
  buildRiskQueue,
  defaultQualityProfile,
  estimatePostEditingEffort,
  qualityCategory,
  qualityCategoryLabel,
  qualityConfidenceScore,
  riskLevelForScore,
  scoreSegment
};
})();
