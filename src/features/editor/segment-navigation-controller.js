/**
 * Owns active-segment selection effects and next-open navigation. Session,
 * filter, grid, inspector, presentation, context, and focus implementations
 * remain behind injected boundaries.
 *
 * @param {{
 *   session: { getSegments: () => any[] },
 *   navigation: { getActiveIndex: () => number },
 *   grid: { select: (index: number, segmentId: string) => unknown, ensureVisible: (position: number, render: Function) => unknown },
 *   inspector: { setContext: (context: { segmentId: string }) => unknown },
 *   confirmation: { renderBusy: () => unknown },
 *   filters: { visiblePosition: (index: number) => number, isOpen: (segment: any) => boolean, matches: (segment: any) => boolean, resetStatus: () => unknown },
 *   presentation: { renderSegments: (options?: object) => unknown, updateRow: (index: number) => unknown, renderPrompt: () => unknown },
 *   context: { refresh: () => Promise<unknown> },
 *   focus: { target: () => unknown },
 *   statusFilter: { value: string }
 * }} options
 */
export function createSegmentNavigationController(options) {
  const session = options?.session;
  const navigation = options?.navigation;
  const grid = options?.grid;
  const inspector = options?.inspector;
  const confirmation = options?.confirmation;
  const filters = options?.filters;
  const presentation = options?.presentation;
  const context = options?.context;
  const focus = options?.focus;
  const statusFilter = options?.statusFilter;
  if (typeof session?.getSegments !== "function" || typeof navigation?.getActiveIndex !== "function") {
    throw new TypeError("SegmentNavigationController requires session and navigation boundaries.");
  }
  if (
    typeof grid?.select !== "function" ||
    typeof grid?.ensureVisible !== "function" ||
    typeof inspector?.setContext !== "function" ||
    typeof confirmation?.renderBusy !== "function"
  ) {
    throw new TypeError("SegmentNavigationController requires grid, inspector, and confirmation boundaries.");
  }
  if (
    typeof filters?.visiblePosition !== "function" ||
    typeof filters?.isOpen !== "function" ||
    typeof filters?.matches !== "function" ||
    typeof filters?.resetStatus !== "function"
  ) {
    throw new TypeError("SegmentNavigationController requires filter boundaries.");
  }
  if (
    typeof presentation?.renderSegments !== "function" ||
    typeof presentation?.updateRow !== "function" ||
    typeof presentation?.renderPrompt !== "function" ||
    typeof context?.refresh !== "function" ||
    typeof focus?.target !== "function" ||
    !statusFilter
  ) {
    throw new TypeError("SegmentNavigationController requires presentation, context, and focus boundaries.");
  }

  function ensureVisible(index) {
    const position = filters.visiblePosition(index);
    if (position === -1) return;
    grid.ensureVisible(position, presentation.renderSegments);
  }

  async function select(index) {
    if (index < 0 || index >= session.getSegments().length) return;
    if (index === navigation.getActiveIndex()) return;
    const oldIndex = navigation.getActiveIndex();
    const segmentId = session.getSegments()[index]?.id || "";
    grid.select(index, segmentId);
    inspector.setContext({ segmentId });
    confirmation.renderBusy();
    ensureVisible(index);
    presentation.updateRow(oldIndex);
    presentation.updateRow(index);
    presentation.renderPrompt();
    await context.refresh();
  }

  async function moveOpen(direction = 1) {
    if (!session.getSegments().length) return;
    const activeIndex = navigation.getActiveIndex();
    const openIndexes = session
      .getSegments()
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => filters.isOpen(segment))
      .map(({ index }) => index);
    const next =
      direction < 0
        ? ([...openIndexes].reverse().find((index) => index < activeIndex) ?? openIndexes.at(-1) ?? -1)
        : (openIndexes.find((index) => index > activeIndex) ?? openIndexes[0] ?? -1);
    if (next === -1) return;
    await select(next);
    if (!filters.matches(session.getSegments()[next])) {
      filters.resetStatus();
      statusFilter.value = "all";
      presentation.renderSegments();
    }
    focus.target();
  }

  function nextOpen() {
    return moveOpen(1);
  }

  function previousOpen() {
    return moveOpen(-1);
  }

  return Object.freeze({ ensureVisible, nextOpen, previousOpen, select });
}
