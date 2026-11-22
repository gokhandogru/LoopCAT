/**
 * Owns project-document progress aggregation. Document selection, rendering,
 * persistence, and source word-count policy remain behind injected boundaries.
 *
 * @param {{
 *   getDocuments: () => any[],
 *   getSegments: () => any[],
 *   sourceWordCount: (segment: any) => number,
 *   sourceWordMetrics?: (segment: any) => {words: number, countingComplete: boolean}
 * }} options
 */
export function createProjectDocumentStatisticsService(options) {
  const getDocuments = options?.getDocuments;
  const getSegments = options?.getSegments;
  const sourceWordCount = options?.sourceWordCount;
  if (
    typeof getDocuments !== "function" ||
    typeof getSegments !== "function" ||
    typeof sourceWordCount !== "function"
  ) {
    throw new TypeError(
      "ProjectDocumentStatisticsService requires document, segment, and source-word-count boundaries."
    );
  }

  function empty() {
    return { segments: 0, confirmed: 0, draft: 0, empty: 0, words: 0, percent: 0 };
  }

  function add(stats, segment) {
    stats.segments += 1;
    if (segment.status === "confirmed") stats.confirmed += 1;
    if (segment.status === "draft") stats.draft += 1;
    if (segment.status === "empty") stats.empty += 1;
    const metrics = options.sourceWordMetrics?.(segment);
    stats.words += metrics?.words ?? sourceWordCount(segment);
    if (metrics?.countingComplete === false) stats.countingComplete = false;
    return stats;
  }

  function finalize(stats) {
    stats.percent = stats.segments ? Math.round((stats.confirmed / stats.segments) * 100) : 0;
    return stats;
  }

  function byDocument(documents = getDocuments()) {
    const map = new Map(documents.map((documentInfo) => [documentInfo.id, empty()]));
    getSegments().forEach((segment) => {
      const id = segment.documentId || "default-document";
      if (!map.has(id)) map.set(id, empty());
      add(map.get(id), segment);
    });
    map.forEach(finalize);
    return map;
  }

  function aggregate(statsById) {
    const total = empty();
    statsById.forEach((stats) => {
      total.segments += stats.segments;
      total.confirmed += stats.confirmed;
      total.draft += stats.draft;
      total.empty += stats.empty;
      total.words += stats.words;
      if (stats.countingComplete === false) total.countingComplete = false;
    });
    return finalize(total);
  }

  function forDocument(documentId) {
    const stats = empty();
    getSegments().forEach((segment) => {
      if (segment.documentId === documentId) add(stats, segment);
    });
    return finalize(stats);
  }

  return Object.freeze({ empty, byDocument, aggregate, forDocument });
}
