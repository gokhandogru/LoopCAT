import { createOpenAiResponsesProviderAdapter } from "./openai-responses-provider-adapter.js";

function rawProviderError(runtime, data) {
  return runtime.redactSensitiveText(data?.error?.message || data?.message || data?.error || "").trim();
}

const PROVIDER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "openai",
    compatibilityExport: "OpenAIProvider",
    name: "OpenAI",
    defaultBaseUrlKey: "OPENAI_DEFAULT_BASE_URL",
    defaultModelKey: "OPENAI_DEFAULT_MODEL",
    normalizeBaseUrlKey: "normalizeOpenAiBaseUrl",
    apiUrlKey: "openAiApiUrl",
    authHeadersKey: "bearerAuthHeaders",
    authError: "Add an OpenAI API key before using OpenAI for pre-translation.",
    connectionError: () =>
      "OpenAI request could not connect. Check your internet connection or provider access and try again.",
    statusError: (runtime, data, status) => {
      const message = data?.error?.message || `OpenAI request failed with status ${status}.`;
      return runtime.redactSensitiveText(message).trim() || "OpenAI request failed.";
    },
    modelName: (model) => model?.id,
    translationErrorName: "OpenAI"
  }),
  Object.freeze({
    id: "xai",
    compatibilityExport: "XAIProvider",
    name: "xAI Grok",
    defaultBaseUrlKey: "XAI_DEFAULT_BASE_URL",
    defaultModelKey: "XAI_DEFAULT_MODEL",
    normalizeBaseUrlKey: "normalizeXAiBaseUrl",
    apiUrlKey: "xAiApiUrl",
    authHeadersKey: "bearerAuthHeaders",
    authError: "Add an xAI API key before using xAI Grok for pre-translation.",
    connectionError: (baseUrl) => `xAI is not reachable at ${baseUrl}.`,
    statusError: (runtime, data, status, model) => {
      const raw = rawProviderError(runtime, data);
      if (status === 401 || status === 403) return "xAI rejected the request. Add or check the xAI API key.";
      if ((status === 404 || /model/i.test(raw)) && model) return `Model ${model} was not found by xAI.`;
      return raw || `xAI request failed with status ${status}.`;
    },
    modelName: (model) => model?.id || model?.name,
    translationErrorName: "xAI"
  }),
  Object.freeze({
    id: "azure-openai",
    compatibilityExport: "AzureOpenAIProvider",
    name: "Azure OpenAI",
    defaultBaseUrlKey: "AZURE_OPENAI_DEFAULT_BASE_URL",
    defaultModelKey: "AZURE_OPENAI_DEFAULT_MODEL",
    normalizeBaseUrlKey: "normalizeAzureOpenAiBaseUrl",
    apiUrlKey: "azureOpenAiApiUrl",
    authHeadersKey: "azureOpenAiAuthHeaders",
    authError: "Add an Azure OpenAI API key before using Azure OpenAI for pre-translation.",
    connectionError: (baseUrl) => `Azure OpenAI is not reachable at ${baseUrl}.`,
    statusError: (runtime, data, status, model) => {
      const raw = rawProviderError(runtime, data);
      if (status === 401 || status === 403) {
        return "Azure OpenAI rejected the request. Add or check the Azure OpenAI API key.";
      }
      if ((status === 404 || /deployment|model/i.test(raw)) && model) {
        return `Azure OpenAI deployment ${model} was not found.`;
      }
      return raw || `Azure OpenAI request failed with status ${status}.`;
    },
    modelName: (model) => model?.id || model?.name,
    translationErrorName: "Azure OpenAI"
  })
]);

function resolvedDefinition(runtime, definition) {
  return {
    ...definition,
    defaultBaseUrl: runtime[definition.defaultBaseUrlKey],
    defaultModel: runtime[definition.defaultModelKey],
    normalizeBaseUrl: runtime[definition.normalizeBaseUrlKey]?.bind(runtime),
    apiUrl: runtime[definition.apiUrlKey]?.bind(runtime),
    authHeaders: runtime[definition.authHeadersKey]?.bind(runtime)
  };
}

export function createNativeOpenAiProviderAdapters(runtime) {
  return PROVIDER_DEFINITIONS.map((definition) => ({
    definition,
    provider: createOpenAiResponsesProviderAdapter(runtime, resolvedDefinition(runtime, definition))
  }));
}

export function installNativeOpenAiProviderAdapters(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("Native OpenAI provider adapters require the LoopCAT AI provider registry.");
  }
  const providers = createNativeOpenAiProviderAdapters(ai.providerAdapterRuntime);
  for (const { definition, provider } of providers) {
    ai.aiProviderRegistry.register(provider);
    ai[definition.compatibilityExport] = provider;
  }
  return providers.map(({ provider }) => provider);
}
