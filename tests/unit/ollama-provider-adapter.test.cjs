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
  return {
    calls,
    DEFAULT_LOCAL_AI_MODEL: "translategemma",
    OLLAMA_DEFAULT_BASE_URL: "http://localhost:11434",
    bearerAuthHeaders(config, extra = {}) {
      return config.apiKey ? { ...extra, Authorization: `Bearer ${config.apiKey}` } : { ...extra };
    },
    buildTranslateGemmaPrompt(request) {
      return `Translate ${request.text} from ${request.sourceCode} to ${request.targetCode}`;
    },
    cleanModelTranslationOutput(value) {
      return String(value).replace(/^Translation:\s*/i, "").trim();
    },
    defaultLocalAiSettings(config) {
      return {
        ...config,
        baseUrl: config.baseUrl || "http://localhost:11434",
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
    isOllamaCloudBaseUrl(baseUrl) {
      return new URL(String(baseUrl || "http://localhost:11434")).hostname === "ollama.com";
    },
    localAiProviderNeedsApiKey(providerId, baseUrl) {
      return providerId === "ollama" && this.isOllamaCloudBaseUrl(baseUrl);
    },
    localAiStartedAt() {
      return 100;
    },
    normalizeOllamaBaseUrl(baseUrl) {
      const value = String(baseUrl || "http://localhost:11434").replace(/\/+$/, "").replace(/\/api$/, "");
      return { rootBaseUrl: value, apiBaseUrl: `${value}/api` };
    },
    ollamaApiUrl(baseUrl, endpoint) {
      return `${this.normalizeOllamaBaseUrl(baseUrl).apiBaseUrl}/${String(endpoint || "").replace(/^\/?(?:api\/)?/, "")}`;
    },
    promptTextOrThrow(request) {
      const prompt = String(request.prompt || "").trim();
      if (!prompt) throw new Error("The AI command has no prompt.");
      return prompt;
    },
    redactSensitiveText(value) {
      return String(value).replace(/ollama-secret/g, "[redacted]");
    },
    requestDurationMs() {
      return 20;
    }
  };
}

test("Ollama adapter preserves local and cloud connection, model mapping, auth, and compatibility export", async () => {
  const { createOllamaProviderAdapter, installOllamaProviderAdapter } = await moduleAt(
    "src/ai/providers/ollama-provider-adapter.js"
  );
  const runtime = createRuntime([
    ok({ version: "0.12.0" }),
    ok({ models: [{ name: "translategemma", size: 42, modified_at: "today" }, { model: "qwen", modifiedAt: "now" }] })
  ]);
  const provider = createOllamaProviderAdapter(runtime);
  const local = await provider.testConnection({ baseUrl: "http://localhost:11434" });
  const models = await provider.listModels({ baseUrl: "https://ollama.com", apiKey: "cloud-key" });
  assert.equal(local.provider, "Ollama");
  assert.equal(local.version, "0.12.0");
  assert.equal(runtime.calls[0].url, "http://localhost:11434/api/version");
  assert.equal(runtime.calls[1].url, "https://ollama.com/api/tags");
  assert.equal(runtime.calls[1].options.headers.Authorization, "Bearer cloud-key");
  assert.deepEqual(models.models, [
    { name: "translategemma", size: 42, modifiedAt: "today" },
    { name: "qwen", size: 0, modifiedAt: "now" }
  ]);
  await assert.rejects(provider.listModels({ baseUrl: "https://ollama.com" }), /API key before refreshing/);

  const registered = [];
  const ai = { providerAdapterRuntime: createRuntime(), aiProviderRegistry: { register: (item) => registered.push(item) } };
  const installed = installOllamaProviderAdapter(ai);
  assert.equal(registered[0], installed);
  assert.equal(ai.OllamaProvider, installed);
});

test("Ollama adapter preserves local pull lifecycle and blocks cloud pulls", async () => {
  const { createOllamaProviderAdapter } = await moduleAt("src/ai/providers/ollama-provider-adapter.js");
  const runtime = createRuntime([ok({ status: "success" })]);
  const provider = createOllamaProviderAdapter(runtime);
  const progress = [];
  const result = await provider.pullModel({ baseUrl: "http://localhost:11434" }, "qwen", (event) => progress.push(event));
  assert.equal(result.model, "qwen");
  assert.deepEqual(progress, [{ status: "starting", model: "qwen" }, { status: "complete", model: "qwen" }]);
  assert.deepEqual(JSON.parse(runtime.calls[0].options.body), { name: "qwen", stream: false });
  await assert.rejects(
    provider.pullModel({ baseUrl: "https://ollama.com", apiKey: "cloud-key" }, "qwen"),
    /only available for local Ollama/
  );
});

test("Ollama adapter preserves translation and generic chat payloads, cancellation signal, provenance, and timing metadata", async () => {
  const { createOllamaProviderAdapter } = await moduleAt("src/ai/providers/ollama-provider-adapter.js");
  const runtime = createRuntime([
    ok({ message: { content: "Translation: Merhaba" }, total_duration: 12, load_duration: 3, prompt_eval_count: 7, eval_count: 4 }),
    ok({ message: { content: "QA note" }, total_duration: 9, prompt_eval_count: 5, eval_count: 2 })
  ]);
  const provider = createOllamaProviderAdapter(runtime);
  const signal = { aborted: false };
  const translated = await provider.translateSegment(
    { model: "translategemma" },
    { text: "Hello", sourceCode: "en", targetCode: "tr", signal }
  );
  const completed = await provider.completePrompt(
    { model: "translategemma" },
    { prompt: "Review", system: "QA system" }
  );
  assert.equal(translated.translatedText, "Merhaba");
  assert.equal(translated.providerId, "ollama");
  assert.deepEqual(translated.metadata, { totalDuration: 12, promptEvalCount: 7, evalCount: 4, loadDuration: 3 });
  assert.equal(runtime.calls[0].config.signal, signal);
  assert.deepEqual(JSON.parse(runtime.calls[0].options.body), {
    model: "translategemma",
    messages: [{ role: "user", content: "Translate Hello from en to tr" }],
    stream: false,
    options: { temperature: 0.1 }
  });
  assert.equal(completed.text, "QA note");
  assert.deepEqual(JSON.parse(runtime.calls[1].options.body).messages, [
    { role: "system", content: "QA system" },
    { role: "user", content: "Review" }
  ]);
});

test("Ollama adapter preserves cloud consent errors and redacted status, model, cancellation, and reachability failures", async () => {
  const { createOllamaProviderAdapter } = await moduleAt("src/ai/providers/ollama-provider-adapter.js");
  const runtime = createRuntime([
    failed(404, { error: "model missing ollama-secret" }),
    failed(401, { error: "credential ollama-secret" }),
    failed(429, { error: "quota ollama-secret" }),
    new Error("Local AI request canceled."),
    new Error("socket failed"),
    new Error("socket failed")
  ]);
  const provider = createOllamaProviderAdapter(runtime);
  await assert.rejects(provider.translateSegment({ baseUrl: "https://ollama.com" }, { text: "Hello" }), /API key before sending/);
  await assert.rejects(provider.translateSegment({ model: "missing" }, { text: "Hello" }), /Model missing is not installed/);
  await assert.rejects(provider.translateSegment({}, { text: "Hello" }), /Ollama rejected the request/);
  await assert.rejects(provider.translateSegment({}, { text: "Hello" }), (error) => error.message === "quota [redacted]");
  await assert.rejects(provider.translateSegment({}, { text: "Hello" }), /Local AI request canceled/);
  await assert.rejects(provider.testConnection({ baseUrl: "http://localhost:11434" }), /Ollama is not reachable at/);
  await assert.rejects(
    provider.testConnection({ baseUrl: "https://ollama.com", apiKey: "cloud-key" }),
    /Ollama Cloud is not reachable/
  );
});
