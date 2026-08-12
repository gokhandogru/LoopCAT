import { assertAiProvider } from "./provider-contract.js";

const TRANSLATION_SYSTEM_PROMPT =
  "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment.";

const REQUIRED_RUNTIME_FUNCTIONS = Object.freeze([
  "buildTranslateGemmaPrompt",
  "cleanModelTranslationOutput",
  "defaultLocalAiSettings",
  "fetchJsonWithTimeout",
  "geminiApiUrl",
  "geminiAuthHeaders",
  "genericPromptResult",
  "genericPromptSystem",
  "localAiStartedAt",
  "normalizeGeminiBaseUrl",
  "promptTextOrThrow",
  "redactSensitiveText",
  "requestDurationMs"
]);

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("The Gemini adapter requires an injected runtime.");
  }
  for (const method of REQUIRED_RUNTIME_FUNCTIONS) {
    if (typeof runtime[method] !== "function") {
      throw new TypeError(`The Gemini adapter runtime is missing ${method}().`);
    }
  }
  return runtime;
}

function authError() {
  return "Add a Gemini API key before using Gemini for pre-translation.";
}

function statusError(runtime, data, status, model = "") {
  const raw = runtime.redactSensitiveText(data?.error?.message || data?.message || data?.error || "").trim();
  if (status === 401 || status === 403) return "Gemini rejected the request. Add or check the Gemini API key.";
  if ((status === 404 || /model/i.test(raw)) && model) return `Model ${model} was not found by Gemini.`;
  return raw || `Gemini request failed with status ${status}.`;
}

async function requestJson(runtime, endpoint, options = {}, config = {}) {
  const url = runtime.geminiApiUrl(config.baseUrl || runtime.GEMINI_DEFAULT_BASE_URL, endpoint);
  let result = null;
  try {
    result = await runtime.fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("canceled") || message.includes("timed out")) throw error;
    const baseUrl = runtime.normalizeGeminiBaseUrl(config.baseUrl || runtime.GEMINI_DEFAULT_BASE_URL);
    throw new Error(`Gemini is not reachable at ${baseUrl}.`);
  }
  if (!result.response?.ok) {
    throw new Error(statusError(runtime, result.data, result.response?.status, config.model));
  }
  return result.data;
}

export function extractGeminiResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.text === "string") return data.text;
  const stepsText = Array.isArray(data?.steps)
    ? data.steps
        .flatMap((step) => {
          if (typeof step?.output_text === "string") return [step.output_text];
          const stepType = typeof step?.type === "string" ? step.type : "";
          if (stepType && !["model_output", "modelOutput", "assistant", "output"].includes(stepType)) return [];
          const content = Array.isArray(step?.content) ? step.content : [];
          const contentText = content
            .map((part) => {
              if (typeof part === "string") return part;
              return typeof part?.text === "string" ? part.text : "";
            })
            .filter(Boolean);
          if (contentText.length) return contentText;
          const parts = Array.isArray(step?.content?.parts) ? step.content.parts : [];
          return parts.map((part) => part?.text).filter((text) => typeof text === "string");
        })
        .join("")
    : "";
  if (stepsText) return stepsText;
  return Array.isArray(data?.candidates?.[0]?.content?.parts)
    ? data.candidates[0].content.parts
        .map((part) => part?.text)
        .filter((text) => typeof text === "string")
        .join("")
    : "";
}

function tokenCount(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function metadata(data) {
  return {
    promptTokens: tokenCount(
      data?.usage?.total_input_tokens,
      data?.usage?.promptTokenCount,
      data?.usageMetadata?.promptTokenCount,
      data?.usage_metadata?.prompt_token_count
    ),
    outputTokens: tokenCount(
      data?.usage?.total_output_tokens,
      data?.usage?.responseTokenCount,
      data?.usageMetadata?.candidatesTokenCount,
      data?.usage_metadata?.candidates_token_count
    ),
    totalTokens: tokenCount(
      data?.usage?.total_tokens,
      data?.usage?.totalTokenCount,
      data?.usageMetadata?.totalTokenCount,
      data?.usage_metadata?.total_token_count
    )
  };
}

function normalizedSettings(runtime, config, request) {
  const settings = runtime.defaultLocalAiSettings(
    { ...config, providerId: "gemini", model: config.model || request.model },
    request.project
  );
  const baseUrl = runtime.normalizeGeminiBaseUrl(config.baseUrl || settings.baseUrl || runtime.GEMINI_DEFAULT_BASE_URL);
  const model =
    String(config.model || request.model || settings.model || runtime.GEMINI_DEFAULT_MODEL)
      .replace(/^models\//, "")
      .trim() || runtime.GEMINI_DEFAULT_MODEL;
  return { settings, baseUrl, model };
}

function interactionRequest(runtime, config, model, prompt, systemInstruction) {
  return {
    method: "POST",
    headers: runtime.geminiAuthHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      model,
      input: prompt,
      stream: false,
      store: false,
      system_instruction: systemInstruction,
      generation_config: { temperature: 0.1 }
    })
  };
}

export function createGeminiProviderAdapter(injectedRuntime) {
  const runtime = assertRuntime(injectedRuntime);
  const provider = {
    id: "gemini",
    name: "Google Gemini",
    defaultBaseUrl: runtime.GEMINI_DEFAULT_BASE_URL,
    defaultModel: runtime.GEMINI_DEFAULT_MODEL,
    async testConnection(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(authError());
      const baseUrl = runtime.normalizeGeminiBaseUrl(config.baseUrl || runtime.GEMINI_DEFAULT_BASE_URL);
      const data = await requestJson(
        runtime,
        "/models",
        { method: "GET", headers: runtime.geminiAuthHeaders(config) },
        { ...config, baseUrl }
      );
      return {
        ok: true,
        provider: "Google Gemini",
        baseUrl,
        modelCount: Array.isArray(data?.models) ? data.models.length : 0
      };
    },
    async listModels(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(authError());
      const baseUrl = runtime.normalizeGeminiBaseUrl(config.baseUrl || runtime.GEMINI_DEFAULT_BASE_URL);
      const data = await requestJson(
        runtime,
        "/models",
        { method: "GET", headers: runtime.geminiAuthHeaders(config) },
        { ...config, baseUrl }
      );
      const models = Array.isArray(data?.models)
        ? data.models
            .map((model) => ({
              name: String(model?.name || "")
                .replace(/^models\//, "")
                .trim(),
              size: 0,
              modifiedAt: model?.updateTime || model?.version || ""
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
        "/interactions",
        interactionRequest(runtime, config, model, prompt, TRANSLATION_SYSTEM_PROMPT),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      const rawOutput = extractGeminiResponseText(data);
      if (typeof rawOutput !== "string") throw new Error("Gemini returned a malformed response.");
      const translatedText = runtime.cleanModelTranslationOutput(rawOutput, sourceText);
      if (!translatedText.trim()) throw new Error("Gemini returned an empty translation for this segment.");
      return {
        translatedText,
        rawOutput,
        provider: "Google Gemini",
        providerId: "gemini",
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
        "/interactions",
        interactionRequest(runtime, config, model, prompt, request.system || runtime.genericPromptSystem()),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      return runtime.genericPromptResult(
        "Google Gemini",
        "gemini",
        model,
        prompt,
        extractGeminiResponseText(data),
        startedAt,
        metadata(data)
      );
    }
  };
  return assertAiProvider(provider);
}

export function installGeminiProviderAdapter(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("The Gemini adapter requires the LoopCAT AI provider registry.");
  }
  const provider = createGeminiProviderAdapter(ai.providerAdapterRuntime);
  ai.aiProviderRegistry.register(provider);
  ai.GeminiProvider = provider;
  return provider;
}
