const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-persistence-lifecycle-controller.js")).href);
}

function createTarget(calls, name, options = {}) {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      calls.push([name, "addEventListener", type, listener]);
      if (options.addError?.[type]) throw options.addError[type];
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      return listeners.get(type)?.call(this, event);
    },
    removeEventListener(type, listener) {
      calls.push([name, "removeEventListener", type, listeners.get(type) === listener]);
      if (options.removeError?.[type]) throw options.removeError[type];
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };
}

function createHarness(createApplicationPersistenceLifecycleController, overrides = {}) {
  const calls = [];
  let visibilityState = overrides.visibilityState || "visible";
  let hasImport = overrides.hasImport === true;
  let autosaveSize = overrides.autosaveSize || 0;
  let hasUnsaved = overrides.hasUnsaved === true;
  const windowTarget = createTarget(calls, "window", overrides.windowOptions);
  const documentTarget = createTarget(calls, "document", overrides.documentOptions);
  const controller = createApplicationPersistenceLifecycleController({
    targets: { window: windowTarget, document: documentTarget },
    visibility: {
      getState() {
        calls.push(["visibility", "getState", visibilityState]);
        if (overrides.visibilityError) throw overrides.visibilityError;
        return visibilityState;
      }
    },
    pending: {
      hasImport() {
        calls.push(["pending", "hasImport", hasImport]);
        if (overrides.importError) throw overrides.importError;
        return hasImport;
      }
    },
    autosave: {
      size() {
        calls.push(["autosave", "size", autosaveSize]);
        if (overrides.sizeError) throw overrides.sizeError;
        return autosaveSize;
      },
      flush() {
        calls.push(["autosave", "flush"]);
        if (overrides.flushSyncError) throw overrides.flushSyncError;
        return overrides.flushPromise || Promise.resolve(overrides.flushResult);
      }
    },
    workspace: {
      hasUnsaved() {
        calls.push(["workspace", "hasUnsaved", hasUnsaved]);
        if (overrides.unsavedError) throw overrides.unsavedError;
        return hasUnsaved;
      },
      autosaveDirty() {
        calls.push(["workspace", "autosaveDirty"]);
        if (overrides.workspaceSyncError) throw overrides.workspaceSyncError;
        return overrides.workspacePromise || Promise.resolve(overrides.workspaceResult);
      }
    },
    logger: {
      warn(error) {
        calls.push(["logger", "warn", error]);
        if (overrides.loggerError) throw overrides.loggerError;
      }
    }
  });
  return {
    calls,
    controller,
    documentTarget,
    setAutosaveSize(value) {
      autosaveSize = value;
    },
    setHasImport(value) {
      hasImport = value;
    },
    setHasUnsaved(value) {
      hasUnsaved = value;
    },
    setVisibility(value) {
      visibilityState = value;
    },
    windowTarget
  };
}

async function flushPromises() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

test("ApplicationPersistenceLifecycleController owns exact ordered listener lifecycle and immutable API", async () => {
  const { createApplicationPersistenceLifecycleController } = await loadFactory();
  const harness = createHarness(createApplicationPersistenceLifecycleController);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(
    harness.calls.map((call) => call.slice(0, 4)),
    [
      ["window", "addEventListener", "beforeunload", harness.calls[0][3]],
      ["document", "addEventListener", "visibilitychange", harness.calls[1][3]],
      ["window", "addEventListener", "pagehide", harness.calls[2][3]],
      ["window", "removeEventListener", "beforeunload", true],
      ["document", "removeEventListener", "visibilitychange", true],
      ["window", "removeEventListener", "pagehide", true]
    ]
  );
});

test("ApplicationPersistenceLifecycleController preserves every live close-warning branch", async () => {
  const { createApplicationPersistenceLifecycleController } = await loadFactory();
  const harness = createHarness(createApplicationPersistenceLifecycleController);
  harness.controller.mount();
  const event = {
    returnValue: "original",
    preventDefault() {
      harness.calls.push(["event", "preventDefault"]);
    }
  };
  harness.calls.length = 0;
  assert.equal(harness.windowTarget.dispatch("beforeunload", event), undefined);
  assert.equal(event.returnValue, "original");
  assert.deepEqual(harness.calls, [
    ["pending", "hasImport", false],
    ["autosave", "size", 0],
    ["workspace", "hasUnsaved", false]
  ]);

  for (const configure of [
    () => harness.setHasImport(true),
    () => {
      harness.setHasImport(false);
      harness.setAutosaveSize(2);
    },
    () => {
      harness.setAutosaveSize(0);
      harness.setHasUnsaved(true);
    }
  ]) {
    configure();
    harness.calls.length = 0;
    event.returnValue = "original";
    harness.windowTarget.dispatch("beforeunload", event);
    assert.equal(event.returnValue, "");
    assert.equal(
      harness.calls.some(([owner]) => owner === "event"),
      true
    );
  }
});

test("ApplicationPersistenceLifecycleController preserves visible and hidden background-save guards", async () => {
  const { createApplicationPersistenceLifecycleController } = await loadFactory();
  const harness = createHarness(createApplicationPersistenceLifecycleController, { autosaveSize: 1 });
  harness.controller.mount();
  harness.calls.length = 0;
  assert.equal(harness.documentTarget.dispatch("visibilitychange", { ignored: true }), undefined);
  assert.deepEqual(harness.calls, [["visibility", "getState", "visible"]]);

  harness.setVisibility("hidden");
  harness.documentTarget.dispatch("visibilitychange");
  await flushPromises();
  assert.ok(
    harness.calls.findIndex(([, operation]) => operation === "flush") <
      harness.calls.findIndex(([, operation]) => operation === "autosaveDirty")
  );
});

test("ApplicationPersistenceLifecycleController preserves Page hide and suppresses persistence promises", async () => {
  const { createApplicationPersistenceLifecycleController } = await loadFactory();
  const harness = createHarness(createApplicationPersistenceLifecycleController, { hasUnsaved: true });
  harness.controller.mount();
  harness.calls.length = 0;
  assert.equal(harness.windowTarget.dispatch("pagehide", { ignored: true }), undefined);
  await flushPromises();
  assert.deepEqual(harness.calls.slice(-2), [
    ["autosave", "flush"],
    ["workspace", "autosaveDirty"]
  ]);
});

test("ApplicationPersistenceLifecycleController catches flush and workspace rejections through the logger", async () => {
  const { createApplicationPersistenceLifecycleController } = await loadFactory();
  for (const [overrides, error] of [
    [{ flushPromise: Promise.reject(new Error("flush failed")) }, /flush failed/],
    [{ workspacePromise: Promise.reject(new Error("workspace failed")) }, /workspace failed/],
    [{ workspaceSyncError: new Error("workspace threw") }, /workspace threw/]
  ]) {
    overrides.flushPromise?.catch(() => {});
    overrides.workspacePromise?.catch(() => {});
    const harness = createHarness(createApplicationPersistenceLifecycleController, {
      hasImport: true,
      ...overrides
    });
    harness.controller.mount();
    harness.windowTarget.dispatch("pagehide");
    await flushPromises();
    const warning = harness.calls.find(([owner]) => owner === "logger");
    assert.match(warning[2].message, error);
  }
});

test("ApplicationPersistenceLifecycleController preserves synchronous query and flush failure timing", async () => {
  const { createApplicationPersistenceLifecycleController } = await loadFactory();
  const query = createHarness(createApplicationPersistenceLifecycleController, {
    importError: new Error("query failed")
  });
  query.controller.mount();
  assert.throws(() => query.windowTarget.dispatch("beforeunload", { preventDefault() {} }), /query failed/);

  const flush = createHarness(createApplicationPersistenceLifecycleController, {
    hasImport: true,
    flushSyncError: new Error("flush threw")
  });
  flush.controller.mount();
  assert.throws(() => flush.windowTarget.dispatch("pagehide"), /flush threw/);
  assert.equal(
    flush.calls.some(([, operation]) => operation === "autosaveDirty"),
    false
  );
});

test("ApplicationPersistenceLifecycleController validates targets, queries, actions, and logger", async () => {
  const { createApplicationPersistenceLifecycleController } = await loadFactory();
  const valid = {
    targets: {
      window: { addEventListener() {}, removeEventListener() {} },
      document: { addEventListener() {}, removeEventListener() {} }
    },
    visibility: { getState: () => "visible" },
    pending: { hasImport: () => false },
    autosave: { size: () => 0, flush: () => Promise.resolve() },
    workspace: { hasUnsaved: () => false, autosaveDirty: () => Promise.resolve() },
    logger: { warn() {} }
  };
  for (const mutation of [
    { targets: {} },
    { visibility: {} },
    { pending: {} },
    { autosave: {} },
    { workspace: {} },
    { logger: {} }
  ]) {
    assert.throws(
      () => createApplicationPersistenceLifecycleController({ ...valid, ...mutation }),
      /ApplicationPersistenceLifecycleController requires/
    );
  }
});
