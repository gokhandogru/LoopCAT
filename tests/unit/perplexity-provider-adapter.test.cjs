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
    PERPLEXITY_DEFAULT_BASE_URL: "https://api.perplexity.ai/v1",
    PERPLEXITY_DEFAULT_MODEL: "sonar-pro",
    bearerAuthHeaders(config, extra = {}) {
      return { ...extra, Authorization: `Bearer ${config.apiKey}` };
    },
    buildTranslateGemmaPrompt(request) {
      return `Translate ${request.text} to ${request.targetCode}`;
    },
    cleanModelTranslationOutput(value) {
      return String(value)
        .replace(/^Translation:\s*/i, "")
        .trim();
    },
    defaultLocalAiSettings(config) {
      return {
        ...config,
        baseUrl: config.baseUrl || "https://api.perplexity.ai/v1",
        model: config.model || "sonar-pro",
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
    normalizePerplexityBaseUrl(value) {
      const baseUrl = String(value || "https://api.perplexity.ai/v1").replace(/\/+$/, "");
      return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    },
    perplexityApiUrl(baseUrl, endpoint) {
      return `${this.normalizePerplexityBaseUrl(baseUrl)}/${String(endpoint || "").replace(/^\/+/, "")}`;
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
      return 20;
    }
  };
}

test("Perplexity adapter preserves identity, compatibility export, auth, and synthesized Sonar models", async () => {
  const { createPerplexityProviderAdapter, installPerplexityProviderAdapter } = await moduleAt(
    "src/ai/providers/perplexity-provider-adapter.js"
  );
  const runtime = createRuntime([
    ok({
      models: [{ id: "sonar-pro", created: 1, size: 32 }, { name: "custom-sonar", size: 64 }, { id: "" }]
    })
  ]);
  const provider = createPerplexityProviderAdapter(runtime);

  assert.equal(provider.id, "perplexity");
  assert.equal(provider.name, "Perplexity Sonar");
  assert.equal(provider.defaultBaseUrl, "https://api.perplexity.ai/v1");
  assert.equal(provider.defaultModel, "sonar-pro");
  await assert.rejects(provider.listModels(), /Add a Perplexity API key/);

  const listed = await provider.listModels({ apiKey: "sk-test", baseUrl: "https://api.perplexity.ai" });
  assert.deepEqual(listed.models, [
    { name: "sonar-pro", size: 32, modifiedAt: "1970-01-01T00:00:01.000Z" },
    { name: "custom-sonar", size: 64, modifiedAt: "" },
    { name: "sonar", size: 0, modifiedAt: "" },
    { name: "sonar-deep-research", size: 0, modifiedAt: "" },
    { name: "sonar-reasoning-pro", size: 0, modifiedAt: "" }
  ]);
  assert.equal(runtime.calls[0].url, "https://api.perplexity.ai/v1/models");
  assert.equal(runtime.calls[0].options.headers.Authorization, "Bearer sk-test");

  const registered = [];
  const ai = {
    providerAdapterRuntime: createRuntime(),
    aiProviderRegistry: { register: (item) => registered.push(item) }
  };
  const installed = installPerplexityProviderAdapter(ai);
  assert.equal(registered[0], installed);
  assert.equal(ai.PerplexityProvider, installed);
});

test("Perplexity adapter preserves Sonar no-search translation payload, abort, parsing, provenance, and citations", async () => {
  const { createPerplexityProviderAdapter } = await moduleAt("src/ai/providers/perplexity-provider-adapter.js");
  const runtime = createRuntime([
    ok({
      choices: [{ message: { content: ["Translation: ", { text: "Merhaba" }] } }],
      usage: { prompt_tokens: 6, completion_tokens: 2, total_tokens: 8 },
      citations: ["one", "two"]
    })
  ]);
  const provider = createPerplexityProviderAdapter(runtime);
  const signal = { aborted: false };
  const result = await provider.translateSegment(
    { apiKey: "sk-test", model: "sonar-pro" },
    { text: "Hello", sourceCode: "en", targetCode: "tr", signal }
  );

  assert.equal(result.translatedText, "Merhaba");
  assert.equal(result.provider, "Perplexity Sonar");
  assert.equal(result.providerId, "perplexity");
  assert.deepEqual(result.metadata, {
    promptTokens: 6,
    completionTokens: 2,
    totalTokens: 8,
    citationCount: 2
  });
  const call = runtime.calls[0];
  assert.equal(call.url, "https://api.perplexity.ai/v1/sonar");
  assert.equal(call.config.signal, signal);
  assert.deepEqual(JSON.parse(call.options.body), {
    model: "sonar-pro",
    messages: [
      {
        role: "system",
        content:
          "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment. Do not browse or cite sources."
      },
      { role: "user", content: "Translate Hello to tr" }
    ],
    stream: false,
    temperature: 0.1,
    max_tokens: 1200,
    disable_search: true,
    return_images: false,
    return_related_questions: false
  });
});

test("Perplexity adapter preserves no-search generic commands and citation metadata", async () => {
  const { createPerplexityProviderAdapter } = await moduleAt("src/ai/providers/perplexity-provider-adapter.js");
  const runtime = createRuntime([ok({ output_text: " QA note ", usage: { total_tokens: 5 }, citations: ["one"] })]);
  const provider = createPerplexityProviderAdapter(runtime);
  const result = await provider.completePrompt(
    { apiKey: "sk-test", model: "sonar-pro" },
    { prompt: "Review", system: "Review system" }
  );

  assert.equal(result.text, "QA note");
  assert.equal(result.providerId, "perplexity");
  assert.equal(result.metadata.citationCount, 1);
  const payload = JSON.parse(runtime.calls[0].options.body);
  assert.equal(runtime.calls[0].url, "https://api.perplexity.ai/v1/sonar");
  assert.equal(payload.messages[0].content, "Review system");
  assert.equal(payload.disable_search, true);
  assert.equal(payload.return_images, false);
  assert.equal(payload.return_related_questions, false);
});

test("Perplexity adapter preserves redacted model, authentication, cancellation, and reachability failures", async () => {
  const { createPerplexityProviderAdapter } = await moduleAt("src/ai/providers/perplexity-provider-adapter.js");
  const runtime = createRuntime([
    failed(404, { error: { message: "model missing sk-secret" } }),
    failed(401, { error: { message: "credential sk-secret" } }),
    new Error("The AI request was canceled."),
    new Error("socket failed")
  ]);
  const provider = createPerplexityProviderAdapter(runtime);

  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-test", model: "missing" }, { text: "Hello" }),
    /Model missing was not found by Perplexity/
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-test" }, { text: "Hello" }),
    /Perplexity rejected the request\. Add or check the Perplexity API key\./
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-test" }, { text: "Hello" }),
    /The AI request was canceled\./
  );
  await assert.rejects(
    provider.translateSegment({ apiKey: "sk-test", baseUrl: "https:\/\/perplexity.example\/v1" }, { text: "Hello" }),
    /Perplexity is not reachable at https:\/\/perplexity\.example\/v1\./
  );
});
