/**
 * Owns shared optional AI termbase/TM context policy, lookup parameters,
 * direct-OpenAI explicit-settings composition, failure containment, and
 * ordered nearby same-document segment selection.
 * Repositories, project/resource records, settings normalization, segment
 * storage, and logging remain injected.
 *
 * @param {{
 *   project: { get: () => any, normalizeAiSettings: (settings: any) => any },
 *   resources: { getTermBaseNames: () => string[], getTmNames: () => string[] },
 *   lookup: { findTerms: (query: object) => Promise<any[]>, findTmMatches: (query: object) => Promise<any[]> },
 *   settings: { read: () => any },
 *   segments: { getAll: () => any[] },
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createAiSegmentContextService(options) {
  const project = options?.project;
  const resources = options?.resources;
  const lookup = options?.lookup;
  const settingsBoundary = options?.settings;
  const segmentsBoundary = options?.segments;
  if (
    typeof project?.get !== "function" ||
    typeof project?.normalizeAiSettings !== "function" ||
    typeof resources?.getTermBaseNames !== "function" ||
    typeof resources?.getTmNames !== "function"
  ) {
    throw new TypeError("AiSegmentContextService requires project and resource boundaries.");
  }
  if (
    typeof lookup?.findTerms !== "function" ||
    typeof lookup?.findTmMatches !== "function" ||
    typeof settingsBoundary?.read !== "function" ||
    typeof segmentsBoundary?.getAll !== "function"
  ) {
    throw new TypeError("AiSegmentContextService requires lookup, settings, and segment boundaries.");
  }

  const logger = options.logger || console;

  async function glossaryTermsForSegment(segment) {
    const selectedProject = project.get();
    if (!selectedProject || !segment) return [];
    if (project.normalizeAiSettings(selectedProject.aiSettings).useTermbaseContext === false) return [];
    try {
      return await lookup.findTerms({
        source: segment.source,
        sourceLang: selectedProject.sourceLang,
        targetLang: selectedProject.targetLang,
        termBaseNames: resources.getTermBaseNames()
      });
    } catch (error) {
      logger.warn?.("Local AI pretranslation termbase lookup failed.", error);
      return [];
    }
  }

  async function tmMatchesForSegment(segment) {
    const selectedProject = project.get();
    if (!selectedProject || !segment) return [];
    if (project.normalizeAiSettings(selectedProject.aiSettings).useTmContext === false) return [];
    try {
      return await lookup.findTmMatches({
        source: segment.source,
        sourceLang: selectedProject.sourceLang,
        targetLang: selectedProject.targetLang,
        tmNames: resources.getTmNames(),
        limit: 3
      });
    } catch (error) {
      logger.warn?.("Local AI pretranslation TM lookup failed.", error);
      return [];
    }
  }

  async function resourceContextForSegment(segment, settings) {
    const selectedProject = project.get();
    return await Promise.all([
      settings.useTmContext
        ? lookup.findTmMatches({
            source: segment.source,
            sourceLang: selectedProject.sourceLang,
            targetLang: selectedProject.targetLang,
            tmNames: resources.getTmNames()
          })
        : [],
      settings.useTermbaseContext
        ? lookup.findTerms({
            source: segment.source,
            sourceLang: selectedProject.sourceLang,
            targetLang: selectedProject.targetLang,
            termBaseNames: resources.getTermBaseNames()
          })
        : []
    ]);
  }

  function surroundingSegmentsForSegment(segment, options = {}) {
    if (!project.get() || !segment) return [];
    const settings = options.settings || settingsBoundary.read();
    if (settings.includeNearbyContext === false) return [];
    const segments =
      Array.isArray(options.segments) && options.segments.length ? options.segments : segmentsBoundary.getAll();
    const segmentIndex = segments.findIndex((item) => item?.id === segment.id);
    if (segmentIndex < 0) return [];
    const sameDocument = (item) => {
      if (!segment.documentId) return true;
      return item?.documentId === segment.documentId;
    };
    const before = [];
    for (let index = segmentIndex - 1; index >= 0 && before.length < 2; index -= 1) {
      const item = segments[index];
      if (!sameDocument(item) || !String(item?.source || "").trim()) continue;
      before.unshift({
        relation: `Previous segment ${before.length + 1}`,
        source: item.source,
        target: item.target || ""
      });
    }
    const after = [];
    for (let index = segmentIndex + 1; index < segments.length && after.length < 2; index += 1) {
      const item = segments[index];
      if (!sameDocument(item) || !String(item?.source || "").trim()) continue;
      after.push({
        relation: `Next segment ${after.length + 1}`,
        source: item.source,
        target: item.target || ""
      });
    }
    return [...before, ...after];
  }

  return Object.freeze({
    glossaryTermsForSegment,
    resourceContextForSegment,
    surroundingSegmentsForSegment,
    tmMatchesForSegment
  });
}
