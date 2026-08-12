import { assertAiProvider } from "./provider-contract.js";

const TRANSLATION_INSTRUCTIONS =
  "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment.";

const REQUIRED_RUNTIME_FUNCTIONS = Object.freeze([
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
  "authHeaders",
  "authError",
  "connectionError",
  "statusError",
  "modelName",
  "translationErrorName"
]);

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("OpenAI Responses provider adapters require an injected runtime.");
  }
  for (const method of REQUIRED_RUNTIME_FUNCTIONS) {
    if (typeof runtime[method] !== "function") {
      throw new TypeError(`The OpenAI Responses provider runtime is missing ${method}().`);
    }
  }
  return runtime;
}

function assertDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("OpenAI Responses provider adapters require a provider definition.");
  }
  for (const field of REQUIRED_DEFINITION_FIELDS) {
    const value = definition[field];
    const missing = typeof value === "function" ? false : !String(value || "").trim();
    if (missing) throw new TypeError(`The OpenAI Responses provider definition is missing ${field}.`);
  }
  for (const field of ["normalizeBaseUrl", "apiUrl", "authHeaders", "connectionError", "statusError", "modelName"]) {
    if (typeof definition[field] !== "function") {
      throw new TypeError(`The OpenAI Responses provider definition requires ${field}().`);
    }
  }
  return definition;
}

export function extractResponsesText(data) {
  if (data?.output_text !== undefined && data?.output_text !== null) return String(data.output_text);
  const chunks = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const contentList = Array.isArray(item?.content) ? item.content : [];
    for (const content of contentList) {
      if (content?.type === "output_text" && content.text) chunks.push(content.text);
      if (content?.type === "text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

export function responsesModelRecord(model, modelName) {
  const created = Number(model?.created);
  return {
    name: String(modelName(model) || "").trim(),
    size: 0,
    modifiedAt: Number.isFinite(created) ? new Date(created * 1000).toISOString() : ""
  };
}

function tokenMetadata(data) {
  return {
    inputTokens: data?.usage?.input_tokens || 0,
    outputTokens: data?.usage?.output_tokens || 0,
    totalTokens: data?.usage?.total_tokens || 0
  };
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
    throw new Error(definition.connectionError(baseUrl));
  }
  if (!result.response?.ok) {
    throw new Error(definition.statusError(runtime, result.data, result.response?.status, config.model));
  }
  return result.data;
}

function responsesRequest(definition, config, model, prompt, instructions) {
  return {
    method: "POST",
    headers: definition.authHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      model,
      store: false,
      instructions,
      input: prompt,
      max_output_tokens: 1200
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

export function createOpenAiResponsesProviderAdapter(injectedRuntime, injectedDefinition) {
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
        { method: "GET", headers: definition.authHeaders(config) },
        { ...config, baseUrl }
      );
      return {
        ok: true,
        provider: definition.name,
        baseUrl,
        modelCount: Array.isArray(data?.data) ? data.data.length : 0
      };
    },
    async listModels(config = {}) {
      if (!String(config.apiKey || "").trim()) throw new Error(definition.authError);
      const baseUrl = definition.normalizeBaseUrl(config.baseUrl || definition.defaultBaseUrl);
      const data = await requestJson(
        runtime,
        definition,
        "/models",
        { method: "GET", headers: definition.authHeaders(config) },
        { ...config, baseUrl }
      );
      const models = Array.isArray(data?.data)
        ? data.data.map((model) => responsesModelRecord(model, definition.modelName)).filter((model) => model.name)
        : [];
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
        "/responses",
        responsesRequest(definition, config, model, prompt, TRANSLATION_INSTRUCTIONS),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      const rawOutput = extractResponsesText(data);
      if (typeof rawOutput !== "string") {
        throw new Error(`${definition.translationErrorName} returned a malformed response.`);
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
        "/responses",
        responsesRequest(definition, config, model, prompt, request.system || runtime.genericPromptSystem()),
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      return runtime.genericPromptResult(
        definition.name,
        definition.id,
        model,
        prompt,
        extractResponsesText(data),
        startedAt,
        tokenMetadata(data)
      );
    }
  };
  return assertAiProvider(provider);
}
