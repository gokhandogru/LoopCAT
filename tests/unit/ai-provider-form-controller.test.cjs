const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadModule() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-provider-form-controller.js")).href);
}

function createHarness(createController, overrides = {}) {
  const events = [];
  const calls = {};
  const project = overrides.project || { id: "project-1", sourceLang: "en", targetLang: "tr" };
  const segment = overrides.segment === undefined ? { id: "segment-1" } : overrides.segment;
  const form = overrides.form || {
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "form-model",
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr"
  };
  const projectSettings = overrides.projectSettings || {
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "project-model",
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr"
  };
  const state = {
    models: overrides.models || [{ name: "model-a" }],
    running: Boolean(overrides.running),
    promptBusy: Boolean(overrides.promptBusy),
    progress: overrides.progress ?? 0.4,
    connectionStatus: overrides.connectionStatus || "connected",
    statusText: overrides.statusText || "Ready"
  };
  const presets = overrides.presets || [
    { id: "ollama-local", providerId: "ollama", baseUrl: "local", model: "local-model", label: "Local" },
    { id: "ollama-cloud", providerId: "ollama", baseUrl: "cloud", model: "cloud-model", label: "Cloud" },
    { id: "azure-openai", providerId: "azure-openai", baseUrl: "azure", model: "azure-model", label: "Azure" },
    { id: "groq", providerId: "groq", baseUrl: "groq", model: "groq-model", label: "Groq" },
    { id: "deepseek", providerId: "deepseek", baseUrl: "deepseek", model: "deepseek-model", label: "DeepSeek" }
  ];
  const providerMap = new Map(
    Object.entries(
      overrides.providerMap || {
        ollama: { id: "ollama", defaultBaseUrl: "ollama-base", defaultModel: "ollama-model" },
        custom: { id: "custom" }
      }
    )
  );
  const administration = {
    readLocalForm: () => form,
    setLanguageFields: (view) => {
      calls.languageFields = view;
      events.push("set-language");
    },
    setProviderFields: (view) => {
      calls.providerFields = view;
      events.push("set-provider");
    },
    render: (view) => {
      calls.commandCentre = view;
      events.push("render-command-centre");
    },
    renderStatus: (view) => {
      calls.status = view;
      events.push("render-status");
    },
    renderModels: (view) => {
      calls.models = view;
      events.push("render-models");
    },
    renderProgress: (view) => {
      calls.progress = view;
      events.push("render-progress");
    },
    renderOutput: (value, options) => {
      calls.output = [value, options];
      events.push("render-output");
    },
    renderProvider: (view) => {
      calls.provider = view;
      events.push("render-provider");
    },
    renderPresets: (view) => {
      calls.presets = view;
      events.push("render-presets");
    }
  };
  const controller = createController({
    administration,
    settings: {
      readForm: () => form,
      readProject: () => projectSettings
    },
    project: { get: () => project, getSegment: () => segment },
    providers: {
      get: (providerId) => providerMap.get(providerId) || null,
      presets,
      getPreset: (presetId) => presets.find((preset) => preset.id === presetId),
      presetForSettings: () =>
        overrides.currentPresetId ? presets.find((preset) => preset.id === overrides.currentPresetId) : null,
      needsApiKey: () => Boolean(overrides.needsApiKey)
    },
    presentation: {
      canPullModel: () => overrides.canPull !== false,
      privacyText: (settings) => `privacy:${settings.providerId}`,
      summaryView: (settings) => ({ name: `summary:${settings.providerId}` })
    },
    credentials: {
      localSnapshot: () => ({ local: overrides.rememberedKey ? "remembered" : null }),
      readLocal: () => overrides.storedKey || ""
    },
    runtime: { canStartServer: () => Boolean(overrides.canStartServer) },
    languages: {
      normalizeInput(value) {
        calls.normalized = [...(calls.normalized || []), value];
        return overrides.normalizedLanguages?.[value] || String(value || "").toLowerCase();
      },
      nameForUi(value) {
        calls.languageNames = [...(calls.languageNames || []), value];
        return overrides.languageNames?.[value] || `Name ${value}`;
      },
      shouldLiveSync: ({ value }) => value === "complete"
    },
    prompt: {
      render: () => events.push("render-prompt"),
      previewRequest: () => ({ prompt: overrides.promptPreview || "preview prompt" })
    },
    help: { hideOpusCat: () => events.push("hide-help") },
    keys: {
      clearLocal: () => overrides.clearLocal !== false,
      clearOpenAi: () => overrides.clearOpenAi !== false
    },
    state: {
      read: () => state,
      clearModels() {
        state.models = [];
        events.push("clear-models");
      },
      setStatus(details) {
        state.connectionStatus = details.connectionStatus;
        state.statusText = details.statusText;
        events.push("set-status");
      }
    },
    status: {
      setSave(text, saveState) {
        calls.saveStatus = [text, saveState];
        events.push("save-status");
      }
    },
    localization: {
      label: (key) => `label:${key}`,
      source: (text, values = {}) => text.replace("{value1}", values.value1 === undefined ? "{value1}" : values.value1)
    },
    redact: (value) => String(value || "").replace(/Bearer\s+\S+/gi, "[redacted secret]"),
    defaults: {
      localBaseUrl: "default-local-base",
      localModel: "default-local-model",
      openAiModel: "default-openai-model",
      geminiModel: "default-gemini-model"
    }
  });
  return {
    administration,
    calls,
    controller,
    events,
    form,
    presets,
    project,
    projectSettings,
    providerMap,
    state
  };
}

test("AI provider form preserves redacted status, model, progress, and output presentation", async () => {
  const { createAiProviderFormController } = await loadModule();
  const harness = createHarness(createAiProviderFormController, { running: true, progress: 0.75 });
  harness.controller.setStatus("error", "Bearer secret-token failed");
  assert.deepEqual(harness.calls.status, {
    connectionStatus: "error",
    text: "[redacted secret] failed"
  });
  assert.equal(harness.state.statusText, "[redacted secret] failed");
  harness.controller.renderModels({ model: "chosen-model" });
  assert.deepEqual(harness.calls.models, {
    models: [{ name: "model-a" }],
    currentModel: "chosen-model",
    emptyLabel: "Refresh models",
    manualLabel: "chosen-model (manual)"
  });
  harness.controller.renderProgress();
  assert.deepEqual(harness.calls.progress, { running: true, value: 0.75 });
  harness.controller.renderOutput("output", { disclosure: true });
  assert.deepEqual(harness.calls.output, ["output", { disclosure: true }]);
});

test("AI provider form preserves provider controls and credential summaries", async () => {
  const { createAiProviderFormController } = await loadModule();
  const harness = createHarness(createAiProviderFormController, {
    running: true,
    promptBusy: true,
    needsApiKey: true,
    rememberedKey: true,
    storedKey: "provider-key",
    canStartServer: true
  });
  const settings = {
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "chosen-model"
  };
  harness.controller.renderProvider(settings);
  assert.deepEqual(harness.calls.provider, {
    privacyText: "privacy:ollama",
    summary: { name: "summary:ollama" },
    running: true,
    promptBusy: true,
    canPull: true,
    pullLabel: "Pull chosen-model",
    canStartServer: true,
    needsKey: true,
    rememberLocalKey: true,
    storedLocalKey: "provider-key"
  });

  const unavailable = createHarness(createAiProviderFormController, { canPull: false });
  unavailable.controller.renderProvider({ providerId: "custom", baseUrl: "custom", model: "" });
  assert.equal(unavailable.calls.provider.pullLabel, "Pull unavailable");
  assert.equal(unavailable.calls.provider.canPull, false);
});

test("AI provider form preserves stable preset groups and current or custom selection", async () => {
  const { createAiProviderFormController } = await loadModule();
  const harness = createHarness(createAiProviderFormController, { currentPresetId: "groq" });
  harness.controller.renderPresets(harness.projectSettings);
  assert.deepEqual(harness.calls.presets, {
    groups: [
      { label: "label:localRuntimes", options: [{ id: "ollama-local", label: "Local" }] },
      { label: "label:ollamaHostedCloud", options: [{ id: "ollama-cloud", label: "Cloud" }] },
      { label: "label:managedDeployments", options: [{ id: "azure-openai", label: "Azure" }] },
      { label: "Hosted routers", options: [{ id: "groq", label: "Groq" }] },
      { label: "label:hostedProviders", options: [{ id: "deepseek", label: "DeepSeek" }] }
    ],
    currentPresetId: "groq",
    customLabel: "Custom provider"
  });

  const custom = createHarness(createAiProviderFormController);
  custom.controller.renderPresets(custom.projectSettings);
  assert.equal(custom.calls.presets.currentPresetId, "custom");
});

test("AI provider preset transitions preserve fields, state clearing, status, and refresh order", async () => {
  const { createAiProviderFormController } = await loadModule();
  const harness = createHarness(createAiProviderFormController);
  harness.controller.handlePresetChange("ollama-local");
  assert.deepEqual(harness.calls.providerFields, {
    providerId: "ollama",
    baseUrl: "local",
    model: "local-model"
  });
  assert.deepEqual(harness.events, [
    "set-provider",
    "clear-models",
    "hide-help",
    "set-status",
    "render-status",
    "render-presets",
    "render-provider",
    "render-models",
    "render-prompt"
  ]);
  assert.equal(harness.state.connectionStatus, "disconnected");
  assert.equal(harness.state.statusText, "Local selected");

  const custom = createHarness(createAiProviderFormController);
  custom.controller.handlePresetChange("custom");
  assert.deepEqual(custom.events, ["render-provider", "render-prompt"]);

  const missing = createHarness(createAiProviderFormController);
  missing.controller.handlePresetChange("missing");
  assert.deepEqual(missing.events, []);
});

test("AI provider and base URL transitions preserve provider-specific defaults and refresh subsets", async () => {
  const { createAiProviderFormController } = await loadModule();
  for (const [providerId, expectedModel] of [
    ["openai", "default-openai-model"],
    ["gemini", "default-gemini-model"],
    ["custom", "default-local-model"]
  ]) {
    const harness = createHarness(createAiProviderFormController);
    harness.controller.handleProviderChange(providerId);
    assert.deepEqual(harness.calls.providerFields, {
      providerId,
      baseUrl: "default-local-base",
      model: expectedModel
    });
    assert.deepEqual(harness.events.slice(-4), ["render-presets", "render-provider", "render-models", "render-prompt"]);
  }

  const known = createHarness(createAiProviderFormController);
  known.controller.handleProviderChange("ollama");
  assert.deepEqual(known.calls.providerFields, {
    providerId: "ollama",
    baseUrl: "ollama-base",
    model: "ollama-model"
  });

  const baseUrl = createHarness(createAiProviderFormController);
  baseUrl.controller.handleBaseUrlInput();
  assert.deepEqual(baseUrl.events, ["hide-help", "set-status", "render-status", "render-presets", "render-provider"]);
});

test("AI provider form preserves key-clear, general form, and live language transition behavior", async () => {
  const { createAiProviderFormController } = await loadModule();
  const harness = createHarness(createAiProviderFormController);
  harness.controller.handleClearLocalKey();
  assert.deepEqual(harness.calls.saveStatus, ["Local AI key cleared from this browser", "saved"]);
  harness.controller.handleClearOpenAiKey();
  assert.deepEqual(harness.calls.saveStatus, ["OpenAI key cleared from this browser", "saved"]);

  harness.events.length = 0;
  harness.controller.handleFormChanged();
  assert.deepEqual(harness.events, ["render-prompt"]);
  harness.events.length = 0;
  harness.controller.handleFormChanged({ providerChanged: true });
  assert.deepEqual(harness.events, ["render-provider", "render-prompt"]);

  harness.events.length = 0;
  harness.controller.handleLanguageChanged("sourceLanguage", "partial", "input");
  assert.deepEqual(harness.events, ["render-prompt"]);
  harness.events.length = 0;
  harness.controller.handleLanguageChanged("sourceLanguage", "complete", "input");
  assert.deepEqual(harness.events, ["set-language", "render-prompt"]);
  harness.events.length = 0;
  harness.controller.handleLanguageChanged("sourceLanguage", "partial", "change");
  assert.deepEqual(harness.events, ["set-language", "render-prompt"]);

  const blocked = createHarness(createAiProviderFormController, {
    clearLocal: false,
    clearOpenAi: false
  });
  blocked.controller.handleClearLocalKey();
  blocked.controller.handleClearOpenAiKey();
  assert.equal(blocked.calls.saveStatus, undefined);
});

test("AI provider form preserves language synchronization direction and project fallbacks", async () => {
  const { createAiProviderFormController } = await loadModule();
  const languageName = createHarness(createAiProviderFormController, {
    form: { sourceLanguage: "Català", targetLanguage: "Türkçe" },
    normalizedLanguages: { Català: "ca-ES", Türkçe: "tr-TR" }
  });
  languageName.controller.syncLanguageFields("sourceLanguage");
  assert.deepEqual(languageName.calls.languageFields, {
    sourceCode: "ca-ES",
    targetLanguage: "Name tr-TR",
    targetCode: "tr-TR"
  });

  const codes = createHarness(createAiProviderFormController, {
    form: { sourceCode: "ca-ES", targetCode: "tr-TR" }
  });
  codes.controller.syncLanguageFields("sourceCode");
  assert.deepEqual(codes.calls.languageFields, {
    sourceLanguage: "Name ca-es",
    targetLanguage: "Name tr-tr",
    targetCode: "tr-tr"
  });
});

test("AI provider form composes the complete command-centre view model", async () => {
  const { createAiProviderFormController } = await loadModule();
  const harness = createHarness(createAiProviderFormController, {
    projectSettings: {
      providerId: "ollama",
      baseUrl: "local",
      model: "",
      sourceLanguage: "",
      sourceCode: "",
      targetLanguage: "",
      targetCode: ""
    },
    currentPresetId: "ollama-local",
    running: true,
    promptBusy: true,
    progress: 0.6,
    connectionStatus: "testing",
    statusText: "Checking",
    promptPreview: "full preview"
  });
  harness.controller.renderCommandCentre();
  const view = harness.calls.commandCentre;
  assert.deepEqual(view.settings, {
    ...harness.projectSettings,
    sourceLanguage: "Name en",
    sourceCode: "en",
    targetLanguage: "Name tr",
    targetCode: "tr"
  });
  assert.equal(view.presets.currentPresetId, "ollama-local");
  assert.equal(view.models.currentModel, "default-local-model");
  assert.equal(view.provider.pullLabel, "Pull default-local-model");
  assert.deepEqual(view.status, { connectionStatus: "testing", text: "Checking" });
  assert.deepEqual(view.progress, { running: true, value: 0.6 });
  assert.equal(view.promptPreview, "full preview");
  assert.deepEqual(view.availability, {
    hasProject: true,
    hasSegment: true,
    running: true,
    promptBusy: true
  });
});
