import { assertAiProvider } from "./provider-contract.js";

const REQUIRED_RUNTIME_FUNCTIONS = Object.freeze([
  "cleanModelTranslationOutput",
  "defaultLocalAiSettings",
  "fetchJsonWithTimeout",
  "isLoopbackBaseUrl",
  "localAiStartedAt",
  "normalizeOpusCatBaseUrl",
  "opusCatApiUrl",
  "opusCatConnectionCandidates",
  "opusCatConnectionMode",
  "redactSensitiveText",
  "requestDurationMs"
]);

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("The OPUS-CAT adapter requires an injected runtime.");
  }
  for (const method of REQUIRED_RUNTIME_FUNCTIONS) {
    if (typeof runtime[method] !== "function") {
      throw new TypeError(`The OPUS-CAT adapter runtime is missing ${method}().`);
    }
  }
  return runtime;
}

export function opusCatLanguageCode(value, fallback = "und") {
  const clean = String(value || fallback || "").trim().toLowerCase().replaceAll("_", "-");
  const match = clean.match(/[a-z]{2,3}/);
  return match?.[0] || String(fallback || "und").trim().toLowerCase() || "und";
}

export function opusCatLanguagePairMatches(pair, sourceCode, targetCode) {
  const tokens = String(pair || "").toLowerCase().match(/[a-z]{2,3}/g) || [];
  return tokens.length >= 2 && tokens[0] === sourceCode && tokens[1] === targetCode;
}

export function opusCatModelTag(model = "") {
  const tag = String(model || "").trim();
  return tag && !/^(?:default|auto)$/i.test(tag) ? tag : "";
}

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    search.set(key, String(value));
  });
  return search.toString();
}

export function opusCatTranslationText(data) {
  if (typeof data === "string") return data;
  if (typeof data?.translation === "string") return data.translation;
  return typeof data?.Translation === "string" ? data.Translation : "";
}

function statusError(runtime, data, status) {
  const raw = runtime.redactSensitiveText(data?.error || data?.message || "").trim();
  if (status === 401 || status === 403) {
    return "OPUS-CAT rejected the request. Check that the local MT Engine is running and accepting local API requests.";
  }
  if (status === 404) {
    return "OPUS-CAT did not expose the expected MTRestService endpoint. Check the OPUS-CAT MT Engine version and port.";
  }
  return raw || `OPUS-CAT request failed with status ${status}.`;
}

async function requestJson(runtime, action, params = {}, options = {}, config = {}) {
  const baseUrl = runtime.normalizeOpusCatBaseUrl(config.baseUrl || runtime.OPUS_CAT_DEFAULT_BASE_URL);
  const queryString = query(params);
  const url = `${runtime.opusCatApiUrl(baseUrl, action)}${queryString ? `?${queryString}` : ""}`;
  let result = null;
  try {
    result = await runtime.fetchJsonWithTimeout(url, options, config);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("canceled") || message.includes("timed out")) throw error;
    throw new Error(
      `OPUS-CAT MT Engine is not reachable at ${baseUrl}. Start OPUS-CAT MT Engine and try again.`
    );
  }
  if (!result.response?.ok) throw new Error(statusError(runtime, result.data, result.response?.status));
  return result.data;
}

function supportedPairs(data) {
  return Array.isArray(data) ? data.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

export function createOpusCatProviderAdapter(injectedRuntime) {
  const runtime = assertRuntime(injectedRuntime);
  const provider = {
    id: "opus-cat",
    name: "OPUS-CAT",
    defaultBaseUrl: runtime.OPUS_CAT_DEFAULT_BASE_URL,
    defaultModel: runtime.OPUS_CAT_DEFAULT_MODEL,
    async testConnection(config = {}) {
      const configuredBaseUrl = runtime.normalizeOpusCatBaseUrl(
        config.baseUrl || runtime.OPUS_CAT_DEFAULT_BASE_URL
      );
      const candidates = runtime.opusCatConnectionCandidates(configuredBaseUrl);
      let lastError = null;
      for (const baseUrl of candidates) {
        try {
          const data = await requestJson(
            runtime,
            "ListSupportedLanguagePairs",
            { tokenCode: "0" },
            { method: "GET" },
            { ...config, baseUrl, timeoutMs: Math.min(Number(config.timeoutMs) || 5000, 5000) }
          );
          const pairs = supportedPairs(data);
          return {
            ok: true,
            provider: "OPUS-CAT",
            version: pairs.length ? `${pairs.length} pair${pairs.length === 1 ? "" : "s"}` : "",
            baseUrl,
            connectionMode: runtime.opusCatConnectionMode(baseUrl),
            autoDiscovered: baseUrl !== configuredBaseUrl,
            modelCount: pairs.length
          };
        } catch (error) {
          if (String(error?.message || "").toLowerCase().includes("canceled")) throw error;
          lastError = error;
        }
      }
      if (!runtime.isLoopbackBaseUrl(configuredBaseUrl, runtime.OPUS_CAT_DEFAULT_BASE_URL) && lastError) {
        throw lastError;
      }
      throw new Error("OPUS-CAT connection failed. Open Connection help for setup steps.");
    },
    async listModels(config = {}) {
      const settings = runtime.defaultLocalAiSettings({ ...config, providerId: "opus-cat" }, config.project);
      const baseUrl = runtime.normalizeOpusCatBaseUrl(
        config.baseUrl || settings.baseUrl || runtime.OPUS_CAT_DEFAULT_BASE_URL
      );
      const sourceCode = opusCatLanguageCode(
        config.sourceCode || settings.sourceCode || config.sourceLanguage || settings.sourceLanguage || "en",
        "en"
      );
      const targetCode = opusCatLanguageCode(
        config.targetCode || settings.targetCode || config.targetLanguage || settings.targetLanguage || "tr",
        "tr"
      );
      const data = await requestJson(
        runtime,
        "ListSupportedLanguagePairs",
        { tokenCode: "0" },
        { method: "GET" },
        { ...settings, ...config, baseUrl }
      );
      const languagePairs = supportedPairs(data);
      const pairSupported = languagePairs.some((pair) => opusCatLanguagePairMatches(pair, sourceCode, targetCode));
      let modelTags = [];
      if (pairSupported) {
        const tagData = await requestJson(
          runtime,
          "GetLanguagePairModelTags",
          { tokenCode: "0", srcLangCode: sourceCode, trgLangCode: targetCode },
          { method: "GET" },
          { ...settings, ...config, baseUrl }
        );
        modelTags = supportedPairs(tagData);
      }
      const models = pairSupported
        ? [
            { name: runtime.OPUS_CAT_DEFAULT_MODEL, size: 0, modifiedAt: "" },
            ...modelTags
              .filter((tag) => tag !== runtime.OPUS_CAT_DEFAULT_MODEL)
              .map((tag) => ({ name: tag, size: 0, modifiedAt: "" }))
          ]
        : [];
      return { models, raw: { supportedLanguagePairs: languagePairs, sourceCode, targetCode, modelTags } };
    },
    async translateSegment(config = {}, request = {}) {
      const settings = runtime.defaultLocalAiSettings(
        { ...config, providerId: "opus-cat", model: config.model || request.model },
        request.project
      );
      const baseUrl = runtime.normalizeOpusCatBaseUrl(
        config.baseUrl || settings.baseUrl || runtime.OPUS_CAT_DEFAULT_BASE_URL
      );
      const model =
        String(config.model || request.model || settings.model || runtime.OPUS_CAT_DEFAULT_MODEL).trim() ||
        runtime.OPUS_CAT_DEFAULT_MODEL;
      const modelTag = opusCatModelTag(model);
      const sourceText = String(request.text ?? request.segment?.source ?? "");
      if (!sourceText.trim()) throw new Error("The segment has no source text.");
      const sourceCode = opusCatLanguageCode(
        request.sourceCode || settings.sourceCode || request.sourceLanguage || settings.sourceLanguage || "en",
        "en"
      );
      const targetCode = opusCatLanguageCode(
        request.targetCode || settings.targetCode || request.targetLanguage || settings.targetLanguage || "tr",
        "tr"
      );
      const startedAt = runtime.localAiStartedAt();
      const data = await requestJson(
        runtime,
        "TranslateJson",
        {
          tokenCode: "0",
          input: sourceText,
          srcLangCode: sourceCode,
          trgLangCode: targetCode,
          modelTag,
          inputIsSingleSentence: "true"
        },
        { method: "GET" },
        { ...settings, ...config, baseUrl, model, signal: request.signal || config.signal }
      );
      const rawOutput = opusCatTranslationText(data);
      if (typeof rawOutput !== "string") throw new Error("OPUS-CAT returned a malformed translation response.");
      const translatedText = runtime.cleanModelTranslationOutput(rawOutput, sourceText);
      if (!translatedText.trim()) {
        throw new Error(
          "OPUS-CAT returned an empty translation for this segment. Check that an OPUS-CAT model is installed for the selected language pair."
        );
      }
      return {
        translatedText,
        rawOutput,
        provider: "OPUS-CAT",
        providerId: "opus-cat",
        model: modelTag || runtime.OPUS_CAT_DEFAULT_MODEL,
        durationMs: runtime.requestDurationMs(startedAt),
        prompt: sourceText,
        metadata: {
          sourceCode,
          targetCode,
          modelTag,
          segmentedTranslationCount: Array.isArray(data?.SegmentedTranslation)
            ? data.SegmentedTranslation.length
            : 0
        }
      };
    }
  };
  return assertAiProvider(provider);
}

export function installOpusCatProviderAdapter(ai) {
  if (!ai?.aiProviderRegistry?.register) {
    throw new TypeError("The OPUS-CAT adapter requires the LoopCAT AI provider registry.");
  }
  const provider = createOpusCatProviderAdapter(ai.providerAdapterRuntime);
  ai.aiProviderRegistry.register(provider);
  ai.OpusCatProvider = provider;
  return provider;
}
