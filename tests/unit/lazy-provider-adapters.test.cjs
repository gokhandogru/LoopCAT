const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const expectedProviders = [
  ["ollama", "Ollama", "OllamaProvider"],
  ["openai", "OpenAI", "OpenAIProvider"],
  ["deepseek", "DeepSeek", "DeepSeekProvider"],
  ["xai", "xAI Grok", "XAIProvider"],
  ["perplexity", "Perplexity Sonar", "PerplexityProvider"],
  ["groq", "Groq", "GroqProvider"],
  ["together", "Together AI", "TogetherProvider"],
  ["openrouter", "OpenRouter", "OpenRouterProvider"],
  ["huggingface", "Hugging Face Inference Providers", "HuggingFaceProvider"],
  ["deepinfra", "DeepInfra", "DeepInfraProvider"],
  ["fireworks", "Fireworks AI", "FireworksProvider"],
  ["gemini", "Google Gemini", "GeminiProvider"],
  ["anthropic", "Anthropic Claude", "AnthropicProvider"],
  ["cohere", "Cohere Command", "CohereProvider"],
  ["mistral", "Mistral AI", "MistralProvider"],
  ["azure-openai", "Azure OpenAI", "AzureOpenAIProvider"],
  ["openai-compatible", "LM Studio / OpenAI-compatible", "OpenAICompatibleProvider"],
  ["opus-cat", "OPUS-CAT", "OpusCatProvider"]
];

function createHarness() {
  const providers = new Map();
  const ai = {
    LOCAL_AI_PROVIDER_PRESETS: expectedProviders.map(([id]) => ({
      providerId: id,
      baseUrl: `https://${id}.example.test`,
      model: `${id}-model`
    })),
    aiProviderRegistry: {
      register(provider) {
        providers.set(provider.id, provider);
        return provider;
      },
      get(id) {
        return providers.get(id) || providers.get("ollama");
      },
      list() {
        return [...providers.values()];
      }
    }
  };
  return { ai, providers };
}

test("lazy provider adapters preserve all registry positions, descriptors, capabilities, and compatibility exports", async () => {
  const { installLazyProviderAdapters } = await moduleAt("src/ai/providers/install-lazy-provider-adapters.js");
  const { ai } = createHarness();
  const installation = installLazyProviderAdapters(ai, { load() {} });

  assert.deepEqual(
    installation.providers.map(({ id, name }) => [id, name]),
    expectedProviders.map(([id, name]) => [id, name])
  );
  expectedProviders.forEach(([id, _name, compatibilityExport], index) => {
    const provider = installation.providers[index];
    assert.equal(provider.defaultBaseUrl, `https://${id}.example.test`);
    assert.equal(provider.defaultModel, `${id}-model`);
    assert.equal(typeof provider.testConnection, "function");
    assert.equal(typeof provider.listModels, "function");
    assert.equal(typeof provider.translateSegment, "function");
    assert.equal(typeof provider.completePrompt, id === "opus-cat" ? "undefined" : "function");
    assert.equal(typeof provider.pullModel, id === "ollama" ? "function" : "undefined");
    assert.equal(ai[compatibilityExport], provider);
    assert.equal(Object.isFrozen(provider), false);
    const originalConnection = provider.testConnection;
    provider.testConnection = () => "test override";
    assert.equal(provider.testConnection(), "test override");
    provider.testConnection = originalConnection;
  });
  assert.equal(Object.isFrozen(installation), true);
  assert.equal(Object.isFrozen(installation.providers), true);
});

test("lazy provider adapters share one concurrent load and preserve delegate receiver, arguments, and results", async () => {
  const { installLazyProviderAdapters } = await moduleAt("src/ai/providers/install-lazy-provider-adapters.js");
  const { ai, providers } = createHarness();
  let resolveLoad;
  let loadCount = 0;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const installation = installLazyProviderAdapters(ai, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const lazy = providers.get("openai");
  const calls = [];
  const connectionResult = { connected: true };
  const translationResult = { translatedText: "Merhaba" };
  const installed = {
    id: "openai",
    name: "OpenAI",
    testConnection(...args) {
      calls.push(["testConnection", this, args]);
      return connectionResult;
    },
    translateSegment(...args) {
      calls.push(["translateSegment", this, args]);
      return translationResult;
    }
  };

  const connection = lazy.testConnection({ apiKey: "key" });
  const translation = lazy.translateSegment({ model: "gpt" }, { text: "Hello" });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  providers.set("openai", installed);
  resolveLoad();

  assert.equal(await connection, connectionResult);
  assert.equal(await translation, translationResult);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === installed, args]),
    [
      ["testConnection", true, [{ apiKey: "key" }]],
      ["translateSegment", true, [{ model: "gpt" }, { text: "Hello" }]]
    ]
  );
  assert.equal(await installation.load(), undefined);
  assert.equal(loadCount, 1);
});

test("lazy provider adapters propagate load failure identity and retry the next first use", async () => {
  const { installLazyProviderAdapters } = await moduleAt("src/ai/providers/install-lazy-provider-adapters.js");
  const { ai, providers } = createHarness();
  const expectedError = new Error("chunk unavailable");
  const result = { models: ["ready"] };
  let loadCount = 0;
  const installed = {
    id: "gemini",
    name: "Google Gemini",
    listModels() {
      return result;
    }
  };
  installLazyProviderAdapters(ai, {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      providers.set("gemini", installed);
    }
  });
  const lazy = providers.get("gemini");

  await assert.rejects(lazy.listModels({}), (error) => error === expectedError);
  assert.equal(await lazy.listModels({}), result);
  assert.equal(loadCount, 2);
});

test("lazy provider adapters reject incomplete installation and permit a repaired retry", async () => {
  const { installLazyProviderAdapters } = await moduleAt("src/ai/providers/install-lazy-provider-adapters.js");
  const { ai, providers } = createHarness();
  let loadCount = 0;
  installLazyProviderAdapters(ai, {
    load() {
      loadCount += 1;
      if (loadCount === 2) {
        providers.set("cohere", {
          id: "cohere",
          name: "Cohere Command",
          completePrompt: () => "ready"
        });
      }
    }
  });
  const lazy = providers.get("cohere");

  await assert.rejects(lazy.completePrompt({}, {}), /AI provider cohere did not install completePrompt\(\)\./);
  assert.equal(await lazy.completePrompt({}, {}), "ready");
  assert.equal(loadCount, 2);
});

test("lazy provider adapters validate registry, preset, and loader boundaries", async () => {
  const { installLazyProviderAdapters } = await moduleAt("src/ai/providers/install-lazy-provider-adapters.js");
  assert.throws(() => installLazyProviderAdapters({}), /require the LoopCAT AI provider registry/);
  assert.throws(
    () =>
      installLazyProviderAdapters({
        aiProviderRegistry: { register() {}, get() {} }
      }),
    /require the provider preset catalog/
  );
  const { ai } = createHarness();
  assert.throws(() => installLazyProviderAdapters(ai, { load: false }), /require a load function/);
});
