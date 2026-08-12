const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function ok(data) {
  return { response: { ok: true, status: 200 }, data };
}

function failed(status, data) {
  return { response: { ok: false, status }, data };
}

function createRuntime(results = []) {
  const calls = [];
  return {
    calls,
    GEMINI_DEFAULT_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
    GEMINI_DEFAULT_MODEL: "gemini-3.5-flash",
    buildTranslateGemmaPrompt(request) {
      return `Translate ${request.text} from ${request.sourceCode} to ${request.targetCode}`;
    },
    cleanModelTranslationOutput(value) {
      return String(value)
        .replace(/^Translation:\s*/i, "")
        .trim();
    },
    defaultLocalAiSettings(config) {
      return {
        ...config,
        baseUrl: config.baseUrl || "https://generativelanguage.googleapis.com/v1beta",
        model: config.model || "gemini-3.5-flash",
        sourceLanguage: "English",
        sourceCode: "en",
        targetLanguage: "Turkish",
        targetCode: "tr"
      };
    },
    fetchJsonWithTimeout(url, options, config) {
      calls.push({ url, options, config });
      const next = results.shift();
      if (next instanceof Error) throw next;
      return next || ok({});
    },
    geminiApiUrl(baseUrl, endpoint) {
      return `${this.normalizeGeminiBaseUrl(baseUrl)}/${String(endpoint || "").replace(/^\/+/, "")}`;
    },
    geminiAuthHeaders(config, extra = {}) {
      return { ...extra, "x-goog-api-key": config.apiKey };
    },
    genericPromptResult(provider, providerId, model, prompt, rawOutput, _startedAt, metadata) {
      if (typeof rawOutput !== "string") throw new Error(`${provider} returned a malformed response.`);
      if (!rawOutput.trim()) throw new Error(`${provider} returned an empty response.`);
      return { text: rawOutput.trim(), rawOutput, provider, providerId, model, durationMs: 20, prompt, metadata };
    },
    genericPromptSystem() {
      return "Generic system";
    },
    localAiStartedAt() {
      return 100;
    },
    normalizeGeminiBaseUrl(value) {
      const baseUrl = String(value || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
      return baseUrl.endsWith("/v1beta") ? baseUrl : `${baseUrl}/v1beta`;
    },
    promptTextOrThrow(request) {
      const prompt = String(request.prompt || "").trim();
      if (!prompt) throw new Error("The AI command has no prompt.");
      return prompt;
    },
    redactSensitiveText(value) {
      return String(value).replace(/AIza[A-Za-z0-9_-]+/g, "[redacted]");
    },
    requestDurationMs() {
      return 20;
    }
  };
}

test("Gemini adapter preserves identity, model mapping, header auth, and compatibility export", async () => {
  const { createGeminiProviderAdapter, installGeminiProviderAdapter } = await moduleAt(
    "src/ai/providers/gemini-provider-adapter.js"
  );
  const modelResponse = {
    models: [
      { name: "models/gemini-3.5-flash", updateTime: "2026-08-01T00:00:00Z" },
      { name: "models/gemini-pro", version: "002" },
      { name: "" }
    ]
  };
  const runtime = createRuntime([ok(modelResponse), ok(modelResponse)]);
  const provider = createGeminiProviderAdapter(runtime);

  assert.equal(provider.id, "gemini");
  assert.equal(provider.name, "Google Gemini");
  assert.equal(provider.defaultBaseUrl, "https://generativelanguage.googleapis.com/v1beta");
  assert.equal(provider.defaultModel, "gemini-3.5-flash");
  await assert.rejects(provider.listModels(), /Add a Gemini API key/);

  const connection = await provider.testConnection({
    apiKey: "AIza-test",
    baseUrl: "https://generativelanguage.googleapis.com"
  });
  const listed = await provider.listModels({
    apiKey: "AIza-test",
    baseUrl: "https://generativelanguage.googleapis.com"
  });
  assert.equal(connection.modelCount, 3);
  assert.deepEqual(listed.models, [
    { name: "gemini-3.5-flash", size: 0, modifiedAt: "2026-08-01T00:00:00Z" },
    { name: "gemini-pro", size: 0, modifiedAt: "002" }
  ]);
  assert.equal(runtime.calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models");
  assert.equal(runtime.calls[0].options.headers["x-goog-api-key"], "AIza-test");

  const registered = [];
  const ai = {
    providerAdapterRuntime: createRuntime(),
    aiProviderRegistry: { register: (item) => registered.push(item) }
  };
  const installed = installGeminiProviderAdapter(ai);
  assert.equal(registered[0], installed);
  assert.equal(ai.GeminiProvider, installed);
});

test("Gemini adapter preserves Interactions translation payload, abort, step parsing, provenance, and token metadata", async () => {
  const { createGeminiProviderAdapter } = await moduleAt("src/ai/providers/gemini-provider-adapter.js");
  const runtime = createRuntime([
    ok({
      steps: [
        { type: "tool", content: [{ text: "ignored" }] },
        { type: "model_output", content: ["Translation: ", { text: "Merhaba" }] }
      ],
      usage: { total_input_tokens: 8, total_output_tokens: 2, total_tokens: 10 }
    })
  ]);
  const provider = createGeminiProviderAdapter(runtime);
  const signal = { aborted: false };
  const result = await provider.translateSegment(
    { apiKey: "AIza-test", model: "models/gemini-3.5-flash" },
    { text: "Hello", sourceCode: "en", targetCode: "tr", signal }
  );

  assert.equal(result.translatedText, "Merhaba");
  assert.equal(result.provider, "Google Gemini");
  assert.equal(result.providerId, "gemini");
  assert.equal(result.model, "gemini-3.5-flash");
  assert.deepEqual(result.metadata, { promptTokens: 8, outputTokens: 2, totalTokens: 10 });
  const call = runtime.calls[0];
  assert.equal(call.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(call.config.signal, signal);
  assert.equal(call.options.headers["x-goog-api-key"], "AIza-test");
  assert.deepEqual(JSON.parse(call.options.body), {
    model: "gemini-3.5-flash",
    input: "Translate Hello from en to tr",
    stream: false,
    store: false,
    system_instruction:
      "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment.",
    generation_config: { temperature: 0.1 }
  });
});

test("Gemini adapter preserves generic commands, response fallbacks, and usage naming variants", async () => {
  const { createGeminiProviderAdapter, extractGeminiResponseText } = await moduleAt(
    "src/ai/providers/gemini-provider-adapter.js"
  );
  assert.equal(extractGeminiResponseText({ output_text: "output" }), "output");
  assert.equal(extractGeminiResponseText({ text: "text" }), "text");
  assert.equal(
    extractGeminiResponseText({ candidates: [{ content: { parts: [{ text: "candidate " }, { text: "text" }] } }] }),
    "candidate text"
  );

  const runtime = createRuntime([
    ok({
      candidates: [{ content: { parts: [{ text: " QA note " }] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 }
    })
  ]);
  const provider = createGeminiProviderAdapter(runtime);
  const result = await provider.completePrompt(
    { apiKey: "AIza-test", model: "models/gemini-pro" },
    { prompt: "Review", system: "Review system" }
  );

  assert.equal(result.text, "QA note");
  assert.equal(result.providerId, "gemini");
  assert.equal(result.model, "gemini-pro");
  assert.deepEqual(result.metadata, { promptTokens: 5, outputTokens: 3, totalTokens: 8 });
  const payload = JSON.parse(runtime.calls[0].options.body);
  assert.equal(payload.system_instruction, "Review system");
  assert.equal(payload.store, false);
  assert.equal(payload.stream, false);
});

test("Gemini adapter preserves redacted status, authentication, model, cancellation, and reachability failures", async () => {
  const { createGeminiProviderAdapter } = await moduleAt("src/ai/providers/gemini-provider-adapter.js");
  const runtime = createRuntime([
    failed(404, { error: { message: "model missing AIza-secret" } }),
    failed(401, { error: { message: "credential AIza-secret" } }),
    failed(429, { error: { message: "quota AIza-secret" } }),
    new Error("The AI request was canceled."),
    new Error("socket failed")
  ]);
  const provider = createGeminiProviderAdapter(runtime);

  await assert.rejects(
    provider.translateSegment({ apiKey: "AIza-test", model: "missing" }, { text: "Hello" }),
    /Model missing was not found by Gemini/
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "AIza-test" }, { text: "Hello" }),
    /Gemini rejected the request\. Add or check the Gemini API key\./
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "AIza-test" }, { text: "Hello" }),
    (error) => error.message === "quota [redacted]"
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "AIza-test" }, { text: "Hello" }),
    /The AI request was canceled\./
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "AIza-test", baseUrl: "https://gemini.example/v1beta" }, { text: "Hello" }),
    /Gemini is not reachable at https:\/\/gemini\.example\/v1beta\./
  );
});
