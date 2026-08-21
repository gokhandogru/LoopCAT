const WORKSPACE_DIRTY_STORAGE = "loopcat.workspace.dirtyProjectIds";

/**
 * Owns workspace dirty-marker state, browser recovery persistence, linked
 * resource selection, and change-sensitive presentation effects. Project,
 * resource-link, summary, recovery, and presentation policy stay injected.
 */
export function createWorkspaceDirtyStateController({
  state,
  storage,
  session,
  resources,
  summary,
  recovery,
  presentation
}) {
  if (
    typeof state?.getDirty !== "function" ||
    typeof state?.setDirty !== "function" ||
    typeof state?.getRecovery !== "function" ||
    typeof state?.setRecovery !== "function" ||
    typeof state?.getStatus !== "function" ||
    typeof storage?.getItem !== "function" ||
    typeof storage?.setItem !== "function" ||
    typeof storage?.removeItem !== "function" ||
    typeof session?.getProject !== "function" ||
    typeof session?.getProjects !== "function" ||
    typeof resources?.links !== "function" ||
    typeof summary?.markDirty !== "function" ||
    typeof recovery?.resetDismissal !== "function" ||
    typeof presentation?.renderStatus !== "function" ||
    typeof presentation?.renderRecovery !== "function"
  ) {
    throw new TypeError(
      "WorkspaceDirtyStateController requires checked state, storage, session, resource, summary, recovery, and presentation boundaries."
    );
  }

  function ids() {
    return Array.from(state.getDirty());
  }

  function readStored() {
    try {
      const parsed = JSON.parse(storage.getItem(WORKSPACE_DIRTY_STORAGE) || "[]");
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id.trim()) : [];
    } catch {
      storage.removeItem(WORKSPACE_DIRTY_STORAGE);
      return [];
    }
  }

  function persist() {
    try {
      const projectIds = ids();
      if (projectIds.length) storage.setItem(WORKSPACE_DIRTY_STORAGE, JSON.stringify(projectIds));
      else storage.removeItem(WORKSPACE_DIRTY_STORAGE);
    } catch {
      // Dirty-state persistence is a recovery aid; in-memory warnings still work if storage is unavailable.
    }
  }

  function restore() {
    const projectIds = readStored();
    state.setDirty(new Set(projectIds));
    state.setRecovery(new Set(projectIds));
    recovery.resetDismissal();
  }

  function prune() {
    const knownIds = new Set(
      session
        .getProjects()
        .map((project) => project.id)
        .filter(Boolean)
    );
    const nextIds = ids().filter((id) => knownIds.has(id));
    const nextRecoveryIds = Array.from(state.getRecovery()).filter((id) => knownIds.has(id) && nextIds.includes(id));
    const dirtyChanged = nextIds.length !== state.getDirty().size;
    const recoveryChanged = nextRecoveryIds.length !== state.getRecovery().size;
    if (!dirtyChanged && !recoveryChanged) return;
    state.setDirty(new Set(nextIds));
    state.setRecovery(new Set(nextRecoveryIds));
    persist();
    presentation.renderRecovery();
  }

  function hasUnsaved() {
    return Boolean(state.getStatus()?.connected && state.getDirty().size);
  }

  function visibleCount(status = state.getStatus()) {
    return status?.connected ? state.getDirty().size : 0;
  }

  function mark(projectId = session.getProject()?.id) {
    if (!projectId) return;
    const changed = !state.getDirty().has(projectId);
    state.getDirty().add(projectId);
    summary.markDirty(projectId);
    if (!changed) return;
    persist();
    presentation.renderStatus();
  }

  function markProjects(projectIds = []) {
    let changed = false;
    projectIds.forEach((projectId) => {
      if (!projectId) return;
      summary.markDirty(projectId);
      if (state.getDirty().has(projectId)) return;
      state.getDirty().add(projectId);
      changed = true;
    });
    if (changed) persist();
    if (changed) presentation.renderStatus();
  }

  function usesResource(project, type, name, sourceLang = "", targetLang = "") {
    if (!project || !type || !name) return false;
    if (sourceLang && project.sourceLang !== sourceLang) return false;
    if (targetLang && project.targetLang !== targetLang) return false;
    return resources.links(project).some((link) => link.type === type && link.name === name);
  }

  function markProjectsUsingResource(type, name, sourceLang = "", targetLang = "") {
    const projectIds = session
      .getProjects()
      .filter((project) => usesResource(project, type, name, sourceLang, targetLang))
      .map((project) => project.id);
    markProjects(projectIds);
    return projectIds.length;
  }

  function clear(projectId = session.getProject()?.id) {
    if (projectId) state.getDirty().delete(projectId);
    if (projectId) state.getRecovery().delete(projectId);
    persist();
    presentation.renderStatus();
  }

  function clearAll() {
    state.getDirty().clear();
    state.getRecovery().clear();
    recovery.resetDismissal();
    persist();
    presentation.renderStatus();
  }

  function clearMemory() {
    state.getDirty().clear();
    state.getRecovery().clear();
    presentation.renderStatus();
  }

  return Object.freeze({
    ids,
    readStored,
    persist,
    restore,
    prune,
    hasUnsaved,
    visibleCount,
    mark,
    markProjects,
    usesResource,
    markProjectsUsingResource,
    clear,
    clearAll,
    clearMemory
  });
}
