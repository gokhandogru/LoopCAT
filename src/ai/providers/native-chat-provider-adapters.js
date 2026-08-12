import { createOpenAiCompatibleHostedProviderAdapter } from "./openai-compatible-hosted-provider-adapter.js";

function createdModelRecord(model) {
  const created = Number(model?.created);
  return {
    name: String(model?.id || model?.name || "").trim(),
    size: 0,
    modifiedAt: Number.isFinite(created) ? new Date(created * 1000).toISOString() : ""
  };
}

function mistralModelRecord(model) {
  const created = Number(model?.created);
  return {
    name: String(model?.id || model?.name || "").trim(),
    size: model?.size || 0,
    modifiedAt:
      model?.updated ||
      model?.updated_at ||
      model?.created_at ||
      (Number.isFinite(created) ? new Date(created * 1000).toISOString() : "")
  };
}

function deepSeekResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.text === "string") return data.text;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || part?.content || ""))
      .join("")
      .trim();
  }
  return "";
}

function mistralResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.text === "string") return data.text;
  if (typeof data?.choices?.[0]?.message?.content === "string") return data.choices[0].message.content;
  const content = Array.isArray(data?.choices?.[0]?.message?.content) ? data.choices[0].message.content : [];
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type && part.type !== "text") return "";
      return typeof part?.text === "string" ? part.text : "";
    })
    .filter(Boolean)
    .join("");
}

const PROVIDER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "deepseek",
    compatibilityExport: "DeepSeekProvider",
    name: "DeepSeek",
    defaultBaseUrlKey: "DEEPSEEK_DEFAULT_BASE_URL",
    defaultModelKey: "DEEPSEEK_DEFAULT_MODEL",
    normalizeBaseUrlKey: "normalizeDeepSeekBaseUrl",
    apiUrlKey: "deepSeekApiUrl",
    authError: "Add a DeepSeek API key before using DeepSeek for pre-translation.",
    authRejectedError: "DeepSeek rejected the request. Add or check the DeepSeek API key.",
    unreachableName: "DeepSeek",
    statusName: "DeepSeek",
    modelMissingName: "DeepSeek",
    translationErrorName: "DeepSeek",
    extractResponseText: deepSeekResponseText,
    mapModel: createdModelRecord
  }),
  Object.freeze({
    id: "mistral",
    compatibilityExport: "MistralProvider",
    name: "Mistral AI",
    defaultBaseUrlKey: "MISTRAL_DEFAULT_BASE_URL",
    defaultModelKey: "MISTRAL_DEFAULT_MODEL",
    normalizeBaseUrlKey: "normalizeMistralBaseUrl",
    apiUrlKey: "mistralApiUrl",
    authError: "Add a Mistral API key before using Mistral for pre-translation.",
    authRejectedError: "Mistral rejected the request. Add or check the Mistral API key.",
    unreachableName: "Mistral",
    statusName: "Mistral",
    modelMissingName: "Mistral",
    translationErrorName: "Mistral",
    extractResponseText: mistralResponseText,
    mapModel: mistralModelRecord
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

export function createNativeChatProviderAdapters(runtime) {
  return PROVIDER_DEFINITIONS.map((definition) => ({
    definition,
    provider: createOpenAiCompatibleHostedProviderAdapter(runtime, resolvedDefinition(runtime, definition))
  }));
}

export function installNativeChatProviderAdapters(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("Native chat provider adapters require the LoopCAT AI provider registry.");
  }
  const providers = createNativeChatProviderAdapters(ai.providerAdapterRuntime);
  for (const { definition, provider } of providers) {
    ai.aiProviderRegistry.register(provider);
    ai[definition.compatibilityExport] = provider;
  }
  return providers.map(({ provider }) => provider);
}
