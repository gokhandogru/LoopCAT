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
    ANTHROPIC_DEFAULT_BASE_URL: "https://api.anthropic.com/v1",
    ANTHROPIC_DEFAULT_MODEL: "claude-sonnet-4-6",
    ANTHROPIC_VERSION: "2023-06-01",
    anthropicApiUrl(baseUrl, endpoint) {
      return `${this.normalizeAnthropicBaseUrl(baseUrl)}/${String(endpoint || "").replace(/^\/+/, "")}`;
    },
    anthropicAuthHeaders(config, extra = {}) {
      return { ...extra, "anthropic-version": this.ANTHROPIC_VERSION, "x-api-key": config.apiKey };
    },
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
        baseUrl: config.baseUrl || "https://api.anthropic.com/v1",
        model: config.model || "claude-sonnet-4-6",
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
    normalizeAnthropicBaseUrl(value) {
      const baseUrl = String(value || "https://api.anthropic.com/v1").replace(/\/+$/, "");
      return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    },
    promptTextOrThrow(request) {
      const prompt = String(request.prompt || "").trim();
      if (!prompt) throw new Error("The AI command has no prompt.");
      return prompt;
    },
    redactSensitiveText(value) {
      return String(value).replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]");
    },
    requestDurationMs() {
      return 20;
    }
  };
}

test("Anthropic adapter preserves identity, model mapping, versioned header auth, and compatibility export", async () => {
  const { createAnthropicProviderAdapter, installAnthropicProviderAdapter } = await moduleAt(
    "src/ai/providers/anthropic-provider-adapter.js"
  );
  const modelResponse = {
    data: [
      { id: "claude-sonnet-4-6", created_at: "2026-02-19T00:00:00Z" },
      { name: "claude-haiku", createdAt: "2026-01-01T00:00:00Z" },
      { id: "" }
    ]
  };
  const runtime = createRuntime([ok(modelResponse), ok(modelResponse)]);
  const provider = createAnthropicProviderAdapter(runtime);

  assert.equal(provider.id, "anthropic");
  assert.equal(provider.name, "Anthropic Claude");
  assert.equal(provider.defaultBaseUrl, "https://api.anthropic.com/v1");
  assert.equal(provider.defaultModel, "claude-sonnet-4-6");
  await assert.rejects(provider.listModels(), /Add an Anthropic API key/);

  const connection = await provider.testConnection({ apiKey: "sk-ant-test", baseUrl: "https://api.anthropic.com" });
  const listed = await provider.listModels({ apiKey: "sk-ant-test", baseUrl: "https://api.anthropic.com" });
  assert.equal(connection.modelCount, 3);
  assert.deepEqual(listed.models, [
    { name: "claude-sonnet-4-6", size: 0, modifiedAt: "2026-02-19T00:00:00Z" },
    { name: "claude-haiku", size: 0, modifiedAt: "2026-01-01T00:00:00Z" }
  ]);
  assert.equal(runtime.calls[0].url, "https://api.anthropic.com/v1/models");
  assert.equal(runtime.calls[0].options.headers["x-api-key"], "sk-ant-test");
  assert.equal(runtime.calls[0].options.headers["anthropic-version"], "2023-06-01");

  const registered = [];
  const ai = {
    providerAdapterRuntime: createRuntime(),
    aiProviderRegistry: { register: (item) => registered.push(item) }
  };
  const installed = installAnthropicProviderAdapter(ai);
  assert.equal(registered[0], installed);
  assert.equal(ai.AnthropicProvider, installed);
});

test("Anthropic adapter preserves Messages translation payload, abort, content parsing, provenance, and token metadata", async () => {
  const { createAnthropicProviderAdapter } = await moduleAt("src/ai/providers/anthropic-provider-adapter.js");
  const runtime = createRuntime([
    ok({
      content: [{ type: "tool_use", text: "ignored" }, "Translation: ", { type: "text", text: "Merhaba" }],
      usage: { input_tokens: 8, output_tokens: 2 }
    })
  ]);
  const provider = createAnthropicProviderAdapter(runtime);
  const signal = { aborted: false };
  const result = await provider.translateSegment(
    { apiKey: "sk-ant-test", model: "claude-sonnet-4-6" },
    { text: "Hello", sourceCode: "en", targetCode: "tr", signal }
  );

  assert.equal(result.translatedText, "Merhaba");
  assert.equal(result.provider, "Anthropic Claude");
  assert.equal(result.providerId, "anthropic");
  assert.deepEqual(result.metadata, { inputTokens: 8, outputTokens: 2, totalTokens: 10 });
  const call = runtime.calls[0];
  assert.equal(call.url, "https://api.anthropic.com/v1/messages");
  assert.equal(call.config.signal, signal);
  assert.equal(call.options.headers["x-api-key"], "sk-ant-test");
  assert.equal(call.options.headers["anthropic-version"], "2023-06-01");
  assert.deepEqual(JSON.parse(call.options.body), {
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system:
      "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment.",
    messages: [{ role: "user", content: "Translate Hello from en to tr" }]
  });
});

test("Anthropic adapter preserves generic commands, response fallbacks, and usage metadata", async () => {
  const { createAnthropicProviderAdapter, extractAnthropicResponseText } = await moduleAt(
    "src/ai/providers/anthropic-provider-adapter.js"
  );
  assert.equal(extractAnthropicResponseText({ output_text: "output" }), "output");
  assert.equal(extractAnthropicResponseText({ text: "text" }), "text");

  const runtime = createRuntime([
    ok({ content: [{ type: "text", text: " QA note " }], usage: { input_tokens: 5, output_tokens: 3 } })
  ]);
  const provider = createAnthropicProviderAdapter(runtime);
  const result = await provider.completePrompt(
    { apiKey: "sk-ant-test", model: "claude-sonnet-4-6" },
    { prompt: "Review", system: "Review system" }
  );

  assert.equal(result.text, "QA note");
  assert.equal(result.providerId, "anthropic");
  assert.deepEqual(result.metadata, { inputTokens: 5, outputTokens: 3, totalTokens: 8 });
  const payload = JSON.parse(runtime.calls[0].options.body);
  assert.equal(payload.system, "Review system");
  assert.equal(payload.max_tokens, 1200);
  assert.deepEqual(payload.messages, [{ role: "user", content: "Review" }]);
});

test("Anthropic adapter preserves redacted status, authentication, model, cancellation, and reachability failures", async () => {
  const { createAnthropicProviderAdapter } = await moduleAt("src/ai/providers/anthropic-provider-adapter.js");
  const runtime = createRuntime([
    failed(404, { error: { message: "model missing sk-ant-secret" } }),
    failed(401, { error: { message: "credential sk-ant-secret" } }),
    failed(429, { error: { message: "quota sk-ant-secret" } }),
    new Error("The AI request was canceled."),
    new Error("socket failed")
  ]);
  const provider = createAnthropicProviderAdapter(runtime);

  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-ant-test", model: "missing" }, { text: "Hello" }),
    /Model missing was not found by Anthropic/
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-ant-test" }, { text: "Hello" }),
    /Anthropic rejected the request\. Add or check the Anthropic API key\./
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-ant-test" }, { text: "Hello" }),
    (error) => error.message === "quota [redacted]"
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-ant-test" }, { text: "Hello" }),
    /The AI request was canceled\./
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-ant-test", baseUrl: "https://anthropic.example/v1" }, { text: "Hello" }),
    /Anthropic is not reachable at https:\/\/anthropic\.example\/v1\./
  );
});
