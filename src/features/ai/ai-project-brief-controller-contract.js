export function validateAiProjectBriefControllerOptions(options) {
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
}
