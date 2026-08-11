const INITIAL_SAVE_STATE = Object.freeze({ status: "saved", projectId: null, segmentId: "", message: "Saved" });

export function createSaveStore(initialState = {}) {
  let state = { ...INITIAL_SAVE_STATE, ...initialState };
  const listeners = new Set();

  function update(status, detail = {}) {
    const previous = state;
    state = Object.freeze({ ...state, ...detail, status });
    listeners.forEach((listener) => listener(state, previous));
    return state;
  }

  return Object.freeze({
    getState: () => state,
    setDirty: (detail) => update("dirty", detail),
    setSaving: (detail) => update("saving", detail),
    setSaved: (detail) => update("saved", detail),
    setFailed: (detail) => update("failed", detail),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
