import {
  createOpenAiCompatibleHostedProviderAdapter,
  extractOpenAiCompatibleResponseText,
  hostedProviderModelRecord
} from "./openai-compatible-hosted-provider-adapter.js";

function groqDefinition(runtime) {
  return {
    id: "groq",
    name: "Groq",
    defaultBaseUrl: runtime.GROQ_DEFAULT_BASE_URL,
    defaultModel: runtime.GROQ_DEFAULT_MODEL,
    normalizeBaseUrl: runtime.normalizeGroqBaseUrl.bind(runtime),
    apiUrl: runtime.groqApiUrl.bind(runtime),
    authError: "Add a Groq API key before using Groq for pre-translation.",
    authRejectedError: "Groq rejected the request. Add or check the Groq API key.",
    unreachableName: "Groq",
    statusName: "Groq",
    modelMissingName: "Groq",
    translationErrorName: "Groq",
    responseFallbackFields: ["output_text", "text"],
    mapModel: (model) => hostedProviderModelRecord(model, { noFallbackModifiedAt: true })
  };
}

export function extractGroqResponseText(data) {
  return extractOpenAiCompatibleResponseText(data, ["output_text", "text"]);
}

export function createGroqProviderAdapter(runtime) {
  return createOpenAiCompatibleHostedProviderAdapter(runtime, groqDefinition(runtime));
}

export function installGroqProviderAdapter(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("The Groq provider adapter requires the LoopCAT AI provider registry.");
  }
  const provider = createGroqProviderAdapter(ai.providerAdapterRuntime);
  ai.aiProviderRegistry.register(provider);
  ai.GroqProvider = provider;
  return provider;
}
