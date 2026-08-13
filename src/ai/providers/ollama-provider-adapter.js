import { assertAiProvider } from "./provider-contract.js";

const REQUIRED_RUNTIME_FUNCTIONS = Object.freeze([
  "bearerAuthHeaders",
  "buildTranslateGemmaPrompt",
  "cleanModelTranslationOutput",
  "defaultLocalAiSettings",
  "fetchJsonWithTimeout",
  "genericPromptResult",
  "isOllamaCloudBaseUrl",
  "localAiProviderNeedsApiKey",
  "localAiStartedAt",
  "normalizeOllamaBaseUrl",
  "ollamaApiUrl",
  "promptTextOrThrow",
  "redactSensitiveText",
  "requestDurationMs"
]);

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") throw new TypeError("The Ollama adapter requires an injected runtime.");
  for (const method of REQUIRED_RUNTIME_FUNCTIONS) {
    if (typeof runtime[method] !== "function") {
      throw new TypeError(`The Ollama adapter runtime is missing ${method}().`);
    }
  }
  return runtime;
}

function reachableError(runtime, baseUrl) {
  const rootBaseUrl = runtime.normalizeOllamaBaseUrl(baseUrl).rootBaseUrl;
  if (runtime.isOllamaCloudBaseUrl(rootBaseUrl)) {
    return "Ollama Cloud is not reachable. Check your connection and hosted Ollama access.";
  }
  return `Ollama is not reachable at ${rootBaseUrl}. Start Ollama and try again.`;
}

function statusError(runtime, data, status, model = "") {
  const raw = runtime.redactSensitiveText(data?.error || data?.message || "").trim();
  if (status === 401 || status === 403) {
    return "Ollama rejected the request. Add or check the Ollama API key for hosted Ollama.";
  }
  if ((/not\s+found|model/i.test(raw) || status === 404) && model) {
    return `Model ${model} is not installed. Pull it from the AI Command Centre.`;
  }
  return raw || `Ollama request failed with status ${status}.`;
}

async function requestJson(runtime, endpoint, options = {}, config = {}) {
  const url = runtime.ollamaApiUrl(config.baseUrl || runtime.OLLAMA_DEFAULT_BASE_URL, endpoint);
  let result = null;
  try {
    result = await runtime.fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("canceled") || message.includes("timed out")) throw error;
    throw new Error(reachableError(runtime, config.baseUrl || runtime.OLLAMA_DEFAULT_BASE_URL));
  }
  if (!result.response?.ok) {
    throw new Error(statusError(runtime, result.data, result.response?.status, config.model));
  }
  return result.data;
}

function normalizedSettings(runtime, config, request) {
  const settings = runtime.defaultLocalAiSettings({ ...config, model: config.model || request.model }, request.project);
  const model =
    String(config.model || request.model || settings.model || runtime.DEFAULT_LOCAL_AI_MODEL).trim() ||
    runtime.DEFAULT_LOCAL_AI_MODEL;
  return { settings, model };
}

function metadata(data, includeLoadDuration = false) {
  const result = {
    totalDuration: data?.total_duration || 0,
    promptEvalCount: data?.prompt_eval_count || 0,
    evalCount: data?.eval_count || 0
  };
  if (includeLoadDuration) result.loadDuration = data?.load_duration || 0;
  return result;
}

function chatRequest(runtime, config, model, messages) {
  return {
    method: "POST",
    headers: runtime.bearerAuthHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.1 } })
  };
}

export function createOllamaProviderAdapter(injectedRuntime) {
  const runtime = assertRuntime(injectedRuntime);
  const provider = {
    id: "ollama",
    name: "Ollama",
    defaultBaseUrl: runtime.OLLAMA_DEFAULT_BASE_URL,
    defaultModel: runtime.DEFAULT_LOCAL_AI_MODEL,
    async testConnection(config = {}) {
      const hosted = runtime.isOllamaCloudBaseUrl(config.baseUrl || runtime.OLLAMA_DEFAULT_BASE_URL);
      if (
        hosted &&
        runtime.localAiProviderNeedsApiKey("ollama", config.baseUrl) &&
        !String(config.apiKey || "").trim()
      ) {
        throw new Error("Add an Ollama API key before using hosted Ollama.");
      }
      const data = hosted
        ? await requestJson(runtime, "/tags", { method: "GET", headers: runtime.bearerAuthHeaders(config) }, config)
        : await requestJson(runtime, "/version", { method: "GET", headers: runtime.bearerAuthHeaders(config) }, config);
      return {
        ok: true,
        provider: hosted ? "Ollama Cloud" : "Ollama",
        version: data?.version || "",
        baseUrl: runtime.normalizeOllamaBaseUrl(config.baseUrl || runtime.OLLAMA_DEFAULT_BASE_URL).rootBaseUrl
      };
    },
    async listModels(config = {}) {
      if (
        runtime.isOllamaCloudBaseUrl(config.baseUrl || runtime.OLLAMA_DEFAULT_BASE_URL) &&
        !String(config.apiKey || "").trim()
      ) {
        throw new Error("Add an Ollama API key before refreshing hosted Ollama models.");
      }
      const data = await requestJson(
        runtime,
        "/tags",
        { method: "GET", headers: runtime.bearerAuthHeaders(config) },
        config
      );
      const models = Array.isArray(data?.models)
        ? data.models
            .map((model) => ({
              name: String(model.name || model.model || "").trim(),
              size: model.size || 0,
              modifiedAt: model.modified_at || model.modifiedAt || ""
            }))
            .filter((model) => model.name)
        : [];
      return { models, raw: data };
    },
    async pullModel(config = {}, modelName = runtime.DEFAULT_LOCAL_AI_MODEL, onProgress = null) {
      const model = String(modelName || runtime.DEFAULT_LOCAL_AI_MODEL).trim() || runtime.DEFAULT_LOCAL_AI_MODEL;
      if (runtime.isOllamaCloudBaseUrl(config.baseUrl || runtime.OLLAMA_DEFAULT_BASE_URL)) {
        throw new Error("Model pull is only available for local Ollama. Refresh hosted Ollama models instead.");
      }
      onProgress?.({ status: "starting", model });
      const data = await requestJson(
        runtime,
        "/pull",
        {
          method: "POST",
          headers: runtime.bearerAuthHeaders(config, { "Content-Type": "application/json" }),
          body: JSON.stringify({ name: model, stream: false })
        },
        { ...config, model }
      );
      onProgress?.({ status: "complete", model });
      return { ok: true, model, raw: data };
    },
    async translateSegment(config = {}, request = {}) {
      const { settings, model } = normalizedSettings(runtime, config, request);
      const sourceText = String(request.text ?? request.segment?.source ?? "");
      if (!sourceText.trim()) throw new Error("The segment has no source text.");
      if (runtime.isOllamaCloudBaseUrl(config.baseUrl || settings.baseUrl) && !String(config.apiKey || "").trim()) {
        throw new Error("Add an Ollama API key before sending source text to hosted Ollama.");
      }
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
        "/chat",
        chatRequest(runtime, config, model, [{ role: "user", content: prompt }]),
        { ...settings, ...config, model, signal: request.signal || config.signal }
      );
      const rawOutput = data?.message?.content;
      if (typeof rawOutput !== "string") throw new Error("Ollama returned a malformed chat response.");
      const translatedText = runtime.cleanModelTranslationOutput(rawOutput, sourceText);
      if (!translatedText.trim()) throw new Error("The model returned an empty translation for this segment.");
      return {
        translatedText,
        rawOutput,
        provider: "Ollama",
        providerId: "ollama",
        model,
        durationMs: runtime.requestDurationMs(startedAt),
        prompt,
        metadata: metadata(data, true)
      };
    },
    async completePrompt(config = {}, request = {}) {
      const { settings, model } = normalizedSettings(runtime, config, request);
      if (runtime.isOllamaCloudBaseUrl(config.baseUrl || settings.baseUrl) && !String(config.apiKey || "").trim()) {
        throw new Error("Add an Ollama API key before sending source text to hosted Ollama.");
      }
      const prompt = runtime.promptTextOrThrow(request);
      const messages = request.system
        ? [
            { role: "system", content: String(request.system) },
            { role: "user", content: prompt }
          ]
        : [{ role: "user", content: prompt }];
      const startedAt = runtime.localAiStartedAt();
      const data = await requestJson(runtime, "/chat", chatRequest(runtime, config, model, messages), {
        ...settings,
        ...config,
        model,
        signal: request.signal || config.signal
      });
      return runtime.genericPromptResult(
        "Ollama",
        "ollama",
        model,
        prompt,
        data?.message?.content,
        startedAt,
        metadata(data)
      );
    }
  };
  return assertAiProvider(provider);
}

export function installOllamaProviderAdapter(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("The Ollama adapter requires the LoopCAT AI provider registry.");
  }
  const provider = createOllamaProviderAdapter(ai.providerAdapterRuntime);
  ai.aiProviderRegistry.register(provider);
  ai.OllamaProvider = provider;
  return provider;
}
