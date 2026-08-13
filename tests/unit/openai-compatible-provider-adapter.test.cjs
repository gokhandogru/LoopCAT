const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);
const ok = (data) => ({ response: { ok: true, status: 200 }, data });
const failed = (status, data) => ({ response: { ok: false, status }, data });

function createRuntime(results = []) {
  const calls = [];
  const allowedHosts = new Set(["localhost", "127.0.0.1", "api.deepseek.com"]);
  return {
    calls,
    DEFAULT_LOCAL_AI_MODEL: "translategemma",
    LM_STUDIO_DEFAULT_BASE_URL: "http://localhost:1234/v1",
    assertOpenAiCompatibleHostedAllowed(baseUrl) {
      if (!allowedHosts.has(new URL(baseUrl).hostname))
        throw new Error("This hosted OpenAI-compatible endpoint is not in LoopCAT's explicit provider allowlist.");
    },
    bearerAuthHeaders(config, extra = {}) {
      return config.apiKey ? { ...extra, Authorization: `Bearer ${config.apiKey}` } : { ...extra };
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
        baseUrl: config.baseUrl || "http://localhost:1234/v1",
        model: config.model || "translategemma",
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
      return { text: rawOutput.trim(), provider, providerId, model, prompt, metadata };
    },
    genericPromptSystem() {
      return "Generic system";
    },
    localAiProviderNeedsApiKey(_providerId, baseUrl) {
      return !["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname);
    },
    localAiStartedAt() {
      return 100;
    },
    normalizeOpenAiCompatibleBaseUrl(baseUrl) {
      const url = new URL(String(baseUrl || "http://localhost:1234/v1"));
      const path = url.pathname.replace(/\/+$/, "");
      if (url.hostname === "api.deepseek.com") url.pathname = path.replace(/\/v1$/, "");
      else url.pathname = path.endsWith("/v1") ? path : `${path}/v1`;
      return url.toString().replace(/\/$/, "");
    },
    openAiCompatibleApiUrl(baseUrl, endpoint) {
      return `${this.normalizeOpenAiCompatibleBaseUrl(baseUrl)}/${String(endpoint || "").replace(/^\/+/, "")}`;
    },
    promptTextOrThrow(request) {
      const prompt = String(request.prompt || "").trim();
      if (!prompt) throw new Error("The AI command has no prompt.");
      return prompt;
    },
    redactSensitiveText(value) {
      return String(value).replace(/compatible-secret/g, "[redacted]");
    },
    requestDurationMs() {
      return 20;
    }
  };
}

test("OpenAI-compatible adapter preserves local model discovery, timestamps, no-key operation, and compatibility export", async () => {
  const { createOpenAiCompatibleProviderAdapter, installOpenAiCompatibleProviderAdapter } = await moduleAt(
    "src/ai/providers/openai-compatible-provider-adapter.js"
  );
  const response = { data: [{ id: "local-qwen", size: 42, created: 1700000000 }, { name: "local-gemma" }] };
  const runtime = createRuntime([ok(response), ok(response)]);
  const provider = createOpenAiCompatibleProviderAdapter(runtime);
  const connection = await provider.testConnection({ baseUrl: "http://localhost:1234" });
  const listed = await provider.listModels({ baseUrl: "http://localhost:1234" });
  assert.equal(connection.modelCount, 2);
  assert.equal(runtime.calls[0].url, "http://localhost:1234/v1/models");
  assert.equal(runtime.calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(listed.models, [
    { name: "local-qwen", size: 42, modifiedAt: "2023-11-14T22:13:20.000Z" },
    { name: "local-gemma", size: 0, modifiedAt: "" }
  ]);

  const registered = [];
  const ai = {
    providerAdapterRuntime: createRuntime(),
    aiProviderRegistry: { register: (item) => registered.push(item) }
  };
  const installed = installOpenAiCompatibleProviderAdapter(ai);
  assert.equal(registered[0], installed);
  assert.equal(ai.OpenAICompatibleProvider, installed);
});

test("OpenAI-compatible adapter preserves local and allowlisted hosted chat payloads, bearer auth, abort, provenance, and usage", async () => {
  const { createOpenAiCompatibleProviderAdapter } = await moduleAt(
    "src/ai/providers/openai-compatible-provider-adapter.js"
  );
  const runtime = createRuntime([
    ok({
      choices: [{ message: { content: "Translation: Merhaba" } }],
      usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 }
    }),
    ok({
      choices: [{ message: { content: "QA note" } }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
    })
  ]);
  const provider = createOpenAiCompatibleProviderAdapter(runtime);
  const signal = { aborted: false };
  const translated = await provider.translateSegment(
    { baseUrl: "http://localhost:1234", model: "local-qwen" },
    { text: "Hello", sourceCode: "en", targetCode: "tr", signal }
  );
  const completed = await provider.completePrompt(
    { baseUrl: "https://api.deepseek.com/v1", apiKey: "hosted-key", model: "deepseek-v4" },
    { prompt: "Review", system: "QA system" }
  );
  assert.equal(translated.translatedText, "Merhaba");
  assert.equal(translated.providerId, "openai-compatible");
  assert.deepEqual(translated.metadata, { promptTokens: 8, completionTokens: 2, totalTokens: 10 });
  assert.equal(runtime.calls[0].config.signal, signal);
  assert.deepEqual(JSON.parse(runtime.calls[0].options.body), {
    model: "local-qwen",
    messages: [{ role: "user", content: "Translate Hello from en to tr" }],
    stream: false,
    temperature: 0.1
  });
  assert.equal(runtime.calls[1].url, "https://api.deepseek.com/chat/completions");
  assert.equal(runtime.calls[1].options.headers.Authorization, "Bearer hosted-key");
  assert.equal(completed.text, "QA note");
  assert.deepEqual(JSON.parse(runtime.calls[1].options.body).messages, [
    { role: "system", content: "QA system" },
    { role: "user", content: "Review" }
  ]);
});

test("OpenAI-compatible adapter blocks unapproved hosts before fetch and requires hosted credentials", async () => {
  const { createOpenAiCompatibleProviderAdapter } = await moduleAt(
    "src/ai/providers/openai-compatible-provider-adapter.js"
  );
  const runtime = createRuntime();
  const provider = createOpenAiCompatibleProviderAdapter(runtime);
  await assert.rejects(
    provider.translateSegment({ baseUrl: "https://example.com/v1", apiKey: "key" }, { text: "Hello" }),
    /explicit provider allowlist/
  );
  await assert.rejects(
    provider.translateSegment({ baseUrl: "https://api.deepseek.com/v1" }, { text: "Hello" }),
    /Add a provider API key before sending source text/
  );
  assert.equal(runtime.calls.length, 0);
});

test("OpenAI-compatible adapter preserves redacted status, model, cancellation, and reachability failures", async () => {
  const { createOpenAiCompatibleProviderAdapter } = await moduleAt(
    "src/ai/providers/openai-compatible-provider-adapter.js"
  );
  const runtime = createRuntime([
    failed(404, { error: { message: "model missing compatible-secret" } }),
    failed(401, { error: { message: "credential compatible-secret" } }),
    failed(429, { error: { message: "quota compatible-secret" } }),
    new Error("Local AI request canceled."),
    new Error("socket failed")
  ]);
  const provider = createOpenAiCompatibleProviderAdapter(runtime);
  await assert.rejects(
    provider.translateSegment({ model: "missing" }, { text: "Hello" }),
    /Model missing was not found/
  );
  await assert.rejects(provider.translateSegment({}, { text: "Hello" }), /rejected the request/);
  await assert.rejects(
    provider.translateSegment({}, { text: "Hello" }),
    (error) => error.message === "quota [redacted]"
  );
  await assert.rejects(provider.translateSegment({}, { text: "Hello" }), /Local AI request canceled/);
  await assert.rejects(
    provider.translateSegment({}, { text: "Hello" }),
    /not reachable at http:\/\/localhost:1234\/v1/
  );
});
