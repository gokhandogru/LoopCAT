function hasFunctions(boundary, methods) {
  return methods.every((method) => typeof boundary?.[method] === "function");
}

export function validateAiDraftEditingControllerOptions(options, boundaries = options) {
  if (
    !hasFunctions(boundaries?.editorSessionStore, ["getProject", "getSegments", "replaceSegments"]) ||
    !hasFunctions(boundaries?.selection, ["getActiveSegment"])
  ) {
    throw new TypeError("AiDraftEditingController requires EditorSessionStore and selection boundaries.");
  }
  if (!hasFunctions(boundaries?.scope, ["getVisibleSegments", "getDocumentSegments", "isLocked", "getTags"])) {
    throw new TypeError("AiDraftEditingController requires translated-draft scope boundaries.");
  }
  if (
    !hasFunctions(boundaries?.settings, ["persist", "runtimeConfig", "assertReady"]) ||
    !hasFunctions(boundaries?.providers, ["get", "sharesExternally"]) ||
    !hasFunctions(boundaries?.consent, ["externalShare"]) ||
    !hasFunctions(boundaries?.context, ["termsForSegment", "tmMatchesForSegment"]) ||
    !hasFunctions(boundaries?.domain, ["polish", "adapt"])
  ) {
    throw new TypeError(
      "AiDraftEditingController requires settings, provider, consent, context, and domain boundaries."
    );
  }
  if (!hasFunctions(boundaries?.lifecycle, ["isRunning", "isPromptBusy", "sync"])) {
    throw new TypeError("AiDraftEditingController requires shared AI lifecycle boundaries.");
  }
  if (
    !hasFunctions(boundaries?.suggestions, ["append", "normalize", "nextId"]) ||
    !hasFunctions(boundaries?.persistence, ["flush", "saveMany", "load"])
  ) {
    throw new TypeError("AiDraftEditingController requires suggestion and persistence boundaries.");
  }
  if (
    !hasFunctions(boundaries?.mutation, ["touch", "clearPending", "restore", "prepareHistory", "prepareHistories"]) ||
    !hasFunctions(boundaries?.presentation, [
      "renderCommandCentre",
      "renderAiProgress",
      "renderOutput",
      "renderAll",
      "refreshSidebar"
    ])
  ) {
    throw new TypeError("AiDraftEditingController requires mutation and presentation boundaries.");
  }
  if (
    !hasFunctions(boundaries?.activity, ["logBatch"]) ||
    !hasFunctions(boundaries?.workspace, ["markDirty"]) ||
    !hasFunctions(boundaries?.status, ["set"]) ||
    typeof boundaries?.redact !== "function"
  ) {
    throw new TypeError("AiDraftEditingController requires activity, workspace, status, and redaction boundaries.");
  }
}

export function validateAiReviewControllerOptions(options, boundaries = options) {
  if (
    !hasFunctions(boundaries?.editorSessionStore, ["getProject", "getSegments", "replaceSegments"]) ||
    !hasFunctions(boundaries?.selection, ["getActiveSegment", "getActiveIndex"])
  ) {
    throw new TypeError("AiReviewController requires EditorSessionStore and selection boundaries.");
  }
  if (!hasFunctions(boundaries?.scope, ["getVisibleSegments", "getDocumentSegments", "isLocked"])) {
    throw new TypeError("AiReviewController requires review scope boundaries.");
  }
  if (
    !hasFunctions(boundaries?.settings, ["persist", "runtimeConfig", "assertReady"]) ||
    !hasFunctions(boundaries?.providers, ["get", "sharesExternally"]) ||
    !hasFunctions(boundaries?.consent, ["externalShare"])
  ) {
    throw new TypeError("AiReviewController requires settings, provider, and consent boundaries.");
  }
  if (
    !hasFunctions(boundaries?.context, ["findTerms", "getTermBaseNames"]) ||
    !hasFunctions(boundaries?.domain, ["reviewSegment", "parseRisk"])
  ) {
    throw new TypeError("AiReviewController requires prompt-context and review-domain boundaries.");
  }
  if (!hasFunctions(boundaries?.lifecycle, ["isRunning", "isPromptBusy", "sync"])) {
    throw new TypeError("AiReviewController requires shared AI lifecycle boundaries.");
  }
  if (!hasFunctions(boundaries?.persistence, ["flush", "saveOne", "saveMany", "load"])) {
    throw new TypeError("AiReviewController requires persistence boundaries.");
  }
  if (!hasFunctions(boundaries?.mutation, ["touch", "clearPending", "restore", "prepareHistory", "prepareHistories"])) {
    throw new TypeError("AiReviewController requires review mutation boundaries.");
  }
  if (
    !hasFunctions(boundaries?.presentation, [
      "renderCommandCentre",
      "renderAiProgress",
      "renderOutput",
      "renderReview",
      "updateRow",
      "renderAll",
      "refreshSidebar",
      "renderSegments",
      "renderProjectProgress",
      "renderHistory"
    ])
  ) {
    throw new TypeError("AiReviewController requires presentation boundaries.");
  }
  if (
    !hasFunctions(boundaries?.activity, ["logActive", "logBatch"]) ||
    !hasFunctions(boundaries?.workspace, ["markDirty"]) ||
    !hasFunctions(boundaries?.status, ["set"]) ||
    !hasFunctions(boundaries?.labels, ["risk"]) ||
    typeof boundaries?.redact !== "function"
  ) {
    throw new TypeError("AiReviewController requires activity, workspace, status, label, and redaction boundaries.");
  }
}

export function validateAiAlternativesControllerOptions(options, boundaries = options) {
  if (
    !hasFunctions(boundaries?.editorSessionStore, ["getProject", "getSegments", "replaceSegments"]) ||
    !hasFunctions(boundaries?.selection, ["getActiveSegment", "getActiveIndex"])
  ) {
    throw new TypeError("AiAlternativesController requires EditorSessionStore and selection boundaries.");
  }
  if (!hasFunctions(boundaries?.scope, ["getVisibleSegments", "getDocumentSegments", "isLocked", "getTags"])) {
    throw new TypeError("AiAlternativesController requires translated-draft scope boundaries.");
  }
  if (
    !hasFunctions(boundaries?.settings, ["persist", "runtimeConfig", "assertReady"]) ||
    !hasFunctions(boundaries?.providers, ["get", "sharesExternally"]) ||
    !hasFunctions(boundaries?.consent, ["externalShare"]) ||
    !hasFunctions(boundaries?.context, ["activeTerms", "batchTerms"]) ||
    !hasFunctions(boundaries?.domain, ["suggestSegmentVariants"])
  ) {
    throw new TypeError(
      "AiAlternativesController requires settings, provider, consent, context, and domain boundaries."
    );
  }
  if (!hasFunctions(boundaries?.lifecycle, ["isRunning", "isPromptBusy", "sync"])) {
    throw new TypeError("AiAlternativesController requires shared AI lifecycle boundaries.");
  }
  if (!hasFunctions(boundaries?.suggestions, ["normalize", "nextId"])) {
    throw new TypeError("AiAlternativesController requires suggestion boundaries.");
  }
  if (
    !hasFunctions(boundaries?.persistence, ["flush", "saveOne", "saveMany", "load"]) ||
    !hasFunctions(boundaries?.mutation, ["touch", "clearPending", "restore", "prepareHistory", "prepareHistories"])
  ) {
    throw new TypeError("AiAlternativesController requires persistence and mutation boundaries.");
  }
  if (
    !hasFunctions(boundaries?.presentation, [
      "renderCommandCentre",
      "renderAiProgress",
      "renderOutput",
      "renderSuggestions",
      "updateRow",
      "renderAll",
      "refreshSidebar"
    ]) ||
    !hasFunctions(boundaries?.activity, ["logActive", "logBatch"]) ||
    !hasFunctions(boundaries?.workspace, ["markDirty"]) ||
    !hasFunctions(boundaries?.status, ["set"]) ||
    typeof boundaries?.redact !== "function"
  ) {
    throw new TypeError(
      "AiAlternativesController requires presentation, activity, workspace, status, and redaction boundaries."
    );
  }
}

export function validateAiTerminologyApplicationControllerOptions(options, boundaries = options) {
  if (
    !hasFunctions(boundaries?.editorSessionStore, ["getProject", "getSegments", "replaceSegments"]) ||
    !hasFunctions(boundaries?.selection, ["getActiveSegment", "getActiveIndex"])
  ) {
    throw new TypeError("AiTerminologyApplicationController requires EditorSessionStore and selection boundaries.");
  }
  if (!hasFunctions(boundaries?.scope, ["getVisibleSegments", "getDocumentSegments", "isLocked", "getTags"])) {
    throw new TypeError("AiTerminologyApplicationController requires translated-draft scope boundaries.");
  }
  if (
    !hasFunctions(boundaries?.settings, ["persist", "runtimeConfig", "assertReady"]) ||
    !hasFunctions(boundaries?.providers, ["get", "sharesExternally"]) ||
    !hasFunctions(boundaries?.consent, ["externalShare"]) ||
    !hasFunctions(boundaries?.context, ["termsForSegment"]) ||
    !hasFunctions(boundaries?.domain, ["applyTerminology"])
  ) {
    throw new TypeError(
      "AiTerminologyApplicationController requires settings, provider, consent, context, and domain boundaries."
    );
  }
  if (!hasFunctions(boundaries?.lifecycle, ["isRunning", "isPromptBusy", "sync"])) {
    throw new TypeError("AiTerminologyApplicationController requires shared AI lifecycle boundaries.");
  }
  if (!hasFunctions(boundaries?.suggestions, ["append", "normalize", "nextId"])) {
    throw new TypeError("AiTerminologyApplicationController requires suggestion boundaries.");
  }
  if (
    !hasFunctions(boundaries?.persistence, ["flush", "saveMany", "load"]) ||
    !hasFunctions(boundaries?.mutation, ["touch", "clearPending", "restore", "prepareHistory", "prepareHistories"])
  ) {
    throw new TypeError("AiTerminologyApplicationController requires persistence and mutation boundaries.");
  }
  if (
    !hasFunctions(boundaries?.presentation, [
      "renderCommandCentre",
      "renderAiProgress",
      "renderOutput",
      "renderSuggestions",
      "updateRow",
      "renderAll",
      "refreshSidebar"
    ]) ||
    !hasFunctions(boundaries?.activity, ["logBatch"]) ||
    !hasFunctions(boundaries?.workspace, ["markDirty"]) ||
    !hasFunctions(boundaries?.status, ["set"]) ||
    typeof boundaries?.redact !== "function"
  ) {
    throw new TypeError(
      "AiTerminologyApplicationController requires presentation, activity, workspace, status, and redaction boundaries."
    );
  }
}

export function validateAiTagRepairControllerOptions(options, boundaries = options) {
  if (
    !hasFunctions(boundaries?.editorSessionStore, ["getProject", "getSegments", "replaceSegments"]) ||
    !hasFunctions(boundaries?.selection, ["getActiveSegment"])
  ) {
    throw new TypeError("AiTagRepairController requires EditorSessionStore and selection boundaries.");
  }
  if (
    !hasFunctions(boundaries?.scope, [
      "getVisibleSegments",
      "getDocumentSegments",
      "isLocked",
      "getTags",
      "getMissingTags",
      "tagText"
    ])
  ) {
    throw new TypeError("AiTagRepairController requires protected-tag scope boundaries.");
  }
  if (
    !hasFunctions(boundaries?.settings, ["persist", "runtimeConfig", "assertReady"]) ||
    !hasFunctions(boundaries?.providers, ["get", "sharesExternally"]) ||
    !hasFunctions(boundaries?.consent, ["externalShare"]) ||
    !hasFunctions(boundaries?.domain, ["repairSegmentTags"])
  ) {
    throw new TypeError("AiTagRepairController requires settings, provider, consent, and domain boundaries.");
  }
  if (!hasFunctions(boundaries?.lifecycle, ["isRunning", "isPromptBusy", "sync"])) {
    throw new TypeError("AiTagRepairController requires shared AI lifecycle boundaries.");
  }
  if (!hasFunctions(boundaries?.suggestions, ["append", "normalize", "nextId"])) {
    throw new TypeError("AiTagRepairController requires suggestion boundaries.");
  }
  if (
    !hasFunctions(boundaries?.persistence, ["flush", "saveMany", "load"]) ||
    !hasFunctions(boundaries?.mutation, ["touch", "clearPending", "restore", "prepareHistory", "prepareHistories"])
  ) {
    throw new TypeError("AiTagRepairController requires persistence and mutation boundaries.");
  }
  if (
    !hasFunctions(boundaries?.presentation, [
      "renderCommandCentre",
      "renderAiProgress",
      "renderOutput",
      "renderAll",
      "refreshSidebar"
    ]) ||
    !hasFunctions(boundaries?.activity, ["logBatch"]) ||
    !hasFunctions(boundaries?.workspace, ["markDirty"]) ||
    !hasFunctions(boundaries?.status, ["set"]) ||
    typeof boundaries?.redact !== "function"
  ) {
    throw new TypeError(
      "AiTagRepairController requires presentation, activity, workspace, status, and redaction boundaries."
    );
  }
}

export function validateAiPretranslationControllerOptions(options, boundaries = options) {
  if (!hasFunctions(boundaries?.editorSessionStore, ["getProject", "getSegments", "replaceSegments"])) {
    throw new TypeError("AiPretranslationController requires EditorSessionStore boundaries.");
  }
  if (!hasFunctions(boundaries?.settings, ["persist", "runtimeConfig", "assertReady", "projectDefaults"])) {
    throw new TypeError("AiPretranslationController requires settings boundaries.");
  }
  if (
    !hasFunctions(boundaries?.providers, ["get", "sharesExternally"]) ||
    !hasFunctions(boundaries?.consent, ["externalShare", "overwrite"])
  ) {
    throw new TypeError("AiPretranslationController requires provider and consent boundaries.");
  }
  if (
    !hasFunctions(boundaries?.scope, ["getSegments", "getOptions"]) ||
    !hasFunctions(boundaries?.domain, ["selectSegments", "pretranslateSegments"])
  ) {
    throw new TypeError("AiPretranslationController requires scope and provider-domain boundaries.");
  }
  if (
    !hasFunctions(boundaries?.context, [
      "glossaryTermsForSegment",
      "tmMatchesForSegment",
      "surroundingSegmentsForSegment"
    ])
  ) {
    throw new TypeError("AiPretranslationController requires prompt-context boundaries.");
  }
  if (!hasFunctions(boundaries?.lifecycle, ["isBusy", "sync"])) {
    throw new TypeError("AiPretranslationController requires shared AI lifecycle boundaries.");
  }
  if (
    !hasFunctions(boundaries?.commands?.bus, ["execute"]) ||
    !hasFunctions(boundaries?.commands, ["create", "changed"])
  ) {
    throw new TypeError("AiPretranslationController requires command boundaries.");
  }
  if (!hasFunctions(boundaries?.persistence, ["flush", "save", "load"])) {
    throw new TypeError("AiPretranslationController requires persistence boundaries.");
  }
  if (
    !hasFunctions(boundaries?.mutation, [
      "capturePatch",
      "applyPatch",
      "clearPending",
      "recordHistory",
      "touch",
      "restore",
      "prepareHistory",
      "prepareHistories"
    ])
  ) {
    throw new TypeError("AiPretranslationController requires target mutation boundaries.");
  }
  if (
    !hasFunctions(boundaries?.restoration, ["restorePatches"]) ||
    !hasFunctions(boundaries?.selection, ["getActiveSegmentId"])
  ) {
    throw new TypeError("AiPretranslationController requires restoration and selection boundaries.");
  }
  if (
    !hasFunctions(boundaries?.presentation, [
      "invalidateFilters",
      "renderAll",
      "renderSegments",
      "renderProjectProgress",
      "renderHistory",
      "renderAiProgress",
      "renderCommandCentre",
      "refreshSidebar"
    ])
  ) {
    throw new TypeError("AiPretranslationController requires presentation boundaries.");
  }
  if (
    !hasFunctions(boundaries?.activity, ["log"]) ||
    !hasFunctions(boundaries?.workspace, ["markDirty"]) ||
    !hasFunctions(boundaries?.status, ["set"])
  ) {
    throw new TypeError("AiPretranslationController requires activity, workspace, and status boundaries.");
  }
}

export function validateAiTerminologyExtractionControllerOptions(options, boundaries = options) {
  if (
    !hasFunctions(boundaries?.editorSessionStore, ["getProject"]) ||
    !hasFunctions(boundaries?.selection, ["getActiveSegment"]) ||
    !hasFunctions(boundaries?.scope, ["getSegments"])
  ) {
    throw new TypeError(
      "AiTerminologyExtractionController requires EditorSessionStore, selection, and scope boundaries."
    );
  }
  if (
    !hasFunctions(boundaries?.termbase, ["getSelectedName", "saveCandidates"]) ||
    !hasFunctions(boundaries?.settings, ["persist", "runtimeConfig", "assertReady"]) ||
    !hasFunctions(boundaries?.providers, ["get", "sharesExternally"]) ||
    !hasFunctions(boundaries?.consent, ["externalShare"]) ||
    !hasFunctions(boundaries?.domain, ["extractSegmentTerms"])
  ) {
    throw new TypeError(
      "AiTerminologyExtractionController requires termbase, settings, provider, consent, and domain boundaries."
    );
  }
  if (!hasFunctions(boundaries?.lifecycle, ["isRunning", "isPromptBusy", "sync"])) {
    throw new TypeError("AiTerminologyExtractionController requires shared AI lifecycle boundaries.");
  }
  if (
    !hasFunctions(boundaries?.presentation, [
      "renderCommandCentre",
      "renderAiProgress",
      "renderOutput",
      "refreshProjectTerms",
      "refreshTerms"
    ]) ||
    !hasFunctions(boundaries?.activity, ["logActive", "logBatch"]) ||
    !hasFunctions(boundaries?.workspace, ["markDirty"]) ||
    !hasFunctions(boundaries?.status, ["set"])
  ) {
    throw new TypeError(
      "AiTerminologyExtractionController requires presentation, activity, workspace, and status boundaries."
    );
  }
}
