import {
  createOpenAiCompatibleHostedProviderAdapter,
  hostedProviderModelRecord
} from "./openai-compatible-hosted-provider-adapter.js";

const PROVIDER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "together",
    compatibilityExport: "TogetherProvider",
    name: "Together AI",
    defaultBaseUrlKey: "TOGETHER_DEFAULT_BASE_URL",
    defaultModelKey: "TOGETHER_DEFAULT_MODEL",
    normalizeBaseUrlKey: "normalizeTogetherBaseUrl",
    apiUrlKey: "togetherApiUrl",
    authError: "Add a Together AI API key before using Together AI for pre-translation.",
    authRejectedError: "Together AI rejected the request. Add or check the Together AI API key.",
    unreachableName: "Together AI",
    statusName: "Together AI",
    modelMissingName: "Together AI",
    translationErrorName: "Together AI",
    acceptRootModelArray: true,
    responseFallbackFields: ["output_text", "text"],
    mapModel: (model) => hostedProviderModelRecord(model)
  }),
  Object.freeze({
    id: "openrouter",
    compatibilityExport: "OpenRouterProvider",
    name: "OpenRouter",
    defaultBaseUrlKey: "OPENROUTER_DEFAULT_BASE_URL",
    defaultModelKey: "OPENROUTER_DEFAULT_MODEL",
    normalizeBaseUrlKey: "normalizeOpenRouterBaseUrl",
    apiUrlKey: "openRouterApiUrl",
    authError: "Add an OpenRouter API key before using OpenRouter for pre-translation.",
    authRejectedError: "OpenRouter rejected the request. Add or check the OpenRouter API key.",
    unreachableName: "OpenRouter",
    statusName: "OpenRouter",
    modelMissingName: "OpenRouter",
    translationErrorName: "OpenRouter",
    statusMessages: Object.freeze({ 402: "OpenRouter reported insufficient credits for this request." }),
    responseFallbackFields: ["output_text", "text"],
    mapModel: (model) => hostedProviderModelRecord(model, { contextLength: true, updatedAtOnly: true })
  }),
  Object.freeze({
    id: "huggingface",
    compatibilityExport: "HuggingFaceProvider",
    name: "Hugging Face Inference Providers",
    defaultBaseUrlKey: "HUGGINGFACE_DEFAULT_BASE_URL",
    defaultModelKey: "HUGGINGFACE_DEFAULT_MODEL",
    normalizeBaseUrlKey: "normalizeHuggingFaceBaseUrl",
    apiUrlKey: "huggingFaceApiUrl",
    authError: "Add a Hugging Face token before using Hugging Face Inference Providers for pre-translation.",
    authRejectedError: "Hugging Face rejected the request. Add or check the Hugging Face token.",
    unreachableName: "Hugging Face Inference Providers",
    statusName: "Hugging Face",
    modelMissingName: "Hugging Face Inference Providers",
    translationErrorName: "Hugging Face",
    statusMessages: Object.freeze({
      402: "Hugging Face reported insufficient credits or quota for this request.",
      429: "Hugging Face rate-limited this request. Wait a moment or choose another provider/model."
    }),
    acceptRootModelArray: true,
    responseFallbackFields: ["generated_text", "output_text", "text"],
    rawError: (data) => data?.error?.message || data?.error || data?.message || "",
    mapModel: (model) => hostedProviderModelRecord(model)
  }),
  Object.freeze({
    id: "deepinfra",
    compatibilityExport: "DeepInfraProvider",
    name: "DeepInfra",
    defaultBaseUrlKey: "DEEPINFRA_DEFAULT_BASE_URL",
    defaultModelKey: "DEEPINFRA_DEFAULT_MODEL",
    normalizeBaseUrlKey: "normalizeDeepInfraBaseUrl",
    apiUrlKey: "deepInfraApiUrl",
    authError: "Add a DeepInfra API key before using DeepInfra for pre-translation.",
    authRejectedError: "DeepInfra rejected the request. Add or check the DeepInfra API key.",
    unreachableName: "DeepInfra",
    statusName: "DeepInfra",
    modelMissingName: "DeepInfra",
    translationErrorName: "DeepInfra",
    responseFallbackFields: ["output_text", "text"],
    mapModel: (model) => hostedProviderModelRecord(model)
  }),
  Object.freeze({
    id: "fireworks",
    compatibilityExport: "FireworksProvider",
    name: "Fireworks AI",
    defaultBaseUrlKey: "FIREWORKS_DEFAULT_BASE_URL",
    defaultModelKey: "FIREWORKS_DEFAULT_MODEL",
    normalizeBaseUrlKey: "normalizeFireworksBaseUrl",
    apiUrlKey: "fireworksApiUrl",
    authError: "Add a Fireworks AI API key before using Fireworks AI for pre-translation.",
    authRejectedError: "Fireworks AI rejected the request. Add or check the Fireworks AI API key.",
    unreachableName: "Fireworks AI",
    statusName: "Fireworks AI",
    modelMissingName: "Fireworks AI",
    translationErrorName: "Fireworks AI",
    responseFallbackFields: ["output_text", "text"],
    mapModel: (model) => hostedProviderModelRecord(model)
  })
]);

function resolvedDefinition(runtime, definition) {
  return {
    ...definition,
    defaultBaseUrl: runtime[definition.defaultBaseUrlKey],
    defaultModel: runtime[definition.defaultModelKey],
    normalizeBaseUrl: runtime[definition.normalizeBaseUrlKey]?.bind(runtime),
    apiUrl: runtime[definition.apiUrlKey]?.bind(runtime)
  };
}

export function createHostedProviderAdapters(runtime) {
  return PROVIDER_DEFINITIONS.map((definition) => ({
    definition,
    provider: createOpenAiCompatibleHostedProviderAdapter(runtime, resolvedDefinition(runtime, definition))
  }));
}

export function installHostedProviderAdapters(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("Hosted provider adapters require the LoopCAT AI provider registry.");
  }
  const providers = createHostedProviderAdapters(ai.providerAdapterRuntime);
  for (const { definition, provider } of providers) {
    ai.aiProviderRegistry.register(provider);
    ai[definition.compatibilityExport] = provider;
  }
  return providers.map(({ provider }) => provider);
}
