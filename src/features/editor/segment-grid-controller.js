const EMPTY_WINDOW = Object.freeze({ start: 0, end: 0, total: 0, indexes: [] });

function normalizedFrameScheduler(requestFrame) {
  if (typeof requestFrame === "function") return requestFrame;
  return (callback) => setTimeout(callback, 0);
}

export function createSegmentGridController({
  navigation,
  viewport = null,
  rowHeight = 118,
  rowBuffer = 8,
  requestFrame = globalThis.requestAnimationFrame
}) {
  if (!navigation?.selectSegment) throw new TypeError("SegmentGridController requires application navigation.");
  if (!Number.isFinite(rowHeight) || rowHeight <= 0)
    throw new TypeError("SegmentGridController requires a positive row height.");
  if (!Number.isInteger(rowBuffer) || rowBuffer < 0)
    throw new TypeError("SegmentGridController requires a non-negative row buffer.");

  const scheduleFrame = normalizedFrameScheduler(requestFrame);
  let currentWindow = EMPTY_WINDOW;
  let scrollFrame = 0;
  let scrollListener = null;
  let rowFrame = 0;
  const pendingRows = new Set();

  function calculateWindow(indexes) {
    const safeIndexes = Array.isArray(indexes) ? indexes : [];
    const viewportRows = Math.ceil((viewport?.clientHeight || 720) / rowHeight);
    const scrollRows = Math.floor((viewport?.scrollTop || 0) / rowHeight);
    const start = Math.max(0, scrollRows - rowBuffer);
    const end = Math.min(safeIndexes.length, scrollRows + viewportRows + rowBuffer);
    return { start, end, total: safeIndexes.length, indexes: safeIndexes.slice(start, end) };
  }

  function commitWindow(nextWindow) {
    currentWindow = nextWindow || EMPTY_WINDOW;
    return currentWindow;
  }

  function resetWindow() {
    currentWindow = EMPTY_WINDOW;
    return currentWindow;
  }

  function scheduleScroll(render) {
    if (scrollFrame || typeof render !== "function") return false;
    scrollFrame = scheduleFrame(() => {
      scrollFrame = 0;
      render();
    });
    return true;
  }

  function mountScroll(render) {
    if (
      scrollListener ||
      !viewport?.addEventListener ||
      !viewport?.removeEventListener ||
      typeof render !== "function"
    ) {
      return false;
    }
    const listener = () => scheduleScroll(render);
    viewport.addEventListener("scroll", listener);
    scrollListener = listener;
    return true;
  }

  function unmountScroll() {
    if (!scrollListener) return false;
    viewport.removeEventListener("scroll", scrollListener);
    scrollListener = null;
    return true;
  }

  function scheduleRowUpdate(index, renderRows) {
    if (!Number.isInteger(index) || index < 0 || typeof renderRows !== "function") return false;
    pendingRows.add(index);
    if (rowFrame) return true;
    rowFrame = scheduleFrame(() => {
      rowFrame = 0;
      const indexes = Array.from(pendingRows);
      pendingRows.clear();
      renderRows(indexes);
    });
    return true;
  }

  function cancelRowUpdate(index) {
    return pendingRows.delete(index);
  }

  function ensureVisible(position, render) {
    if (!Number.isInteger(position) || position < 0) return false;
    if (position >= currentWindow.start && position < currentWindow.end) return false;
    if (viewport) viewport.scrollTop = Math.max(0, position * rowHeight - rowHeight);
    if (typeof render === "function") render();
    return true;
  }

  function findTargetEditor(root, index) {
    if (!root?.querySelector || !Number.isInteger(index) || index < 0) return null;
    return root.querySelector(`tr[data-index="${index}"] textarea`);
  }

  return Object.freeze({
    calculateWindow,
    cancelRowUpdate,
    commitWindow,
    ensureVisible,
    findTargetEditor,
    getWindow: () => currentWindow,
    mountScroll,
    resetWindow,
    scheduleRowUpdate,
    scheduleScroll,
    unmountScroll,
    selectSegment(index, segmentId) {
      return navigation.selectSegment({ activeIndex: index, segmentId });
    }
  });
}
