/**
 * Owns workspace status and recovery-panel view-model composition. Workspace
 * transport, dirty-state policy, project records, durability policy, and DOM
 * presentation stay injected.
 */
export function createWorkspaceRecoveryPresentationService({
  available,
  state,
  dirty,
  projects,
  durability,
  recovery
}) {
  if (
    typeof available !== "boolean" ||
    typeof state?.getStatus !== "function" ||
    typeof state?.getDurability !== "function" ||
    typeof state?.getImportTask !== "function" ||
    typeof state?.getRecovery !== "function" ||
    typeof state?.getDirty !== "function" ||
    typeof state?.getAutosaving !== "function" ||
    typeof dirty?.visibleCount !== "function" ||
    typeof projects?.getCurrent !== "function" ||
    typeof projects?.knownById !== "function" ||
    typeof durability?.warnings !== "function" ||
    typeof durability?.line !== "function" ||
    typeof recovery?.renderStatus !== "function" ||
    typeof recovery?.renderRecovery !== "function"
  ) {
    throw new TypeError(
      "WorkspaceRecoveryPresentationService requires checked availability, state, dirty-state, project, durability, and recovery boundaries."
    );
  }

  function ids() {
    return Array.from(state.getRecovery()).filter((id) => state.getDirty().has(id));
  }

  function renderRecovery() {
    const recoveryIds = ids();
    recovery.renderRecovery({
      status: state.getStatus() || {},
      projects: recoveryIds.map((id) => {
        const project = projects.knownById(id);
        return { id, name: project?.name || id };
      }),
      autosaving: state.getAutosaving()
    });
  }

  function renderStatus() {
    if (!available) return;
    const status = state.getStatus() || {};
    const dirtyCount = dirty.visibleCount(status);
    const storageWarnings = durability.warnings(state.getDurability());
    recovery.renderStatus({
      status,
      dirtyCount,
      storageLine: durability.line(state.getDurability()),
      storageWarnings,
      importBusy: Boolean(state.getImportTask()),
      hasProject: Boolean(projects.getCurrent())
    });
    renderRecovery();
  }

  return Object.freeze({ ids, renderStatus, renderRecovery });
}
