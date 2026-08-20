/**
 * Owns synchronous target-draft mutation and its filter-sensitive presentation
 * effects. Target state, filter, rendering, and workspace implementations stay
 * behind injected boundaries.
 *
 * @param {{
 *   targetState: { setTarget: (segment: any, target: string, status: string, reason: string) => unknown, touch: (segment: any, options: { invalidateFilters: boolean }) => unknown, capturePatch: (segment: any) => any },
 *   filters: { matches: (segment: any) => boolean },
 *   presentation: { renderSegments: (options?: object) => unknown, scheduleRowUpdate: (index: number) => unknown, cancelRowUpdate: (index: number) => unknown, renderProgress: (options: { previousStatus: string, nextStatus: string }) => unknown, scheduleHistory: () => unknown },
 *   workspace: { markDirty: () => unknown }
 * }} options
 */
export function createSegmentDraftApplicationService(options) {
  const targetState = options?.targetState;
  const filters = options?.filters;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  if (
    typeof targetState?.setTarget !== "function" ||
    typeof targetState?.touch !== "function" ||
    typeof targetState?.capturePatch !== "function"
  ) {
    throw new TypeError("SegmentDraftApplicationService requires target-state boundaries.");
  }
  if (typeof filters?.matches !== "function") {
    throw new TypeError("SegmentDraftApplicationService requires filter boundaries.");
  }
  if (
    typeof presentation?.renderSegments !== "function" ||
    typeof presentation?.scheduleRowUpdate !== "function" ||
    typeof presentation?.cancelRowUpdate !== "function" ||
    typeof presentation?.renderProgress !== "function" ||
    typeof presentation?.scheduleHistory !== "function" ||
    typeof workspace?.markDirty !== "function"
  ) {
    throw new TypeError("SegmentDraftApplicationService requires presentation and workspace boundaries.");
  }

  function apply({ index, segment, target }) {
    const previousStatus = segment.status || (segment.target?.trim() ? "draft" : "empty");
    const passedFiltersBefore = filters.matches(segment);
    targetState.setTarget(segment, target, target.trim() ? "draft" : "empty", "edit");
    const passedFiltersAfter = filters.matches(segment);
    const filterMembershipChanged = passedFiltersBefore !== passedFiltersAfter;
    targetState.touch(segment, { invalidateFilters: filterMembershipChanged });
    if (filterMembershipChanged) {
      presentation.renderSegments({ preserveScroll: true });
    } else if (passedFiltersAfter) {
      presentation.scheduleRowUpdate(index);
    } else {
      presentation.cancelRowUpdate(index);
    }
    presentation.renderProgress({ previousStatus, nextStatus: segment.status });
    presentation.scheduleHistory();
    workspace.markDirty();
    return { segment, patch: targetState.capturePatch(segment) };
  }

  return Object.freeze({ apply });
}
