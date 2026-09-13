import { evaluateRegex } from "./regex-worker-client.js";

/**
 * Owns segment filter predicates and revision-keyed visible-index caching.
 * Filter controls, navigation mutation, segment mutation, and rendering remain
 * behind injected boundaries.
 *
 * @param {{
 *   getSegments: () => any[],
 *   onResults?: () => void,
 *   onError?: (error: Error) => void,
 *   evaluateRegex?: typeof evaluateRegex,
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
  let regexResult = { key: "", ids: new Set() };
  let regexRequestKey = "";
  let regexAbort;
  let regexTimer;

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
      const key = cacheKey();
      if (regexResult.key === key) return (segment) => regexResult.ids.has(segment.id);
      if (regexRequestKey !== key) {
        regexRequestKey = key;
        regexAbort?.abort();
        clearTimeout(regexTimer);
        regexAbort = new AbortController();
        const signal = regexAbort.signal;
        regexTimer = setTimeout(async () => {
          try {
            const records = getSegments().map((segment) => ({
              id: segment.id,
              text:
                scope === "source"
                  ? segment.source || ""
                  : scope === "target"
                    ? segment.target || ""
                    : `${segment.source || ""} ${segment.target || ""}`
            }));
            const result = await (options.evaluateRegex || evaluateRegex)(
              { type: "query", pattern: query, caseSensitive: filters.caseSensitive, records },
              { signal }
            );
            if (signal.aborted || key !== cacheKey()) return;
            regexResult = { key, ids: new Set(result.filter((item) => item.match).map((item) => item.id)) };
            cache.key = "";
            options.onResults?.();
          } catch (error) {
            if (!signal.aborted && key === cacheKey()) options.onError?.(error);
          }
        }, 200);
      }
      return () => false;
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
