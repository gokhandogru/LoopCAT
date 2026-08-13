const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const PROVIDERS = Object.freeze([
  {
    id: "openai",
    exportName: "OpenAIProvider",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5"
  },
  {
    id: "xai",
    exportName: "XAIProvider",
    name: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.3"
  },
  {
    id: "azure-openai",
    exportName: "AzureOpenAIProvider",
    name: "Azure OpenAI",
    baseUrl: "https://loopcat.openai.azure.com/openai/v1",
    model: "gpt-4.1-nano"
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
    OPENAI_DEFAULT_BASE_URL: PROVIDERS[0].baseUrl,
    OPENAI_DEFAULT_MODEL: PROVIDERS[0].model,
    XAI_DEFAULT_BASE_URL: PROVIDERS[1].baseUrl,
    XAI_DEFAULT_MODEL: PROVIDERS[1].model,
    AZURE_OPENAI_DEFAULT_BASE_URL: PROVIDERS[2].baseUrl,
    AZURE_OPENAI_DEFAULT_MODEL: PROVIDERS[2].model,
    bearerAuthHeaders(config, extra = {}) {
      return { ...extra, Authorization: `Bearer ${config.apiKey}` };
    },
    azureOpenAiAuthHeaders(config, extra = {}) {
      return { ...extra, "api-key": config.apiKey };
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
      return String(value).replace(/(?:sk|key)-[A-Za-z0-9-]+/g, "[redacted]");
    },
    requestDurationMs() {
      return 20;
    }
  };

  const normalize = (fallback) => (value) => String(value || fallback).replace(/\/+$/, "");
  runtime.normalizeOpenAiBaseUrl = normalize(PROVIDERS[0].baseUrl);
  runtime.normalizeXAiBaseUrl = normalize(PROVIDERS[1].baseUrl);
  runtime.normalizeAzureOpenAiBaseUrl = normalize(PROVIDERS[2].baseUrl);
  runtime.openAiApiUrl = (baseUrl, endpoint) => `${runtime.normalizeOpenAiBaseUrl(baseUrl)}/${clean(endpoint)}`;
  runtime.xAiApiUrl = (baseUrl, endpoint) => `${runtime.normalizeXAiBaseUrl(baseUrl)}/${clean(endpoint)}`;
  runtime.azureOpenAiApiUrl = (baseUrl, endpoint) =>
    `${runtime.normalizeAzureOpenAiBaseUrl(baseUrl)}/${clean(endpoint)}`;
  return runtime;
}

test("native OpenAI adapters preserve identity, defaults, compatibility exports, and family order", async () => {
  const { createNativeOpenAiProviderAdapters, installNativeOpenAiProviderAdapters } = await moduleAt(
    "src/ai/providers/native-openai-provider-adapters.js"
  );
  const runtime = createRuntime();
  const created = createNativeOpenAiProviderAdapters(runtime).map(({ provider }) => provider);
  assert.deepEqual(
    created.map(({ id, name, defaultBaseUrl, defaultModel }) => ({ id, name, defaultBaseUrl, defaultModel })),
    PROVIDERS.map(({ id, name, baseUrl, model }) => ({ id, name, defaultBaseUrl: baseUrl, defaultModel: model }))
  );

  const registered = [];
  const ai = {
    providerAdapterRuntime: runtime,
    aiProviderRegistry: { register: (provider) => registered.push(provider) }
  };
  const installed = installNativeOpenAiProviderAdapters(ai);
  assert.deepEqual(
    installed.map(({ id }) => id),
    PROVIDERS.map(({ id }) => id)
  );
  assert.deepEqual(registered, installed);
  for (const provider of PROVIDERS) assert.equal(ai[provider.exportName].id, provider.id);
});

test("native OpenAI adapters preserve model mapping and provider-specific credential headers", async () => {
  const { createNativeOpenAiProviderAdapters } = await moduleAt("src/ai/providers/native-openai-provider-adapters.js");
  const runtime = createRuntime([
    ok({ data: [{ id: "openai-model", created: 1 }, { name: "ignored-without-id" }] }),
    ok({ data: [{ name: "xai-model", created: 2 }] }),
    ok({ data: [{ id: "azure-deployment", created: 3 }] })
  ]);
  const providers = createNativeOpenAiProviderAdapters(runtime).map(({ provider }) => provider);
  const models = [];
  for (const provider of providers) models.push((await provider.listModels({ apiKey: "key-test" })).models);

  assert.deepEqual(models, [
    [{ name: "openai-model", size: 0, modifiedAt: "1970-01-01T00:00:01.000Z" }],
    [{ name: "xai-model", size: 0, modifiedAt: "1970-01-01T00:00:02.000Z" }],
    [{ name: "azure-deployment", size: 0, modifiedAt: "1970-01-01T00:00:03.000Z" }]
  ]);
  assert.equal(runtime.calls[0].options.headers.Authorization, "Bearer key-test");
  assert.equal(runtime.calls[1].options.headers.Authorization, "Bearer key-test");
  assert.equal(runtime.calls[2].options.headers["api-key"], "key-test");
  assert.equal(runtime.calls[2].options.headers.Authorization, undefined);
});

test("native OpenAI adapters preserve Responses payloads, aborts, output parsing, provenance, and token metadata", async () => {
  const { createNativeOpenAiProviderAdapters } = await moduleAt("src/ai/providers/native-openai-provider-adapters.js");
  const results = [];
  for (const provider of PROVIDERS) {
    results.push(
      ok({
        output: [{ content: [{ type: "output_text", text: `Translation: ${provider.id} translated` }] }],
        usage: { input_tokens: 5, output_tokens: 4, total_tokens: 9 }
      }),
      ok({ output_text: `${provider.id} command`, usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } })
    );
  }
  const runtime = createRuntime(results);
  const providers = createNativeOpenAiProviderAdapters(runtime).map(({ provider }) => provider);
  const signal = { aborted: false };

  for (const provider of providers) {
    const translated = await provider.translateSegment(
      { apiKey: "key-test", model: `${provider.id}-model` },
      { text: "Hello", sourceCode: "en", targetCode: "tr", signal }
    );
    assert.equal(translated.translatedText, `${provider.id} translated`);
    assert.equal(translated.providerId, provider.id);
    assert.equal(translated.provider, provider.name);
    assert.deepEqual(translated.metadata, { inputTokens: 5, outputTokens: 4, totalTokens: 9 });
    const translationCall = runtime.calls.at(-1);
    assert.equal(translationCall.url, `${provider.defaultBaseUrl}/responses`);
    assert.equal(translationCall.config.signal, signal);
    const translationPayload = JSON.parse(translationCall.options.body);
    assert.deepEqual(translationPayload, {
      model: `${provider.id}-model`,
      store: false,
      instructions:
        "You are a professional translation assistant inside LoopCAT. Produce only the requested target-language translation for one CAT-tool segment.",
      input: "Translate Hello to tr",
      max_output_tokens: 1200
    });

    const completed = await provider.completePrompt(
      { apiKey: "key-test", model: `${provider.id}-model` },
      { prompt: "Review", system: "Review system", signal }
    );
    assert.equal(completed.text, `${provider.id} command`);
    assert.equal(completed.providerId, provider.id);
    const commandCall = runtime.calls.at(-1);
    assert.equal(commandCall.config.signal, signal);
    const commandPayload = JSON.parse(commandCall.options.body);
    assert.equal(commandPayload.store, false);
    assert.equal(commandPayload.instructions, "Review system");
    assert.equal(commandPayload.max_output_tokens, 1200);
  }
});

test("native OpenAI adapters preserve redacted status, auth, model/deployment, cancellation, and reachability failures", async () => {
  const { createNativeOpenAiProviderAdapters } = await moduleAt("src/ai/providers/native-openai-provider-adapters.js");
  const runtime = createRuntime([
    failed(500, { error: { message: "OpenAI error sk-secret" } }),
    failed(404, { error: { message: "model missing key-secret" } }),
    failed(404, { error: { message: "deployment missing key-secret" } }),
    new Error("The AI request was canceled."),
    new Error("socket failed"),
    new Error("socket failed")
  ]);
  const providers = Object.fromEntries(
    createNativeOpenAiProviderAdapters(runtime).map(({ provider }) => [provider.id, provider])
  );

  await assert.rejects(
    providers.openai.translateSegment({ apiKey: "key-test" }, { text: "Hello" }),
    (error) => error.message.includes("OpenAI error [redacted]") && !error.message.includes("sk-secret")
  );
  await assert.rejects(
    providers.xai.translateSegment({ apiKey: "key-test", model: "missing" }, { text: "Hello" }),
    /Model missing was not found by xAI/
  );
  await assert.rejects(
    providers["azure-openai"].translateSegment({ apiKey: "key-test", model: "missing-deployment" }, { text: "Hello" }),
    /Azure OpenAI deployment missing-deployment was not found/
  );
  await assert.rejects(
    providers.openai.translateSegment({ apiKey: "key-test" }, { text: "Hello" }),
    /The AI request was canceled\./
  );
  await assert.rejects(
    providers.xai.translateSegment({ apiKey: "key-test", baseUrl: "https:\/\/xai.example\/v1" }, { text: "Hello" }),
    /xAI is not reachable at https:\/\/xai\.example\/v1\./
  );
  await assert.rejects(
    providers["azure-openai"].translateSegment(
      { apiKey: "key-test", baseUrl: "https:\/\/azure.example\/openai\/v1" },
      { text: "Hello" }
    ),
    /Azure OpenAI is not reachable at https:\/\/azure\.example\/openai\/v1\./
  );
  await assert.rejects(providers.xai.testConnection(), /Add an xAI API key/);
});
