const PRETRANSLATION_API_ORDER = Object.freeze([
  "isLockedSegment",
  "segmentSkipReason",
  "selectSegments",
  "applyAiPretranslation",
  "pretranslateSegments"
]);

const AI_COMMAND_API_ORDER = Object.freeze([
  "buildAiReviewPrompt",
  "buildTagRepairPrompt",
  "buildTargetVariantsPrompt",
  "buildStylePolishPrompt",
  "buildDraftAdaptationPrompt",
  "buildTerminologyExtractionPrompt",
  "buildTerminologyApplicationPrompt",
  "parseAiReviewRisk",
  "normalizeAiReviewRiskLevel",
  "extractSegmentTerms",
  "applyTerminology",
  "generateProjectBrief",
  "adaptSegmentDraft",
  "polishSegmentStyle",
  "repairSegmentTags",
  "suggestSegmentVariants",
  "reviewSegment"
]);

const LAZY_AI_COMMAND_METHODS = new Set([
  "extractSegmentTerms",
  "applyTerminology",
  "generateProjectBrief",
  "adaptSegmentDraft",
  "polishSegmentStyle",
  "repairSegmentTags",
  "suggestSegmentVariants",
  "reviewSegment"
]);

function defaultLoader() {
  // @ts-expect-error The legacy AI domain script installs its compatibility implementation by side effect.
  return import("../../ai-command-domain.js");
}

function hasOrderedFunctions(boundary, order) {
  return order.every((method) => typeof boundary?.[method] === "function");
}

export function installLazyAiCommandDomain(browserWindow, options = {}) {
  const ai = browserWindow?.CatHan?.ai;
  if (!ai || typeof ai !== "object") {
    throw new TypeError("Lazy AI command domain requires the LoopCAT AI compatibility module.");
  }
  if (
    typeof ai.openAiSuggestion !== "function" ||
    !hasOrderedFunctions(ai.preTranslationService, PRETRANSLATION_API_ORDER) ||
    !hasOrderedFunctions(ai.aiCommandService, AI_COMMAND_API_ORDER)
  ) {
    throw new TypeError("Lazy AI command domain requires complete synchronous compatibility contracts.");
  }
  const load = Object.hasOwn(options, "load") ? options.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy AI command domain requires a load function.");

  const synchronousPretranslation = Object.fromEntries(
    PRETRANSLATION_API_ORDER.slice(0, -1).map((method) => [method, ai.preTranslationService[method]])
  );
  const synchronousCommands = Object.fromEntries(
    AI_COMMAND_API_ORDER.filter((method) => !LAZY_AI_COMMAND_METHODS.has(method)).map((method) => [
      method,
      ai.aiCommandService[method]
    ])
  );
  let implementationPromise = null;
  let lazyOpenAiSuggestion;
  let lazyPreTranslationService;
  let lazyAiCommandService;

  function restoreLazyModule() {
    ai.openAiSuggestion = lazyOpenAiSuggestion;
    ai.preTranslationService = lazyPreTranslationService;
    ai.aiCommandService = lazyAiCommandService;
  }

  function loadImplementation() {
    if (!implementationPromise) {
      implementationPromise = Promise.resolve()
        .then(() => load())
        .then(() => {
          if (
            ai.openAiSuggestion === lazyOpenAiSuggestion ||
            typeof ai.openAiSuggestion !== "function" ||
            ai.preTranslationService === lazyPreTranslationService ||
            !hasOrderedFunctions(ai.preTranslationService, PRETRANSLATION_API_ORDER) ||
            ai.aiCommandService === lazyAiCommandService ||
            !hasOrderedFunctions(ai.aiCommandService, AI_COMMAND_API_ORDER)
          ) {
            throw new TypeError("Lazy AI command domain did not install its implementation.");
          }
          return {
            openAiSuggestion: ai.openAiSuggestion,
            preTranslationService: ai.preTranslationService,
            aiCommandService: ai.aiCommandService
          };
        })
        .catch((error) => {
          implementationPromise = null;
          restoreLazyModule();
          throw new Error("AI command domain could not be loaded. Try again.", { cause: error });
        });
    }
    return implementationPromise;
  }

  async function invokeOpenAiSuggestion(args) {
    const implementation = await loadImplementation();
    return implementation.openAiSuggestion.apply(ai, args);
  }

  async function invokeService(serviceName, method, args) {
    const implementation = await loadImplementation();
    const service = implementation[serviceName];
    return service[method](...args);
  }

  lazyOpenAiSuggestion = (...args) => invokeOpenAiSuggestion(args);
  lazyPreTranslationService = {};
  PRETRANSLATION_API_ORDER.forEach((method) => {
    lazyPreTranslationService[method] =
      method === "pretranslateSegments"
        ? (...args) => invokeService("preTranslationService", method, args)
        : synchronousPretranslation[method];
  });
  lazyAiCommandService = {};
  AI_COMMAND_API_ORDER.forEach((method) => {
    lazyAiCommandService[method] = LAZY_AI_COMMAND_METHODS.has(method)
      ? (...args) => invokeService("aiCommandService", method, args)
      : synchronousCommands[method];
  });
  restoreLazyModule();

  return Object.freeze({
    load: loadImplementation,
    openAiSuggestion: lazyOpenAiSuggestion,
    preTranslationService: lazyPreTranslationService,
    aiCommandService: lazyAiCommandService
  });
}

if (globalThis.window?.CatHan?.ai) installLazyAiCommandDomain(globalThis.window);
