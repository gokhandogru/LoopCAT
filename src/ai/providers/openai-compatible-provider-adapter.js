import { assertAiProvider } from "./provider-contract.js";

const REQUIRED_RUNTIME_FUNCTIONS = Object.freeze([
  "assertOpenAiCompatibleHostedAllowed",
  "bearerAuthHeaders",
  "buildTranslateGemmaPrompt",
  "cleanModelTranslationOutput",
  "defaultLocalAiSettings",
  "fetchJsonWithTimeout",
  "genericPromptResult",
  "genericPromptSystem",
  "localAiProviderNeedsApiKey",
  "localAiStartedAt",
  "normalizeOpenAiCompatibleBaseUrl",
  "openAiCompatibleApiUrl",
  "promptTextOrThrow",
  "redactSensitiveText",
  "requestDurationMs"
]);

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("The OpenAI-compatible adapter requires an injected runtime.");
  }
  for (const method of REQUIRED_RUNTIME_FUNCTIONS) {
    if (typeof runtime[method] !== "function") {
      throw new TypeError(`The OpenAI-compatible adapter runtime is missing ${method}().`);
    }
  }
  return runtime;
}

function statusError(runtime, data, status, model = "") {
  const raw = runtime.redactSensitiveText(data?.error?.message || data?.message || data?.error || "").trim();
  if (status === 401 || status === 403) {
    return "The OpenAI-compatible provider rejected the request. Add or check the provider API key.";
  }
  if ((status === 404 || /model/i.test(raw)) && model) {
    return `Model ${model} was not found by the OpenAI-compatible provider.`;
  }
  return raw || `OpenAI-compatible request failed with status ${status}.`;
}

async function requestJson(runtime, endpoint, options = {}, config = {}) {
  const url = runtime.openAiCompatibleApiUrl(config.baseUrl || runtime.LM_STUDIO_DEFAULT_BASE_URL, endpoint);
  let result = null;
  try {
    result = await runtime.fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("canceled") || message.includes("timed out")) throw error;
    const baseUrl = runtime.normalizeOpenAiCompatibleBaseUrl(
      config.baseUrl || runtime.LM_STUDIO_DEFAULT_BASE_URL
    );
    throw new Error(`OpenAI-compatible provider is not reachable at ${baseUrl}.`);
  }
  if (!result.response?.ok) {
    throw new Error(statusError(runtime, result.data, result.response?.status, config.model));
  }
  return result.data;
}

function normalizedSettings(runtime, config, request) {
  const settings = runtime.defaultLocalAiSettings(
    { ...config, providerId: "openai-compatible", model: config.model || request.model },
    request.project
  );
  const baseUrl = runtime.normalizeOpenAiCompatibleBaseUrl(
    config.baseUrl || settings.baseUrl || runtime.LM_STUDIO_DEFAULT_BASE_URL
  );
  const model =
    String(config.model || request.model || settings.model || runtime.DEFAULT_LOCAL_AI_MODEL).trim() ||
    runtime.DEFAULT_LOCAL_AI_MODEL;
  return { settings, baseUrl, model };
}

function requireAllowedEndpoint(runtime, baseUrl, config, action) {
  runtime.assertOpenAiCompatibleHostedAllowed(baseUrl);
  if (runtime.localAiProviderNeedsApiKey("openai-compatible", baseUrl) && !String(config.apiKey || "").trim()) {
    throw new Error(`Add a provider API key before ${action}.`);
  }
}

function metadata(data) {
  return {
    promptTokens: data?.usage?.prompt_tokens || 0,
    completionTokens: data?.usage?.completion_tokens || 0,
    totalTokens: data?.usage?.total_tokens || 0
  };
}

function chatRequest(runtime, config, model, messages) {
  return {
    method: "POST",
    headers: runtime.bearerAuthHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({ model, messages, stream: false, temperature: 0.1 })
  };
}

export function createOpenAiCompatibleProviderAdapter(injectedRuntime) {
  const runtime = assertRuntime(injectedRuntime);
  const provider = {
    id: "openai-compatible",
    name: "LM Studio / OpenAI-compatible",
    defaultBaseUrl: runtime.LM_STUDIO_DEFAULT_BASE_URL,
    defaultModel: runtime.DEFAULT_LOCAL_AI_MODEL,
    async testConnection(config = {}) {
      const baseUrl = runtime.normalizeOpenAiCompatibleBaseUrl(
        config.baseUrl || runtime.LM_STUDIO_DEFAULT_BASE_URL
      );
      requireAllowedEndpoint(runtime, baseUrl, config, "using this hosted OpenAI-compatible endpoint");
      const data = await requestJson(
        runtime,
        "/models",
        { method: "GET", headers: runtime.bearerAuthHeaders(config) },
        { ...config, baseUrl }
      );
      return {
        ok: true,
        provider: "OpenAI-compatible",
        baseUrl,
        modelCount: Array.isArray(data?.data) ? data.data.length : 0
      };
    },
    async listModels(config = {}) {
      const baseUrl = runtime.normalizeOpenAiCompatibleBaseUrl(
        config.baseUrl || runtime.LM_STUDIO_DEFAULT_BASE_URL
      );
      requireAllowedEndpoint(runtime, baseUrl, config, "refreshing models");
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
      requireAllowedEndpoint(runtime, baseUrl, config, "sending source text to this hosted endpoint");
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
        chatRequest(runtime, config, model, [{ role: "user", content: prompt }]),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      const rawOutput = data?.choices?.[0]?.message?.content;
      if (typeof rawOutput !== "string") {
        throw new Error("The OpenAI-compatible provider returned a malformed chat response.");
      }
      const translatedText = runtime.cleanModelTranslationOutput(rawOutput, sourceText);
      if (!translatedText.trim()) throw new Error("The model returned an empty translation for this segment.");
      return {
        translatedText,
        rawOutput,
        provider: "OpenAI-compatible",
        providerId: "openai-compatible",
        model,
        durationMs: runtime.requestDurationMs(startedAt),
        prompt,
        metadata: metadata(data)
      };
    },
    async completePrompt(config = {}, request = {}) {
      const { settings, baseUrl, model } = normalizedSettings(runtime, config, request);
      requireAllowedEndpoint(runtime, baseUrl, config, "sending source text to this hosted endpoint");
      const prompt = runtime.promptTextOrThrow(request);
      const startedAt = runtime.localAiStartedAt();
      const data = await requestJson(
        runtime,
        "/chat/completions",
        chatRequest(runtime, config, model, [
          { role: "system", content: request.system || runtime.genericPromptSystem() },
          { role: "user", content: prompt }
        ]),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      return runtime.genericPromptResult(
        "OpenAI-compatible",
        "openai-compatible",
        model,
        prompt,
        data?.choices?.[0]?.message?.content,
        startedAt,
        metadata(data)
      );
    }
  };
  return assertAiProvider(provider);
}

export function installOpenAiCompatibleProviderAdapter(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("The OpenAI-compatible adapter requires the LoopCAT AI provider registry.");
  }
  const provider = createOpenAiCompatibleProviderAdapter(ai.providerAdapterRuntime);
  ai.aiProviderRegistry.register(provider);
  ai.OpenAICompatibleProvider = provider;
  return provider;
}
