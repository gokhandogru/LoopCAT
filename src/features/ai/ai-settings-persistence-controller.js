/**
 * Owns project AI-settings persistence, credential update sequencing,
 * activity warnings, and exact project/list/key recovery. Form state,
 * records, policy, key stores, repositories, and presentation stay injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getProjects: () => any[], replaceProject: (project: any) => void, replaceProjects: (projects: any[]) => void },
 *   forms: { readGlobal: () => any, readSecrets: () => any, readLocalSettings: () => any },
 *   settings: { normalize: (settings: any) => any, projectUpdateFields: (localSettings: any, project: any) => object },
 *   endpoint: { assertAllowed: (localSettings: any) => void },
 *   provider: { isOpenAi: (aiSettings: any) => boolean },
 *   keys: { openAi: { snapshot: () => any, save: (value: string, remember: boolean) => void, restore: (snapshot: any) => unknown, storageLabel: () => string }, local: { snapshot: (settings: any) => any, save: (value: string, remember: boolean, settings: any) => void, restore: (snapshot: any) => unknown, storageLabel: (settings: any) => string } },
 *   persistence: { updateProject: (project: any) => Promise<any> },
 *   activity: { log: (details: object) => Promise<unknown> | unknown },
 *   presentation: { renderEditor: () => void },
 *   workspace: { markDirty: () => void, markActivityWarningDirty: () => void, markRollbackDirty: (projectId: string) => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   defaults: { model: string },
 *   testHooks?: { beforeSave?: (project: any) => void, beforeActivity?: (project: any) => void },
 *   logger?: { warn?: (...values: any[]) => void }
 * }} options
 */
export function createAiSettingsPersistenceController(options) {
  const store = options?.editorSessionStore;
  const forms = options?.forms;
  const settingsBoundary = options?.settings;
  const endpoint = options?.endpoint;
  const provider = options?.provider;
  const keys = options?.keys;
  const persistence = options?.persistence;
  const activity = options?.activity;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;
  if (
    typeof store?.getProject !== "function" ||
    typeof store?.getProjects !== "function" ||
    typeof store?.replaceProject !== "function" ||
    typeof store?.replaceProjects !== "function"
  ) {
    throw new TypeError("AiSettingsPersistenceController requires EditorSessionStore boundaries.");
  }
  if (
    typeof forms?.readGlobal !== "function" ||
    typeof forms?.readSecrets !== "function" ||
    typeof forms?.readLocalSettings !== "function" ||
    typeof settingsBoundary?.normalize !== "function" ||
    typeof settingsBoundary?.projectUpdateFields !== "function" ||
    typeof endpoint?.assertAllowed !== "function" ||
    typeof provider?.isOpenAi !== "function"
  ) {
    throw new TypeError("AiSettingsPersistenceController requires form, settings, endpoint, and provider boundaries.");
  }
  for (const keyBoundary of [keys?.openAi, keys?.local]) {
    if (
      typeof keyBoundary?.snapshot !== "function" ||
      typeof keyBoundary?.save !== "function" ||
      typeof keyBoundary?.restore !== "function" ||
      typeof keyBoundary?.storageLabel !== "function"
    ) {
      throw new TypeError("AiSettingsPersistenceController requires OpenAI and local key boundaries.");
    }
  }
  if (
    typeof persistence?.updateProject !== "function" ||
    typeof activity?.log !== "function" ||
    typeof presentation?.renderEditor !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof workspace?.markActivityWarningDirty !== "function" ||
    typeof workspace?.markRollbackDirty !== "function" ||
    typeof status?.set !== "function" ||
    !String(options?.defaults?.model || "").trim()
  ) {
    throw new TypeError("AiSettingsPersistenceController requires persistence, effects, and defaults.");
  }

  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};
  const beforeActivity =
    typeof options.testHooks?.beforeActivity === "function" ? options.testHooks.beforeActivity : () => {};
  const warn = typeof options.logger?.warn === "function" ? options.logger.warn.bind(options.logger) : () => {};

  function replaceProjectInList(project) {
    store.replaceProjects(store.getProjects().map((item) => (item.id === project.id ? project : item)));
  }

  async function restoreProject(previousProject, previousProjects, projectPersisted) {
    if (!projectPersisted) {
      store.replaceProject(previousProject);
      store.replaceProjects(previousProjects);
      return;
    }
    try {
      const restored = await persistence.updateProject(previousProject);
      store.replaceProject(restored);
      replaceProjectInList(restored);
    } catch (rollbackError) {
      warn("Project AI settings rollback failed.", rollbackError);
      store.replaceProject(previousProject);
      store.replaceProjects(previousProjects);
      workspace.markRollbackDirty(previousProject.id);
    }
  }

  async function save() {
    const project = store.getProject();
    if (!project) return undefined;
    const previousProject = structuredClone(project);
    const previousProjects = store.getProjects().map((item) => structuredClone(item));
    const previousOpenAiKey = keys.openAi.snapshot();
    const globalForm = forms.readGlobal() || {};
    const secrets = forms.readSecrets() || {};
    const apiKeyInput = secrets.openAiKey || "";
    const rememberApiKey = Boolean(secrets.rememberOpenAiKey);
    const localAiKeyInput = secrets.localAiKey || "";
    const rememberLocalAiKey = Boolean(secrets.rememberLocalAiKey);
    const localSettings = forms.readLocalSettings();
    const previousLocalKey = keys.local.snapshot(localSettings);
    let projectPersisted = false;
    let activityLogged = true;
    const aiSettings = settingsBoundary.normalize({
      enabled: Boolean(globalForm.enabled),
      provider: globalForm.provider || "OpenAI",
      model: globalForm.model || options.defaults.model,
      sendSourceToAi: Boolean(globalForm.sendSourceToAi),
      useTmContext: globalForm.useTmContext !== false,
      useTermbaseContext: globalForm.useTermbaseContext !== false,
      styleGuide: globalForm.styleGuide || "",
      ...settingsBoundary.projectUpdateFields(localSettings, project)
    });
    const shouldUpdateOpenAiKey = Boolean(String(apiKeyInput || "").trim()) && provider.isOpenAi(aiSettings);
    const shouldUpdateLocalKey = Boolean(String(localAiKeyInput || "").trim());
    try {
      endpoint.assertAllowed(localSettings);
      beforeSave(project);
      const savedProject = await persistence.updateProject({ ...project, aiSettings });
      store.replaceProject(savedProject);
      projectPersisted = true;
      replaceProjectInList(savedProject);
      if (shouldUpdateOpenAiKey) keys.openAi.save(apiKeyInput, rememberApiKey);
      if (shouldUpdateLocalKey) keys.local.save(localAiKeyInput, rememberLocalAiKey, localSettings);
      try {
        beforeActivity(project);
        await activity.log({
          enabled: aiSettings.enabled,
          provider: aiSettings.provider,
          model: aiSettings.model,
          sendSourceToAi: aiSettings.sendSourceToAi,
          keyStorage: provider.isOpenAi(aiSettings) ? keys.openAi.storageLabel() : "Not applicable",
          localAiKeyStorage: shouldUpdateLocalKey ? keys.local.storageLabel(localSettings) : "Not changed"
        });
      } catch (activityError) {
        activityLogged = false;
        warn("AI settings activity log failed.", activityError);
        workspace.markActivityWarningDirty();
      }
      presentation.renderEditor();
      workspace.markDirty();
      status.set(
        activityLogged ? "AI settings saved" : "AI settings saved; activity log failed",
        activityLogged ? "saved" : "dirty"
      );
      return true;
    } catch (error) {
      await restoreProject(previousProject, previousProjects, projectPersisted);
      keys.openAi.restore(previousOpenAiKey);
      keys.local.restore(previousLocalKey);
      status.set(error.message || "AI settings save failed", "dirty");
      return false;
    }
  }

  return Object.freeze({ save });
}
