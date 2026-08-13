import { APPLICATION_EVENTS } from "./events.js";

export function createNavigationController({ store, events }) {
  if (!store?.dispatch || !store?.getState) throw new TypeError("NavigationController requires an AppStore.");

  function change(payload, eventName = /** @type {string} */ (APPLICATION_EVENTS.NAVIGATION_CHANGED)) {
    store.dispatch({ type: "navigation/changed", payload });
    const navigation = store.getState().navigation;
    events?.emit?.(eventName, navigation);
    return navigation;
  }

  return Object.freeze({
    openProjects() {
      return change({ view: "projects" });
    },
    openResources() {
      return change({ view: "resources" });
    },
    openProject(projectId, activeIndex = -1) {
      return change(
        { view: "project", projectId, documentId: "", segmentId: "", activeIndex },
        APPLICATION_EVENTS.PROJECT_OPENED
      );
    },
    openEditor({ projectId, documentId = "", segmentId = "", activeIndex = -1 }) {
      return change({ view: "editor", projectId, documentId, segmentId, activeIndex });
    },
    selectSegment({ segmentId = "", activeIndex = -1 }) {
      store.dispatch({ type: "selection/changed", payload: { segmentId, activeIndex } });
      const navigation = store.getState().navigation;
      events?.emit?.(APPLICATION_EVENTS.SEGMENT_SELECTED, navigation);
      return navigation;
    },
    /** @param {{ documentId?: string, segmentId?: string, activeIndex?: number }} [selection] */
    selectDocument({ documentId = "", segmentId, activeIndex } = {}) {
      /** @type {{ documentId: string, segmentId?: string, activeIndex?: number }} */
      const payload = { documentId };
      if (segmentId !== undefined) payload.segmentId = segmentId;
      if (activeIndex !== undefined) payload.activeIndex = activeIndex;
      store.dispatch({ type: "selection/changed", payload });
      return store.getState().navigation;
    },
    clearSelection() {
      store.dispatch({
        type: "selection/changed",
        payload: { projectId: null, documentId: "", segmentId: "", activeIndex: -1 }
      });
      return store.getState().navigation;
    },
    syncLegacy(payload) {
      store.dispatch({ type: "legacy/navigation-synced", payload });
      return store.getState().navigation;
    }
  });
}
