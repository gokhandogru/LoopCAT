/**
 * Owns shared AI terminology/pretranslation scope selection, stable-ID
 * options, and bounded project-brief samples. Project/session records,
 * filter computation, form settings, and consumers remain injected.
 *
 * @param {{
 *   project: { get: () => any },
 *   settings: { read: () => any },
 *   segments: { getAll: () => any[], getDocument: () => any[], getActive: () => any },
 *   filters: { getVisibleIndexes: () => number[] }
 * }} options
 */
export function createAiScopeSelectionService(options) {
  const project = options?.project;
  const settingsBoundary = options?.settings;
  const segments = options?.segments;
  const filters = options?.filters;
  if (
    typeof project?.get !== "function" ||
    typeof settingsBoundary?.read !== "function" ||
    typeof segments?.getAll !== "function" ||
    typeof segments?.getDocument !== "function" ||
    typeof segments?.getActive !== "function" ||
    typeof filters?.getVisibleIndexes !== "function"
  ) {
    throw new TypeError("AiScopeSelectionService requires project, settings, segment, and filter boundaries.");
  }

  function documentSegments() {
    const scoped = segments.getDocument();
    const activeDocumentId = segments.getActive()?.documentId;
    if (activeDocumentId) return scoped.filter((segment) => segment.documentId === activeDocumentId);
    // An ambiguous all-files view must never expand a document-only operation.
    return new Set(scoped.map((segment) => segment.documentId)).size <= 1 ? scoped : [];
  }

  function terminologySegments(settings = settingsBoundary.read()) {
    if (!project.get()) return [];
    if (settings.mode === "selected") return segments.getActive() ? [segments.getActive()] : [];
    if (settings.mode === "visible") {
      return filters
        .getVisibleIndexes()
        .map((index) => segments.getAll()[index])
        .filter(Boolean);
    }
    if (settings.mode === "project") return segments.getAll();
    if (settings.mode === "untranslated") {
      return documentSegments().filter((segment) => !String(segment.target || "").trim());
    }
    if (settings.mode === "document") return documentSegments();
    return segments.getDocument();
  }

  function projectBriefSampleSegments(limit = 6) {
    const scoped = segments.getDocument();
    const source = scoped.length ? scoped : segments.getAll();
    const picked = [];
    for (const segment of source) {
      if (!String(segment.source || "").trim()) continue;
      picked.push({
        source: segment.source,
        target: segment.target || ""
      });
      if (picked.length >= limit) break;
    }
    return picked;
  }

  function pretranslationSegments(settings) {
    if (settings.mode === "project" || settings.mode === "visible" || settings.mode === "selected") {
      return segments.getAll();
    }
    if (settings.mode === "document" || settings.mode === "untranslated") return terminologySegments(settings);
    return segments.getDocument();
  }

  function pretranslationOptions(settings) {
    return {
      mode: settings.mode,
      selectedSegmentIds: segments.getActive()?.id ? [segments.getActive().id] : [],
      visibleSegmentIds: filters
        .getVisibleIndexes()
        .map((index) => segments.getAll()[index]?.id)
        .filter(Boolean)
    };
  }

  function hasProjectBriefSamples() {
    return projectBriefSampleSegments(1).length > 0;
  }

  return Object.freeze({
    hasProjectBriefSamples,
    pretranslationOptions,
    pretranslationSegments,
    projectBriefSampleSegments,
    terminologySegments
  });
}
