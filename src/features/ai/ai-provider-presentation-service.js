const PROVIDER_ENDPOINTS = Object.freeze({
  ollama: Object.freeze({ models: ["GET", "/tags"], translate: ["POST", "/chat"] }),
  "opus-cat": Object.freeze({
    models: ["GET", "/ListSupportedLanguagePairs"],
    translate: ["GET", "/TranslateJson"]
  }),
  openai: Object.freeze({ models: ["GET", "/models"], translate: ["POST", "/responses"] }),
  deepseek: Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/chat/completions"]
  }),
  gemini: Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/interactions"]
  }),
  anthropic: Object.freeze({ models: ["GET", "/models"], translate: ["POST", "/messages"] }),
  cohere: Object.freeze({ models: ["GET", "/v1/models"], translate: ["POST", "/v2/chat"] }),
  mistral: Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/chat/completions"]
  }),
  xai: Object.freeze({ models: ["GET", "/models"], translate: ["POST", "/responses"] }),
  perplexity: Object.freeze({ models: ["GET", "/models"], translate: ["POST", "/sonar"] }),
  groq: Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/chat/completions"]
  }),
  together: Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/chat/completions"]
  }),
  openrouter: Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/chat/completions"]
  }),
  huggingface: Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/chat/completions"]
  }),
  deepinfra: Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/chat/completions"]
  }),
  fireworks: Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/chat/completions"]
  }),
  "azure-openai": Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/responses"]
  }),
  "openai-compatible": Object.freeze({
    models: ["GET", "/models"],
    translate: ["POST", "/chat/completions"]
  })
});

/**
 * Owns AI provider privacy copy, endpoint/capability labels, badge policy,
 * and the administration summary view model. Provider registries, URL
 * construction, localization, credential storage, rendering, and commands
 * remain injected.
 *
 * @param {{
 *   providers: {
 *     get: (providerId: string) => any,
 *     getPreset: (settings: any) => any,
 *     needsApiKey: (providerId: string, baseUrl: string) => boolean,
 *     sharesExternally: (providerId: string, baseUrl: string, model: string) => boolean,
 *     getGuidance: (settings: any) => string
 *   },
 *   urls: Record<string, (baseUrl: string, endpoint: string) => string>,
 *   network: { isOllamaCloudBaseUrl: (baseUrl: string) => boolean },
 *   localization: { label: (key: string) => string, source: (text: string) => string },
 *   defaults: { providerId: string, baseUrl: string, model: string }
 * }} options
 */
export function createAiProviderPresentationService(options) {
  const providers = options?.providers;
  const urls = options?.urls;
  const network = options?.network;
  const localization = options?.localization;
  const defaults = options?.defaults;
  if (
    typeof providers?.get !== "function" ||
    typeof providers?.getPreset !== "function" ||
    typeof providers?.needsApiKey !== "function" ||
    typeof providers?.sharesExternally !== "function" ||
    typeof providers?.getGuidance !== "function" ||
    typeof network?.isOllamaCloudBaseUrl !== "function" ||
    typeof localization?.label !== "function" ||
    typeof localization?.source !== "function" ||
    !defaults?.providerId ||
    !defaults?.baseUrl ||
    !defaults?.model
  ) {
    throw new TypeError(
      "AiProviderPresentationService requires provider, network, localization, and default boundaries."
    );
  }
  for (const providerId of Object.keys(PROVIDER_ENDPOINTS)) {
    if (typeof urls?.[providerId] !== "function") {
      throw new TypeError(`AiProviderPresentationService requires a ${providerId} URL builder.`);
    }
  }

  function privacyText(settings) {
    const sharesExternally = providers.sharesExternally(settings.providerId, settings.baseUrl, settings.model);
    const needsKey = providers.needsApiKey(settings.providerId, settings.baseUrl);
    if (sharesExternally) {
      if (settings.providerId === "ollama" && !needsKey) {
        return "Ollama cloud model mode: requests are sent to local Ollama first, and cloud-suffixed models may be processed through Ollama Cloud after confirmation.";
      }
      return needsKey
        ? "Hosted AI mode: source text is sent to the configured provider URL after confirmation. API keys stay in this browser and are never exported with project packages."
        : "Network AI mode: source text is sent to the configured provider URL after confirmation.";
    }
    return settings.providerId === "ollama"
      ? "Local AI mode: requests are sent to the loopback provider URL below. Ollama is the default local provider."
      : "Local AI mode: requests are sent only to the loopback provider URL below.";
  }

  function endpointPathLabel(url) {
    try {
      const parsed = new URL(url);
      return parsed.pathname || "/";
    } catch {
      return String(url || "");
    }
  }

  function endpointSummary(settings = {}) {
    const providerId = settings.providerId || defaults.providerId;
    const baseUrl = settings.baseUrl || defaults.baseUrl;
    const endpoints = PROVIDER_ENDPOINTS[providerId];
    if (!endpoints) {
      return {
        models: "Model list endpoint depends on provider",
        translate: "Translation endpoint depends on provider"
      };
    }
    const buildUrl = urls[providerId];
    return {
      models: `${endpoints.models[0]} ${endpointPathLabel(buildUrl(baseUrl, endpoints.models[1]))}`,
      translate: `${endpoints.translate[0]} ${endpointPathLabel(buildUrl(baseUrl, endpoints.translate[1]))}`
    };
  }

  function canPullModel(settings, provider) {
    if (!provider?.pullModel) return false;
    if (settings.providerId === "ollama" && network.isOllamaCloudBaseUrl(settings.baseUrl)) {
      return false;
    }
    return true;
  }

  function capabilityLabels(settings, provider) {
    const labels = [];
    if (provider?.testConnection) labels.push("Connection test");
    if (provider?.listModels) labels.push("Model refresh");
    if (provider?.translateSegment) labels.push("Pre-translate");
    if (provider?.completePrompt) {
      labels.push("Prompt test");
      labels.push("Review/edit tools");
    }
    if (canPullModel(settings, provider)) labels.push("Pull model");
    if (providers.sharesExternally(settings.providerId, settings.baseUrl, settings.model)) {
      labels.push("Confirmation before send");
    }
    return labels.length ? labels : ["No AI commands available"];
  }

  function summaryView(settings) {
    const provider = providers.get(settings.providerId);
    const preset = providers.getPreset(settings);
    const sharesExternally = providers.sharesExternally(settings.providerId, settings.baseUrl, settings.model);
    const needsKey = providers.needsApiKey(settings.providerId, settings.baseUrl);
    const endpoints = endpointSummary(settings);
    const canPull = canPullModel(settings, provider);
    const guidance = providers.getGuidance(settings);
    const capabilities = capabilityLabels(settings, provider);
    const badges = [
      sharesExternally ? localization.label("hostedNetwork") : localization.label("localLoopback"),
      needsKey ? localization.label("apiKeyRequired") : localization.label("noApiKey"),
      canPull ? localization.label("pullSupported") : localization.label("manualModel"),
      settings.includeNearbyContext !== false
        ? localization.label("nearbyContextOn")
        : localization.label("nearbyContextOff")
    ];
    return {
      name: preset?.label || provider?.name || settings.providerId || "AI provider",
      model: settings.model || defaults.model,
      badges,
      guidance: localization.source(guidance),
      baseLabel: localization.label("base"),
      baseUrl: settings.baseUrl || defaults.baseUrl,
      toolsLabel: localization.label("tools"),
      capabilities: capabilities.map((item) => localization.source(item)).join(" - "),
      modelsLabel: localization.label("models"),
      modelsEndpoint: endpoints.models,
      translateLabel: localization.label("translate"),
      translateEndpoint: endpoints.translate
    };
  }

  return Object.freeze({
    canPullModel,
    capabilityLabels,
    endpointPathLabel,
    endpointSummary,
    privacyText,
    summaryView
  });
}
