/**
 * Owns command-time local AI settings persistence. Form composition, endpoint
 * policy, store/repository implementations, session records, provider/runtime
 * selection, AI commands, workspace state, and status state remain injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getProjects: () => any[], replaceProject: (project: any) => void, replaceProjects: (projects: any[]) => void },
 *   form: { readSettings: () => any },
 *   settings: { normalize: (settings: any) => any, projectUpdateFields: (localSettings: any, project: any) => object },
 *   endpoint: { assertAllowed: (settings: any) => void },
 *   localStore: { save: (settings: any) => void },
 *   persistence: { updateProject: (project: any) => Promise<any> },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode: string) => void }
 * }} options
 */
export function createAiLocalSettingsPersistenceController(options) {
  const store = options?.editorSessionStore;
  const form = options?.form;
  const settingsBoundary = options?.settings;
  const endpoint = options?.endpoint;
  const localStore = options?.localStore;
  const persistence = options?.persistence;
  const workspace = options?.workspace;
  const status = options?.status;
  if (
    typeof store?.getProject !== "function" ||
    typeof store?.getProjects !== "function" ||
    typeof store?.replaceProject !== "function" ||
    typeof store?.replaceProjects !== "function"
  ) {
    throw new TypeError("AiLocalSettingsPersistenceController requires EditorSessionStore boundaries.");
  }
  if (
    typeof form?.readSettings !== "function" ||
    typeof settingsBoundary?.normalize !== "function" ||
    typeof settingsBoundary?.projectUpdateFields !== "function" ||
    typeof endpoint?.assertAllowed !== "function" ||
    typeof localStore?.save !== "function" ||
    typeof persistence?.updateProject !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "AiLocalSettingsPersistenceController requires form, settings, endpoint, local-store, persistence, workspace, and status boundaries."
    );
  }

  async function persist(persistOptions = {}) {
    const project = store.getProject();
    const localSettings = form.readSettings();
    if (!project) return localSettings;
    try {
      endpoint.assertAllowed(localSettings);
    } catch {
      return localSettings;
    }

    localStore.save(localSettings);
    const aiSettings = settingsBoundary.normalize({
      ...project.aiSettings,
      ...settingsBoundary.projectUpdateFields(localSettings, project)
    });
    store.replaceProject(await persistence.updateProject({ ...project, aiSettings }));
    const savedProject = store.getProject();
    store.replaceProjects(store.getProjects().map((item) => (item.id === savedProject.id ? savedProject : item)));
    workspace.markDirty();
    if (!persistOptions.silent) status.set("Local AI settings saved", "saved");
    return localSettings;
  }

  function persistSilently() {
    return persist({ silent: true });
  }

  return Object.freeze({ persist, persistSilently });
}
