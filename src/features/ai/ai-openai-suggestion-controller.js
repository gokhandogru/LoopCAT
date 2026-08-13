/**
 * Owns the explicit-consent direct OpenAI suggestion-request flow: validation,
 * settings/key setup, project/list synchronization, context and provider
 * routing, suggestion-storage result handling, and exact setup recovery.
 * Records, provider transport, context lookup, key storage, repositories, and
 * suggestion persistence remain injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getProjects: () => any[], getSegments: () => any[], replaceProject: (project: any) => void, replaceProjects: (projects: any[]) => void },
 *   selection: { getActiveIndex: () => number },
 *   administration: { readGlobalForm: () => any, readSecrets: () => any },
 *   settings: { normalize: (settings: any) => any },
 *   provider: { isOpenAi: (settings: any) => boolean, appearsOffline: () => boolean, request: (options: object) => Promise<any> },
 *   keys: { readStored: () => string, snapshot: () => any, save: (value: string, remember: boolean) => void, restore: (snapshot: any) => unknown },
 *   consent: { externalShare: (details: object) => boolean },
 *   persistence: { updateProject: (project: any) => Promise<any> },
 *   context: { forSegment: (segment: any, settings: any) => Promise<[any[], any[]]> },
 *   suggestions: { append: (segment: any, suggestion: any) => Promise<any> },
 *   presentation: { renderEditor: () => void },
 *   workspace: { markDirty: () => void, markRollbackDirty: (projectId: string) => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   defaults: { model: string },
 *   testHooks?: { beforeProjectSave?: (project: any) => void },
 *   logger?: { warn?: (...values: any[]) => void }
 * }} options
 */
export function createAiOpenAiSuggestionController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const selection = options?.selection;
  const administration = options?.administration;
  const settingsBoundary = options?.settings;
  const provider = options?.provider;
  const keys = options?.keys;
  const consent = options?.consent;
  const persistence = options?.persistence;
  const context = options?.context;
  const suggestions = options?.suggestions;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;

  if (
    typeof editorSessionStore?.getProject !== "function" ||
    typeof editorSessionStore?.getProjects !== "function" ||
    typeof editorSessionStore?.getSegments !== "function" ||
    typeof editorSessionStore?.replaceProject !== "function" ||
    typeof editorSessionStore?.replaceProjects !== "function"
  ) {
    throw new TypeError("AiOpenAiSuggestionController requires EditorSessionStore boundaries.");
  }
  if (
    typeof selection?.getActiveIndex !== "function" ||
    typeof administration?.readGlobalForm !== "function" ||
    typeof administration?.readSecrets !== "function" ||
    typeof settingsBoundary?.normalize !== "function"
  ) {
    throw new TypeError("AiOpenAiSuggestionController requires selection, administration, and settings boundaries.");
  }
  if (
    typeof provider?.isOpenAi !== "function" ||
    typeof provider?.appearsOffline !== "function" ||
    typeof provider?.request !== "function" ||
    typeof consent?.externalShare !== "function" ||
    typeof context?.forSegment !== "function" ||
    typeof suggestions?.append !== "function"
  ) {
    throw new TypeError("AiOpenAiSuggestionController requires provider, consent, context, and suggestion boundaries.");
  }
  if (
    typeof keys?.readStored !== "function" ||
    typeof keys?.snapshot !== "function" ||
    typeof keys?.save !== "function" ||
    typeof keys?.restore !== "function" ||
    typeof persistence?.updateProject !== "function"
  ) {
    throw new TypeError("AiOpenAiSuggestionController requires key and project persistence boundaries.");
  }
  if (
    typeof presentation?.renderEditor !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof workspace?.markRollbackDirty !== "function" ||
    typeof status?.set !== "function" ||
    !String(options?.defaults?.model || "").trim()
  ) {
    throw new TypeError("AiOpenAiSuggestionController requires presentation, workspace, status, and defaults.");
  }

  const beforeProjectSave =
    typeof options.testHooks?.beforeProjectSave === "function" ? options.testHooks.beforeProjectSave : () => {};
  const warn = typeof options.logger?.warn === "function" ? options.logger.warn.bind(options.logger) : () => {};

  function currentSegment() {
    return editorSessionStore.getSegments()[selection.getActiveIndex()] || null;
  }

  function replaceProjectInList(project) {
    editorSessionStore.replaceProjects(
      editorSessionStore.getProjects().map((item) => (item.id === project.id ? project : item))
    );
  }

  async function restoreProject(previousProject, previousProjects, projectPersisted) {
    if (!projectPersisted) {
      editorSessionStore.replaceProject(previousProject);
      editorSessionStore.replaceProjects(previousProjects);
      return;
    }
    try {
      const restoredProject = await persistence.updateProject(previousProject);
      editorSessionStore.replaceProject(restoredProject);
      replaceProjectInList(restoredProject);
    } catch (rollbackError) {
      warn("Project AI settings rollback failed.", rollbackError);
      editorSessionStore.replaceProject(previousProject);
      editorSessionStore.replaceProjects(previousProjects);
      workspace.markRollbackDirty(previousProject.id);
    }
  }

  async function create() {
    const project = editorSessionStore.getProject();
    const segment = currentSegment();
    if (!project || !segment) return undefined;
    const globalForm = administration.readGlobalForm() || {};
    const secrets = administration.readSecrets() || {};
    const aiSettings = settingsBoundary.normalize({
      ...project.aiSettings,
      enabled: Boolean(globalForm.enabled),
      provider: globalForm.provider || "OpenAI",
      model: globalForm.model || options.defaults.model,
      sendSourceToAi: Boolean(globalForm.sendSourceToAi),
      useTmContext: globalForm.useTmContext !== false,
      useTermbaseContext: globalForm.useTermbaseContext !== false,
      styleGuide: globalForm.styleGuide || ""
    });
    if (!aiSettings.enabled) {
      status.set("Enable AI helpers before requesting an OpenAI suggestion.", "dirty");
      return undefined;
    }
    if (!aiSettings.sendSourceToAi) {
      status.set("Turn on source sharing before sending a segment to OpenAI.", "dirty");
      return undefined;
    }
    if (!provider.isOpenAi(aiSettings)) {
      status.set("Choose OpenAI as the provider before requesting an OpenAI suggestion.", "dirty");
      return undefined;
    }
    if (!String(segment.source || "").trim()) {
      status.set("The active segment has no source text.", "dirty");
      return undefined;
    }
    if (provider.appearsOffline()) {
      status.set(
        "OpenAI suggestions need an internet connection. LoopCAT appears to be offline; no source text, API key, or AI settings were sent or saved.",
        "dirty"
      );
      return undefined;
    }
    const apiKey = String(secrets.openAiKey || "").trim() || keys.readStored();
    if (!apiKey) {
      status.set("Add your OpenAI API key first.", "dirty");
      return undefined;
    }
    const contextLabels = [
      aiSettings.useTmContext ? "local TM matches" : "",
      aiSettings.useTermbaseContext ? "local termbase hits" : "",
      aiSettings.styleGuide ? "style instructions" : ""
    ].filter(Boolean);
    if (
      !consent.externalShare({
        provider: "OpenAI",
        includesSourceText: true,
        contextLabels
      })
    ) {
      status.set("OpenAI suggestion canceled", "dirty");
      return undefined;
    }

    const previousProject = structuredClone(project);
    const previousProjects = editorSessionStore.getProjects().map((item) => structuredClone(item));
    const previousKey = keys.snapshot();
    let projectPersisted = false;
    try {
      beforeProjectSave(project);
      const savedProject = await persistence.updateProject({ ...project, aiSettings });
      editorSessionStore.replaceProject(savedProject);
      projectPersisted = true;
      replaceProjectInList(savedProject);
      keys.save(apiKey, Boolean(secrets.rememberOpenAiKey));
      workspace.markDirty();
      presentation.renderEditor();
      status.set("Requesting OpenAI suggestion...");
    } catch (error) {
      await restoreProject(previousProject, previousProjects, projectPersisted);
      keys.restore(previousKey);
      presentation.renderEditor();
      status.set(error.message || "OpenAI suggestion setup failed", "dirty");
      return undefined;
    }
    try {
      const [tmMatches, terms] = await context.forSegment(segment, aiSettings);
      const suggestion = await provider.request({
        apiKey,
        segment,
        tmMatches,
        terms,
        project: editorSessionStore.getProject()
      });
      const saved = await suggestions.append(segment, suggestion);
      if (saved?.ok) {
        status.set(
          saved.activityLogged
            ? "OpenAI suggestion ready for review"
            : "OpenAI suggestion ready for review; activity log failed",
          saved.activityLogged ? "saved" : "dirty"
        );
      }
    } catch (error) {
      status.set(error.message || "OpenAI suggestion failed", "dirty");
    }
    return undefined;
  }

  return Object.freeze({ create });
}
