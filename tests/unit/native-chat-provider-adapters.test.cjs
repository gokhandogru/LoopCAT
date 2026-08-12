const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const PROVIDERS = Object.freeze([
  {
    id: "deepseek",
    exportName: "DeepSeekProvider",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro"
  },
  {
    id: "mistral",
    exportName: "MistralProvider",
    name: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-large-latest"
  }
]);

function clean(endpoint) {
  return String(endpoint || "").replace(/^\/+/, "");
}

function ok(data) {
  return { response: { ok: true, status: 200 }, data };
}

function failed(status, data) {
  return { response: { ok: false, status }, data };
}

function createRuntime(results = []) {
  const calls = [];
  const runtime = {
    calls,
    DEEPSEEK_DEFAULT_BASE_URL: PROVIDERS[0].baseUrl,
    DEEPSEEK_DEFAULT_MODEL: PROVIDERS[0].model,
    MISTRAL_DEFAULT_BASE_URL: PROVIDERS[1].baseUrl,
    MISTRAL_DEFAULT_MODEL: PROVIDERS[1].model,
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

  runtime.normalizeDeepSeekBaseUrl = (value) =>
    String(value || PROVIDERS[0].baseUrl)
      .replace(/\/+$/, "")
      .replace(/\/v1$/, "");
  runtime.normalizeMistralBaseUrl = (value) => {
    const baseUrl = String(value || PROVIDERS[1].baseUrl).replace(/\/+$/, "");
    return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
  };
  runtime.deepSeekApiUrl = (baseUrl, endpoint) => `${runtime.normalizeDeepSeekBaseUrl(baseUrl)}/${clean(endpoint)}`;
  runtime.mistralApiUrl = (baseUrl, endpoint) => `${runtime.normalizeMistralBaseUrl(baseUrl)}/${clean(endpoint)}`;
  return runtime;
}

test("native chat adapters preserve identity, defaults, compatibility exports, and family order", async () => {
  const { createNativeChatProviderAdapters, installNativeChatProviderAdapters } = await moduleAt(
    "src/ai/providers/native-chat-provider-adapters.js"
  );
  const runtime = createRuntime();
  const created = createNativeChatProviderAdapters(runtime).map(({ provider }) => provider);
  assert.deepEqual(
    created.map(({ id, name, defaultBaseUrl, defaultModel }) => ({ id, name, defaultBaseUrl, defaultModel })),
    PROVIDERS.map(({ id, name, baseUrl, model }) => ({ id, name, defaultBaseUrl: baseUrl, defaultModel: model }))
  );

  const registered = [];
  const ai = {
    providerAdapterRuntime: runtime,
    aiProviderRegistry: { register: (provider) => registered.push(provider) }
  };
  const installed = installNativeChatProviderAdapters(ai);
  assert.deepEqual(
    installed.map(({ id }) => id),
    PROVIDERS.map(({ id }) => id)
  );
  assert.deepEqual(registered, installed);
  for (const provider of PROVIDERS) assert.equal(ai[provider.exportName].id, provider.id);
});

test("native chat adapters preserve DeepSeek and Mistral model metadata rules", async () => {
  const { createNativeChatProviderAdapters } = await moduleAt("src/ai/providers/native-chat-provider-adapters.js");
  const runtime = createRuntime([
    ok({ data: [{ id: "deepseek-model", created: 1, size: 999 }] }),
    ok({ data: [{ name: "mistral-model", created: 2, created_at: "created", updated_at: "updated", size: 32 }] })
  ]);
  const providers = createNativeChatProviderAdapters(runtime).map(({ provider }) => provider);
  const models = [];
  for (const provider of providers) models.push((await provider.listModels({ apiKey: "sk-test" })).models[0]);

  assert.deepEqual(models, [
    { name: "deepseek-model", size: 0, modifiedAt: "1970-01-01T00:00:01.000Z" },
    { name: "mistral-model", size: 32, modifiedAt: "updated" }
  ]);
  assert.deepEqual(
    runtime.calls.map(({ url }) => url),
    ["https://api.deepseek.com/models", "https://api.mistral.ai/v1/models"]
  );
  assert(runtime.calls.every(({ options }) => options.headers.Authorization === "Bearer sk-test"));
});

test("native chat adapters preserve multipart parsing, payloads, aborts, provenance, and token metadata", async () => {
  const { createNativeChatProviderAdapters } = await moduleAt("src/ai/providers/native-chat-provider-adapters.js");
  const runtime = createRuntime([
    ok({
      choices: [{ message: { content: [" Deep", { text: "Seek target " }] } }],
      usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 }
    }),
    ok({ choices: [{ message: { content: "DeepSeek command" } }], usage: { total_tokens: 3 } }),
    ok({
      choices: [
        {
          message: {
            content: ["Mistral ", { type: "tool", text: "ignored" }, { type: "text", text: "target" }]
          }
        }
      ],
      usage: { prompt_tokens: 6, completion_tokens: 4, total_tokens: 10 }
    }),
    ok({ choices: [{ message: { content: "Mistral command" } }], usage: { total_tokens: 4 } })
  ]);
  const providers = createNativeChatProviderAdapters(runtime).map(({ provider }) => provider);
  const signal = { aborted: false };

  for (const provider of providers) {
    const translated = await provider.translateSegment(
      { apiKey: "sk-test", model: `${provider.id}-model` },
      { text: "Hello", sourceCode: "en", targetCode: "tr", signal }
    );
    assert.equal(translated.translatedText, provider.id === "deepseek" ? "DeepSeek target" : "Mistral target");
    assert.equal(translated.providerId, provider.id);
    assert.equal(translated.provider, provider.name);
    assert.equal(translated.metadata.totalTokens, provider.id === "deepseek" ? 9 : 10);
    const translationCall = runtime.calls.at(-1);
    assert.equal(translationCall.url, `${provider.defaultBaseUrl}/chat/completions`);
    assert.equal(translationCall.config.signal, signal);
    const translationPayload = JSON.parse(translationCall.options.body);
    assert.equal(translationPayload.model, `${provider.id}-model`);
    assert.equal(translationPayload.stream, false);
    assert.equal(translationPayload.temperature, 0.1);
    assert.equal(translationPayload.max_tokens, 1200);
    assert.equal(translationPayload.messages[1].content, "Translate Hello to tr");

    const completed = await provider.completePrompt(
      { apiKey: "sk-test", model: `${provider.id}-model` },
      { prompt: "Review", system: "Review system", signal }
    );
    assert.equal(completed.text, `${provider.name === "DeepSeek" ? "DeepSeek" : "Mistral"} command`);
    assert.equal(completed.providerId, provider.id);
    const commandCall = runtime.calls.at(-1);
    assert.equal(commandCall.config.signal, signal);
    assert.equal(JSON.parse(commandCall.options.body).messages[0].content, "Review system");
  }
});

test("native chat adapters preserve auth, redacted model, cancellation, and reachability failures", async () => {
  const { createNativeChatProviderAdapters } = await moduleAt("src/ai/providers/native-chat-provider-adapters.js");
  const runtime = createRuntime([
    failed(404, { error: { message: "model missing sk-secret" } }),
    failed(401, { error: { message: "credential sk-secret" } }),
    new Error("The AI request was canceled."),
    new Error("socket failed")
  ]);
  const providers = Object.fromEntries(
    createNativeChatProviderAdapters(runtime).map(({ provider }) => [provider.id, provider])
  );

  await assert.rejects(
    providers.deepseek.translateSegment({ apiKey: "sk-test", model: "missing" }, { text: "Hello" }),
    /Model missing was not found by DeepSeek/
  );
  await assert.rejects(
    providers.mistral.translateSegment({ apiKey: "sk-test" }, { text: "Hello" }),
    /Mistral rejected the request\. Add or check the Mistral API key\./
  );
  await assert.rejects(
    providers.deepseek.translateSegment({ apiKey: "sk-test" }, { text: "Hello" }),
    /The AI request was canceled\./
  );
  await assert.rejects(
    providers.mistral.translateSegment(
      { apiKey: "sk-test", baseUrl: "https:\/\/mistral.example\/v1" },
      { text: "Hello" }
    ),
    /Mistral is not reachable at https:\/\/mistral\.example\/v1\./
  );
  await assert.rejects(providers.deepseek.testConnection(), /Add a DeepSeek API key/);
});
