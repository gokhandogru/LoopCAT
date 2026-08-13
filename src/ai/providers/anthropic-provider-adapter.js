import { assertAiProvider } from "./provider-contract.js";

const TRANSLATION_SYSTEM_PROMPT =
  "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment.";

const REQUIRED_RUNTIME_FUNCTIONS = Object.freeze([
  "anthropicApiUrl",
  "anthropicAuthHeaders",
  "buildTranslateGemmaPrompt",
  "cleanModelTranslationOutput",
  "defaultLocalAiSettings",
  "fetchJsonWithTimeout",
  "genericPromptResult",
  "genericPromptSystem",
  "localAiStartedAt",
  "normalizeAnthropicBaseUrl",
  "promptTextOrThrow",
  "redactSensitiveText",
  "requestDurationMs"
]);

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("The Anthropic adapter requires an injected runtime.");
  }
  for (const method of REQUIRED_RUNTIME_FUNCTIONS) {
    if (typeof runtime[method] !== "function") {
      throw new TypeError(`The Anthropic adapter runtime is missing ${method}().`);
    }
  }
  return runtime;
}

function authError() {
  return "Add an Anthropic API key before using Claude for pre-translation.";
}

function statusError(runtime, data, status, model = "") {
  const raw = runtime.redactSensitiveText(data?.error?.message || data?.message || data?.error || "").trim();
  if (status === 401 || status === 403) return "Anthropic rejected the request. Add or check the Anthropic API key.";
  if ((status === 404 || /model/i.test(raw)) && model) return `Model ${model} was not found by Anthropic.`;
  return raw || `Anthropic request failed with status ${status}.`;
}

async function requestJson(runtime, endpoint, options = {}, config = {}) {
  const url = runtime.anthropicApiUrl(config.baseUrl || runtime.ANTHROPIC_DEFAULT_BASE_URL, endpoint);
  let result = null;
  try {
    result = await runtime.fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("canceled") || message.includes("timed out")) throw error;
    const baseUrl = runtime.normalizeAnthropicBaseUrl(config.baseUrl || runtime.ANTHROPIC_DEFAULT_BASE_URL);
    throw new Error(`Anthropic is not reachable at ${baseUrl}.`);
  }
  if (!result.response?.ok) {
    throw new Error(statusError(runtime, result.data, result.response?.status, config.model));
  }
  return result.data;
}

export function extractAnthropicResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.text === "string") return data.text;
  const content = Array.isArray(data?.content) ? data.content : [];
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type && part.type !== "text") return "";
      return typeof part?.text === "string" ? part.text : "";
    })
    .filter(Boolean)
    .join("");
}

function metadata(data) {
  const inputTokens = Number(data?.usage?.input_tokens) || 0;
  const outputTokens = Number(data?.usage?.output_tokens) || 0;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

function normalizedSettings(runtime, config, request) {
  const settings = runtime.defaultLocalAiSettings(
    { ...config, providerId: "anthropic", model: config.model || request.model },
    request.project
  );
  const baseUrl = runtime.normalizeAnthropicBaseUrl(
    config.baseUrl || settings.baseUrl || runtime.ANTHROPIC_DEFAULT_BASE_URL
  );
  const model =
    String(config.model || request.model || settings.model || runtime.ANTHROPIC_DEFAULT_MODEL).trim() ||
    runtime.ANTHROPIC_DEFAULT_MODEL;
  return { settings, baseUrl, model };
}

function messageRequest(runtime, config, model, prompt, system) {
  return {
    method: "POST",
    headers: runtime.anthropicAuthHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: prompt }]
    })
  };
}

export function createAnthropicProviderAdapter(injectedRuntime) {
  const runtime = assertRuntime(injectedRuntime);
  const provider = {
    id: "anthropic",
    name: "Anthropic Claude",
    defaultBaseUrl: runtime.ANTHROPIC_DEFAULT_BASE_URL,
    defaultModel: runtime.ANTHROPIC_DEFAULT_MODEL,
    async testConnection(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(authError());
      const baseUrl = runtime.normalizeAnthropicBaseUrl(config.baseUrl || runtime.ANTHROPIC_DEFAULT_BASE_URL);
      const data = await requestJson(
        runtime,
        "/models",
        { method: "GET", headers: runtime.anthropicAuthHeaders(config) },
        { ...config, baseUrl }
      );
      return {
        ok: true,
        provider: "Anthropic Claude",
        baseUrl,
        modelCount: Array.isArray(data?.data) ? data.data.length : 0
      };
    },
    async listModels(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(authError());
      const baseUrl = runtime.normalizeAnthropicBaseUrl(config.baseUrl || runtime.ANTHROPIC_DEFAULT_BASE_URL);
      const data = await requestJson(
        runtime,
        "/models",
        { method: "GET", headers: runtime.anthropicAuthHeaders(config) },
        { ...config, baseUrl }
      );
      const models = Array.isArray(data?.data)
        ? data.data
            .map((model) => ({
              name: String(model?.id || model?.name || "").trim(),
              size: 0,
              modifiedAt: model?.created_at || model?.createdAt || ""
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
        "/messages",
        messageRequest(runtime, config, model, prompt, TRANSLATION_SYSTEM_PROMPT),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      const rawOutput = extractAnthropicResponseText(data);
      if (typeof rawOutput !== "string") throw new Error("Anthropic returned a malformed response.");
      const translatedText = runtime.cleanModelTranslationOutput(rawOutput, sourceText);
      if (!translatedText.trim()) throw new Error("Anthropic returned an empty translation for this segment.");
      return {
        translatedText,
        rawOutput,
        provider: "Anthropic Claude",
        providerId: "anthropic",
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
        "/messages",
        messageRequest(runtime, config, model, prompt, request.system || runtime.genericPromptSystem()),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      return runtime.genericPromptResult(
        "Anthropic Claude",
        "anthropic",
        model,
        prompt,
        extractAnthropicResponseText(data),
        startedAt,
        metadata(data)
      );
    }
  };
  return assertAiProvider(provider);
}

export function installAnthropicProviderAdapter(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("The Anthropic adapter requires the LoopCAT AI provider registry.");
  }
  const provider = createAnthropicProviderAdapter(ai.providerAdapterRuntime);
  ai.aiProviderRegistry.register(provider);
  ai.AnthropicProvider = provider;
  return provider;
}
