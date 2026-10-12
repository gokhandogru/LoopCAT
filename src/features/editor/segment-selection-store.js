/** Selection is independent of the active editing cell and DOM virtualization. */
export function createSegmentSelectionStore() {
  let projectId = "";
  let anchor = "";
  const ids = new Set();
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    sync(nextProjectId, segments) {
      if (projectId !== nextProjectId) {
        ids.clear();
        anchor = "";
        projectId = nextProjectId;
      }
      const known = new Set(segments.map((segment) => segment.id));
      for (const id of ids) if (!known.has(id)) ids.delete(id);
      notify();
    },
    has: (id) => ids.has(id),
    ids: () => [...ids],
    clear() {
      ids.clear();
      anchor = "";
      notify();
    },
    select(rows) {
      rows.forEach((row) => ids.add(row.id));
      notify();
    },
    toggle(id, checked, range, orderedIds) {
      const start = orderedIds.indexOf(anchor),
        end = orderedIds.indexOf(id);
      const affected =
        range && start >= 0 && end >= 0 ? orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1) : [id];
      affected.forEach((value) => (checked ? ids.add(value) : ids.delete(value)));
      anchor = id;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
