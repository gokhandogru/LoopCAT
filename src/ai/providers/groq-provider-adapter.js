import { assertAiProvider } from "./provider-contract.js";

const TRANSLATION_SYSTEM_PROMPT =
  "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment.";

const REQUIRED_RUNTIME_FUNCTIONS = Object.freeze([
  "bearerAuthHeaders",
  "buildTranslateGemmaPrompt",
  "cleanModelTranslationOutput",
  "defaultLocalAiSettings",
  "fetchJsonWithTimeout",
  "genericPromptResult",
  "genericPromptSystem",
  "groqApiUrl",
  "localAiStartedAt",
  "normalizeGroqBaseUrl",
  "promptTextOrThrow",
  "redactSensitiveText",
  "requestDurationMs"
]);

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("The Groq provider adapter requires an injected runtime.");
  }
  for (const method of REQUIRED_RUNTIME_FUNCTIONS) {
    if (typeof runtime[method] !== "function") {
      throw new TypeError(`The Groq provider runtime is missing ${method}().`);
    }
  }
  if (!String(runtime.GROQ_DEFAULT_BASE_URL || "").trim()) {
    throw new TypeError("The Groq provider runtime requires GROQ_DEFAULT_BASE_URL.");
  }
  if (!String(runtime.GROQ_DEFAULT_MODEL || "").trim()) {
    throw new TypeError("The Groq provider runtime requires GROQ_DEFAULT_MODEL.");
  }
  return runtime;
}

function providerAuthError() {
  return "Add a Groq API key before using Groq for pre-translation.";
}

function statusError(runtime, data, status, model = "") {
  const raw = runtime.redactSensitiveText(data?.error?.message || data?.message || data?.error || "").trim();
  if (status === 401 || status === 403) return "Groq rejected the request. Add or check the Groq API key.";
  if ((status === 404 || /model/i.test(raw)) && model) return `Model ${model} was not found by Groq.`;
  return raw || `Groq request failed with status ${status}.`;
}

async function requestJson(runtime, endpoint, options = {}, config = {}) {
  const url = runtime.groqApiUrl(config.baseUrl || runtime.GROQ_DEFAULT_BASE_URL, endpoint);
  let result = null;
  try {
    result = await runtime.fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("canceled") || message.includes("timed out")) throw error;
    const baseUrl = runtime.normalizeGroqBaseUrl(config.baseUrl || runtime.GROQ_DEFAULT_BASE_URL);
    throw new Error(`Groq is not reachable at ${baseUrl}.`);
  }
  if (!result.response?.ok) {
    throw new Error(statusError(runtime, result.data, result.response?.status, config.model));
  }
  return result.data;
}

export function extractGroqResponseText(data) {
  const messageContent = data?.choices?.[0]?.message?.content;
  if (typeof messageContent === "string") return messageContent;
  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("");
  }
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.text === "string") return data.text;
  return "";
}

function tokenMetadata(data) {
  return {
    promptTokens: data?.usage?.prompt_tokens || 0,
    completionTokens: data?.usage?.completion_tokens || 0,
    totalTokens: data?.usage?.total_tokens || 0
  };
}

function chatRequest(runtime, config, model, prompt, system) {
  return {
    method: "POST",
    headers: runtime.bearerAuthHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      stream: false,
      temperature: 0.1,
      max_tokens: 1200
    })
  };
}

function normalizedSettings(runtime, config, request) {
  const settings = runtime.defaultLocalAiSettings(
    { ...config, providerId: "groq", model: config.model || request.model },
    request.project
  );
  const baseUrl = runtime.normalizeGroqBaseUrl(config.baseUrl || settings.baseUrl || runtime.GROQ_DEFAULT_BASE_URL);
  const model =
    String(config.model || request.model || settings.model || runtime.GROQ_DEFAULT_MODEL).trim() ||
    runtime.GROQ_DEFAULT_MODEL;
  return { settings, baseUrl, model };
}

export function createGroqProviderAdapter(injectedRuntime) {
  const runtime = assertRuntime(injectedRuntime);
  const provider = {
    id: "groq",
    name: "Groq",
    defaultBaseUrl: runtime.GROQ_DEFAULT_BASE_URL,
    defaultModel: runtime.GROQ_DEFAULT_MODEL,
    async testConnection(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(providerAuthError());
      const baseUrl = runtime.normalizeGroqBaseUrl(config.baseUrl || runtime.GROQ_DEFAULT_BASE_URL);
      const data = await requestJson(
        runtime,
        "/models",
        { method: "GET", headers: runtime.bearerAuthHeaders(config) },
        { ...config, baseUrl }
      );
      return {
        ok: true,
        provider: "Groq",
        baseUrl,
        modelCount: Array.isArray(data?.data) ? data.data.length : 0
      };
    },
    async listModels(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(providerAuthError());
      const baseUrl = runtime.normalizeGroqBaseUrl(config.baseUrl || runtime.GROQ_DEFAULT_BASE_URL);
      const data = await requestJson(
        runtime,
        "/models",
        { method: "GET", headers: runtime.bearerAuthHeaders(config) },
        { ...config, baseUrl }
      );
      const models = Array.isArray(data?.data)
        ? data.data
            .map((model) => {
              const created = Number(model.created);
              return {
                name: String(model.id || model.name || "").trim(),
                size: model.size || 0,
                modifiedAt: Number.isFinite(created) ? new Date(created * 1000).toISOString() : ""
              };
            })
            .filter((model) => model.name)
        : [];
      return { models, raw: data };
    },
    async translateSegment(config = {}, request = {}) {
      const { settings, baseUrl, model } = normalizedSettings(runtime, config, request);
      const sourceText = String(request.text ?? request.segment?.source ?? "");
      if (!sourceText.trim()) throw new Error("The segment has no source text.");
      if (!String(config.apiKey || "").trim()) throw new Error(providerAuthError());
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
        "/chat/completions",
        chatRequest(runtime, config, model, prompt, TRANSLATION_SYSTEM_PROMPT),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      const rawOutput = extractGroqResponseText(data);
      if (typeof rawOutput !== "string") throw new Error("Groq returned a malformed chat response.");
      const translatedText = runtime.cleanModelTranslationOutput(rawOutput, sourceText);
      if (!translatedText.trim()) throw new Error("Groq returned an empty translation for this segment.");
      return {
        translatedText,
        rawOutput,
        provider: "Groq",
        providerId: "groq",
        model,
        durationMs: runtime.requestDurationMs(startedAt),
        prompt,
        metadata: tokenMetadata(data)
      };
    },
    async completePrompt(config = {}, request = {}) {
      const { settings, baseUrl, model } = normalizedSettings(runtime, config, request);
      if (!String(config.apiKey || "").trim()) throw new Error(providerAuthError());
      const prompt = runtime.promptTextOrThrow(request);
      const startedAt = runtime.localAiStartedAt();
      const data = await requestJson(
        runtime,
        "/chat/completions",
        chatRequest(runtime, config, model, prompt, request.system || runtime.genericPromptSystem()),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      return runtime.genericPromptResult(
        "Groq",
        "groq",
        model,
        prompt,
        extractGroqResponseText(data),
        startedAt,
        tokenMetadata(data)
      );
    }
  };
  return assertAiProvider(provider);
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
