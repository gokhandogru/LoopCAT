const LOCAL_PRETRANSLATION_MODES = new Set(["selected", "document", "untranslated", "visible", "project"]);
const LOCAL_VARIANT_MODES = new Set(["standard", "formal", "concise", "locale", "plain"]);
const LOCAL_ADAPT_MODES = new Set(["simplify", "formalize", "localize", "shorten"]);

const HOSTED_COMPATIBLE_ENDPOINT_ERROR =
  "This hosted OpenAI-compatible endpoint is not in LoopCAT's explicit provider allowlist. Choose a named hosted provider preset or use a loopback server such as LM Studio.";

/**
 * Owns AI project-setting normalization, local form/project composition,
 * hosted-compatible endpoint eligibility, credential-aware runtime config,
 * and provider-key readiness. Form ownership, settings persistence/defaults,
 * credentials, language/provider policy, project records, presentation, and
 * status remain injected.
 *
 * @param {{
 *   project: { get: () => any },
 *   administration: { readLocalForm: () => any, readSecrets: () => any },
 *   localSettings: {
 *     projectSettings: (project: any) => any,
 *     defaults: (settings: any, project: any) => any
 *   },
 *   languages: {
 *     normalizeInput: (value: any) => string,
 *     nameForUi: (value: any) => string
 *   },
 *   endpoints: { isAllowedHostedCompatible: (baseUrl: string) => boolean },
 *   providers: { needsApiKey: (providerId: string, baseUrl: string) => boolean },
 *   credentials: {
 *     saveLocal: (value: string, remember: boolean, settings: any) => void,
 *     readLocal: (settings: any) => string,
 *     readOpenAi: () => string
 *   },
 *   redact: (value: any) => string,
 *   defaults: {
 *     openAiModel: string,
 *     projectLocalProviderId: string,
 *     projectLocalBaseUrl: string,
 *     projectLocalModel: string,
 *     localBaseUrl: string,
 *     localModel: string
 *   }
 * }} options
 */
export function createAiRuntimeSettingsService(options) {
  const projectBoundary = options?.project;
  const administration = options?.administration;
  const localSettings = options?.localSettings;
  const languages = options?.languages;
  const endpoints = options?.endpoints;
  const providers = options?.providers;
  const credentials = options?.credentials;
  const redact = options?.redact;
  const defaults = options?.defaults;
  if (
    typeof projectBoundary?.get !== "function" ||
    typeof administration?.readLocalForm !== "function" ||
    typeof administration?.readSecrets !== "function" ||
    typeof localSettings?.projectSettings !== "function" ||
    typeof localSettings?.defaults !== "function" ||
    typeof languages?.normalizeInput !== "function" ||
    typeof languages?.nameForUi !== "function" ||
    typeof endpoints?.isAllowedHostedCompatible !== "function" ||
    typeof providers?.needsApiKey !== "function" ||
    typeof credentials?.saveLocal !== "function" ||
    typeof credentials?.readLocal !== "function" ||
    typeof credentials?.readOpenAi !== "function" ||
    typeof redact !== "function" ||
    !defaults?.openAiModel ||
    !defaults?.projectLocalProviderId ||
    !defaults?.projectLocalBaseUrl ||
    !defaults?.projectLocalModel ||
    !defaults?.localBaseUrl ||
    !defaults?.localModel
  ) {
    throw new TypeError(
      "AiRuntimeSettingsService requires project, form, local-settings, language, endpoint, provider, credential, redaction, and default boundaries."
    );
  }

  function normalizeProjectSettings(settings = {}) {
    const source = /** @type {Record<string, any>} */ (settings && typeof settings === "object" ? settings : {});
    const localProvider =
      redact(source.localProvider || source.localProviderId || defaults.projectLocalProviderId).trim() ||
      defaults.projectLocalProviderId;
    const localBaseUrl =
      redact(source.localBaseUrl || defaults.projectLocalBaseUrl).trim() || defaults.projectLocalBaseUrl;
    const localModel = redact(source.localModel || defaults.projectLocalModel).trim() || defaults.projectLocalModel;
    const localSourceCode = redact(source.localSourceCode || "").trim();
    const localTargetCode = redact(source.localTargetCode || "").trim();
    const localConcurrency = Number(source.localConcurrency);
    const localTimeoutMs = Number(source.localTimeoutMs);
    const localPretranslateMode = String(source.localPretranslateMode || "").trim();
    const localVariantMode = String(source.localVariantMode || "").trim();
    const localAdaptMode = String(source.localAdaptMode || "").trim();
    return {
      enabled: Boolean(source.enabled),
      provider: redact(source.provider || "OpenAI").trim() || "OpenAI",
      model: redact(source.model || defaults.openAiModel).trim() || defaults.openAiModel,
      apiKeyMode: "bring-your-own",
      sendSourceToAi: Boolean(source.sendSourceToAi),
      useTmContext: source.useTmContext !== false,
      useTermbaseContext: source.useTermbaseContext !== false,
      styleGuide: redact(source.styleGuide || "").trim(),
      localProvider,
      localBaseUrl,
      localModel,
      localSourceLang: redact(source.localSourceLang || "").trim(),
      localSourceCode,
      localTargetLang: redact(source.localTargetLang || "").trim(),
      localTargetCode,
      localPretranslateMode: LOCAL_PRETRANSLATION_MODES.has(localPretranslateMode)
        ? localPretranslateMode
        : "untranslated",
      localVariantMode: LOCAL_VARIANT_MODES.has(localVariantMode) ? localVariantMode : "standard",
      localAdaptMode: LOCAL_ADAPT_MODES.has(localAdaptMode) ? localAdaptMode : "simplify",
      localConcurrency: Number.isFinite(localConcurrency) ? Math.min(2, Math.max(1, Math.round(localConcurrency))) : 1,
      localTimeoutMs: Number.isFinite(localTimeoutMs)
        ? Math.min(600000, Math.max(5000, Math.round(localTimeoutMs)))
        : 120000,
      localOverwrite: Boolean(source.localOverwrite),
      localPreserveConfirmedLocked: source.localPreserveConfirmedLocked !== false,
      localIncludeNearbyContext: source.localIncludeNearbyContext !== false
    };
  }

  function localSettingsFromForm() {
    const project = projectBoundary.get();
    const projectSettings = localSettings.projectSettings(project) || {};
    const form = administration.readLocalForm() || {};
    const formSourceCode = languages.normalizeInput(
      form.sourceCode || form.sourceLanguage || projectSettings.sourceCode || project?.sourceLang
    );
    const formTargetCode = languages.normalizeInput(
      form.targetCode || form.targetLanguage || projectSettings.targetCode || project?.targetLang
    );
    const formSourceLanguage = form.sourceLanguage
      ? languages.nameForUi(languages.normalizeInput(form.sourceLanguage))
      : projectSettings.sourceLanguage;
    const formTargetLanguage = form.targetLanguage
      ? languages.nameForUi(languages.normalizeInput(form.targetLanguage))
      : projectSettings.targetLanguage;
    return localSettings.defaults(
      {
        ...projectSettings,
        providerId: form.providerId || projectSettings.providerId,
        baseUrl: form.baseUrl || projectSettings.baseUrl || defaults.localBaseUrl,
        model: form.model || projectSettings.model || defaults.localModel,
        sourceLanguage: formSourceLanguage,
        sourceCode: formSourceCode || projectSettings.sourceCode || project?.sourceLang,
        targetLanguage: formTargetLanguage,
        targetCode: formTargetCode || projectSettings.targetCode || project?.targetLang,
        mode: form.mode || projectSettings.mode,
        variantMode: form.variantMode || projectSettings.variantMode,
        adaptMode: form.adaptMode || projectSettings.adaptMode,
        concurrency: form.concurrency || projectSettings.concurrency,
        timeoutMs: form.timeoutMs || projectSettings.timeoutMs,
        overwriteExisting: Boolean(form.overwriteExisting),
        includeNearbyContext: form.includeNearbyContext !== false,
        preserveConfirmedLocked: form.preserveConfirmedLocked !== false
      },
      project
    );
  }

  function assertEndpointAllowed(settings) {
    if (settings?.providerId === "openai-compatible" && !endpoints.isAllowedHostedCompatible(settings.baseUrl)) {
      throw new Error(HOSTED_COMPATIBLE_ENDPOINT_ERROR);
    }
    return true;
  }

  function runtimeConfig(settings = localSettingsFromForm()) {
    assertEndpointAllowed(settings);
    const secrets = administration.readSecrets() || {};
    const typedKey = String(secrets.localAiKey || "").trim();
    if (typedKey) {
      credentials.saveLocal(typedKey, Boolean(secrets.rememberLocalAiKey), settings);
    }
    const apiKey =
      typedKey || credentials.readLocal(settings) || (settings.providerId === "openai" ? credentials.readOpenAi() : "");
    return { ...settings, apiKey };
  }

  function assertRuntimeReady(settings, config, actionLabel = "using this provider") {
    assertEndpointAllowed(settings);
    if (providers.needsApiKey(settings.providerId, settings.baseUrl) && !String(config.apiKey || "").trim()) {
      throw new Error(`Add a provider API key before ${actionLabel}.`);
    }
    return true;
  }

  return Object.freeze({
    assertEndpointAllowed,
    assertRuntimeReady,
    localSettingsFromForm,
    normalizeProjectSettings,
    runtimeConfig
  });
}
