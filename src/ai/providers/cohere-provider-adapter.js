import { assertAiProvider } from "./provider-contract.js";

const TRANSLATION_SYSTEM_PROMPT =
  "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment.";

const REQUIRED_RUNTIME_FUNCTIONS = Object.freeze([
  "buildTranslateGemmaPrompt",
  "cleanModelTranslationOutput",
  "cohereApiUrl",
  "cohereAuthHeaders",
  "defaultLocalAiSettings",
  "fetchJsonWithTimeout",
  "genericPromptResult",
  "genericPromptSystem",
  "localAiStartedAt",
  "normalizeCohereBaseUrl",
  "promptTextOrThrow",
  "redactSensitiveText",
  "requestDurationMs"
]);

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("The Cohere adapter requires an injected runtime.");
  }
  for (const method of REQUIRED_RUNTIME_FUNCTIONS) {
    if (typeof runtime[method] !== "function") {
      throw new TypeError(`The Cohere adapter runtime is missing ${method}().`);
    }
  }
  return runtime;
}

function authError() {
  return "Add a Cohere API key before using Cohere for pre-translation.";
}

function statusError(runtime, data, status, model = "") {
  const raw = runtime.redactSensitiveText(data?.message || data?.error?.message || data?.error || "").trim();
  if (status === 401 || status === 403) return "Cohere rejected the request. Add or check the Cohere API key.";
  if ((status === 404 || /model/i.test(raw)) && model) return `Model ${model} was not found by Cohere.`;
  return raw || `Cohere request failed with status ${status}.`;
}

async function requestJson(runtime, endpoint, options = {}, config = {}) {
  const url = runtime.cohereApiUrl(config.baseUrl || runtime.COHERE_DEFAULT_BASE_URL, endpoint);
  let result = null;
  try {
    result = await runtime.fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("canceled") || message.includes("timed out")) throw error;
    const baseUrl = runtime.normalizeCohereBaseUrl(config.baseUrl || runtime.COHERE_DEFAULT_BASE_URL);
    throw new Error(`Cohere is not reachable at ${baseUrl}.`);
  }
  if (!result.response?.ok) {
    throw new Error(statusError(runtime, result.data, result.response?.status, config.model));
  }
  return result.data;
}

export function extractCohereResponseText(data) {
  if (typeof data?.text === "string") return data.text;
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.message?.content === "string") return data.message.content;
  const content = Array.isArray(data?.message?.content) ? data.message.content : [];
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type && part.type !== "text") return "";
      return typeof part?.text === "string" ? part.text : "";
    })
    .filter(Boolean)
    .join("");
}

function tokenCount(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function metadata(data) {
  const inputTokens = tokenCount(data?.usage?.tokens?.input_tokens, data?.usage?.billed_units?.input_tokens);
  const outputTokens = tokenCount(data?.usage?.tokens?.output_tokens, data?.usage?.billed_units?.output_tokens);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

function normalizedSettings(runtime, config, request) {
  const settings = runtime.defaultLocalAiSettings(
    { ...config, providerId: "cohere", model: config.model || request.model },
    request.project
  );
  const baseUrl = runtime.normalizeCohereBaseUrl(config.baseUrl || settings.baseUrl || runtime.COHERE_DEFAULT_BASE_URL);
  const model =
    String(config.model || request.model || settings.model || runtime.COHERE_DEFAULT_MODEL).trim() ||
    runtime.COHERE_DEFAULT_MODEL;
  return { settings, baseUrl, model };
}

function chatRequest(runtime, config, model, prompt, system) {
  return {
    method: "POST",
    headers: runtime.cohereAuthHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 1200
    })
  };
}

export function createCohereProviderAdapter(injectedRuntime) {
  const runtime = assertRuntime(injectedRuntime);
  const provider = {
    id: "cohere",
    name: "Cohere Command",
    defaultBaseUrl: runtime.COHERE_DEFAULT_BASE_URL,
    defaultModel: runtime.COHERE_DEFAULT_MODEL,
    async testConnection(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(authError());
      const baseUrl = runtime.normalizeCohereBaseUrl(config.baseUrl || runtime.COHERE_DEFAULT_BASE_URL);
      const data = await requestJson(
        runtime,
        "/v1/models",
        { method: "GET", headers: runtime.cohereAuthHeaders(config) },
        { ...config, baseUrl }
      );
      return {
        ok: true,
        provider: "Cohere Command",
        baseUrl,
        modelCount: Array.isArray(data?.models) ? data.models.length : 0
      };
    },
    async listModels(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(authError());
      const baseUrl = runtime.normalizeCohereBaseUrl(config.baseUrl || runtime.COHERE_DEFAULT_BASE_URL);
      const data = await requestJson(
        runtime,
        "/v1/models",
        { method: "GET", headers: runtime.cohereAuthHeaders(config) },
        { ...config, baseUrl }
      );
      const models = Array.isArray(data?.models)
        ? data.models
            .map((model) => ({
              name: String(model.name || model.id || "").trim(),
              size: 0,
              modifiedAt: model.created_at || model.createdAt || ""
            }))
            .filter((model) => model.name)
        : [];
      return { models, raw: data };
    },
    async translateSegment(config = {}, request = {}) {
      const { settings, baseUrl, model } = normalizedSettings(runtime, config, request);
      const sourceText = String(request.text ?? request.segment?.source ?? "");
      if (!sourceText.trim()) throw new Error("The segment has no source text.");
      if (!String(config.apiKey || "").trim()) throw new Error(authError());
      const prompt =
        request.prompt ||
        runtime.buildTranslateGemmaPrompt({
          sourceLanguage: request.sourceLanguage || settings.sourceLanguage,
          sourceCode: request.sourceCode || settings.sourceCode,
          targetLanguage: request.targetLanguage || settings.targetLanguage,
          targetCode: request.targetCode || settings.targetCode,
          text: sourceText,
          segment: request.segment,
          glossaryTerms: request.glossaryTerms,
          tmMatches: request.tmMatches,
          surroundingSegments: request.surroundingSegments
        });
      const startedAt = runtime.localAiStartedAt();
      const data = await requestJson(
        runtime,
        "/v2/chat",
        chatRequest(runtime, config, model, prompt, TRANSLATION_SYSTEM_PROMPT),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      const rawOutput = extractCohereResponseText(data);
      if (typeof rawOutput !== "string") throw new Error("Cohere returned a malformed response.");
      const translatedText = runtime.cleanModelTranslationOutput(rawOutput, sourceText);
      if (!translatedText.trim()) throw new Error("Cohere returned an empty translation for this segment.");
      return {
        translatedText,
        rawOutput,
        provider: "Cohere Command",
        providerId: "cohere",
        model,
        durationMs: runtime.requestDurationMs(startedAt),
        prompt,
        metadata: metadata(data)
      };
    },
    async completePrompt(config = {}, request = {}) {
      const { settings, baseUrl, model } = normalizedSettings(runtime, config, request);
      if (!String(config.apiKey || "").trim()) throw new Error(authError());
      const prompt = runtime.promptTextOrThrow(request);
      const startedAt = runtime.localAiStartedAt();
      const data = await requestJson(
        runtime,
        "/v2/chat",
        chatRequest(runtime, config, model, prompt, request.system || runtime.genericPromptSystem()),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      return runtime.genericPromptResult(
        "Cohere Command",
        "cohere",
        model,
        prompt,
        extractCohereResponseText(data),
        startedAt,
        metadata(data)
      );
    }
  };
  return assertAiProvider(provider);
}

export function installCohereProviderAdapter(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("The Cohere adapter requires the LoopCAT AI provider registry.");
  }
  const provider = createCohereProviderAdapter(ai.providerAdapterRuntime);
  ai.aiProviderRegistry.register(provider);
  ai.CohereProvider = provider;
  return provider;
}
