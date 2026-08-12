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
  "localAiStartedAt",
  "promptTextOrThrow",
  "redactSensitiveText",
  "requestDurationMs"
]);

const REQUIRED_DEFINITION_FIELDS = Object.freeze([
  "id",
  "name",
  "defaultBaseUrl",
  "defaultModel",
  "normalizeBaseUrl",
  "apiUrl",
  "authError",
  "authRejectedError",
  "unreachableName",
  "statusName",
  "modelMissingName",
  "translationErrorName",
  "mapModel"
]);

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("Hosted AI provider adapters require an injected runtime.");
  }
  for (const method of REQUIRED_RUNTIME_FUNCTIONS) {
    if (typeof runtime[method] !== "function") {
      throw new TypeError(`The hosted AI provider runtime is missing ${method}().`);
    }
  }
  return runtime;
}

function assertDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("Hosted AI provider adapters require a provider definition.");
  }
  for (const field of REQUIRED_DEFINITION_FIELDS) {
    const value = definition[field];
    const missing = typeof value === "function" ? false : !String(value || "").trim();
    if (missing) throw new TypeError(`The hosted AI provider definition is missing ${field}.`);
  }
  if (
    typeof definition.normalizeBaseUrl !== "function" ||
    typeof definition.apiUrl !== "function" ||
    typeof definition.mapModel !== "function"
  ) {
    throw new TypeError("Hosted AI provider definitions require URL and model-mapping functions.");
  }
  return definition;
}

export function extractOpenAiCompatibleResponseText(data, fallbackFields = ["output_text", "text"]) {
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
  for (const field of fallbackFields) {
    if (typeof data?.[field] === "string") return data[field];
  }
  return "";
}

export function hostedProviderModelRecords(data, acceptRootModelArray = false) {
  if (Array.isArray(data?.data)) return data.data;
  return acceptRootModelArray && Array.isArray(data) ? data : [];
}

export function hostedProviderModelRecord(model, options = {}) {
  const created = Number(model?.created);
  const size = options.contextLength
    ? Number(model?.context_length || model?.contextLength || 0) || model?.size || 0
    : model?.size || 0;
  const fallbackModifiedAt = options.updatedAtOnly
    ? model?.updated_at || model?.updatedAt || ""
    : options.noFallbackModifiedAt
      ? ""
      : model?.updated_at || model?.created_at || "";
  return {
    name: String(model?.id || model?.name || "").trim(),
    size,
    modifiedAt: Number.isFinite(created) ? new Date(created * 1000).toISOString() : fallbackModifiedAt
  };
}

function tokenMetadata(data) {
  return {
    promptTokens: data?.usage?.prompt_tokens || 0,
    completionTokens: data?.usage?.completion_tokens || 0,
    totalTokens: data?.usage?.total_tokens || 0
  };
}

function rawStatusText(runtime, definition, data) {
  const rawValue = definition.rawError
    ? definition.rawError(data)
    : data?.error?.message || data?.message || data?.error || "";
  return runtime.redactSensitiveText(rawValue).trim();
}

function statusError(runtime, definition, data, status, model = "") {
  const raw = rawStatusText(runtime, definition, data);
  if (status === 401 || status === 403) return definition.authRejectedError;
  const specialMessage = definition.statusMessages?.[status];
  if (specialMessage) return specialMessage;
  if ((status === 404 || /model/i.test(raw)) && model) {
    return `Model ${model} was not found by ${definition.modelMissingName}.`;
  }
  return raw || `${definition.statusName} request failed with status ${status}.`;
}

async function requestJson(runtime, definition, endpoint, options = {}, config = {}) {
  const url = definition.apiUrl(config.baseUrl || definition.defaultBaseUrl, endpoint);
  let result = null;
  try {
    result = await runtime.fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("canceled") || message.includes("timed out")) throw error;
    const baseUrl = definition.normalizeBaseUrl(config.baseUrl || definition.defaultBaseUrl);
    throw new Error(`${definition.unreachableName} is not reachable at ${baseUrl}.`);
  }
  if (!result.response?.ok) {
    throw new Error(statusError(runtime, definition, result.data, result.response?.status, config.model));
  }
  return result.data;
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

function normalizedSettings(runtime, definition, config, request) {
  const settings = runtime.defaultLocalAiSettings(
    { ...config, providerId: definition.id, model: config.model || request.model },
    request.project
  );
  const baseUrl = definition.normalizeBaseUrl(config.baseUrl || settings.baseUrl || definition.defaultBaseUrl);
  const model =
    String(config.model || request.model || settings.model || definition.defaultModel).trim() ||
    definition.defaultModel;
  return { settings, baseUrl, model };
}

function responseText(definition, data) {
  return extractOpenAiCompatibleResponseText(data, definition.responseFallbackFields);
}

export function createOpenAiCompatibleHostedProviderAdapter(injectedRuntime, injectedDefinition) {
  const runtime = assertRuntime(injectedRuntime);
  const definition = assertDefinition(injectedDefinition);
  const provider = {
    id: definition.id,
    name: definition.name,
    defaultBaseUrl: definition.defaultBaseUrl,
    defaultModel: definition.defaultModel,
    async testConnection(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(definition.authError);
      const baseUrl = definition.normalizeBaseUrl(config.baseUrl || definition.defaultBaseUrl);
      const data = await requestJson(
        runtime,
        definition,
        "/models",
        { method: "GET", headers: runtime.bearerAuthHeaders(config) },
        { ...config, baseUrl }
      );
      return {
        ok: true,
        provider: definition.name,
        baseUrl,
        modelCount: hostedProviderModelRecords(data, definition.acceptRootModelArray).length
      };
    },
    async listModels(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(definition.authError);
      const baseUrl = definition.normalizeBaseUrl(config.baseUrl || definition.defaultBaseUrl);
      const data = await requestJson(
        runtime,
        definition,
        "/models",
        { method: "GET", headers: runtime.bearerAuthHeaders(config) },
        { ...config, baseUrl }
      );
      const models = hostedProviderModelRecords(data, definition.acceptRootModelArray)
        .map((model) => definition.mapModel(model))
        .filter((model) => model.name);
      return { models, raw: data };
    },
    async translateSegment(config = {}, request = {}) {
      const { settings, baseUrl, model } = normalizedSettings(runtime, definition, config, request);
      const sourceText = String(request.text ?? request.segment?.source ?? "");
      if (!sourceText.trim()) throw new Error("The segment has no source text.");
      if (!String(config.apiKey || "").trim()) throw new Error(definition.authError);
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
        definition,
        "/chat/completions",
        chatRequest(runtime, config, model, prompt, TRANSLATION_SYSTEM_PROMPT),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      const rawOutput = responseText(definition, data);
      if (typeof rawOutput !== "string") {
        throw new Error(`${definition.translationErrorName} returned a malformed chat response.`);
      }
      const translatedText = runtime.cleanModelTranslationOutput(rawOutput, sourceText);
      if (!translatedText.trim()) {
        throw new Error(`${definition.translationErrorName} returned an empty translation for this segment.`);
      }
      return {
        translatedText,
        rawOutput,
        provider: definition.name,
        providerId: definition.id,
        model,
        durationMs: runtime.requestDurationMs(startedAt),
        prompt,
        metadata: tokenMetadata(data)
      };
    },
    async completePrompt(config = {}, request = {}) {
      const { settings, baseUrl, model } = normalizedSettings(runtime, definition, config, request);
      if (!String(config.apiKey || "").trim()) throw new Error(definition.authError);
      const prompt = runtime.promptTextOrThrow(request);
      const startedAt = runtime.localAiStartedAt();
      const data = await requestJson(
        runtime,
        definition,
        "/chat/completions",
        chatRequest(runtime, config, model, prompt, request.system || runtime.genericPromptSystem()),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      return runtime.genericPromptResult(
        definition.name,
        definition.id,
        model,
        prompt,
        responseText(definition, data),
        startedAt,
        tokenMetadata(data)
      );
    }
  };
  return assertAiProvider(provider);
}
