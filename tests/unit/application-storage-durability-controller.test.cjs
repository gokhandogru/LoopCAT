const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const LOW_SPACE_BYTES = 250 * 1024 * 1024;
const HIGH_USAGE_RATIO = 0.9;

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-storage-durability-controller.js")).href);
}

function createHarness(createApplicationStorageDurabilityController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "storage durability"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  let info =
    overrides.info ||
    Object.freeze({
      checked: false,
      supported: false,
      persisted: false,
      requested: false,
      usageBytes: 0,
      quotaBytes: 0
    });
  let api = Object.hasOwn(overrides, "api") ? overrides.api : null;
  const context = {
    get() {
      calls.push(["context.get", info]);
      fail("context.get");
      return info;
    },
    set(value) {
      calls.push(["context.set", value]);
      fail("context.set");
      info = value;
      return overrides.setResult;
    }
  };
  const storage = {
    getApi() {
      calls.push(["storage.getApi", api]);
      fail("storage.getApi");
      return api;
    }
  };
  const formatting = {
    fileSize(bytes) {
      calls.push(["formatting.fileSize", bytes]);
      fail("formatting.fileSize");
      if (overrides.fileSize) return overrides.fileSize(bytes);
      return bytes > 0 ? `${bytes} bytes` : "";
    }
  };
  const presentation = {
    renderWorkspaceStatus() {
      calls.push(["presentation.renderWorkspaceStatus"]);
      fail("presentation.renderWorkspaceStatus");
      return overrides.renderResult;
    }
  };
  const limits = {
    lowSpaceBytes: overrides.lowSpaceBytes ?? LOW_SPACE_BYTES,
    highUsageRatio: overrides.highUsageRatio ?? HIGH_USAGE_RATIO
  };
  const controller = createApplicationStorageDurabilityController({
    context,
    storage,
    formatting,
    presentation,
    limits
  });
  return {
    api,
    calls,
    context,
    controller,
    failure,
    formatting,
    getInfo: () => info,
    limits,
    presentation,
    setApi(value) {
      api = value;
    },
    setInfo(value) {
      info = value;
    },
    storage
  };
}

function createStorageApi(calls, options = {}) {
  const api = {};
  if (options.persisted !== "absent") {
    api.persisted = () => {
      calls.push(["api.persisted"]);
      if (options.persistedError) throw options.persistedError;
      return options.persisted;
    };
  }
  if (options.persist !== "absent") {
    api.persist = () => {
      calls.push(["api.persist"]);
      if (options.persistError) throw options.persistError;
      return options.persist;
    };
  }
  if (options.estimate !== "absent") {
    api.estimate = () => {
      calls.push(["api.estimate"]);
      if (options.estimateError) throw options.estimateError;
      return options.estimate;
    };
  }
  return api;
}

test("ApplicationStorageDurabilityController preserves live default state and immutable API", async () => {
  const { createApplicationStorageDurabilityController } = await loadFactory();
  const harness = createHarness(createApplicationStorageDurabilityController);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.deepEqual(harness.controller.warnings(), []);
  assert.equal(harness.controller.line(), "Storage: checking local persistence");
  const supported = {
    checked: true,
    supported: true,
    persisted: true,
    usageBytes: 0,
    quotaBytes: 0
  };
  harness.setInfo(supported);
  assert.deepEqual(harness.controller.warnings(), []);
  assert.equal(harness.controller.line(), "Storage: persistent");
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ["context.get", "context.get", "context.get", "context.get"]
  );
});

test("ApplicationStorageDurabilityController preserves every ordered warning threshold", async () => {
  const { createApplicationStorageDurabilityController } = await loadFactory();
  const { controller } = createHarness(createApplicationStorageDurabilityController);
  const base = {
    checked: true,
    supported: true,
    persisted: true,
    usageBytes: 100 * 1024 * 1024,
    quotaBytes: 1000 * 1024 * 1024
  };
  assert.deepEqual(controller.warnings({ ...base, checked: false }), []);
  assert.deepEqual(controller.warnings({ ...base, supported: false }), []);
  assert.deepEqual(controller.warnings({ ...base, persisted: false, quotaBytes: 0 }), [
    "Browser storage is best-effort; export project packages or connect a workspace folder for recovery."
  ]);
  assert.deepEqual(controller.warnings(base), []);
  assert.deepEqual(
    controller.warnings({
      ...base,
      usageBytes: base.quotaBytes - LOW_SPACE_BYTES
    }),
    ["Local storage is nearly full; export a backup before importing more files."]
  );
  assert.deepEqual(
    controller.warnings({
      ...base,
      usageBytes: String(900 * 1024 * 1024),
      quotaBytes: String(1000 * 1024 * 1024)
    }),
    ["Local storage is nearly full; export a backup before importing more files."]
  );
  assert.deepEqual(
    controller.warnings({
      ...base,
      persisted: false,
      usageBytes: 950 * 1024 * 1024
    }),
    [
      "Browser storage is best-effort; export project packages or connect a workspace folder for recovery.",
      "Local storage is nearly full; export a backup before importing more files."
    ]
  );
  assert.deepEqual(controller.warnings({ ...base, usageBytes: "invalid", quotaBytes: "invalid" }), []);
});

test("ApplicationStorageDurabilityController preserves every status line and size fallback", async () => {
  const { createApplicationStorageDurabilityController } = await loadFactory();
  const harness = createHarness(createApplicationStorageDurabilityController, {
    fileSize: (bytes) => (bytes === 0 ? "" : `size:${bytes}`)
  });
  assert.equal(harness.controller.formatSize(0), "0 B");
  assert.equal(harness.controller.formatSize(7), "size:7");
  assert.equal(harness.controller.line({ checked: false }), "Storage: checking local persistence");
  assert.equal(harness.controller.line({ checked: true, supported: false }), "Storage: browser-managed local cache");
  assert.equal(
    harness.controller.line({
      checked: true,
      supported: true,
      persisted: false,
      usageBytes: 0,
      quotaBytes: 0
    }),
    "Storage: best-effort"
  );
  assert.equal(
    harness.controller.line({
      checked: true,
      supported: true,
      persisted: true,
      usageBytes: "12",
      quotaBytes: "100"
    }),
    "Storage: persistent - size:12 of size:100 used"
  );
  assert.deepEqual(harness.calls, [
    ["formatting.fileSize", 0],
    ["formatting.fileSize", 7],
    ["formatting.fileSize", 12],
    ["formatting.fileSize", 100]
  ]);
});

test("ApplicationStorageDurabilityController publishes and renders the unsupported result", async () => {
  const { createApplicationStorageDurabilityController } = await loadFactory();
  const harness = createHarness(createApplicationStorageDurabilityController, { api: null });
  const result = await harness.controller.refresh();
  assert.deepEqual(result, {
    checked: true,
    supported: false,
    persisted: false,
    requested: false,
    usageBytes: 0,
    quotaBytes: 0
  });
  assert.equal(harness.getInfo(), result);
  assert.deepEqual(harness.calls, [
    ["storage.getApi", null],
    ["context.set", result],
    ["presentation.renderWorkspaceStatus"]
  ]);
});

test("ApplicationStorageDurabilityController preserves persisted storage and finite estimates", async () => {
  const { createApplicationStorageDurabilityController } = await loadFactory();
  const apiCalls = [];
  const api = createStorageApi(apiCalls, {
    persisted: 1,
    persist: true,
    estimate: { usage: "2048", quota: 8192 }
  });
  const harness = createHarness(createApplicationStorageDurabilityController, { api });
  const result = await harness.controller.refresh();
  assert.deepEqual(result, {
    checked: true,
    supported: true,
    persisted: true,
    requested: false,
    usageBytes: 2048,
    quotaBytes: 8192
  });
  assert.deepEqual(apiCalls, [["api.persisted"], ["api.estimate"]]);
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ["storage.getApi", "context.set", "presentation.renderWorkspaceStatus"]
  );
});

test("ApplicationStorageDurabilityController preserves persistence request and opt-out branches", async () => {
  const { createApplicationStorageDurabilityController } = await loadFactory();
  const requestedCalls = [];
  const requestedApi = createStorageApi(requestedCalls, {
    persisted: false,
    persist: "yes",
    estimate: "absent"
  });
  const requested = createHarness(createApplicationStorageDurabilityController, { api: requestedApi });
  assert.deepEqual(await requested.controller.refresh(), {
    checked: true,
    supported: true,
    persisted: true,
    requested: true,
    usageBytes: 0,
    quotaBytes: 0
  });
  assert.deepEqual(requestedCalls, [["api.persisted"], ["api.persist"]]);

  const optOutCalls = [];
  const optOutApi = createStorageApi(optOutCalls, {
    persisted: false,
    persist: true,
    estimate: "absent"
  });
  const optOut = createHarness(createApplicationStorageDurabilityController, { api: optOutApi });
  assert.deepEqual(await optOut.controller.refresh({ request: false }), {
    checked: true,
    supported: true,
    persisted: false,
    requested: false,
    usageBytes: 0,
    quotaBytes: 0
  });
  assert.deepEqual(optOutCalls, [["api.persisted"]]);

  const absentApi = {};
  const absent = createHarness(createApplicationStorageDurabilityController, { api: absentApi });
  assert.deepEqual(await absent.controller.refresh(), {
    checked: true,
    supported: true,
    persisted: false,
    requested: false,
    usageBytes: 0,
    quotaBytes: 0
  });
});

test("ApplicationStorageDurabilityController contains persistence and estimate failures independently", async () => {
  const { createApplicationStorageDurabilityController } = await loadFactory();
  const persistedFailure = new Error("persisted failed");
  const persistFailure = new Error("persist failed");
  const apiCalls = [];
  const api = createStorageApi(apiCalls, {
    persisted: false,
    persistedError: persistedFailure,
    persist: false,
    persistError: persistFailure,
    estimate: { usage: "12", quota: Number.POSITIVE_INFINITY }
  });
  const harness = createHarness(createApplicationStorageDurabilityController, { api });
  assert.deepEqual(await harness.controller.refresh(), {
    checked: true,
    supported: true,
    persisted: false,
    requested: true,
    usageBytes: 12,
    quotaBytes: 0
  });
  assert.deepEqual(apiCalls, [["api.persisted"], ["api.persist"], ["api.estimate"]]);

  const estimateCalls = [];
  const estimateApi = createStorageApi(estimateCalls, {
    persisted: true,
    persist: "absent",
    estimate: {},
    estimateError: new Error("estimate failed")
  });
  harness.setApi(estimateApi);
  assert.deepEqual(await harness.controller.refresh(), {
    checked: true,
    supported: true,
    persisted: true,
    requested: false,
    usageBytes: 0,
    quotaBytes: 0
  });
  assert.deepEqual(estimateCalls, [["api.persisted"], ["api.estimate"]]);
});

test("ApplicationStorageDurabilityController preserves live API and primary failure timing", async () => {
  const { createApplicationStorageDurabilityController } = await loadFactory();
  const getFailure = createHarness(createApplicationStorageDurabilityController, { failAt: "storage.getApi" });
  await assert.rejects(getFailure.controller.refresh(), (error) => error === getFailure.failure);
  assert.deepEqual(
    getFailure.calls.map(([name]) => name),
    ["storage.getApi"]
  );

  const setFailure = createHarness(createApplicationStorageDurabilityController, {
    api: null,
    failAt: "context.set"
  });
  await assert.rejects(setFailure.controller.refresh(), (error) => error === setFailure.failure);
  assert.deepEqual(
    setFailure.calls.map(([name]) => name),
    ["storage.getApi", "context.set"]
  );

  const renderFailure = createHarness(createApplicationStorageDurabilityController, {
    api: null,
    failAt: "presentation.renderWorkspaceStatus"
  });
  await assert.rejects(renderFailure.controller.refresh(), (error) => error === renderFailure.failure);
  assert.equal(renderFailure.getInfo().checked, true);
  assert.deepEqual(
    renderFailure.calls.map(([name]) => name),
    ["storage.getApi", "context.set", "presentation.renderWorkspaceStatus"]
  );

  const live = createHarness(createApplicationStorageDurabilityController, { api: null });
  await live.controller.refresh();
  const apiCalls = [];
  live.setApi(
    createStorageApi(apiCalls, {
      persisted: true,
      persist: "absent",
      estimate: "absent"
    })
  );
  assert.equal((await live.controller.refresh()).supported, true);
  assert.deepEqual(apiCalls, [["api.persisted"]]);
  await assert.rejects(live.controller.refresh(null), TypeError);
});

test("ApplicationStorageDurabilityController preserves storage property failure boundaries", async () => {
  const { createApplicationStorageDurabilityController } = await loadFactory();
  const persistedGetterApi = {};
  Object.defineProperty(persistedGetterApi, "persisted", {
    get() {
      throw new Error("persisted getter failed");
    }
  });
  const persistedGetter = createHarness(createApplicationStorageDurabilityController, {
    api: persistedGetterApi
  });
  assert.deepEqual(await persistedGetter.controller.refresh({ request: false }), {
    checked: true,
    supported: true,
    persisted: false,
    requested: false,
    usageBytes: 0,
    quotaBytes: 0
  });

  const persistFailure = new Error("persist getter failed");
  const persistGetterApi = {
    persisted() {
      return false;
    }
  };
  Object.defineProperty(persistGetterApi, "persist", {
    get() {
      throw persistFailure;
    }
  });
  const persistGetter = createHarness(createApplicationStorageDurabilityController, { api: persistGetterApi });
  await assert.rejects(persistGetter.controller.refresh(), (error) => error === persistFailure);
  assert.deepEqual(
    persistGetter.calls.map(([name]) => name),
    ["storage.getApi"]
  );

  const estimateGetterApi = {
    persisted() {
      return true;
    }
  };
  Object.defineProperty(estimateGetterApi, "estimate", {
    get() {
      throw new Error("estimate getter failed");
    }
  });
  const estimateGetter = createHarness(createApplicationStorageDurabilityController, { api: estimateGetterApi });
  assert.equal((await estimateGetter.controller.refresh()).persisted, true);
  assert.equal(estimateGetter.getInfo().usageBytes, 0);
});

test("ApplicationStorageDurabilityController validates every injected owner", async () => {
  const { createApplicationStorageDurabilityController } = await loadFactory();
  const valid = {
    context: { get() {}, set() {} },
    storage: { getApi() {} },
    formatting: { fileSize() {} },
    presentation: { renderWorkspaceStatus() {} },
    limits: { lowSpaceBytes: LOW_SPACE_BYTES, highUsageRatio: HIGH_USAGE_RATIO }
  };
  for (const [key, value, message] of [
    ["context", null, "checked live context boundary"],
    ["context", { get() {} }, "checked live context boundary"],
    ["storage", null, "checked storage API boundary"],
    ["formatting", null, "checked file-size boundary"],
    ["presentation", null, "checked presentation boundary"],
    ["limits", null, "checked storage-warning limits"],
    ["limits", { lowSpaceBytes: LOW_SPACE_BYTES, highUsageRatio: Number.NaN }, "checked storage-warning limits"]
  ]) {
    assert.throws(() => createApplicationStorageDurabilityController({ ...valid, [key]: value }), new RegExp(message));
  }
});
