/**
 * Owns project segment-progress text and meter presentation. Progress
 * derivation/cache policy and localization remain behind injected boundaries.
 *
 * @param {{
 *   summary: { refresh: (options?: object) => { total: number, confirmed: number, words: number, countingComplete?: boolean } },
 *   elements: { progressText: any, wordCountText: any, progressFill: { style: { width: string }, parentElement?: Element } },
 *   localization: { label: (key: string, values?: Record<string, unknown>) => string }
 * }} options
 */
export function createSegmentProgressPresentationService(options) {
  const summary = options?.summary;
  const elements = options?.elements;
  const localization = options?.localization;

  if (
    typeof summary?.refresh !== "function" ||
    !elements?.progressText ||
    !elements?.wordCountText ||
    !elements?.progressFill?.style ||
    typeof localization?.label !== "function"
  ) {
    throw new TypeError(
      "SegmentProgressPresentationService requires summary, progress text, word-count text, progress-fill, and localization boundaries."
    );
  }

  function render(options = {}) {
    const progress = summary.refresh(options);
    const { total, confirmed, words } = progress;
    const open = total - confirmed;
    elements.progressText.textContent = localization.label("progressSummary", { confirmed, open, total });
    elements.wordCountText.textContent = localization.label("sourceWordCount", { count: words });
    if (progress.countingComplete === false)
      elements.wordCountText.textContent = "≥ " + elements.wordCountText.textContent;
    const percent = total ? Math.round((confirmed / total) * 100) : 0;
    elements.progressFill.style.width = total ? `${percent}%` : "0";
    elements.progressFill.parentElement?.setAttribute("aria-valuenow", String(percent));
  }

  return Object.freeze({ render });
}
