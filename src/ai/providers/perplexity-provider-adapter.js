import {
  createOpenAiCompatibleHostedProviderAdapter,
  extractOpenAiCompatibleResponseText
} from "./openai-compatible-hosted-provider-adapter.js";

const SONAR_MODELS = Object.freeze(["sonar", "sonar-pro", "sonar-deep-research", "sonar-reasoning-pro"]);
const TRANSLATION_INSTRUCTIONS =
  "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment. Do not browse or cite sources.";

function perplexityModels(data) {
  const records = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  const models = records
    .map((model) => {
      const created = Number(model?.created);
      return {
        name: String(model?.id || model?.name || "").trim(),
        size: model?.size || 0,
        modifiedAt: Number.isFinite(created) ? new Date(created * 1000).toISOString() : ""
      };
    })
    .filter((model) => model.name);
  const seen = new Set(models.map((model) => model.name));
  for (const name of SONAR_MODELS) {
    if (seen.has(name)) continue;
    models.push({ name, size: 0, modifiedAt: "" });
    seen.add(name);
  }
  return models;
}

function perplexityDefinition(runtime) {
  return {
    id: "perplexity",
    name: "Perplexity Sonar",
    defaultBaseUrl: runtime.PERPLEXITY_DEFAULT_BASE_URL,
    defaultModel: runtime.PERPLEXITY_DEFAULT_MODEL,
    normalizeBaseUrl: runtime.normalizePerplexityBaseUrl.bind(runtime),
    apiUrl: runtime.perplexityApiUrl.bind(runtime),
    authError: "Add a Perplexity API key before using Perplexity Sonar for pre-translation.",
    authRejectedError: "Perplexity rejected the request. Add or check the Perplexity API key.",
    unreachableName: "Perplexity",
    statusName: "Perplexity",
    modelMissingName: "Perplexity",
    translationErrorName: "Perplexity",
    malformedResponseError: "Perplexity returned a malformed Sonar response.",
    chatEndpoint: "/sonar",
    translationSystemPrompt: TRANSLATION_INSTRUCTIONS,
    requestExtras: Object.freeze({
      disable_search: true,
      return_images: false,
      return_related_questions: false
    }),
    models: perplexityModels,
    mapModel: (model) => model,
    extractResponseText: (data) => extractOpenAiCompatibleResponseText(data, ["output_text", "text"]),
    metadata: (data) => ({
      promptTokens: data?.usage?.prompt_tokens || 0,
      completionTokens: data?.usage?.completion_tokens || 0,
      totalTokens: data?.usage?.total_tokens || 0,
      citationCount: Array.isArray(data?.citations) ? data.citations.length : 0
    })
  };
}

export function createPerplexityProviderAdapter(runtime) {
  return createOpenAiCompatibleHostedProviderAdapter(runtime, perplexityDefinition(runtime));
}

export function installPerplexityProviderAdapter(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("The Perplexity adapter requires the LoopCAT AI provider registry.");
  }
  const provider = createPerplexityProviderAdapter(ai.providerAdapterRuntime);
  ai.aiProviderRegistry.register(provider);
  ai.PerplexityProvider = provider;
  return provider;
}
