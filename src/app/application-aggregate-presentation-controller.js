/**
 * Owns the exact aggregate editor-shell presentation sequence.
 * Filter state and each feature presentation remain injected owners.
 *
 * @param {{
 *   filters: { invalidate: () => unknown },
 *   presentation: {
 *     renderProjectList: () => unknown,
 *     renderEditor: () => unknown,
 *     renderProjectHome: () => unknown,
 *     renderProjectAnalysis: () => unknown,
 *     renderDocumentFilter: () => unknown,
 *     renderSegments: () => unknown,
 *     renderProgress: () => unknown
 *   }
 * }} options
 */
export function createApplicationAggregatePresentationController(options) {
  const filters = options?.filters;
  const presentation = options?.presentation;

  if (typeof filters?.invalidate !== "function") {
    throw new TypeError("ApplicationAggregatePresentationController requires a filter boundary.");
  }
  for (const method of [
    "renderProjectList",
    "renderEditor",
    "renderProjectHome",
    "renderProjectAnalysis",
    "renderDocumentFilter",
    "renderSegments",
    "renderProgress"
  ]) {
    if (typeof presentation?.[method] !== "function") {
      throw new TypeError(`ApplicationAggregatePresentationController requires presentation.${method}.`);
    }
  }

  function render() {
    filters.invalidate();
    presentation.renderProjectList();
    presentation.renderEditor();
    presentation.renderProjectHome();
    presentation.renderProjectAnalysis();
    presentation.renderDocumentFilter();
    presentation.renderSegments();
    presentation.renderProgress();
  }

  return Object.freeze({ render });
}
