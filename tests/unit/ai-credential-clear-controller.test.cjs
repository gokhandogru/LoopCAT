const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-credential-clear-controller.js")).href);
}

function createHarness(createAiCredentialClearController, overrides = {}) {
  const calls = [];
  const localSettings = overrides.localSettings || { providerId: "ollama", baseUrl: "http://localhost:11434" };
  const dependencies = {
    settings: {
      readLocal() {
        calls.push(["read-local"]);
        return localSettings;
      }
    },
    credentials: {
      saveOpenAi(value, remember) {
        calls.push(["save-openai", value, remember]);
      },
      saveLocal(value, remember, settings) {
        calls.push(["save-local", value, remember, settings]);
      }
    },
    redaction: {
      sanitize(value) {
        calls.push(["redact", value]);
        return `safe:${value}`;
      }
    },
    presentation: {
      clearOpenSecret() {
        calls.push(["clear-open-secret"]);
      },
      renderOpenStatus(value) {
        calls.push(["open-status", value]);
      },
      clearLocalSecret() {
        calls.push(["clear-local-secret"]);
      },
      renderLocalStatus(kind, value) {
        calls.push(["local-status", kind, value]);
      }
    }
  };
  for (const [owner, values] of Object.entries(overrides.dependencies || {})) {
    dependencies[owner] = { ...dependencies[owner], ...values };
  }
  const controller = createAiCredentialClearController(dependencies);
  return { calls, controller, dependencies, localSettings };
}

test("AiCredentialClearController preserves the exact OpenAI success sequence and immutable API", async () => {
  const { createAiCredentialClearController } = await loadFactory();
  const { calls, controller } = createHarness(createAiCredentialClearController);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(controller.clearOpenAi(), true);
  assert.deepEqual(calls, [
    ["save-openai", "", false],
    ["clear-open-secret"],
    [
      "open-status",
      "OpenAI key: Not saved. API keys stay in this browser and are never exported with project packages."
    ]
  ]);
});

test("AiCredentialClearController redacts OpenAI storage failures and returns false", async () => {
  const { createAiCredentialClearController } = await loadFactory();
  const storageError = new Error("");
  const { calls, controller } = createHarness(createAiCredentialClearController, {
    dependencies: {
      credentials: {
        saveOpenAi(value, remember) {
          calls.push(["save-openai", value, remember]);
          throw storageError;
        }
      }
    }
  });
  assert.equal(controller.clearOpenAi(), false);
  assert.deepEqual(calls, [
    ["save-openai", "", false],
    ["redact", "OpenAI key could not be cleared."],
    ["open-status", "safe:OpenAI key could not be cleared."]
  ]);
});

test("AiCredentialClearController preserves absent optional OpenAI presentation branches", async () => {
  const { createAiCredentialClearController } = await loadFactory();
  const success = createHarness(createAiCredentialClearController, {
    dependencies: {
      presentation: { clearOpenSecret: undefined, renderOpenStatus: undefined }
    }
  });
  assert.equal(success.controller.clearOpenAi(), true);
  assert.deepEqual(success.calls, [["save-openai", "", false]]);

  const failure = createHarness(createAiCredentialClearController, {
    dependencies: {
      credentials: {
        saveOpenAi() {
          throw new Error("secret failure");
        }
      },
      presentation: { renderOpenStatus: undefined }
    }
  });
  assert.equal(failure.controller.clearOpenAi(), false);
  assert.equal(
    failure.calls.some(([name]) => name === "redact"),
    false
  );
});

test("AiCredentialClearController preserves settings-first local credential clearing", async () => {
  const { createAiCredentialClearController } = await loadFactory();
  const { calls, controller, localSettings } = createHarness(createAiCredentialClearController);
  assert.equal(controller.clearLocal(), true);
  assert.deepEqual(calls, [
    ["read-local"],
    ["save-local", "", false, localSettings],
    ["clear-local-secret"],
    ["local-status", "disconnected", "Local AI key cleared for this provider"]
  ]);
});

test("AiCredentialClearController redacts local storage failures and preserves live settings identity", async () => {
  const { createAiCredentialClearController } = await loadFactory();
  const storageError = new Error("provider token failed");
  const { calls, controller, localSettings } = createHarness(createAiCredentialClearController, {
    dependencies: {
      credentials: {
        saveLocal(value, remember, settings) {
          calls.push(["save-local", value, remember, settings]);
          throw storageError;
        }
      }
    }
  });
  assert.equal(controller.clearLocal(), false);
  assert.deepEqual(calls, [
    ["read-local"],
    ["save-local", "", false, localSettings],
    ["redact", "provider token failed"],
    ["local-status", "error", "safe:provider token failed"]
  ]);
});

test("AiCredentialClearController preserves primary and downstream failure timing", async () => {
  const { createAiCredentialClearController } = await loadFactory();
  const settingsError = new Error("settings failed");
  const settingsFailure = createHarness(createAiCredentialClearController, {
    dependencies: {
      settings: {
        readLocal() {
          throw settingsError;
        }
      }
    }
  });
  assert.throws(
    () => settingsFailure.controller.clearLocal(),
    (error) => error === settingsError
  );
  assert.deepEqual(settingsFailure.calls, []);

  const nonErrorFailure = createHarness(createAiCredentialClearController, {
    dependencies: {
      credentials: {
        saveOpenAi() {
          throw null;
        }
      }
    }
  });
  assert.throws(() => nonErrorFailure.controller.clearOpenAi(), TypeError);

  for (const [method, dependencies, expected] of [
    [
      "clearOpenAi",
      {
        presentation: {
          clearOpenSecret() {
            throw new Error("open secret failed");
          }
        }
      },
      "open secret failed"
    ],
    [
      "clearOpenAi",
      {
        presentation: {
          renderOpenStatus() {
            throw new Error("open status failed");
          }
        }
      },
      "open status failed"
    ],
    [
      "clearLocal",
      {
        presentation: {
          clearLocalSecret() {
            throw new Error("local secret failed");
          }
        }
      },
      "local secret failed"
    ],
    [
      "clearLocal",
      {
        presentation: {
          renderLocalStatus() {
            throw new Error("local status failed");
          }
        }
      },
      "local status failed"
    ]
  ]) {
    const harness = createHarness(createAiCredentialClearController, { dependencies });
    assert.throws(() => harness.controller[method](), new RegExp(expected));
  }
});

test("AiCredentialClearController validates every injected boundary", async () => {
  const { createAiCredentialClearController } = await loadFactory();
  const valid = {
    settings: { readLocal: () => ({}) },
    credentials: { saveOpenAi: () => {}, saveLocal: () => {} },
    redaction: { sanitize: (value) => value },
    presentation: { renderLocalStatus: () => {} }
  };
  for (const value of [
    undefined,
    null,
    {},
    { ...valid, settings: null },
    { ...valid, credentials: { ...valid.credentials, saveOpenAi: null } },
    { ...valid, credentials: { ...valid.credentials, saveLocal: null } },
    { ...valid, redaction: null },
    { ...valid, presentation: null },
    { ...valid, presentation: { renderLocalStatus: null } },
    { ...valid, presentation: { renderLocalStatus: () => {}, clearOpenSecret: true } }
  ]) {
    assert.throws(
      () => createAiCredentialClearController(value),
      /checked settings, credential, redaction, and presentation boundaries/
    );
  }
});
