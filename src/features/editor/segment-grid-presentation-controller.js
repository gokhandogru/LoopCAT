/**
 * Owns virtualized segment-grid DOM presentation and coalesced row refreshes.
 * Filtering, navigation, virtual-window state, and row construction remain
 * behind injected application boundaries.
 *
 * @param {{
 *   document: { activeElement: any, createElement: (name: string) => any, createDocumentFragment: () => any },
 *   body: { replaceChildren: (...nodes: any[]) => void },
 *   viewport: { scrollTop: number, contains: (element: any) => boolean },
 *   filters: { visibleIndexes: () => number[] },
 *   application: { getActiveIndex: () => number },
 *   grid: {
 *     calculateWindow: (indexes: number[]) => { start: number, end: number, total: number, indexes: number[] },
 *     getWindow: () => { start: number, end: number, total: number },
 *     resetWindow: () => unknown,
 *     commitWindow: (window: object) => unknown,
 *     scheduleRowUpdate: (index: number, render: (indexes: number[]) => void) => unknown,
 *     cancelRowUpdate: (index: number) => unknown
 *   },
 *   rows: { create: (index: number) => any, update: (index: number) => unknown },
 *   localization: { source: (text: string) => string },
 *   rowHeight: number
 * }} options
 */
export function createSegmentGridPresentationController(options) {
  const ownerDocument = options?.document;
  const body = options?.body;
  const viewport = options?.viewport;
  const filters = options?.filters;
  const application = options?.application;
  const grid = options?.grid;
  const rows = options?.rows;
  const localization = options?.localization;
  const rowHeight = options?.rowHeight;

  if (
    typeof ownerDocument?.createElement !== "function" ||
    typeof ownerDocument?.createDocumentFragment !== "function" ||
    typeof body?.replaceChildren !== "function" ||
    typeof viewport?.contains !== "function" ||
    typeof filters?.visibleIndexes !== "function" ||
    typeof application?.getActiveIndex !== "function" ||
    typeof grid?.calculateWindow !== "function" ||
    typeof grid?.getWindow !== "function" ||
    typeof grid?.resetWindow !== "function" ||
    typeof grid?.commitWindow !== "function" ||
    typeof grid?.scheduleRowUpdate !== "function" ||
    typeof grid?.cancelRowUpdate !== "function" ||
    typeof rows?.create !== "function" ||
    typeof rows?.update !== "function" ||
    typeof localization?.source !== "function" ||
    !Number.isFinite(rowHeight) ||
    rowHeight <= 0
  ) {
    throw new TypeError(
      "SegmentGridPresentationController requires DOM, viewport, filter, application, virtual-grid, row, localization, and positive row-height boundaries."
    );
  }

  function spacerRow(height) {
    const row = ownerDocument.createElement("tr");
    row.className = "segment-spacer-row";
    row.setAttribute("aria-hidden", "true");
    const cell = ownerDocument.createElement("td");
    cell.colSpan = 4;
    cell.style.height = `${Math.max(0, height)}px`;
    cell.style.padding = "0";
    cell.style.border = "0";
    row.append(cell);
    return row;
  }

  function render(options = {}) {
    const indexes = filters.visibleIndexes();
    const scrollTop = viewport?.scrollTop || 0;
    if (!indexes.length) {
      grid.resetWindow();
      const row = ownerDocument.createElement("tr");
      const cell = ownerDocument.createElement("td");
      cell.colSpan = 4;
      cell.className = "muted";
      cell.textContent = localization.source("No segments match this view.");
      row.append(cell);
      body.replaceChildren(row);
      return;
    }
    const win = grid.calculateWindow(indexes);
    const previousWindow = grid.getWindow();
    if (
      options.fromScroll &&
      win.start === previousWindow.start &&
      win.end === previousWindow.end &&
      win.total === previousWindow.total
    ) {
      return;
    }
    const activeElement = ownerDocument.activeElement;
    if (options.fromScroll && viewport.contains(activeElement) && !win.indexes.includes(application.getActiveIndex())) {
      activeElement.blur();
    }
    grid.commitWindow(win);
    const topHeight = win.start * rowHeight;
    const bottomHeight = (indexes.length - win.end) * rowHeight;
    const fragment = ownerDocument.createDocumentFragment();
    if (topHeight) fragment.append(spacerRow(topHeight));
    win.indexes.forEach((index) => fragment.append(rows.create(index)));
    if (bottomHeight) fragment.append(spacerRow(bottomHeight));
    body.replaceChildren(fragment);
    if (options.preserveScroll && viewport.scrollTop !== scrollTop) {
      viewport.scrollTop = scrollTop;
    }
  }

  function scheduleRowUpdate(index) {
    return grid.scheduleRowUpdate(index, (indexes) => indexes.forEach(rows.update));
  }

  function cancelRowUpdate(index) {
    return grid.cancelRowUpdate(index);
  }

  return Object.freeze({ render, scheduleRowUpdate, cancelRowUpdate });
}
