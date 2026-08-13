const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const PROVIDERS = Object.freeze([
  {
    id: "together",
    exportName: "TogetherProvider",
    name: "Together AI",
    baseUrl: "https://api.together.ai/v1",
    model: "MiniMaxAI/MiniMax-M3"
  },
  {
    id: "openrouter",
    exportName: "OpenRouterProvider",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "~openai/gpt-latest"
  },
  {
    id: "huggingface",
    exportName: "HuggingFaceProvider",
    name: "Hugging Face Inference Providers",
    baseUrl: "https://router.huggingface.co/v1",
    model: "openai/gpt-oss-120b:cerebras"
  },
  {
    id: "deepinfra",
    exportName: "DeepInfraProvider",
    name: "DeepInfra",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    model: "meta-llama/Meta-Llama-3.1-70B-Instruct"
  },
  {
    id: "fireworks",
    exportName: "FireworksProvider",
    name: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    model: "accounts/fireworks/models/llama-v3p1-8b-instruct"
  }
]);

function createRuntime(results = []) {
  const calls = [];
  const runtime = {
    calls,
    TOGETHER_DEFAULT_BASE_URL: PROVIDERS[0].baseUrl,
    TOGETHER_DEFAULT_MODEL: PROVIDERS[0].model,
    OPENROUTER_DEFAULT_BASE_URL: PROVIDERS[1].baseUrl,
    OPENROUTER_DEFAULT_MODEL: PROVIDERS[1].model,
    HUGGINGFACE_DEFAULT_BASE_URL: PROVIDERS[2].baseUrl,
    HUGGINGFACE_DEFAULT_MODEL: PROVIDERS[2].model,
    DEEPINFRA_DEFAULT_BASE_URL: PROVIDERS[3].baseUrl,
    DEEPINFRA_DEFAULT_MODEL: PROVIDERS[3].model,
    FIREWORKS_DEFAULT_BASE_URL: PROVIDERS[4].baseUrl,
    FIREWORKS_DEFAULT_MODEL: PROVIDERS[4].model,
    bearerAuthHeaders(config, extra = {}) {
      return { Authorization: `Bearer ${config.apiKey}`, ...extra };
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
      const provider = PROVIDERS.find(({ id }) => id === config.providerId);
      return {
        ...config,
        baseUrl: config.baseUrl || provider?.baseUrl || "",
        model: config.model || provider?.model || "",
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

  const normalize = (fallback) => (value) => {
    const raw = String(value || fallback).replace(/\/+$/, "");
    return raw === new URL(fallback).origin ? fallback : raw;
  };
  runtime.normalizeTogetherBaseUrl = normalize(PROVIDERS[0].baseUrl);
  runtime.normalizeOpenRouterBaseUrl = normalize(PROVIDERS[1].baseUrl);
  runtime.normalizeHuggingFaceBaseUrl = normalize(PROVIDERS[2].baseUrl);
  runtime.normalizeDeepInfraBaseUrl = normalize(PROVIDERS[3].baseUrl);
  runtime.normalizeFireworksBaseUrl = normalize(PROVIDERS[4].baseUrl);
  runtime.togetherApiUrl = (baseUrl, endpoint) => `${runtime.normalizeTogetherBaseUrl(baseUrl)}/${clean(endpoint)}`;
  runtime.openRouterApiUrl = (baseUrl, endpoint) => `${runtime.normalizeOpenRouterBaseUrl(baseUrl)}/${clean(endpoint)}`;
  runtime.huggingFaceApiUrl = (baseUrl, endpoint) =>
    `${runtime.normalizeHuggingFaceBaseUrl(baseUrl)}/${clean(endpoint)}`;
  runtime.deepInfraApiUrl = (baseUrl, endpoint) => `${runtime.normalizeDeepInfraBaseUrl(baseUrl)}/${clean(endpoint)}`;
  runtime.fireworksApiUrl = (baseUrl, endpoint) => `${runtime.normalizeFireworksBaseUrl(baseUrl)}/${clean(endpoint)}`;
  return runtime;
}

function clean(endpoint) {
  return String(endpoint || "").replace(/^\/+/, "");
}

function ok(data) {
  return { response: { ok: true, status: 200 }, data };
}

function failed(status, data) {
  return { response: { ok: false, status }, data };
}

test("hosted adapters preserve identity, defaults, compatibility exports, and registry order", async () => {
  const { createHostedProviderAdapters, installHostedProviderAdapters } = await moduleAt(
    "src/ai/providers/hosted-provider-adapters.js"
  );
  const runtime = createRuntime();
  const created = createHostedProviderAdapters(runtime).map(({ provider }) => provider);
  assert.deepEqual(
    created.map(({ id, name, defaultBaseUrl, defaultModel }) => ({ id, name, defaultBaseUrl, defaultModel })),
    PROVIDERS.map(({ id, name, baseUrl, model }) => ({ id, name, defaultBaseUrl: baseUrl, defaultModel: model }))
  );

  const registered = [];
  const ai = {
    providerAdapterRuntime: runtime,
    aiProviderRegistry: { register: (provider) => registered.push(provider) }
  };
  const installed = installHostedProviderAdapters(ai);
  assert.deepEqual(
    installed.map(({ id }) => id),
    PROVIDERS.map(({ id }) => id)
  );
  assert.deepEqual(registered, installed);
  for (const provider of PROVIDERS) assert.equal(ai[provider.exportName].id, provider.id);
});

test("hosted adapters preserve provider-specific model-list shapes and mappings", async () => {
  const { createHostedProviderAdapters } = await moduleAt("src/ai/providers/hosted-provider-adapters.js");
  const runtime = createRuntime([
    ok([{ id: "together-model", created_at: "2026-01-01", size: 4 }]),
    ok({ data: [{ id: "openrouter-model", context_length: 131072, updatedAt: "2026-02-02" }] }),
    ok([{ name: "huggingface-model", created_at: "2026-03-03", size: 8 }]),
    ok({ data: [{ id: "deepinfra-model", created: 1, size: 16 }] }),
    ok({ data: [{ id: "fireworks-model", updated_at: "2026-04-04", size: 32 }] })
  ]);
  const providers = createHostedProviderAdapters(runtime).map(({ provider }) => provider);
  const models = [];
  for (const provider of providers) models.push((await provider.listModels({ apiKey: "sk-test" })).models[0]);

  assert.deepEqual(models, [
    { name: "together-model", size: 4, modifiedAt: "2026-01-01" },
    { name: "openrouter-model", size: 131072, modifiedAt: "2026-02-02" },
    { name: "huggingface-model", size: 8, modifiedAt: "2026-03-03" },
    { name: "deepinfra-model", size: 16, modifiedAt: "1970-01-01T00:00:01.000Z" },
    { name: "fireworks-model", size: 32, modifiedAt: "2026-04-04" }
  ]);
  assert.deepEqual(
    runtime.calls.map(({ url }) => url),
    PROVIDERS.map(({ baseUrl }) => `${baseUrl}/models`)
  );
  assert(
    runtime.calls.every(({ options }) => options.method === "GET" && options.headers.Authorization === "Bearer sk-test")
  );
});

test("hosted adapters preserve translation and generic-command payloads, aborts, normalization, and provenance", async () => {
  const { createHostedProviderAdapters } = await moduleAt("src/ai/providers/hosted-provider-adapters.js");
  const results = [];
  for (const provider of PROVIDERS) {
    const response =
      provider.id === "huggingface"
        ? { generated_text: `Translation: ${provider.id} translated`, usage: { total_tokens: 9 } }
        : {
            choices: [{ message: { content: ["Translation: ", { text: `${provider.id} translated` }] } }],
            usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 }
          };
    results.push(
      ok(response),
      ok({ choices: [{ message: { content: `${provider.id} command` } }], usage: { total_tokens: 3 } })
    );
  }
  const runtime = createRuntime(results);
  const providers = createHostedProviderAdapters(runtime).map(({ provider }) => provider);
  const signal = { aborted: false };

  for (const provider of providers) {
    const translated = await provider.translateSegment(
      { apiKey: "sk-test", model: `${provider.id}-model` },
      { text: "Hello", sourceCode: "en", targetCode: "tr", signal }
    );
    assert.equal(translated.translatedText, `${provider.id} translated`);
    assert.equal(translated.providerId, provider.id);
    assert.equal(translated.provider, provider.name);
    assert.equal(translated.metadata.totalTokens, 9);
    const translationCall = runtime.calls.at(-1);
    assert.equal(translationCall.url, `${provider.defaultBaseUrl}/chat/completions`);
    assert.equal(translationCall.config.signal, signal);
    const translationPayload = JSON.parse(translationCall.options.body);
    assert.equal(translationPayload.model, `${provider.id}-model`);
    assert.equal(translationPayload.max_tokens, 1200);
    assert.equal(translationPayload.messages[1].content, "Translate Hello to tr");

    const completed = await provider.completePrompt(
      { apiKey: "sk-test", model: `${provider.id}-model` },
      { prompt: "Review", system: "Review system", signal }
    );
    assert.equal(completed.text, `${provider.id} command`);
    assert.equal(completed.providerId, provider.id);
    const commandCall = runtime.calls.at(-1);
    assert.equal(commandCall.config.signal, signal);
    assert.equal(JSON.parse(commandCall.options.body).messages[0].content, "Review system");
  }
});

test("hosted adapters preserve special, redacted, cancellation, and reachability failures", async () => {
  const { createHostedProviderAdapters } = await moduleAt("src/ai/providers/hosted-provider-adapters.js");
  const runtime = createRuntime([
    failed(404, { error: { message: "model missing sk-secret" } }),
    failed(402, {}),
    failed(429, {}),
    failed(500, { error: { message: "provider error sk-secret" } }),
    new Error("The AI request was canceled."),
    new Error("socket failed")
  ]);
  const providers = Object.fromEntries(
    createHostedProviderAdapters(runtime).map(({ provider }) => [provider.id, provider])
  );

  await assert.rejects(
    providers.together.translateSegment({ apiKey: "sk-test", model: "missing" }, { text: "Hello" }),
    /Model missing was not found by Together AI/
  );
  await assert.rejects(
    providers.openrouter.translateSegment({ apiKey: "sk-test" }, { text: "Hello" }),
    /OpenRouter reported insufficient credits/
  );
  await assert.rejects(
    providers.huggingface.translateSegment({ apiKey: "sk-test" }, { text: "Hello" }),
    /Hugging Face rate-limited this request/
  );
  await assert.rejects(
    providers.deepinfra.translateSegment({ apiKey: "sk-test" }, { text: "Hello" }),
    (error) => error.message.includes("provider error [redacted]") && !error.message.includes("sk-secret")
  );
  await assert.rejects(
    providers.fireworks.translateSegment({ apiKey: "sk-test" }, { text: "Hello" }),
    /The AI request was canceled\./
  );
  await assert.rejects(
    providers.fireworks.translateSegment(
      { apiKey: "sk-test", baseUrl: "https://fireworks.example/v1" },
      { text: "Hello" }
    ),
    /Fireworks AI is not reachable at https:\/\/fireworks\.example\/v1\./
  );
});
