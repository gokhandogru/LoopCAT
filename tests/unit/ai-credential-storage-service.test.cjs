const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadModule() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-credential-storage-service.js")).href);
}

function createMemoryStorage(initial = {}, failures = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      const error = failures.read?.(key);
      if (error) throw error;
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      const error = failures.write?.(key, value);
      if (error) throw error;
      values.set(key, String(value));
    },
    removeItem(key) {
      const error = failures.clear?.(key);
      if (error) throw error;
      values.delete(key);
    }
  };
}

function createHarness(createService, overrides = {}) {
  const local = overrides.localStorage || createMemoryStorage(overrides.localValues);
  const session = overrides.sessionStorage || createMemoryStorage(overrides.sessionValues);
  const warnings = [];
  const normalizeCalls = [];
  const formSettings = overrides.formSettings || {
    providerId: "deepseek",
    baseUrl: "https://api.deepseek.example/"
  };
  const service = createService({
    storage: {
      get(kind) {
        if (overrides.accessError?.[kind]) throw overrides.accessError[kind];
        return kind === "local" ? local : session;
      }
    },
    settings: {
      readLocal: () => formSettings,
      normalizeLocal: (settings) => ({ ...settings }),
      normalizeProviderBaseUrl(providerId, baseUrl) {
        normalizeCalls.push([providerId, baseUrl]);
        return String(baseUrl).replace(/\/+$/, "").toLowerCase();
      }
    },
    defaults: {
      ollamaBaseUrl: "http://127.0.0.1:11434",
      openAiBaseUrl: "https://api.openai.com/v1"
    },
    failures: {
      beforeOpenAiSave: () => overrides.forcedOpenAiFailure || false
    },
    logger: { warn: (...details) => warnings.push(details) }
  });
  return { formSettings, local, normalizeCalls, service, session, warnings };
}

test("AI credential storage preserves exact key constants and provider/base scoped normalization", async () => {
  const { AI_CREDENTIAL_STORAGE_KEYS, createAiCredentialStorageService } = await loadModule();
  assert.deepEqual(AI_CREDENTIAL_STORAGE_KEYS, {
    openAi: "loopcat.openai.apiKey",
    localAiLegacy: "loopcat.localAi.apiKey"
  });
  const harness = createHarness(createAiCredentialStorageService);
  assert.equal(harness.service.localAiStorageKey(), "loopcat.localAi.apiKey:deepseek:https://api.deepseek.example");
  assert.deepEqual(harness.normalizeCalls, [["deepseek", "https://api.deepseek.example/"]]);
  assert.equal(
    harness.service.localAiStorageKey({ provider: "ollama", baseUrl: "" }),
    "loopcat.localAi.apiKey:ollama:http://127.0.0.1:11434"
  );
  assert.equal(
    harness.service.localAiStorageKey({ providerId: "gemini", baseUrl: "" }),
    "loopcat.localAi.apiKey:gemini:https://api.openai.com/v1"
  );
});

test("OpenAI credential storage preserves session precedence, labels, remember routing, and blank clearing", async () => {
  const { AI_CREDENTIAL_STORAGE_KEYS, createAiCredentialStorageService } = await loadModule();
  const key = AI_CREDENTIAL_STORAGE_KEYS.openAi;
  const harness = createHarness(createAiCredentialStorageService, {
    localValues: { [key]: "local-key" },
    sessionValues: { [key]: "session-key" }
  });
  assert.equal(harness.service.storedOpenAiKey(), "session-key");
  assert.equal(harness.service.openAiStorageLabel(), "Saved in this browser");
  harness.service.saveOpenAiKey(" remembered ", true);
  assert.equal(harness.local.values.get(key), "remembered");
  assert.equal(harness.session.values.has(key), false);
  harness.service.saveOpenAiKey("tab-only", false);
  assert.equal(harness.local.values.has(key), false);
  assert.equal(harness.session.values.get(key), "tab-only");
  assert.equal(harness.service.openAiStorageLabel(), "Saved for this tab");
  harness.service.saveOpenAiKey(" ", false);
  assert.equal(harness.service.storedOpenAiKey(), "");
  assert.equal(harness.service.openAiStorageLabel(), "Not saved");
});

test("OpenAI credential storage restores the exact snapshot after forced or browser write failure", async () => {
  const { AI_CREDENTIAL_STORAGE_KEYS, createAiCredentialStorageService } = await loadModule();
  const key = AI_CREDENTIAL_STORAGE_KEYS.openAi;
  const forced = createHarness(createAiCredentialStorageService, {
    localValues: { [key]: "existing" },
    forcedOpenAiFailure: "forced failure"
  });
  assert.throws(() => forced.service.saveOpenAiKey("replacement", false), /forced failure/);
  assert.deepEqual(forced.service.openAiSnapshot(), { local: "existing", session: null });

  const writeError = new Error("write blocked");
  const local = createMemoryStorage({ [key]: "existing" });
  const session = createMemoryStorage(
    {},
    {
      write: (_key, value) => (value === "replacement" ? writeError : null)
    }
  );
  const blocked = createHarness(createAiCredentialStorageService, {
    localStorage: local,
    sessionStorage: session
  });
  assert.throws(() => blocked.service.saveOpenAiKey("replacement", false), /OpenAI key could not be saved/);
  assert.deepEqual(blocked.service.openAiSnapshot(), { local: "existing", session: null });
  assert.deepEqual(blocked.warnings, [["OpenAI session key storage write failed.", writeError]]);
});

test("AI credential storage contains unavailable and throwing storage with exact warnings", async () => {
  const { AI_CREDENTIAL_STORAGE_KEYS, createAiCredentialStorageService } = await loadModule();
  const accessError = new Error("storage unavailable");
  const unavailable = createHarness(createAiCredentialStorageService, {
    accessError: { local: accessError }
  });
  assert.deepEqual(unavailable.service.openAiSnapshot(), { local: null, session: null });
  assert.equal(unavailable.service.localAiSnapshot().local, null);
  assert.deepEqual(unavailable.warnings.slice(0, 2), [
    ["OpenAI local key storage is unavailable.", accessError],
    ["Local AI local key storage is unavailable.", accessError]
  ]);

  const readError = new Error("read blocked");
  const clearError = new Error("clear blocked");
  const local = createMemoryStorage(
    {},
    {
      read: (key) => (key === AI_CREDENTIAL_STORAGE_KEYS.openAi ? readError : null),
      clear: (key) => (key === AI_CREDENTIAL_STORAGE_KEYS.openAi ? clearError : null)
    }
  );
  const throwing = createHarness(createAiCredentialStorageService, { localStorage: local });
  assert.equal(throwing.service.openAiSnapshot().local, null);
  assert.equal(throwing.service.safeRestoreOpenAiSnapshot({ local: null, session: null }), false);
  assert.deepEqual(throwing.warnings.slice(0, 2), [
    ["OpenAI local key storage read failed.", readError],
    ["OpenAI local key storage clear failed.", clearError]
  ]);
  assert.equal(throwing.warnings[2][0], "OpenAI key storage restore failed.");
  assert.ok(throwing.warnings[2][1] instanceof Error);
});

test("local AI credential storage preserves scoped precedence, legacy cleanup, labels, and blank clearing", async () => {
  const { AI_CREDENTIAL_STORAGE_KEYS, createAiCredentialStorageService } = await loadModule();
  const scoped = "loopcat.localAi.apiKey:deepseek:https://api.deepseek.example";
  const legacy = AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy;
  const harness = createHarness(createAiCredentialStorageService, {
    localValues: { [scoped]: "local-provider", [legacy]: "legacy-local" },
    sessionValues: { [scoped]: "session-provider", [legacy]: "legacy-session" }
  });
  assert.equal(harness.service.storedLocalAiKey(), "session-provider");
  assert.equal(harness.service.localAiStorageLabel(), "Saved in this browser for this provider");
  assert.deepEqual(harness.service.localAiSnapshot(), {
    key: scoped,
    local: "local-provider",
    session: "session-provider",
    legacyLocal: "legacy-local",
    legacySession: "legacy-session"
  });
  harness.service.saveLocalAiKey("tab-key", false);
  assert.equal(harness.local.values.has(scoped), false);
  assert.equal(harness.session.values.get(scoped), "tab-key");
  assert.equal(harness.local.values.has(legacy), false);
  assert.equal(harness.session.values.has(legacy), false);
  assert.equal(harness.service.localAiStorageLabel(), "Saved for this tab and provider");
  harness.service.saveLocalAiKey("", false);
  assert.equal(harness.service.storedLocalAiKey(), "");
  assert.equal(harness.service.localAiStorageLabel(), "Not saved");
});

test("local AI credential storage restores scoped and legacy records after primary failure", async () => {
  const { AI_CREDENTIAL_STORAGE_KEYS, createAiCredentialStorageService } = await loadModule();
  const scoped = "loopcat.localAi.apiKey:deepseek:https://api.deepseek.example";
  const legacy = AI_CREDENTIAL_STORAGE_KEYS.localAiLegacy;
  const writeError = new Error("provider write blocked");
  const local = createMemoryStorage({ [scoped]: "old-local", [legacy]: "legacy-local" });
  const session = createMemoryStorage(
    { [legacy]: "legacy-session" },
    {
      write: (key, value) => (key === scoped && value === "new-key" ? writeError : null)
    }
  );
  const harness = createHarness(createAiCredentialStorageService, {
    localStorage: local,
    sessionStorage: session
  });
  assert.throws(() => harness.service.saveLocalAiKey("new-key", false), /Local AI key could not be saved/);
  assert.deepEqual(harness.service.localAiSnapshot(), {
    key: scoped,
    local: "old-local",
    session: null,
    legacyLocal: "legacy-local",
    legacySession: "legacy-session"
  });
  assert.deepEqual(harness.warnings, [["Local AI session key storage write failed.", writeError]]);
});

test("AI credential storage safe local restoration preserves failure result and warning copy", async () => {
  const { createAiCredentialStorageService } = await loadModule();
  const clearError = new Error("cannot clear");
  const local = createMemoryStorage({}, { clear: () => clearError });
  const harness = createHarness(createAiCredentialStorageService, { localStorage: local });
  assert.equal(
    harness.service.safeRestoreLocalAiSnapshot({
      key: "scoped",
      local: null,
      session: null,
      legacyLocal: null,
      legacySession: null
    }),
    false
  );
  assert.equal(harness.warnings.at(-1)[0], "Local AI key storage restore failed.");
});
