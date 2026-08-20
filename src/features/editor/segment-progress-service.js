/**
 * Owns cached source word counts and derived project/editor progress policy.
 * Segment mutation, project-summary persistence, and DOM presentation remain
 * behind injected boundaries.
 *
 * @param {{
 *   getSegments: () => any[],
 *   getProjectId: () => string,
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
    return (text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function sourceWordCount(segment) {
    if (!segment || typeof segment !== "object") return 0;
    const source = segment.source || "";
    const cached = sourceWordCounts.get(segment);
    if (cached?.source === source) return cached.count;
    const count = wordCount(source);
    sourceWordCounts.set(segment, { source, count });
    return count;
  }

  function projectProgress(segments) {
    const total = segments.length;
    let confirmed = 0;
    let draft = 0;
    let words = 0;
    for (const segment of segments) {
      if (segment.status === "confirmed") confirmed += 1;
      if (segment.status === "draft") draft += 1;
      words += sourceWordCount(segment);
    }
    const percent = total ? Math.round((confirmed / total) * 100) : 0;
    return { total, confirmed, draft, words, percent };
  }

  function activeSummary() {
    const total = getSegments().length;
    let confirmed = 0;
    let words = 0;
    for (const segment of getSegments()) {
      if (segment.status === "confirmed") confirmed += 1;
      words += sourceWordCount(segment);
    }
    return { projectId: getProjectId() || "", total, confirmed, words };
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

  return Object.freeze({ wordCount, sourceWordCount, projectProgress, activeSummary, refresh });
}
