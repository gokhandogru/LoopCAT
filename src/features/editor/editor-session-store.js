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
const EXPLICIT_SESSION_FIELDS = new Set([
  "projectSummaries",
  "projectSummaryRevisions",
  "projectTerms",
  "activityEvents"
]);
export const EDITOR_SESSION_COMPATIBILITY_FIELDS = Object.freeze(
  EDITOR_SESSION_FIELDS.filter((name) => !EXPLICIT_SESSION_FIELDS.has(name))
);

function normalizeField(name, value) {
  if (ARRAY_FIELDS.has(name) && !Array.isArray(value)) {
    throw new TypeError(`EditorSessionStore ${name} must be an array.`);
  }
  if (name === "projectSummaryRevisions" && !(value instanceof Map)) {
    throw new TypeError("EditorSessionStore projectSummaryRevisions must be a Map.");
  }
  if (name === "projectSummaryRevisions") return new Map(value);
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
    getActivityEvents: () => state.activityEvents,
    getProjectTerms: () => state.projectTerms,
    getProjectSummaries: () => state.projectSummaries,
    getProjectSummaryRevision(projectId) {
      return Number(state.projectSummaryRevisions.get(String(projectId || "")) || 0);
    },
    markProjectSummaryDirty(projectId) {
      const normalizedProjectId = String(projectId || "");
      if (!normalizedProjectId) return state.projectSummaryRevisions;
      const revisions = new Map(state.projectSummaryRevisions);
      revisions.set(normalizedProjectId, Number(revisions.get(normalizedProjectId) || 0) + 1);
      return replace({ projectSummaryRevisions: revisions }).projectSummaryRevisions;
    },
    pruneProjectSummaryRevisions(projectIds) {
      const retainedProjectIds = new Set(Array.from(projectIds || [], (projectId) => String(projectId || "")));
      const revisions = new Map(
        Array.from(state.projectSummaryRevisions).filter(([projectId]) => retainedProjectIds.has(projectId))
      );
      if (revisions.size === state.projectSummaryRevisions.size) return state.projectSummaryRevisions;
      return replace({ projectSummaryRevisions: revisions }).projectSummaryRevisions;
    },
    replace,
    prependActivityEvent(activityEvent) {
      const activityEvents = [activityEvent, ...state.activityEvents.filter((item) => item.id !== activityEvent.id)];
      return replace({ activityEvents }).activityEvents;
    },
    replaceActivityEvents(activityEvents) {
      return replace({ activityEvents }).activityEvents;
    },
    replaceProjectTerms(projectTerms) {
      return replace({ projectTerms }).projectTerms;
    },
    replaceProjectSummaries(projectSummaries) {
      return replace({ projectSummaries }).projectSummaries;
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("EditorSessionStore listener must be a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attachCompatibility(target) {
      if (!target || typeof target !== "object") {
        throw new TypeError("EditorSessionStore compatibility target must be an object.");
      }
      for (const name of EDITOR_SESSION_COMPATIBILITY_FIELDS) {
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
