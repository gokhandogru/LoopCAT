export function createSelectionStore(initialState = {}) {
  let state = Object.freeze({
    activeIndex: Number.isInteger(initialState.activeIndex) ? initialState.activeIndex : -1,
    segmentId: String(initialState.segmentId || "")
  });
  const listeners = new Set();
  return Object.freeze({
    getState: () => state,
    select(activeIndex, segmentId = "") {
      if (!Number.isInteger(activeIndex)) throw new TypeError("Selection index must be an integer.");
      const previous = state;
      state = Object.freeze({ activeIndex, segmentId: String(segmentId || "") });
      listeners.forEach((listener) => listener(state, previous));
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
