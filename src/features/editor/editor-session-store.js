const ARRAY_FIELDS = new Set([
  "projects",
  "projectSummaries",
  "segments",
  "projectTerms",
  "activityEvents",
  "qaChecks"
]);

function createDefaultSession() {
  return {
    projects: [],
    projectSummaries: [],
    projectSummaryRevisions: new Map(),
    project: null,
    segments: [],
    progressSummary: null,
    projectTerms: [],
    activityEvents: [],
    qaChecks: [],
    qualityRiskQueue: null
  };
}

export const EDITOR_SESSION_FIELDS = Object.freeze(Object.keys(createDefaultSession()));

function normalizeField(name, value) {
  if (ARRAY_FIELDS.has(name) && !Array.isArray(value)) {
    throw new TypeError(`EditorSessionStore ${name} must be an array.`);
  }
  if (name === "projectSummaryRevisions" && !(value instanceof Map)) {
    throw new TypeError("EditorSessionStore projectSummaryRevisions must be a Map.");
  }
  return value;
}

export function createEditorSessionStore(initialState = {}) {
  const defaults = createDefaultSession();
  let state = Object.freeze({
    ...defaults,
    ...Object.fromEntries(
      Object.entries(initialState)
        .filter(([name]) => EDITOR_SESSION_FIELDS.includes(name))
        .map(([name, value]) => [name, normalizeField(name, value)])
    )
  });
  const listeners = new Set();

  function replace(patch = {}) {
    const entries = Object.entries(patch).filter(([name]) => EDITOR_SESSION_FIELDS.includes(name));
    if (!entries.length) return state;
    const previous = state;
    const acceptedPatch = Object.freeze(
      Object.fromEntries(entries.map(([name, value]) => [name, normalizeField(name, value)]))
    );
    state = Object.freeze({
      ...state,
      ...acceptedPatch
    });
    listeners.forEach((listener) => listener(state, previous, acceptedPatch));
    return state;
  }

  return Object.freeze({
    getState: () => state,
    replace,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("EditorSessionStore listener must be a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attachCompatibility(target) {
      if (!target || typeof target !== "object") {
        throw new TypeError("EditorSessionStore compatibility target must be an object.");
      }
      for (const name of EDITOR_SESSION_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(target, name)) {
          throw new Error(`EditorSessionStore cannot attach over existing state.${name}.`);
        }
        Object.defineProperty(target, name, {
          configurable: false,
          enumerable: true,
          get: () => state[name],
          set: (value) => replace({ [name]: value })
        });
      }
      return target;
    }
  });
}
