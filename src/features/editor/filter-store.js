const DEFAULT_FILTERS = Object.freeze({
  query: "",
  scope: "both",
  regex: false,
  caseSensitive: false,
  status: "all",
  reviewState: "",
  aiState: ""
});

export function createFilterStore(initialState = {}) {
  let state = Object.freeze({ ...DEFAULT_FILTERS, ...(initialState || {}) });
  const listeners = new Set();
  return Object.freeze({
    getState: () => state,
    update(patch = {}) {
      const previous = state;
      state = Object.freeze({ ...state, ...patch });
      listeners.forEach((listener) => listener(state, previous));
      return state;
    },
    reset() {
      return this.update(DEFAULT_FILTERS);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
