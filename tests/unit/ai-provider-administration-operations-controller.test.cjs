const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(
    pathToFileURL(path.join(root, "src/features/ai/ai-provider-administration-operations-controller.js")).href
  );
}

function createHarness(createController, overrides = {}) {
  const settings = {
    providerId: overrides.providerId || "ollama",
    baseUrl: overrides.baseUrl || "http://localhost:11434",
    model: overrides.model === undefined ? "model-a" : overrides.model
  };
  const calls = [];
  const connectionStatuses = [];
  const saveStatuses = [];
  let models = [];
  let connectionAttempt = 0;
  const provider = overrides.noProvider
    ? null
    : {
        name: overrides.providerName || "Test provider",
        testConnection: () => {
          connectionAttempt += 1;
          calls.push(["testConnection", connectionAttempt]);
          if (overrides.connectionErrors?.[connectionAttempt - 1]) {
            return Promise.reject(overrides.connectionErrors[connectionAttempt - 1]);
          }
          return Promise.resolve(
            overrides.connectionResult || { provider: "Test provider", version: "1.2", connectionMode: "direct" }
          );
        },
        listModels: () => {
          calls.push(["listModels"]);
          return overrides.listError
            ? Promise.reject(overrides.listError)
            : Promise.resolve({ models: overrides.models || [{ name: "model-a" }] });
        },
        ...(overrides.noPull
          ? {}
          : {
              pullModel: (config, model, onProgress) => {
                calls.push(["pullModel", config.key, model]);
                onProgress({ status: "downloading" });
                return overrides.pullError ? Promise.reject(overrides.pullError) : Promise.resolve();
              }
            })
      };
  const bridge = overrides.noBridge
    ? null
    : {
        startLmStudioServer: () => {
          calls.push(["startServer"]);
          return Promise.resolve(
            overrides.startResult === undefined
              ? { ok: true, message: "LM Studio server started" }
              : overrides.startResult
          );
        }
      };
  const controller = createController({
    project: { exists: () => overrides.noProject !== true },
    settings: {
      persist: () => {
        calls.push(["persist"]);
        return Promise.resolve({ ...settings });
      },
      runtimeConfig: () => {
        calls.push(["runtimeConfig"]);
        if (overrides.runtimeError) throw overrides.runtimeError;
        return { key: "config" };
      },
      assertReady: (value, config, action) => {
        calls.push(["assertReady", value.providerId, config.key, action]);
        if (overrides.readyError) throw overrides.readyError;
      },
      normalizeBaseUrl: (providerId, baseUrl) => `${providerId}:${String(baseUrl).replace(/\/$/, "")}`
    },
    providers: {
      get: () => provider,
      sharesExternally: () => Boolean(overrides.sharesExternally),
      canPullModel: () => overrides.canPull !== false && Boolean(provider?.pullModel)
    },
    desktop: { getBridge: () => bridge },
    administration: {
      setBaseUrl: (value) => {
        calls.push(["setBaseUrl", value]);
        settings.baseUrl = value;
      },
      readModel: () => overrides.formModel || ""
    },
    modelState: {
      get: () => models,
      replace: (value) => {
        calls.push(["replaceModels", value.map((item) => item.name)]);
        models = value;
      }
    },
    presentation: {
      renderPresets: (value) => calls.push(["renderPresets", value.baseUrl]),
      renderProvider: (value) => calls.push(["renderProvider", value.baseUrl]),
      renderPrompt: () => calls.push(["renderPrompt"]),
      renderModels: (value) => calls.push(["renderModels", value.model])
    },
    help: {
      setVisible: (visible) => calls.push(["helpVisible", visible]),
      open: () => calls.push(["helpOpen"])
    },
    status: {
      setConnection: (state, message) => connectionStatuses.push([state, message]),
      setSave: (message, mode) => saveStatuses.push([message, mode])
    },
    defaults: { model: "default-model" }
  });
  return { calls, connectionStatuses, controller, models: () => models, saveStatuses, settings };
}

test("provider administration exposes LM Studio start only for local OpenAI-compatible desktop settings", async () => {
  const { createAiProviderAdministrationOperationsController } = await loadFactory();
  const eligible = createHarness(createAiProviderAdministrationOperationsController, {
    providerId: "openai-compatible"
  });
  assert.equal(eligible.controller.canStartServer(eligible.settings), true);
  const hosted = createHarness(createAiProviderAdministrationOperationsController, {
    providerId: "openai-compatible",
    sharesExternally: true
  });
  assert.equal(hosted.controller.canStartServer(hosted.settings), false);
  const noBridge = createHarness(createAiProviderAdministrationOperationsController, {
    providerId: "openai-compatible",
    noBridge: true
  });
  assert.equal(noBridge.controller.canStartServer(noBridge.settings), false);
});

test("provider connection validation and missing-provider outcomes stop before invocation", async () => {
  const { createAiProviderAdministrationOperationsController } = await loadFactory();
  const absent = createHarness(createAiProviderAdministrationOperationsController, { noProject: true });
  await absent.controller.testConnection();
  assert.deepEqual(absent.calls, []);
  assert.deepEqual(absent.saveStatuses, []);
  const invalid = createHarness(createAiProviderAdministrationOperationsController, {
    readyError: new Error("key setup unavailable")
  });
  await invalid.controller.testConnection();
  assert.deepEqual(invalid.saveStatuses.at(-1), ["key setup unavailable", "dirty"]);
  assert.equal(
    invalid.calls.some(([name]) => name === "testConnection"),
    false
  );
  const missing = createHarness(createAiProviderAdministrationOperationsController, { noProvider: true });
  await missing.controller.testConnection();
  assert.deepEqual(missing.saveStatuses.at(-1), ["This AI provider is not available.", "dirty"]);
});

test("provider connection success preserves status version and route", async () => {
  const { createAiProviderAdministrationOperationsController } = await loadFactory();
  const harness = createHarness(createAiProviderAdministrationOperationsController);
  await harness.controller.testConnection();
  assert.deepEqual(harness.connectionStatuses.at(-1), ["connected", "Test provider 1.2 connected via direct"]);
  assert.deepEqual(harness.saveStatuses.at(-1), ["AI provider connection works", "saved"]);
  assert.ok(harness.calls.some(([name, visible]) => name === "helpVisible" && visible === false));
});

test("OPUS-CAT discovery persists the discovered base URL and refreshes administration presentation", async () => {
  const { createAiProviderAdministrationOperationsController } = await loadFactory();
  const harness = createHarness(createAiProviderAdministrationOperationsController, {
    providerId: "opus-cat",
    baseUrl: "http://localhost:8500",
    connectionResult: {
      provider: "OPUS-CAT",
      baseUrl: "http://localhost:8501",
      autoDiscovered: true
    }
  });
  await harness.controller.testConnection();
  assert.equal(harness.settings.baseUrl, "http://localhost:8501");
  for (const expected of ["setBaseUrl", "renderPresets", "renderProvider", "renderPrompt"]) {
    assert.ok(
      harness.calls.some(([name]) => name === expected),
      `${expected} should run`
    );
  }
  assert.deepEqual(harness.saveStatuses.at(-1), [
    "OPUS-CAT connection found and saved at http://localhost:8501",
    "saved"
  ]);
});

test("connection failure auto-starts LM Studio once and retries the same provider config", async () => {
  const { createAiProviderAdministrationOperationsController } = await loadFactory();
  const harness = createHarness(createAiProviderAdministrationOperationsController, {
    providerId: "openai-compatible",
    connectionErrors: [new Error("connection refused")]
  });
  await harness.controller.testConnection();
  assert.equal(harness.calls.filter(([name]) => name === "testConnection").length, 2);
  assert.ok(harness.calls.some(([name]) => name === "startServer"));
  assert.deepEqual(harness.saveStatuses.at(-1), ["LM Studio server started; AI provider connection works", "saved"]);
  const failedStart = createHarness(createAiProviderAdministrationOperationsController, {
    providerId: "openai-compatible",
    connectionErrors: [new Error("connection refused")],
    startResult: { ok: false, message: "server start unavailable" }
  });
  await failedStart.controller.testConnection();
  assert.deepEqual(failedStart.saveStatuses.at(-1), ["server start unavailable", "dirty"]);
});

test("OPUS-CAT terminal connection failure opens setup help while other failures remain inline", async () => {
  const { createAiProviderAdministrationOperationsController } = await loadFactory();
  const harness = createHarness(createAiProviderAdministrationOperationsController, {
    providerId: "opus-cat",
    connectionErrors: [new Error("provider unavailable")]
  });
  await harness.controller.testConnection();
  assert.ok(harness.calls.some(([name]) => name === "helpOpen"));
  assert.deepEqual(harness.saveStatuses.at(-1), ["provider unavailable", "dirty"]);
});

test("model refresh replaces model state and preserves installed, pullable, and manual-model statuses", async () => {
  const { createAiProviderAdministrationOperationsController } = await loadFactory();
  const installed = createHarness(createAiProviderAdministrationOperationsController, {
    models: [{ name: "model-a" }]
  });
  await installed.controller.refreshModels();
  assert.equal(installed.models().length, 1);
  assert.deepEqual(installed.saveStatuses.at(-1), ["AI models refreshed", "saved"]);
  const pullable = createHarness(createAiProviderAdministrationOperationsController, {
    model: "missing",
    models: []
  });
  await pullable.controller.refreshModels();
  assert.match(pullable.saveStatuses.at(-1)[0], /not installed/);
  const manual = createHarness(createAiProviderAdministrationOperationsController, {
    model: "missing",
    models: [],
    canPull: false
  });
  await manual.controller.refreshModels();
  assert.match(manual.saveStatuses.at(-1)[0], /was not returned/);
  const failed = createHarness(createAiProviderAdministrationOperationsController, {
    listError: new Error("model listing unavailable")
  });
  await failed.controller.refreshModels();
  assert.deepEqual(failed.connectionStatuses.at(-1), ["error", "model listing unavailable"]);
  assert.deepEqual(failed.saveStatuses.at(-1), ["model listing unavailable", "dirty"]);
});

test("model pull reports progress, refreshes models, and preserves unsupported-provider behavior", async () => {
  const { createAiProviderAdministrationOperationsController } = await loadFactory();
  const harness = createHarness(createAiProviderAdministrationOperationsController, {
    formModel: "pulled-model",
    models: [{ name: "pulled-model" }]
  });
  await harness.controller.pullModel();
  assert.ok(harness.calls.some(([name, , model]) => name === "pullModel" && model === "pulled-model"));
  assert.ok(harness.connectionStatuses.some(([, message]) => message.includes("downloading")));
  assert.deepEqual(harness.saveStatuses.at(-1), ["pulled-model pulled", "saved"]);
  const unsupported = createHarness(createAiProviderAdministrationOperationsController, { noPull: true });
  await unsupported.controller.pullModel();
  assert.deepEqual(unsupported.saveStatuses.at(-1), ["Model pull is available for Ollama in this build.", "dirty"]);
  const failed = createHarness(createAiProviderAdministrationOperationsController, {
    formModel: "failed-model",
    pullError: new Error("model pull unavailable")
  });
  await failed.controller.pullModel();
  assert.deepEqual(failed.connectionStatuses.at(-1), ["error", "model pull unavailable"]);
  assert.deepEqual(failed.saveStatuses.at(-1), ["model pull unavailable", "dirty"]);
});
