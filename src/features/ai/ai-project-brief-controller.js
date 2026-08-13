/**
 * Owns AI project-brief validation, consent, context routing, prompt lifecycle,
 * style-guide mutation, project persistence/list synchronization, secondary
 * effects, presentation, and exact in-memory recovery. Provider adapters,
 * records, context selection, repositories, and AI administration stay
 * injected.
 *
 * @param {{
 *   editorSessionStore: { getProject: () => any, getProjects: () => any[], replaceProject: (project: any) => void, replaceProjects: (projects: any[]) => void },
 *   settings: { persist: () => Promise<any>, runtimeConfig: (settings: any) => any, assertReady: (settings: any, config: any, action: string) => void, normalizeProjectAiSettings: (settings: any) => any },
 *   providers: { get: (settings: any) => any, sharesExternally: (settings: any) => boolean },
 *   consent: { externalShare: (details: object) => boolean },
 *   context: { getSampleSegments: () => any[], getDocuments: () => any[], getTerms: (project: any) => Promise<any[]> },
 *   domain: { generateProjectBrief: (options: object) => Promise<any> },
 *   lifecycle: { isRunning: () => boolean, isPromptBusy: () => boolean, sync: (state: { promptBusy: boolean }) => void },
 *   persistence: { updateProject: (project: any) => Promise<any> },
 *   administration: { setStyleGuide: (value: string) => void },
 *   presentation: { renderCommandCentre: () => void, renderOutput: (text: string, options?: object) => void },
 *   activity: { log: (details: object) => Promise<unknown> | unknown },
 *   workspace: { markDirty: () => void },
 *   status: { set: (message: string, mode?: string) => void },
 *   logger?: { warn?: (...args: any[]) => void }
 * }} options
 */
export function createAiProjectBriefController(options) {
  const editorSessionStore = options?.editorSessionStore;
  const settingsBoundary = options?.settings;
  const providers = options?.providers;
  const consent = options?.consent;
  const context = options?.context;
  const domain = options?.domain;
  const lifecycle = options?.lifecycle;
  const persistence = options?.persistence;
  const administration = options?.administration;
  const presentation = options?.presentation;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const status = options?.status;

  if (
    typeof editorSessionStore?.getProject !== "function" ||
    typeof editorSessionStore?.getProjects !== "function" ||
    typeof editorSessionStore?.replaceProject !== "function" ||
    typeof editorSessionStore?.replaceProjects !== "function"
  ) {
    throw new TypeError("AiProjectBriefController requires EditorSessionStore boundaries.");
  }
  if (
    typeof settingsBoundary?.persist !== "function" ||
    typeof settingsBoundary?.runtimeConfig !== "function" ||
    typeof settingsBoundary?.assertReady !== "function" ||
    typeof settingsBoundary?.normalizeProjectAiSettings !== "function" ||
    typeof providers?.get !== "function" ||
    typeof providers?.sharesExternally !== "function" ||
    typeof consent?.externalShare !== "function" ||
    typeof context?.getSampleSegments !== "function" ||
    typeof context?.getDocuments !== "function" ||
    typeof context?.getTerms !== "function" ||
    typeof domain?.generateProjectBrief !== "function"
  ) {
    throw new TypeError(
      "AiProjectBriefController requires settings, provider, consent, context, and domain boundaries."
    );
  }
  if (
    typeof lifecycle?.isRunning !== "function" ||
    typeof lifecycle?.isPromptBusy !== "function" ||
    typeof lifecycle?.sync !== "function" ||
    typeof persistence?.updateProject !== "function" ||
    typeof administration?.setStyleGuide !== "function" ||
    typeof presentation?.renderCommandCentre !== "function" ||
    typeof presentation?.renderOutput !== "function" ||
    typeof activity?.log !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "AiProjectBriefController requires lifecycle, persistence, administration, presentation, activity, workspace, and status boundaries."
    );
  }

  const logger = options.logger || console;
  let promptBusy = false;

  function syncLifecycle() {
    lifecycle.sync({ promptBusy });
  }

  function replaceProjectInList(project) {
    editorSessionStore.replaceProjects(
      editorSessionStore.getProjects().map((item) => (item.id === project.id ? project : item))
    );
  }

  async function generate() {
    const project = editorSessionStore.getProject();
    if (!project || lifecycle.isRunning() || promptBusy || lifecycle.isPromptBusy()) return false;
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "generating a project brief");
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return false;
    }
    const provider = providers.get(settings);
    if (!provider?.completePrompt) {
      status.set("AI project brief generation is not available for this provider.", "dirty");
      return false;
    }
    const sampleSegments = context.getSampleSegments();
    if (
      providers.sharesExternally(settings) &&
      !consent.externalShare({
        provider: provider.name || settings.providerId,
        includesSourceText: sampleSegments.length > 0,
        contextLabels: [
          "project metadata",
          "document names",
          "sample segments",
          "termbase hints",
          "configured provider URL"
        ]
      })
    ) {
      status.set("AI project brief canceled", "dirty");
      return false;
    }

    const projectSnapshot = structuredClone(project);
    promptBusy = true;
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set("Generating AI project brief...");
    try {
      const documents = context.getDocuments();
      const terms = await context.getTerms(project);
      const result = await domain.generateProjectBrief({
        provider,
        project,
        settings,
        config,
        sourceLanguage: settings.sourceLanguage,
        sourceCode: settings.sourceCode,
        targetLanguage: settings.targetLanguage,
        targetCode: settings.targetCode,
        documents,
        sampleSegments,
        terms: terms.slice(0, 12)
      });
      const existingStyle = String(project.aiSettings?.styleGuide || "").trim();
      const generatedBlock = `AI project brief:\n${result.brief.trim()}`;
      const nextStyleGuide = existingStyle ? `${existingStyle}\n\n${generatedBlock}` : generatedBlock;
      const aiSettings = settingsBoundary.normalizeProjectAiSettings({
        ...project.aiSettings,
        styleGuide: nextStyleGuide
      });
      const savedProject = await persistence.updateProject({ ...project, aiSettings });
      editorSessionStore.replaceProject(savedProject);
      replaceProjectInList(savedProject);
      workspace.markDirty();
      let activityLogged = true;
      try {
        await activity.log({
          provider: result.provider || provider.name || settings.providerId,
          model: result.model || settings.model,
          sampleCount: sampleSegments.length,
          termCount: Math.min(terms.length, 12)
        });
      } catch (activityError) {
        activityLogged = false;
        logger.warn?.("AI project brief activity log failed.", activityError);
        workspace.markDirty();
      }
      administration.setStyleGuide(savedProject.aiSettings.styleGuide || "");
      presentation.renderOutput(result.brief);
      status.set(
        activityLogged ? "AI project brief saved to style instructions" : "AI project brief saved; activity log failed",
        activityLogged ? "saved" : "dirty"
      );
      return true;
    } catch (error) {
      editorSessionStore.replaceProject(projectSnapshot);
      replaceProjectInList(projectSnapshot);
      administration.setStyleGuide(
        settingsBoundary.normalizeProjectAiSettings(projectSnapshot.aiSettings).styleGuide || ""
      );
      const message = error.message || "AI project brief failed.";
      presentation.renderOutput(message, { muted: false });
      status.set(message, "dirty");
      return false;
    } finally {
      promptBusy = false;
      syncLifecycle();
      presentation.renderCommandCentre();
    }
  }

  return Object.freeze({ generate });
}
