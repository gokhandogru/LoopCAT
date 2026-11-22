import { linguistics } from "../linguistics/core.js";

/**
 * Owns cached source word counts and derived project/editor progress policy.
 * Segment mutation, project-summary persistence, and DOM presentation remain
 * behind injected boundaries.
 *
 * @param {{
 *   getSegments: () => any[],
 *   getProjectId: () => string,
 *   getSourceLanguage?: () => string,
 *   getCachedSummary: () => any,
 *   replaceCachedSummary: (summary: any) => any
 * }} options
 */
export function createSegmentProgressService(options) {
  const getSegments = options?.getSegments;
  const getProjectId = options?.getProjectId;
  const getCachedSummary = options?.getCachedSummary;
  const replaceCachedSummary = options?.replaceCachedSummary;
  if (
    typeof getSegments !== "function" ||
    typeof getProjectId !== "function" ||
    typeof getCachedSummary !== "function" ||
    typeof replaceCachedSummary !== "function"
  ) {
    throw new TypeError("SegmentProgressService requires segment, project, and progress-summary boundaries.");
  }

  const sourceWordCounts = new WeakMap();

  function wordCount(text) {
    return linguistics.sourceMetrics(typeof text === "string" ? text : text?.trim?.() || "").words;
  }

  function sourceWordMetrics(segment) {
    if (!segment || typeof segment !== "object") return { words: 0, countingComplete: false };
    const source = segment.source;
    const cached = sourceWordCounts.get(segment);
    const language = options.getSourceLanguage?.() || segment.sourceLang || "en";
    const descriptor = JSON.stringify(linguistics.descriptorFor(segment));
    if (cached?.source === source && cached.language === language && cached.descriptor === descriptor)
      return cached.metrics;
    const metrics = linguistics.metricsForSegment(segment, language);
    sourceWordCounts.set(segment, { source, metrics, language, descriptor });
    return metrics;
  }

  const sourceWordCount = (segment) => sourceWordMetrics(segment).words;

  function projectProgress(segments) {
    const total = segments.length;
    let confirmed = 0;
    let draft = 0;
    let words = 0;
    let countingComplete = true;
    for (const segment of segments) {
      if (segment.status === "confirmed") confirmed += 1;
      if (segment.status === "draft") draft += 1;
      const metrics = sourceWordMetrics(segment);
      words += metrics.words;
      countingComplete &&= metrics.countingComplete;
    }
    const percent = total ? Math.round((confirmed / total) * 100) : 0;
    return { total, confirmed, draft, words, percent, ...(countingComplete ? {} : { countingComplete: false }) };
  }

  function activeSummary() {
    const { total, confirmed, words, countingComplete } = projectProgress(getSegments());
    return {
      projectId: getProjectId() || "",
      total,
      confirmed,
      words,
      ...(countingComplete === false ? { countingComplete } : {})
    };
  }

  function refresh(options = {}) {
    const previousStatus = options.previousStatus;
    const nextStatus = options.nextStatus;
    const cached = getCachedSummary();
    const canApplyStatusDelta =
      cached &&
      cached.projectId === (getProjectId() || "") &&
      cached.total === getSegments().length &&
      previousStatus !== undefined &&
      nextStatus !== undefined;
    let summary;
    if (canApplyStatusDelta) {
      let confirmed = cached.confirmed;
      if (previousStatus === "confirmed" && nextStatus !== "confirmed") confirmed -= 1;
      if (previousStatus !== "confirmed" && nextStatus === "confirmed") confirmed += 1;
      summary = { ...cached, confirmed: Math.max(0, Math.min(cached.total, confirmed)) };
    } else {
      summary = activeSummary();
    }
    replaceCachedSummary(summary);
    return summary;
  }

  return Object.freeze({ wordCount, sourceWordCount, sourceWordMetrics, projectProgress, activeSummary, refresh });
}
