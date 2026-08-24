export function validateAiSuggestionApplicationControllerOptions(options) {
  const editorSessionStore = options?.editorSessionStore;
  const commands = options?.commands;
  const selection = options?.selection;
  const mutation = options?.mutation;
  const persistence = options?.persistence;
  const activity = options?.activity;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;

  if (
    typeof editorSessionStore?.getProject !== "function" ||
    typeof editorSessionStore?.getSegments !== "function" ||
    typeof editorSessionStore?.replaceSegmentAt !== "function"
  ) {
    throw new TypeError("AiSuggestionApplicationController requires EditorSessionStore boundaries.");
  }
  if (
    typeof commands?.bus?.execute !== "function" ||
    typeof commands?.create !== "function" ||
    typeof commands?.changed !== "function"
  ) {
    throw new TypeError("AiSuggestionApplicationController requires CommandBus boundaries.");
  }
  if (typeof selection?.getActiveIndex !== "function" || typeof selection?.goToNextOpen !== "function") {
    throw new TypeError("AiSuggestionApplicationController requires selection boundaries.");
  }
  if (
    typeof mutation?.applyTarget !== "function" ||
    typeof mutation?.touch !== "function" ||
    typeof mutation?.restoreInPlace !== "function" ||
    typeof mutation?.prepareHistory !== "function" ||
    typeof mutation?.prepareRestoreSnapshot !== "function"
  ) {
    throw new TypeError("AiSuggestionApplicationController requires target mutation boundaries.");
  }
  if (
    typeof persistence?.flush !== "function" ||
    typeof persistence?.clearPending !== "function" ||
    typeof persistence?.save !== "function"
  ) {
    throw new TypeError("AiSuggestionApplicationController requires persistence boundaries.");
  }
  if (
    typeof activity?.log !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof workspace?.markActivityWarningDirty !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError("AiSuggestionApplicationController requires activity, workspace, and status boundaries.");
  }
  for (const boundary of [
    "renderSegments",
    "renderProgress",
    "renderHistory",
    "renderSuggestions",
    "refreshSidebar",
    "renderAll",
    "focusTarget"
  ]) {
    if (typeof presentation?.[boundary] !== "function") {
      throw new TypeError(`AiSuggestionApplicationController requires the ${boundary} presentation boundary.`);
    }
  }
}
