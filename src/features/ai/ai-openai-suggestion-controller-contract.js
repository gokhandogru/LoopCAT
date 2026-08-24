export function validateAiOpenAiSuggestionControllerOptions(options) {
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
}
