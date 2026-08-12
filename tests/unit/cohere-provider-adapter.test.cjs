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
    COHERE_DEFAULT_BASE_URL: "https://api.cohere.com",
    COHERE_DEFAULT_MODEL: "command-a-translate-08-2025",
    buildTranslateGemmaPrompt(request) {
      return `Translate ${request.text} from ${request.sourceCode} to ${request.targetCode}`;
    },
    cleanModelTranslationOutput(value) {
      return String(value).replace(/^Translation:\s*/i, "").trim();
    },
    cohereApiUrl(baseUrl, endpoint) {
      const rootUrl = this.normalizeCohereBaseUrl(baseUrl).replace(/\/v[12]$/, "");
      return `${rootUrl}/${String(endpoint || "").replace(/^\/+/, "")}`;
    },
    cohereAuthHeaders(config, extra = {}) {
      return { ...extra, Authorization: `Bearer ${config.apiKey}`, "X-Client-Name": "LoopCAT" };
    },
    defaultLocalAiSettings(config) {
      return {
        ...config,
        baseUrl: config.baseUrl || "https://api.cohere.com",
        model: config.model || "command-a-translate-08-2025",
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
    normalizeCohereBaseUrl(value) {
      return String(value || "https://api.cohere.com").replace(/\/+$/, "");
    },
    promptTextOrThrow(request) {
      const prompt = String(request.prompt || "").trim();
      if (!prompt) throw new Error("The AI command has no prompt.");
      return prompt;
    },
    redactSensitiveText(value) {
      return String(value).replace(/cohere-secret/g, "[redacted]");
    },
    requestDurationMs() {
      return 20;
    }
  };
}

test("Cohere adapter preserves identity, model mapping, bearer headers, client name, and compatibility export", async () => {
  const { createCohereProviderAdapter, installCohereProviderAdapter } = await moduleAt(
    "src/ai/providers/cohere-provider-adapter.js"
  );
  const modelResponse = {
    models: [
      { name: "command-a-translate-08-2025", created_at: "2025-08-01T00:00:00Z" },
      { id: "command-r", createdAt: "2024-01-01T00:00:00Z" },
      { name: "" }
    ]
  };
  const runtime = createRuntime([ok(modelResponse), ok(modelResponse)]);
  const provider = createCohereProviderAdapter(runtime);

  assert.equal(provider.id, "cohere");
  assert.equal(provider.name, "Cohere Command");
  await assert.rejects(provider.listModels(), /Add a Cohere API key/);
  const connection = await provider.testConnection({ apiKey: "cohere-key", baseUrl: "https://api.cohere.com/v2" });
  const listed = await provider.listModels({ apiKey: "cohere-key", baseUrl: "https://api.cohere.com/v2" });
  assert.equal(connection.modelCount, 3);
  assert.deepEqual(listed.models, [
    { name: "command-a-translate-08-2025", size: 0, modifiedAt: "2025-08-01T00:00:00Z" },
    { name: "command-r", size: 0, modifiedAt: "2024-01-01T00:00:00Z" }
  ]);
  assert.equal(runtime.calls[0].url, "https://api.cohere.com/v1/models");
  assert.equal(runtime.calls[0].options.headers.Authorization, "Bearer cohere-key");
  assert.equal(runtime.calls[0].options.headers["X-Client-Name"], "LoopCAT");

  const registered = [];
  const ai = {
    providerAdapterRuntime: createRuntime(),
    aiProviderRegistry: { register: (item) => registered.push(item) }
  };
  const installed = installCohereProviderAdapter(ai);
  assert.equal(registered[0], installed);
  assert.equal(ai.CohereProvider, installed);
});

test("Cohere adapter preserves Chat V2 translation payload, abort, content parsing, provenance, and usage fallbacks", async () => {
  const { createCohereProviderAdapter } = await moduleAt("src/ai/providers/cohere-provider-adapter.js");
  const runtime = createRuntime([
    ok({
      message: { content: [{ type: "tool", text: "ignored" }, "Translation: ", { type: "text", text: "Merhaba" }] },
      usage: { billed_units: { input_tokens: 8, output_tokens: 2 } }
    })
  ]);
  const provider = createCohereProviderAdapter(runtime);
  const signal = { aborted: false };
  const result = await provider.translateSegment(
    { apiKey: "cohere-key", model: "command-a-translate-08-2025" },
    { text: "Hello", sourceCode: "en", targetCode: "tr", signal }
  );

  assert.equal(result.translatedText, "Merhaba");
  assert.equal(result.providerId, "cohere");
  assert.deepEqual(result.metadata, { inputTokens: 8, outputTokens: 2, totalTokens: 10 });
  const call = runtime.calls[0];
  assert.equal(call.url, "https://api.cohere.com/v2/chat");
  assert.equal(call.config.signal, signal);
  assert.equal(call.options.headers.Authorization, "Bearer cohere-key");
  assert.equal(call.options.headers["X-Client-Name"], "LoopCAT");
  assert.deepEqual(JSON.parse(call.options.body), {
    model: "command-a-translate-08-2025",
    messages: [
      {
        role: "system",
        content:
          "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment."
      },
      { role: "user", content: "Translate Hello from en to tr" }
    ],
    temperature: 0.1,
    max_tokens: 1200
  });
});

test("Cohere adapter preserves generic commands, response fallbacks, bounded tokens, and usage metadata", async () => {
  const { createCohereProviderAdapter, extractCohereResponseText } = await moduleAt(
    "src/ai/providers/cohere-provider-adapter.js"
  );
  assert.equal(extractCohereResponseText({ output_text: "output" }), "output");
  assert.equal(extractCohereResponseText({ text: "text" }), "text");
  assert.equal(extractCohereResponseText({ message: { content: "content" } }), "content");

  const runtime = createRuntime([
    ok({ message: { content: [{ type: "text", text: " QA note " }] }, usage: { tokens: { input_tokens: 5, output_tokens: 3 } } })
  ]);
  const provider = createCohereProviderAdapter(runtime);
  const result = await provider.completePrompt(
    { apiKey: "cohere-key", model: "command-a-translate-08-2025" },
    { prompt: "Review", system: "Review system" }
  );

  assert.equal(result.text, "QA note");
  assert.deepEqual(result.metadata, { inputTokens: 5, outputTokens: 3, totalTokens: 8 });
  const payload = JSON.parse(runtime.calls[0].options.body);
  assert.equal(payload.messages[0].content, "Review system");
  assert.equal(payload.max_tokens, 1200);
});

test("Cohere adapter preserves redacted status, authentication, model, cancellation, and reachability failures", async () => {
  const { createCohereProviderAdapter } = await moduleAt("src/ai/providers/cohere-provider-adapter.js");
  const runtime = createRuntime([
    failed(404, { message: "model missing cohere-secret" }),
    failed(401, { message: "credential cohere-secret" }),
    failed(429, { message: "quota cohere-secret" }),
    new Error("The AI request was canceled."),
    new Error("socket failed")
  ]);
  const provider = createCohereProviderAdapter(runtime);

  await assert.rejects(
    provider.translateSegment({ apiKey: "cohere-key", model: "missing" }, { text: "Hello" }),
    /Model missing was not found by Cohere/
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "cohere-key" }, { text: "Hello" }),
    /Cohere rejected the request\. Add or check the Cohere API key\./
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "cohere-key" }, { text: "Hello" }),
    (error) => error.message === "quota [redacted]"
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "cohere-key" }, { text: "Hello" }),
    /The AI request was canceled\./
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "cohere-key", baseUrl: "https://cohere.example" }, { text: "Hello" }),
    /Cohere is not reachable at https:\/\/cohere\.example\./
  );
});
