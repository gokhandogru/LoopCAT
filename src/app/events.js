export const APPLICATION_EVENTS = Object.freeze({
  LOCALE_CHANGED: "locale-changed",
  NAVIGATION_CHANGED: "navigation-changed",
  OPERATION_CHANGED: "operation-changed",
  PROJECT_OPENED: "project-opened",
  SEGMENT_SELECTED: "segment-selected"
});

const ALLOWED_EVENTS = new Set(Object.values(APPLICATION_EVENTS));

export function createApplicationEvents() {
  const listeners = new Map();

  function assertEventName(eventName) {
    if (!ALLOWED_EVENTS.has(eventName)) throw new TypeError(`Unknown application event: ${eventName}`);
  }

  return Object.freeze({
    on(eventName, listener) {
      assertEventName(eventName);
      if (typeof listener !== "function") throw new TypeError("Application event listener must be a function.");
      const eventListeners = listeners.get(eventName) || new Set();
      eventListeners.add(listener);
      listeners.set(eventName, eventListeners);
      return () => eventListeners.delete(listener);
    },
    emit(eventName, detail = {}) {
      assertEventName(eventName);
      for (const listener of listeners.get(eventName) || []) listener(detail);
    }
  });
}
