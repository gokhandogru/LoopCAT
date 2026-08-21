const PROVIDER_DEFINITIONS = Object.freeze([
  ["ollama", "Ollama", "OllamaProvider", true, true],
  ["openai", "OpenAI", "OpenAIProvider", true, false],
  ["deepseek", "DeepSeek", "DeepSeekProvider", true, false],
  ["xai", "xAI Grok", "XAIProvider", true, false],
  ["perplexity", "Perplexity Sonar", "PerplexityProvider", true, false],
  ["groq", "Groq", "GroqProvider", true, false],
  ["together", "Together AI", "TogetherProvider", true, false],
  ["openrouter", "OpenRouter", "OpenRouterProvider", true, false],
  ["huggingface", "Hugging Face Inference Providers", "HuggingFaceProvider", true, false],
  ["deepinfra", "DeepInfra", "DeepInfraProvider", true, false],
  ["fireworks", "Fireworks AI", "FireworksProvider", true, false],
  ["gemini", "Google Gemini", "GeminiProvider", true, false],
  ["anthropic", "Anthropic Claude", "AnthropicProvider", true, false],
  ["cohere", "Cohere Command", "CohereProvider", true, false],
  ["mistral", "Mistral AI", "MistralProvider", true, false],
  ["azure-openai", "Azure OpenAI", "AzureOpenAIProvider", true, false],
  ["openai-compatible", "LM Studio / OpenAI-compatible", "OpenAICompatibleProvider", true, false],
  ["opus-cat", "OPUS-CAT", "OpusCatProvider", false, false]
]);

function assertAi(ai) {
  if (!ai?.aiProviderRegistry?.register || !ai?.aiProviderRegistry?.get) {
    throw new TypeError("Lazy AI provider adapters require the LoopCAT AI provider registry.");
  }
  if (!Array.isArray(ai.LOCAL_AI_PROVIDER_PRESETS)) {
    throw new TypeError("Lazy AI provider adapters require the provider preset catalog.");
  }
  return ai;
}

function defaultLoader(ai) {
  return import("./install-extracted-providers.js").then(({ installExtractedProviderAdapters }) =>
    installExtractedProviderAdapters(ai)
  );
}

export function installLazyProviderAdapters(injectedAi, options = {}) {
  const ai = assertAi(injectedAi);
  const registry = ai.aiProviderRegistry;
  const load = Object.hasOwn(options, "load") ? options.load : () => defaultLoader(ai);
  if (typeof load !== "function") throw new TypeError("Lazy AI provider adapters require a load function.");
  let loadPromise = null;

  function loadAdapters() {
    if (!loadPromise) {
      loadPromise = Promise.resolve()
        .then(() => load())
        .catch((error) => {
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  }

  const providers = PROVIDER_DEFINITIONS.map(([id, name, compatibilityExport, supportsPrompt, supportsPull]) => {
    const preset = ai.LOCAL_AI_PROVIDER_PRESETS.find((candidate) => candidate.providerId === id);
    let lazyProvider;

    async function invoke(method, args) {
      await loadAdapters();
      const provider = registry.get(id);
      if (!provider || provider === lazyProvider || typeof provider[method] !== "function") {
        loadPromise = null;
        throw new TypeError(`AI provider ${id} did not install ${method}().`);
      }
      return provider[method](...args);
    }

    lazyProvider = {
      id,
      name,
      defaultBaseUrl: preset?.baseUrl || "",
      defaultModel: preset?.model || "",
      testConnection(...args) {
        return invoke("testConnection", args);
      },
      listModels(...args) {
        return invoke("listModels", args);
      },
      translateSegment(...args) {
        return invoke("translateSegment", args);
      }
    };
    if (supportsPrompt) {
      lazyProvider.completePrompt = (...args) => invoke("completePrompt", args);
    }
    if (supportsPull) {
      lazyProvider.pullModel = (...args) => invoke("pullModel", args);
    }
    registry.register(lazyProvider);
    ai[compatibilityExport] = lazyProvider;
    return lazyProvider;
  });

  return Object.freeze({
    load: loadAdapters,
    providers: Object.freeze(providers)
  });
}

if (globalThis.window?.CatHan?.ai) installLazyProviderAdapters(globalThis.window.CatHan.ai);
