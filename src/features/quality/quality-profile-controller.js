/**
 * Owns quality-profile normalization, project persistence and list
 * synchronization, risk/summary refresh, optional activity status,
 * presentation, and failure recovery. Project records remain owned by
 * EditorSessionStore and durable effects stay behind injected boundaries.
 *
 * @param {{
 *   editorSessionStore: {
 *     getProject: () => any,
 *     getProjects: () => any[],
 *     replaceProject: (project: any) => unknown,
 *     replaceProjects: (projects: any[]) => unknown,
 *     replaceQualityRiskQueue: (queue: any) => unknown
 *   },
 *   profile: { normalize: (values: any) => any, buildRiskQueue: () => any },
 *   persistence: { saveProject: (project: any) => Promise<any>, refreshSummaries: () => Promise<unknown> },
 *   activity: { log: (profile: any) => Promise<boolean> | boolean },
 *   presentation: { renderWorkbench: () => void },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void }
 * }} options
 */
export function createQualityProfileController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const profile = options?.profile;
  const persistence = options?.persistence;
  const activity = options?.activity;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;

  if (
    typeof editorSessionStore?.getProject !== "function" ||
    typeof editorSessionStore?.getProjects !== "function" ||
    typeof editorSessionStore?.replaceProject !== "function" ||
    typeof editorSessionStore?.replaceProjects !== "function" ||
    typeof editorSessionStore?.replaceQualityRiskQueue !== "function"
  ) {
    throw new TypeError("QualityProfileController requires EditorSessionStore boundaries.");
  }
  if (typeof profile?.normalize !== "function" || typeof profile?.buildRiskQueue !== "function") {
    throw new TypeError("QualityProfileController requires profile normalization and risk boundaries.");
  }
  if (typeof persistence?.saveProject !== "function" || typeof persistence?.refreshSummaries !== "function") {
    throw new TypeError("QualityProfileController requires project persistence boundaries.");
  }
  if (typeof activity?.log !== "function") {
    throw new TypeError("QualityProfileController requires an activity boundary.");
  }
  if (
    typeof presentation?.renderWorkbench !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError("QualityProfileController requires presentation, workspace, and status boundaries.");
  }

  async function save(values) {
    if (!editorSessionStore.getProject()) return false;
    const previousProject = structuredClone(editorSessionStore.getProject());
    const previousProjects = editorSessionStore.getProjects().map((projectRecord) => structuredClone(projectRecord));
    const qualityProfile = profile.normalize(values);
    try {
      const savedProject = await persistence.saveProject({ ...editorSessionStore.getProject(), qualityProfile });
      editorSessionStore.replaceProject(savedProject);
      editorSessionStore.replaceProjects(
        editorSessionStore
          .getProjects()
          .map((projectRecord) =>
            projectRecord.id === editorSessionStore.getProject().id ? editorSessionStore.getProject() : projectRecord
          )
      );
      editorSessionStore.replaceQualityRiskQueue(profile.buildRiskQueue());
      await persistence.refreshSummaries();
      workspace.markDirty();
      presentation.renderWorkbench();
      const activityLogged = await activity.log(qualityProfile);
      status.set(
        activityLogged ? "Quality profile saved" : "Quality profile saved; activity log failed",
        activityLogged ? "saved" : "dirty"
      );
      return true;
    } catch (error) {
      editorSessionStore.replaceProject(previousProject);
      editorSessionStore.replaceProjects(previousProjects);
      presentation.renderWorkbench();
      status.set(error.message || "Quality profile save failed", "dirty");
      return false;
    }
  }

  return Object.freeze({ save });
}
