const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadModule() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-runtime-settings-service.js")).href);
}

function createHarness(createService, overrides = {}) {
  const project = overrides.project || { id: "project-1", sourceLang: "en", targetLang: "tr" };
  const form = overrides.form || {};
  const secrets = overrides.secrets || {};
  const projectSettings = overrides.projectSettings || {
    providerId: "ollama",
    baseUrl: "http://project.local",
    model: "project-model",
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr",
    mode: "untranslated",
    variantMode: "standard",
    adaptMode: "simplify",
    concurrency: 1,
    timeoutMs: 120000,
    overwriteExisting: true,
    includeNearbyContext: false,
    preserveConfirmedLocked: false
  };
  const calls = {
    defaults: [],
    endpoint: [],
    names: [],
    normalize: [],
    readLocal: [],
    readOpenAi: 0,
    saveLocal: []
  };
  const service = createService({
    project: { get: () => project },
    administration: {
      readLocalForm: () => form,
      readSecrets: () => secrets
    },
    localSettings: {
      projectSettings: () => projectSettings,
      defaults(settings, selectedProject) {
        calls.defaults.push([settings, selectedProject]);
        return { ...settings, normalized: true };
      }
    },
    languages: {
      normalizeInput(value) {
        calls.normalize.push(value);
        return overrides.normalizedLanguages?.[value] || String(value || "").toLowerCase();
      },
      nameForUi(value) {
        calls.names.push(value);
        return overrides.languageNames?.[value] || `Name ${value}`;
      }
    },
    endpoints: {
      isAllowedHostedCompatible(baseUrl) {
        calls.endpoint.push(baseUrl);
        return overrides.endpointAllowed !== false;
      }
    },
    providers: {
      needsApiKey: () => Boolean(overrides.needsApiKey)
    },
    credentials: {
      saveLocal(value, remember, settings) {
        calls.saveLocal.push([value, remember, settings]);
        if (overrides.saveError) throw overrides.saveError;
      },
      readLocal(settings) {
        calls.readLocal.push(settings);
        return overrides.localKey || "";
      },
      readOpenAi() {
        calls.readOpenAi += 1;
        return overrides.openAiKey || "";
      }
    },
    redact: (value) => String(value || "").replace(/Bearer\s+[A-Za-z0-9-]+/gi, "[redacted secret]"),
    defaults: {
      openAiModel: "gpt-default",
      projectLocalProviderId: "ollama",
      projectLocalBaseUrl: "http://localhost:11434",
      projectLocalModel: "translategemma",
      localBaseUrl: "http://127.0.0.1:11434",
      localModel: "translategemma:latest"
    }
  });
  return { calls, form, project, projectSettings, secrets, service };
}

test("AI runtime settings preserve every global and local project default", async () => {
  const { createAiRuntimeSettingsService } = await loadModule();
  const { service } = createHarness(createAiRuntimeSettingsService);
  assert.deepEqual(service.normalizeProjectSettings(null), {
    enabled: false,
    provider: "OpenAI",
    model: "gpt-default",
    apiKeyMode: "bring-your-own",
    sendSourceToAi: false,
    useTmContext: true,
    useTermbaseContext: true,
    styleGuide: "",
    localProvider: "ollama",
    localBaseUrl: "http://localhost:11434",
    localModel: "translategemma",
    localSourceLang: "",
    localSourceCode: "",
    localTargetLang: "",
    localTargetCode: "",
    localPretranslateMode: "untranslated",
    localVariantMode: "standard",
    localAdaptMode: "simplify",
    localConcurrency: 1,
    localTimeoutMs: 120000,
    localOverwrite: false,
    localPreserveConfirmedLocked: true,
    localIncludeNearbyContext: true
  });
});

test("AI runtime settings preserve redaction, enum allowlists, numeric bounds, and booleans", async () => {
  const { createAiRuntimeSettingsService } = await loadModule();
  const { service } = createHarness(createAiRuntimeSettingsService);
  const normalized = service.normalizeProjectSettings({
    enabled: 1,
    provider: " Bearer provider-secret ",
    model: " Bearer model-secret ",
    apiKeyMode: "persist-secret",
    sendSourceToAi: "yes",
    useTmContext: false,
    useTermbaseContext: false,
    styleGuide: " Bearer style-secret ",
    localProviderId: " Bearer local-provider ",
    localBaseUrl: " Bearer local-base ",
    localModel: " Bearer local-model ",
    localSourceLang: " Bearer source-name ",
    localSourceCode: " Bearer source-code ",
    localTargetLang: " Bearer target-name ",
    localTargetCode: " Bearer target-code ",
    localPretranslateMode: "selected",
    localVariantMode: "locale",
    localAdaptMode: "shorten",
    localConcurrency: 1.6,
    localTimeoutMs: 700000,
    localOverwrite: 1,
    localPreserveConfirmedLocked: false,
    localIncludeNearbyContext: false,
    apiKey: "must-not-survive"
  });
  assert.equal(normalized.provider, "[redacted secret]");
  assert.equal(normalized.model, "[redacted secret]");
  assert.equal(normalized.styleGuide, "[redacted secret]");
  assert.equal(normalized.localProvider, "[redacted secret]");
  assert.equal(normalized.localSourceCode, "[redacted secret]");
  assert.equal(normalized.localTargetCode, "[redacted secret]");
  assert.equal(normalized.localPretranslateMode, "selected");
  assert.equal(normalized.localVariantMode, "locale");
  assert.equal(normalized.localAdaptMode, "shorten");
  assert.equal(normalized.localConcurrency, 2);
  assert.equal(normalized.localTimeoutMs, 600000);
  assert.equal(normalized.enabled, true);
  assert.equal(normalized.sendSourceToAi, true);
  assert.equal(normalized.useTmContext, false);
  assert.equal(normalized.useTermbaseContext, false);
  assert.equal(normalized.localOverwrite, true);
  assert.equal(normalized.localPreserveConfirmedLocked, false);
  assert.equal(normalized.localIncludeNearbyContext, false);
  assert.equal(normalized.apiKeyMode, "bring-your-own");
  assert.equal(Object.hasOwn(normalized, "apiKey"), false);

  const bounded = service.normalizeProjectSettings({
    localPretranslateMode: "invalid",
    localVariantMode: "invalid",
    localAdaptMode: "invalid",
    localConcurrency: -10,
    localTimeoutMs: 12
  });
  assert.equal(bounded.localPretranslateMode, "untranslated");
  assert.equal(bounded.localVariantMode, "standard");
  assert.equal(bounded.localAdaptMode, "simplify");
  assert.equal(bounded.localConcurrency, 1);
  assert.equal(bounded.localTimeoutMs, 5000);
});

test("local AI settings composition preserves form, project, language, and boolean precedence", async () => {
  const { createAiRuntimeSettingsService } = await loadModule();
  const harness = createHarness(createAiRuntimeSettingsService, {
    form: {
      providerId: "deepseek",
      baseUrl: "https://form.example",
      model: "form-model",
      sourceLanguage: "Català",
      targetCode: "de-DE",
      mode: "selected",
      variantMode: "formal",
      adaptMode: "localize",
      concurrency: 2,
      timeoutMs: 9000,
      overwriteExisting: false,
      includeNearbyContext: false,
      preserveConfirmedLocked: false
    },
    normalizedLanguages: { Català: "ca-ES", "de-DE": "de-DE" },
    languageNames: { "ca-ES": "Catalan" }
  });
  const result = harness.service.localSettingsFromForm();
  assert.equal(result.normalized, true);
  assert.deepEqual(harness.calls.normalize, ["Català", "de-DE", "Català"]);
  assert.deepEqual(harness.calls.names, ["ca-ES"]);
  assert.deepEqual(harness.calls.defaults, [
    [
      {
        ...harness.projectSettings,
        providerId: "deepseek",
        baseUrl: "https://form.example",
        model: "form-model",
        sourceLanguage: "Catalan",
        sourceCode: "ca-ES",
        targetLanguage: "Turkish",
        targetCode: "de-DE",
        mode: "selected",
        variantMode: "formal",
        adaptMode: "localize",
        concurrency: 2,
        timeoutMs: 9000,
        overwriteExisting: false,
        includeNearbyContext: false,
        preserveConfirmedLocked: false
      },
      harness.project
    ]
  ]);
});

test("AI runtime settings preserve exact hosted-compatible endpoint policy and error copy", async () => {
  const { createAiRuntimeSettingsService } = await loadModule();
  const blocked = createHarness(createAiRuntimeSettingsService, { endpointAllowed: false });
  assert.throws(
    () =>
      blocked.service.assertEndpointAllowed({
        providerId: "openai-compatible",
        baseUrl: "https://unsupported.example/v1"
      }),
    /This hosted OpenAI-compatible endpoint is not in LoopCAT's explicit provider allowlist\. Choose a named hosted provider preset or use a loopback server such as LM Studio\./
  );
  assert.deepEqual(blocked.calls.endpoint, ["https://unsupported.example/v1"]);
  assert.equal(
    blocked.service.assertEndpointAllowed({
      providerId: "deepseek",
      baseUrl: "https://unsupported.example/v1"
    }),
    true
  );
  assert.deepEqual(blocked.calls.endpoint, ["https://unsupported.example/v1"]);
});

test("AI runtime config preserves typed credential trimming, remember routing, and save failure", async () => {
  const { createAiRuntimeSettingsService } = await loadModule();
  const settings = { providerId: "deepseek", baseUrl: "https://api.deepseek.com" };
  const typed = createHarness(createAiRuntimeSettingsService, {
    secrets: { localAiKey: "  typed-key  ", rememberLocalAiKey: true },
    localKey: "stored-key",
    openAiKey: "global-key"
  });
  assert.deepEqual(typed.service.runtimeConfig(settings), { ...settings, apiKey: "typed-key" });
  assert.deepEqual(typed.calls.saveLocal, [["typed-key", true, settings]]);
  assert.deepEqual(typed.calls.readLocal, []);
  assert.equal(typed.calls.readOpenAi, 0);

  const saveError = new Error("credential save failed");
  const failed = createHarness(createAiRuntimeSettingsService, {
    secrets: { localAiKey: "typed-key" },
    saveError
  });
  assert.throws(() => failed.service.runtimeConfig(settings), saveError);
  assert.deepEqual(failed.calls.readLocal, []);
});

test("AI runtime config preserves provider-scoped then OpenAI-global credential fallback", async () => {
  const { createAiRuntimeSettingsService } = await loadModule();
  const local = createHarness(createAiRuntimeSettingsService, {
    localKey: "provider-key",
    openAiKey: "global-key"
  });
  assert.equal(
    local.service.runtimeConfig({ providerId: "openai", baseUrl: "https://api.openai.com/v1" }).apiKey,
    "provider-key"
  );
  assert.equal(local.calls.readOpenAi, 0);

  const openAi = createHarness(createAiRuntimeSettingsService, { openAiKey: "global-key" });
  assert.equal(
    openAi.service.runtimeConfig({ providerId: "openai", baseUrl: "https://api.openai.com/v1" }).apiKey,
    "global-key"
  );
  assert.equal(openAi.calls.readOpenAi, 1);

  const hosted = createHarness(createAiRuntimeSettingsService, { openAiKey: "global-key" });
  assert.equal(
    hosted.service.runtimeConfig({ providerId: "deepseek", baseUrl: "https://api.deepseek.com" }).apiKey,
    ""
  );
  assert.equal(hosted.calls.readOpenAi, 0);
});

test("AI runtime readiness preserves endpoint-first validation and action-specific key copy", async () => {
  const { createAiRuntimeSettingsService } = await loadModule();
  const settings = { providerId: "openai-compatible", baseUrl: "https://allowed.example/v1" };
  const required = createHarness(createAiRuntimeSettingsService, { needsApiKey: true });
  assert.throws(
    () => required.service.assertRuntimeReady(settings, { apiKey: " " }, "testing this provider"),
    /Add a provider API key before testing this provider\./
  );
  assert.equal(required.service.assertRuntimeReady(settings, { apiKey: "key" }), true);

  const keyFree = createHarness(createAiRuntimeSettingsService, { needsApiKey: false });
  assert.equal(keyFree.service.assertRuntimeReady(settings, { apiKey: "" }), true);

  const blocked = createHarness(createAiRuntimeSettingsService, {
    endpointAllowed: false,
    needsApiKey: true
  });
  assert.throws(() => blocked.service.assertRuntimeReady(settings, { apiKey: "" }), /explicit provider allowlist/);
});
