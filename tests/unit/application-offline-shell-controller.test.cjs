const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-offline-shell-controller.js")).href);
}

async function drain() {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function createHarness(createApplicationOfflineShellController, overrides = {}) {
  const calls = [];
  const statuses = [];
  const location = { protocol: overrides.protocol || "https:" };
  const response = {
    clone() {
      calls.push(["cloneResponse"]);
      return { cloned: true };
    }
  };
  const cachedAssets = new Set(overrides.cachedAssets || ["./app.js"]);
  const cache = {
    match(asset) {
      calls.push(["cacheMatch", asset]);
      if (overrides.matchErrorAsset === asset) return Promise.reject(overrides.matchError);
      return Promise.resolve(cachedAssets.has(asset) ? { cached: asset } : null);
    },
    put(asset, value) {
      calls.push(["cachePut", asset, value]);
      if (overrides.putErrorAsset === asset) return Promise.reject(overrides.putError);
      return Promise.resolve();
    }
  };
  const cacheStorage = {
    keys() {
      calls.push(["cacheKeys"]);
      if (overrides.keysError) return Promise.reject(overrides.keysError);
      return Promise.resolve(overrides.cacheNames || ["unrelated", "loopcat-offline-v3", "loopcat-offline-v2"]);
    },
    open(name) {
      calls.push(["cacheOpen", name]);
      if (overrides.openError) return Promise.reject(overrides.openError);
      return Promise.resolve(cache);
    }
  };
  let controllerChangeListener = null;
  const registrations = overrides.registrations || [
    { unregister: () => (calls.push(["unregister", 0]), Promise.resolve(true)) },
    { unregister: () => (calls.push(["unregister", 1]), Promise.resolve(false)) }
  ];
  const serviceWorker = {
    ready:
      overrides.ready === undefined ? Promise.resolve({ registration: "ready" }) : Promise.resolve(overrides.ready),
    controller: overrides.controller === undefined ? { active: true } : overrides.controller,
    addEventListener(type, listener, options) {
      calls.push(["serviceWorkerAdd", type, options]);
      controllerChangeListener = listener;
    },
    getRegistrations() {
      calls.push(["getRegistrations"]);
      if (overrides.registrationListError) return Promise.reject(overrides.registrationListError);
      return Promise.resolve(registrations);
    }
  };
  if (overrides.noGetRegistrations) serviceWorker.getRegistrations = undefined;

  const elements = {
    banner: overrides.noBanner
      ? null
      : {
          classList: {
            toggle(name, hidden) {
              calls.push(["toggleBanner", name, hidden]);
            }
          }
        },
    title: { textContent: "" },
    message: { textContent: "" },
    reloadButton: { disabled: false, textContent: "" },
    deferButton: { disabled: false }
  };
  let updateOptions = null;
  const activateResult = overrides.activateResult || { activated: true };
  const deferResult = overrides.deferResult || { deferred: true };
  const updateController = {
    initialize(scriptUrl) {
      calls.push(["initialize", scriptUrl]);
      if (overrides.initializeError) return Promise.reject(overrides.initializeError);
      return Promise.resolve({ scope: "./" });
    },
    activate() {
      calls.push(["activate"]);
      return activateResult;
    },
    defer() {
      calls.push(["defer"]);
      return deferResult;
    }
  };
  const options = {
    browser: {
      hasServiceWorker() {
        calls.push(["hasServiceWorker"]);
        return overrides.hasServiceWorker !== false;
      },
      getServiceWorker() {
        calls.push(["getServiceWorker"]);
        return serviceWorker;
      },
      hasCacheStorage() {
        calls.push(["hasCacheStorage"]);
        return overrides.hasCacheStorage !== false;
      },
      getCacheStorage() {
        calls.push(["getCacheStorage"]);
        return cacheStorage;
      },
      fetchAsset(asset) {
        calls.push(["fetchAsset", asset]);
        if (overrides.fetchErrorAsset === asset) return Promise.reject(overrides.fetchError);
        return Promise.resolve(overrides.absentResponseAsset === asset ? null : response);
      },
      location,
      setTimeout(callback, timeoutMs) {
        calls.push(["setTimeout", timeoutMs]);
        if (overrides.fireTimeouts) callback();
        return { timeoutMs };
      }
    },
    updates: {
      create(nextOptions) {
        calls.push(["createUpdate"]);
        updateOptions = nextOptions;
        if (overrides.createError) throw overrides.createError;
        return overrides.noUpdateController ? undefined : updateController;
      },
      trustScriptUrl: (value) => `trusted:${value}`
    },
    assets: {
      cachePrefix: "loopcat-offline-",
      warmup: overrides.warmup || ["./app.js", "./styles.css"]
    },
    persistence: {
      flush() {
        calls.push(["flush"]);
        if (overrides.flushError) return Promise.reject(overrides.flushError);
        return Promise.resolve();
      },
      shouldSaveRecovery() {
        calls.push(["shouldSaveRecovery"]);
        if (overrides.recoveryCheckError) throw overrides.recoveryCheckError;
        return overrides.shouldSaveRecovery === true;
      },
      saveRecovery() {
        calls.push(["saveRecovery"]);
        if (overrides.recoveryError) return Promise.reject(overrides.recoveryError);
        return Promise.resolve();
      }
    },
    presentation: {
      elements,
      localize(value) {
        calls.push(["localize", value]);
        return `[${value}]`;
      },
      setStatus(message, mode) {
        statuses.push([message, mode]);
      }
    },
    logger: {
      warn(...values) {
        calls.push(["warn", ...values]);
      }
    }
  };
  const controller = createApplicationOfflineShellController(options);
  return {
    calls,
    cache,
    controller,
    controllerChange() {
      serviceWorker.controller = { active: "changed" };
      controllerChangeListener?.();
    },
    elements,
    location,
    options,
    serviceWorker,
    statuses,
    updateOptions: () => updateOptions,
    updateController
  };
}

test("ApplicationOfflineShellController preserves unsupported and non-web registration guards with immutable no-op actions", async () => {
  const { createApplicationOfflineShellController } = await loadFactory();
  const unsupported = createHarness(createApplicationOfflineShellController, { hasServiceWorker: false });
  assert.equal(Object.isFrozen(unsupported.controller), true);
  assert.equal(unsupported.controller.activate(), undefined);
  assert.equal(unsupported.controller.defer(), undefined);
  assert.equal(unsupported.controller.register(), undefined);
  assert.deepEqual(unsupported.calls, [["hasServiceWorker"]]);

  for (const protocol of ["file:", "ftp:", "data:"]) {
    const harness = createHarness(createApplicationOfflineShellController, { protocol });
    assert.equal(harness.controller.register(), undefined);
    assert.equal(
      harness.calls.some(([name]) => name === "createUpdate"),
      false
    );
    assert.deepEqual(harness.calls.slice(0, 2), [["hasServiceWorker"], ["getServiceWorker"]]);
  }
});

test("ApplicationOfflineShellController preserves desktop service-worker cleanup and warning containment", async () => {
  const { createApplicationOfflineShellController } = await loadFactory();
  const success = createHarness(createApplicationOfflineShellController, { protocol: "loopcat:" });
  assert.equal(success.controller.register(), undefined);
  await drain();
  assert.deepEqual(
    success.calls.filter(([name]) => ["getRegistrations", "unregister"].includes(name)),
    [["getRegistrations"], ["unregister", 0], ["unregister", 1]]
  );
  assert.equal(
    success.calls.some(([name]) => name === "createUpdate"),
    false
  );

  const cleanupError = new Error("cleanup unavailable");
  const failure = createHarness(createApplicationOfflineShellController, {
    protocol: "loopcat:",
    registrationListError: cleanupError
  });
  failure.controller.register();
  await drain();
  assert.deepEqual(
    failure.calls.find(([name]) => name === "warn"),
    ["warn", "Desktop service worker cleanup failed.", cleanupError]
  );
});

test("ApplicationOfflineShellController composes one update controller and preserves late actions and activation persistence", async () => {
  const { createApplicationOfflineShellController } = await loadFactory();
  const harness = createHarness(createApplicationOfflineShellController, { shouldSaveRecovery: true });
  assert.equal(harness.controller.register(), undefined);
  const updateOptions = harness.updateOptions();
  assert.equal(updateOptions.serviceWorker, harness.serviceWorker);
  assert.equal(updateOptions.location, harness.location);
  assert.equal(updateOptions.trustScriptUrl, harness.options.updates.trustScriptUrl);
  assert.deepEqual(
    harness.calls.filter(([name]) => ["createUpdate", "initialize"].includes(name)),
    [["createUpdate"], ["initialize", "./service-worker.js"]]
  );
  assert.equal(harness.controller.activate(), harness.controller.activate());
  assert.equal(harness.controller.defer(), harness.controller.defer());
  assert.equal(harness.calls.filter(([name]) => name === "activate").length, 2);
  assert.equal(harness.calls.filter(([name]) => name === "defer").length, 2);

  await drain();
  harness.calls.length = 0;
  await updateOptions.beforeActivate();
  assert.deepEqual(harness.calls, [["flush"], ["shouldSaveRecovery"], ["saveRecovery"]]);
  const failure = new Error("update failed");
  updateOptions.onError(failure);
  updateOptions.onError(null);
  assert.deepEqual(harness.statuses, [
    ["update failed", "dirty"],
    ["Offline update failed; current version remains active", "dirty"]
  ]);

  const cleanWorkspace = createHarness(createApplicationOfflineShellController);
  cleanWorkspace.controller.register();
  await drain();
  cleanWorkspace.calls.length = 0;
  await cleanWorkspace.updateOptions().beforeActivate();
  assert.deepEqual(cleanWorkspace.calls, [["flush"], ["shouldSaveRecovery"]]);
});

test("ApplicationOfflineShellController preserves exact update-banner state copy and busy policy", async () => {
  const { createApplicationOfflineShellController } = await loadFactory();
  const harness = createHarness(createApplicationOfflineShellController);
  harness.controller.register();
  const render = harness.updateOptions().onStateChange;

  render(null);
  render({ state: "deferred" });
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "toggleBanner"),
    [
      ["toggleBanner", "hidden", true],
      ["toggleBanner", "hidden", true]
    ]
  );

  const cases = [
    [
      "ready",
      "Update ready",
      "Reload when convenient. LoopCAT will save pending local work first.",
      false,
      "Reload now"
    ],
    [
      "saving",
      "Saving before update",
      "Pending segment and workspace changes are being saved locally.",
      true,
      "Reload now"
    ],
    [
      "activating",
      "Applying update",
      "The new offline app shell is ready. LoopCAT will reload shortly.",
      true,
      "Reload now"
    ],
    ["reloading", "Reloading LoopCAT", "Your saved project and workspace state will be restored.", true, "Reload now"],
    ["error", "Update paused", "specific failure", false, "Try again"],
    [
      "unknown",
      "Update ready",
      "Reload when convenient. LoopCAT will save pending local work first.",
      false,
      "Reload now"
    ]
  ];
  for (const [state, title, message, busy, button] of cases) {
    render({ state, message: state === "error" ? message : undefined });
    assert.equal(harness.elements.title.textContent, `[${title}]`);
    assert.equal(harness.elements.message.textContent, `[${message}]`);
    assert.equal(harness.elements.reloadButton.disabled, busy);
    assert.equal(harness.elements.deferButton.disabled, busy);
    assert.equal(harness.elements.reloadButton.textContent, `[${button}]`);
  }
});

test("ApplicationOfflineShellController warms the first matching cache with ordered concurrent asset policy", async () => {
  const { createApplicationOfflineShellController } = await loadFactory();
  const harness = createHarness(createApplicationOfflineShellController);
  harness.controller.register();
  await drain();

  assert.deepEqual(
    harness.calls.filter(([name]) => name === "cacheOpen"),
    [["cacheOpen", "loopcat-offline-v3"]]
  );
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "cacheMatch"),
    [
      ["cacheMatch", "./app.js"],
      ["cacheMatch", "./styles.css"]
    ]
  );
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "fetchAsset"),
    [["fetchAsset", "./styles.css"]]
  );
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "cachePut"),
    [["cachePut", "./styles.css", { cloned: true }]]
  );
  assert.equal(harness.calls.filter(([name]) => name === "setTimeout").length, 1);
});

test("ApplicationOfflineShellController preserves cache guards, absent responses, and timeout continuation", async () => {
  const { createApplicationOfflineShellController } = await loadFactory();
  const noCacheApi = createHarness(createApplicationOfflineShellController, { hasCacheStorage: false });
  noCacheApi.controller.register();
  await drain();
  assert.equal(
    noCacheApi.calls.some(([name]) => name === "cacheKeys"),
    false
  );

  const noMatchingCache = createHarness(createApplicationOfflineShellController, { cacheNames: ["other"] });
  noMatchingCache.controller.register();
  await drain();
  assert.equal(
    noMatchingCache.calls.some(([name]) => name === "cacheOpen"),
    false
  );

  const absentResponse = createHarness(createApplicationOfflineShellController, {
    cachedAssets: [],
    absentResponseAsset: "./styles.css"
  });
  absentResponse.controller.register();
  await drain();
  assert.equal(
    absentResponse.calls.some(([name, asset]) => name === "cachePut" && asset === "./styles.css"),
    false
  );

  const timeout = createHarness(createApplicationOfflineShellController, {
    controller: null,
    ready: { then: (_resolve, reject) => reject(new Error("ready failed")) },
    fireTimeouts: true
  });
  timeout.controller.register();
  await drain();
  assert.equal(
    timeout.calls.some(([name]) => name === "serviceWorkerAdd"),
    true
  );
  assert.equal(timeout.calls.filter(([name]) => name === "setTimeout").length, 2);
  assert.equal(
    timeout.calls.some(([name]) => name === "cacheOpen"),
    true
  );

  const controllerChange = createHarness(createApplicationOfflineShellController, { controller: null });
  controllerChange.controller.register();
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
  controllerChange.controllerChange();
  await drain();
  assert.deepEqual(
    controllerChange.calls.find(([name]) => name === "serviceWorkerAdd"),
    ["serviceWorkerAdd", "controllerchange", { once: true }]
  );
  assert.equal(
    controllerChange.calls.some(([name]) => name === "cacheOpen"),
    true
  );
});

test("ApplicationOfflineShellController contains per-asset, outer warmup, and registration failures exactly", async () => {
  const { createApplicationOfflineShellController } = await loadFactory();
  const matchError = new Error("match failed");
  const perAsset = createHarness(createApplicationOfflineShellController, {
    matchErrorAsset: "./styles.css",
    matchError
  });
  perAsset.controller.register();
  await drain();
  assert.deepEqual(
    perAsset.calls.find(([name, message]) => name === "warn" && message.includes("warmup")),
    ["warn", "Offline app shell warmup failed.", "./styles.css", matchError]
  );

  const keysError = new Error("keys failed");
  const outer = createHarness(createApplicationOfflineShellController, { keysError });
  outer.controller.register();
  await drain();
  assert.deepEqual(
    outer.calls.find(([name]) => name === "warn"),
    ["warn", "Offline app shell warmup failed.", keysError]
  );

  const initializeError = new Error("registration failed");
  const registration = createHarness(createApplicationOfflineShellController, { initializeError });
  registration.controller.register();
  await drain();
  assert.deepEqual(
    registration.calls.find(([name]) => name === "warn"),
    ["warn", "Offline app shell registration failed.", initializeError]
  );
  assert.equal(
    registration.calls.some(([name]) => name === "cacheKeys"),
    false
  );
});

test("ApplicationOfflineShellController preserves persistence failures and validates every injected boundary", async () => {
  const { createApplicationOfflineShellController } = await loadFactory();
  for (const [overrides, expected, calls] of [
    [{ flushError: new Error("flush failed") }, /flush failed/, [["flush"]]],
    [{ recoveryCheckError: new Error("check failed") }, /check failed/, [["flush"], ["shouldSaveRecovery"]]],
    [
      { shouldSaveRecovery: true, recoveryError: new Error("recovery failed") },
      /recovery failed/,
      [["flush"], ["shouldSaveRecovery"], ["saveRecovery"]]
    ]
  ]) {
    const harness = createHarness(createApplicationOfflineShellController, overrides);
    harness.controller.register();
    await drain();
    harness.calls.length = 0;
    await assert.rejects(harness.updateOptions().beforeActivate(), expected);
    assert.deepEqual(harness.calls, calls);
  }

  const valid = createHarness(createApplicationOfflineShellController).options;
  const invalidCases = [
    [{ ...valid, browser: { ...valid.browser, hasServiceWorker: null } }, /checked browser boundaries/],
    [{ ...valid, updates: { ...valid.updates, create: null } }, /update-controller boundaries/],
    [{ ...valid, assets: { ...valid.assets, warmup: null } }, /offline cache assets/],
    [{ ...valid, persistence: { ...valid.persistence, flush: null } }, /persistence boundaries/],
    [{ ...valid, presentation: { ...valid.presentation, localize: null } }, /presentation and logger boundaries/],
    [{ ...valid, logger: { warn: null } }, /presentation and logger boundaries/]
  ];
  for (const [options, error] of invalidCases) {
    assert.throws(() => createApplicationOfflineShellController(options), error);
  }
});
