/**
 * Owns localized review-state and segment-status label mapping. Localization,
 * segment records, status mutation, review orchestration, and row presentation
 * remain injected or external owners.
 *
 * @param {{
 *   localization: {
 *     source: (text: unknown) => any,
 *     label: (key: string) => any
 *   }
 * }} options
 */
export function createSegmentLabelService(options) {
  const localization = options?.localization;
  if (typeof localization?.source !== "function" || typeof localization?.label !== "function") {
    throw new TypeError("SegmentLabelService requires localization boundaries.");
  }

  function review(value) {
    return (
      {
        "needs-review": localization.source("Needs review"),
        reviewed: localization.source("Reviewed"),
        blocked: localization.source("Blocked")
      }[value] || ""
    );
  }

  function status(value) {
    return (
      {
        empty: localization.label("empty"),
        draft: localization.label("draft"),
        confirmed: localization.label("confirmed")
      }[value] || localization.source(value)
    );
  }

  return Object.freeze({ review, status });
}
