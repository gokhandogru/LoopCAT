const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const ENDPOINTS = {
  ollama: { models: "GET /tags", translate: "POST /chat" },
  "opus-cat": { models: "GET /ListSupportedLanguagePairs", translate: "GET /TranslateJson" },
  openai: { models: "GET /models", translate: "POST /responses" },
  deepseek: { models: "GET /models", translate: "POST /chat/completions" },
  gemini: { models: "GET /models", translate: "POST /interactions" },
  anthropic: { models: "GET /models", translate: "POST /messages" },
  cohere: { models: "GET /v1/models", translate: "POST /v2/chat" },
  mistral: { models: "GET /models", translate: "POST /chat/completions" },
  xai: { models: "GET /models", translate: "POST /responses" },
  perplexity: { models: "GET /models", translate: "POST /sonar" },
  groq: { models: "GET /models", translate: "POST /chat/completions" },
  together: { models: "GET /models", translate: "POST /chat/completions" },
  openrouter: { models: "GET /models", translate: "POST /chat/completions" },
  huggingface: { models: "GET /models", translate: "POST /chat/completions" },
  deepinfra: { models: "GET /models", translate: "POST /chat/completions" },
  fireworks: { models: "GET /models", translate: "POST /chat/completions" },
  "azure-openai": { models: "GET /models", translate: "POST /responses" },
  "openai-compatible": { models: "GET /models", translate: "POST /chat/completions" }
};

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-provider-presentation-service.js")).href);
}

function createHarness(createService, overrides = {}) {
  const urlCalls = [];
  const urls = {};
  for (const providerId of Object.keys(ENDPOINTS)) {
    urls[providerId] = (baseUrl, endpoint) => {
      urlCalls.push([providerId, baseUrl, endpoint]);
      return `https://provider.example${endpoint}`;
    };
  }
  const provider = overrides.provider || null;
  const preset = overrides.preset || null;
  const service = createService({
    providers: {
      get: () => provider,
      getPreset: () => preset,
      needsApiKey: (providerId, baseUrl) =>
        overrides.needsApiKey ? overrides.needsApiKey(providerId, baseUrl) : false,
      sharesExternally: (providerId, baseUrl, model) =>
        overrides.sharesExternally ? overrides.sharesExternally(providerId, baseUrl, model) : false,
      getGuidance: () => overrides.guidance || "Provider guidance"
    },
    urls,
    network: {
      isOllamaCloudBaseUrl: (baseUrl) => baseUrl === "https://ollama.cloud"
    },
    localization: {
      label: (key) => `label:${key}`,
      source: (text) => `source:${text}`
    },
    defaults: {
      providerId: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "default-model"
    }
  });
  return { service, urlCalls };
}

test("AI provider presentation preserves local, Ollama-cloud, hosted-key, and network privacy copy", async () => {
  const { createAiProviderPresentationService } = await loadFactory();
  const local = createHarness(createAiProviderPresentationService);
  assert.equal(
    local.service.privacyText({ providerId: "ollama", baseUrl: "http://127.0.0.1", model: "local" }),
    "Local AI mode: requests are sent to the loopback provider URL below. Ollama is the default local provider."
  );
  assert.equal(
    local.service.privacyText({ providerId: "openai-compatible", baseUrl: "http://127.0.0.1" }),
    "Local AI mode: requests are sent only to the loopback provider URL below."
  );
  const cloud = createHarness(createAiProviderPresentationService, {
    sharesExternally: () => true
  });
  assert.equal(
    cloud.service.privacyText({ providerId: "ollama", baseUrl: "https://ollama.cloud", model: "cloud" }),
    "Ollama cloud model mode: requests are sent to local Ollama first, and cloud-suffixed models may be processed through Ollama Cloud after confirmation."
  );
  const hosted = createHarness(createAiProviderPresentationService, {
    sharesExternally: () => true,
    needsApiKey: () => true
  });
  assert.equal(
    hosted.service.privacyText({ providerId: "openai", baseUrl: "https://api.example", model: "hosted" }),
    "Hosted AI mode: source text is sent to the configured provider URL after confirmation. API keys stay in this browser and are never exported with project packages."
  );
  const network = createHarness(createAiProviderPresentationService, {
    sharesExternally: () => true
  });
  assert.equal(
    network.service.privacyText({ providerId: "opus-cat", baseUrl: "https://remote.example" }),
    "Network AI mode: source text is sent to the configured provider URL after confirmation."
  );
});

test("AI provider presentation preserves safe paths and every registry endpoint summary", async () => {
  const { createAiProviderPresentationService } = await loadFactory();
  const harness = createHarness(createAiProviderPresentationService);
  assert.equal(harness.service.endpointPathLabel("https://example.test/api/models?key=secret"), "/api/models");
  assert.equal(harness.service.endpointPathLabel("not a valid URL"), "not a valid URL");
  assert.equal(harness.service.endpointPathLabel(""), "");
  for (const [providerId, expected] of Object.entries(ENDPOINTS)) {
    assert.deepEqual(harness.service.endpointSummary({ providerId, baseUrl: "https://configured.example" }), expected);
  }
  assert.deepEqual(harness.service.endpointSummary({ providerId: "unknown" }), {
    models: "Model list endpoint depends on provider",
    translate: "Translation endpoint depends on provider"
  });
  assert.deepEqual(harness.service.endpointSummary(), ENDPOINTS.ollama);
});

test("AI provider presentation preserves pull eligibility and ordered capability labels", async () => {
  const { createAiProviderPresentationService } = await loadFactory();
  const hosted = createHarness(createAiProviderPresentationService, {
    sharesExternally: () => true
  });
  const provider = {
    testConnection() {},
    listModels() {},
    translateSegment() {},
    completePrompt() {},
    pullModel() {}
  };
  const settings = { providerId: "openai-compatible", baseUrl: "http://127.0.0.1", model: "model" };
  assert.equal(hosted.service.canPullModel(settings, provider), true);
  assert.deepEqual(hosted.service.capabilityLabels(settings, provider), [
    "Connection test",
    "Model refresh",
    "Pre-translate",
    "Prompt test",
    "Review/edit tools",
    "Pull model",
    "Confirmation before send"
  ]);
  assert.equal(hosted.service.canPullModel({ providerId: "ollama", baseUrl: "https://ollama.cloud" }, provider), false);
  const local = createHarness(createAiProviderPresentationService);
  assert.deepEqual(local.service.capabilityLabels(settings, {}), ["No AI commands available"]);
});

test("AI provider presentation builds localized badges and the complete summary view", async () => {
  const { createAiProviderPresentationService } = await loadFactory();
  const provider = { name: "Provider name", pullModel() {} };
  const harness = createHarness(createAiProviderPresentationService, {
    provider,
    preset: { label: "Preset label" },
    needsApiKey: () => true,
    sharesExternally: () => true,
    guidance: "Use this provider"
  });
  assert.deepEqual(
    harness.service.summaryView({
      providerId: "openai",
      baseUrl: "https://api.example",
      model: "",
      includeNearbyContext: false
    }),
    {
      name: "Preset label",
      model: "default-model",
      badges: ["label:hostedNetwork", "label:apiKeyRequired", "label:pullSupported", "label:nearbyContextOff"],
      guidance: "source:Use this provider",
      baseLabel: "label:base",
      baseUrl: "https://api.example",
      toolsLabel: "label:tools",
      capabilities: "source:Pull model - source:Confirmation before send",
      modelsLabel: "label:models",
      modelsEndpoint: "GET /models",
      translateLabel: "label:translate",
      translateEndpoint: "POST /responses"
    }
  );
});

test("AI provider presentation preserves provider and default summary fallbacks with nearby context on", async () => {
  const { createAiProviderPresentationService } = await loadFactory();
  const provider = { name: "Provider fallback" };
  const harness = createHarness(createAiProviderPresentationService, { provider });
  const summary = harness.service.summaryView({
    providerId: "ollama",
    baseUrl: "",
    model: "",
    includeNearbyContext: true
  });
  assert.equal(summary.name, "Provider fallback");
  assert.equal(summary.model, "default-model");
  assert.equal(summary.baseUrl, "http://127.0.0.1:11434");
  assert.deepEqual(summary.badges, [
    "label:localLoopback",
    "label:noApiKey",
    "label:manualModel",
    "label:nearbyContextOn"
  ]);
  const anonymous = createHarness(createAiProviderPresentationService);
  assert.equal(anonymous.service.summaryView({ providerId: "", baseUrl: "", model: "" }).name, "AI provider");
});
