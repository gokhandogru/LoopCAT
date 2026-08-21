/**
 * Owns single-frame coalescing for revision-history presentation.
 * Browser scheduling and the presentation effect remain injected boundaries.
 *
 * @param {{
 *   requestFrame: (callback: () => void) => number,
 *   presentation: { render: () => unknown }
 * }} options
 */
export function createRevisionHistoryRenderScheduler(options) {
  const requestFrame = options?.requestFrame;
  const presentation = options?.presentation;

  if (typeof requestFrame !== "function" || typeof presentation?.render !== "function") {
    throw new TypeError("RevisionHistoryRenderScheduler requires frame and presentation boundaries.");
  }

  let frame = 0;

  function schedule() {
    if (frame) return;
    frame = requestFrame(() => {
      frame = 0;
      presentation.render();
    });
  }

  return Object.freeze({ schedule });
}
