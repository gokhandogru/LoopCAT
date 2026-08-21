/**
 * Owns detection of local projects whose packages are absent from the
 * connected workspace. Workspace transport, local project storage, and dirty
 * marker policy remain injected boundaries.
 *
 * @param {{
 *   workspace: {
 *     canListPackages: () => unknown,
 *     isConnected: () => unknown,
 *     listPackages: () => Promise<any[]>
 *   },
 *   projects: { list: () => Promise<any[]> },
 *   dirty: { markProjects: (projectIds: any[]) => unknown }
 * }} options
 */
export function createWorkspaceProjectCoverageService(options) {
  const workspace = options?.workspace;
  const projects = options?.projects;
  const dirty = options?.dirty;

  if (
    typeof workspace?.canListPackages !== "function" ||
    typeof workspace?.isConnected !== "function" ||
    typeof workspace?.listPackages !== "function" ||
    typeof projects?.list !== "function" ||
    typeof dirty?.markProjects !== "function"
  ) {
    throw new TypeError(
      "WorkspaceProjectCoverageService requires workspace, project-list, and dirty-marker boundaries."
    );
  }

  async function markMissingLocalDirty() {
    if (!workspace.canListPackages() || !workspace.isConnected()) return 0;
    const [localProjects, refs] = await Promise.all([projects.list(), workspace.listPackages()]);
    const workspaceProjectIds = new Set((refs || []).map((ref) => ref.id).filter(Boolean));
    const missingProjectIds = (localProjects || [])
      .map((project) => project.id)
      .filter((id) => id && !workspaceProjectIds.has(id));
    dirty.markProjects(missingProjectIds);
    return missingProjectIds.length;
  }

  return Object.freeze({ markMissingLocalDirty });
}
