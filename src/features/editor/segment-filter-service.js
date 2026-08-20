/**
 * Owns segment filter predicates and revision-keyed visible-index caching.
 * Filter controls, navigation mutation, segment mutation, and rendering remain
 * behind injected boundaries.
 *
 * @param {{
 *   getSegments: () => any[],
 *   getFilters: () => any,
 *   getDocumentId: () => string,
 *   normalizeCase: (value: unknown) => string,
 *   provenance: {
 *     hasAiDraft: (segment: any) => boolean,
 *     hasAiSuggestions: (segment: any) => boolean,
 *     aiRiskLevel: (segment: any) => string
 *   }
 * }} options
 */
export function createSegmentFilterService(options) {
  const getSegments = options?.getSegments;
  const getFilters = options?.getFilters;
  const getDocumentId = options?.getDocumentId;
  const normalizeCase = options?.normalizeCase;
  const provenance = options?.provenance;
  if (
    typeof getSegments !== "function" ||
    typeof getFilters !== "function" ||
    typeof getDocumentId !== "function" ||
    typeof normalizeCase !== "function" ||
    typeof provenance?.hasAiDraft !== "function" ||
    typeof provenance?.hasAiSuggestions !== "function" ||
    typeof provenance?.aiRiskLevel !== "function"
  ) {
    throw new TypeError(
      "SegmentFilterService requires segment, filter, document, case-normalization, and provenance boundaries."
    );
  }

  let revision = 0;
  let cache = { key: "", indexes: [], positions: new Map() };

  function invalidate() {
    revision += 1;
    cache = { key: "", indexes: [], positions: new Map() };
  }

  function isOpen(segment) {
    return segment.status !== "confirmed";
  }

  function passesAiFilter(segment = {}) {
    const filter = getFilters().aiState;
    if (!filter) return true;
    if (filter === "ai-draft") return provenance.hasAiDraft(segment);
    if (filter === "ai-suggestions") return provenance.hasAiSuggestions(segment);
    if (filter === "ai-review-risk") return Boolean(provenance.aiRiskLevel(segment));
    if (filter === "high-ai-risk") return ["high", "critical"].includes(provenance.aiRiskLevel(segment));
    return true;
  }

  function queryMatcher() {
    const filters = getFilters();
    const query = filters.query;
    if (!query) return () => true;
    const scope = filters.scope;
    if (filters.regex) {
      try {
        const pattern = new RegExp(query, filters.caseSensitive ? "" : "i");
        return (segment) => {
          const source = segment.source || "";
          const target = segment.target || "";
          const haystack = scope === "source" ? source : scope === "target" ? target : `${source} ${target}`;
          return pattern.test(haystack);
        };
      } catch {
        return () => false;
      }
    }
    if (filters.caseSensitive) {
      return (segment) => {
        const source = segment.source || "";
        const target = segment.target || "";
        const haystack = scope === "source" ? source : scope === "target" ? target : `${source} ${target}`;
        return haystack.includes(query);
      };
    }
    const foldedQuery = normalizeCase(query);
    return (segment) => {
      const source = segment.source || "";
      const target = segment.target || "";
      const haystack = scope === "source" ? source : scope === "target" ? target : `${source} ${target}`;
      return normalizeCase(haystack).includes(foldedQuery);
    };
  }

  function matches(segment, queryMatches = queryMatcher()) {
    const filters = getFilters();
    const status = filters.status;
    if (getDocumentId() && segment.documentId !== getDocumentId()) return false;
    if (filters.reviewState) {
      const comments = (segment.comments || []).length + ((segment.reviewNote || "").trim() ? 1 : 0);
      if (filters.reviewState === "comments") {
        if (!comments) return false;
      } else if (segment.reviewState !== filters.reviewState) {
        return false;
      }
    }
    if (!passesAiFilter(segment)) return false;
    const statusMatch = status === "all" || (status === "open" && isOpen(segment)) || segment.status === status;
    if (!statusMatch) return false;
    return queryMatches(segment);
  }

  function allIndexes() {
    return getSegments().map((_, index) => index);
  }

  function cacheKey() {
    const filters = getFilters();
    return [
      revision,
      getDocumentId(),
      filters.query,
      filters.scope,
      filters.regex ? "regex" : "plain",
      filters.caseSensitive ? "case" : "fold",
      filters.status,
      filters.reviewState,
      filters.aiState
    ].join("\u001f");
  }

  function visibleIndexes() {
    const key = cacheKey();
    if (cache.key === key) return cache.indexes;
    const indexes = [];
    const queryMatches = queryMatcher();
    getSegments().forEach((segment, index) => {
      if (matches(segment, queryMatches)) indexes.push(index);
    });
    const positions = new Map(indexes.map((segmentIndex, position) => [segmentIndex, position]));
    cache = { key, indexes, positions };
    return indexes;
  }

  function visiblePosition(index) {
    const key = cacheKey();
    if (cache.key !== key) visibleIndexes();
    return cache.positions.get(index) ?? -1;
  }

  function firstVisible() {
    return visibleIndexes()[0] ?? -1;
  }

  return Object.freeze({
    invalidate,
    isOpen,
    passesAiFilter,
    queryMatcher,
    matches,
    allIndexes,
    visibleIndexes,
    visiblePosition,
    firstVisible
  });
}
