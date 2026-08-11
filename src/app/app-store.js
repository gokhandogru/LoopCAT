const DEFAULT_STATE = Object.freeze({
  navigation: Object.freeze({
    view: "projects",
    projectId: null,
    documentId: "",
    segmentId: "",
    activeIndex: -1
  }),
  interface: Object.freeze({
    locale: "",
    focusMode: false
  })
});

function normalizeView(view) {
  return ["projects", "project", "editor", "resources"].includes(view) ? view : "projects";
}

function normalizeNavigation(current, patch = {}) {
  const view = normalizeView(patch.view ?? current.view);
  const projectId = patch.projectId === undefined ? current.projectId : patch.projectId || null;
  const documentId = patch.documentId === undefined ? current.documentId : String(patch.documentId || "");
  const segmentId = patch.segmentId === undefined ? current.segmentId : String(patch.segmentId || "");
  const activeIndex = Number.isInteger(patch.activeIndex) ? patch.activeIndex : current.activeIndex;
  return {
    view,
    projectId,
    documentId,
    segmentId,
    activeIndex
  };
}

export function applicationReducer(state = DEFAULT_STATE, action = {}) {
  if (action.type === "navigation/changed" || action.type === "legacy/navigation-synced") {
    const navigation = normalizeNavigation(state.navigation, action.payload);
    const focusMode = navigation.view === "editor" ? state.interface.focusMode : false;
    return { ...state, navigation, interface: { ...state.interface, focusMode } };
  }
  if (action.type === "selection/changed") {
    return { ...state, navigation: normalizeNavigation(state.navigation, action.payload) };
  }
  if (action.type === "interface/focus-mode-changed") {
    const navigationView = String(state.navigation.view);
    const enabled = Boolean(action.payload?.enabled && navigationView === "editor" && state.navigation.projectId);
    return { ...state, interface: { ...state.interface, focusMode: enabled } };
  }
  if (action.type === "interface/locale-changed") {
    return { ...state, interface: { ...state.interface, locale: String(action.payload?.locale || "") } };
  }
  return state;
}

export function createAppStore(initialState = {}) {
  let state = {
    navigation: normalizeNavigation(DEFAULT_STATE.navigation, initialState.navigation),
    interface: { ...DEFAULT_STATE.interface, ...(initialState.interface || {}) }
  };
  const listeners = new Set();

  return Object.freeze({
    getState() {
      return state;
    },
    dispatch(action) {
      const previous = state;
      state = applicationReducer(state, action);
      if (state !== previous) listeners.forEach((listener) => listener(state, previous, action));
      return action;
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("AppStore listener must be a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
