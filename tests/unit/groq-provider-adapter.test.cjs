const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createRuntime(results = []) {
  const calls = [];
  return {
    calls,
    GROQ_DEFAULT_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_DEFAULT_MODEL: "llama-3.1-8b-instant",
    bearerAuthHeaders(config, extra = {}) {
      return { Authorization: `Bearer ${config.apiKey}`, ...extra };
    },
    buildTranslateGemmaPrompt(request) {
      return `Translate ${request.text} to ${request.targetCode}`;
    },
    cleanModelTranslationOutput(value) {
      return String(value).trim();
    },
    defaultLocalAiSettings(config) {
      return {
        ...config,
        baseUrl: config.baseUrl || "https://api.groq.com/openai/v1",
        model: config.model || "llama-3.1-8b-instant",
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
      return next || { response: { ok: true, status: 200 }, data: {} };
    },
    genericPromptResult(provider, providerId, model, prompt, rawOutput, startedAt, metadata) {
      if (typeof rawOutput !== "string") throw new Error(`${provider} returned a malformed response.`);
      if (!rawOutput.trim()) throw new Error(`${provider} returned an empty response.`);
      return { text: rawOutput.trim(), rawOutput, provider, providerId, model, durationMs: 25, prompt, metadata };
    },
    genericPromptSystem() {
      return "Generic system";
    },
    groqApiUrl(baseUrl, endpoint) {
      return `${this.normalizeGroqBaseUrl(baseUrl)}/${String(endpoint).replace(/^\/+/, "")}`;
    },
    localAiStartedAt() {
      return 100;
    },
    normalizeGroqBaseUrl(baseUrl) {
      return String(baseUrl).replace(/\/+$/, "");
    },
    promptTextOrThrow(request) {
      const prompt = String(request.prompt || "").trim();
      if (!prompt) throw new Error("The AI command has no prompt.");
      return prompt;
    },
    redactSensitiveText(value) {
      return String(value).replace(/sk-[A-Za-z0-9-]+/g, "[redacted]");
    },
    requestDurationMs() {
      return 25;
    }
  };
}

test("Groq adapter preserves identity, authentication, model listing, and registry compatibility", async () => {
  const { createGroqProviderAdapter, installGroqProviderAdapter } = await moduleAt(
    "src/ai/providers/groq-provider-adapter.js"
  );
  const runtime = createRuntime([
    {
      response: { ok: true, status: 200 },
      data: { data: [{ id: "model-a", created: 1, size: 32 }, { name: "model-b" }, { id: "" }] }
    }
  ]);
  const provider = createGroqProviderAdapter(runtime);

  assert.equal(provider.id, "groq");
  assert.equal(provider.name, "Groq");
  assert.equal(provider.defaultBaseUrl, "https://api.groq.com/openai/v1");
  assert.equal(provider.defaultModel, "llama-3.1-8b-instant");
  await assert.rejects(provider.testConnection(), /Add a Groq API key/);

  const listed = await provider.listModels({ apiKey: "sk-test", baseUrl: "https://api.groq.com/openai/v1/" });
  assert.deepEqual(listed.models, [
    { name: "model-a", size: 32, modifiedAt: "1970-01-01T00:00:01.000Z" },
    { name: "model-b", size: 0, modifiedAt: "" }
  ]);
  assert.equal(runtime.calls[0].url, "https://api.groq.com/openai/v1/models");
  assert.deepEqual(runtime.calls[0].options, {
    method: "GET",
    headers: { Authorization: "Bearer sk-test" }
  });

  const registered = [];
  const ai = { providerAdapterRuntime: runtime, aiProviderRegistry: { register: (item) => registered.push(item) } };
  const installed = installGroqProviderAdapter(ai);
  assert.equal(registered[0], installed);
  assert.equal(ai.GroqProvider, installed);
});

test("Groq adapter preserves translation payload, cancellation signal, response normalization, and provenance", async () => {
  const { createGroqProviderAdapter } = await moduleAt("src/ai/providers/groq-provider-adapter.js");
  const runtime = createRuntime([
    {
      response: { ok: true, status: 200 },
      data: {
        choices: [{ message: { content: [" Mer", { text: "haba" }] } }],
        usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 }
      }
    }
  ]);
  const provider = createGroqProviderAdapter(runtime);
  const signal = { aborted: false };
  const result = await provider.translateSegment(
    { apiKey: "sk-test", model: "model-a" },
    { text: "Hello", sourceCode: "en", targetCode: "tr", signal }
  );

  assert.equal(result.translatedText, "Merhaba");
  assert.equal(result.rawOutput, " Merhaba");
  assert.equal(result.provider, "Groq");
  assert.equal(result.providerId, "groq");
  assert.equal(result.model, "model-a");
  assert.equal(result.durationMs, 25);
  assert.deepEqual(result.metadata, { promptTokens: 7, completionTokens: 2, totalTokens: 9 });
  assert.equal(runtime.calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(runtime.calls[0].config.signal, signal);
  const payload = JSON.parse(runtime.calls[0].options.body);
  assert.deepEqual(payload, {
    model: "model-a",
    messages: [
      {
        role: "system",
        content:
          "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment."
      },
      { role: "user", content: "Translate Hello to tr" }
    ],
    stream: false,
    temperature: 0.1,
    max_tokens: 1200
  });
});

test("Groq adapter preserves generic prompt behavior and provider-safe failures", async () => {
  const { createGroqProviderAdapter } = await moduleAt("src/ai/providers/groq-provider-adapter.js");
  const runtime = createRuntime([
    {
      response: { ok: true, status: 200 },
      data: { choices: [{ message: { content: "  Review result  " } }], usage: { total_tokens: 5 } }
    },
    {
      response: { ok: false, status: 404 },
      data: { error: { message: "model missing sk-secret" } }
    },
    new Error("The AI request was canceled."),
    new Error("socket failed")
  ]);
  const provider = createGroqProviderAdapter(runtime);

  const completed = await provider.completePrompt(
    { apiKey: "sk-test", model: "model-a" },
    { prompt: "Review this", system: "Review system" }
  );
  assert.equal(completed.text, "Review result");
  assert.equal(JSON.parse(runtime.calls[0].options.body).messages[0].content, "Review system");

  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-test", model: "missing" }, { text: "Hello" }),
    /Model missing was not found by Groq/
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-test" }, { text: "Hello" }),
    /The AI request was canceled\./
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-test", baseUrl: "https:\/\/groq.example\/v1" }, { text: "Hello" }),
    /Groq is not reachable at https:\/\/groq\.example\/v1\./
  );
});
