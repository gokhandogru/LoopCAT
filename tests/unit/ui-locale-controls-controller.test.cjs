const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/i18n/ui-locale-controls-controller.js")).href);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function createControl(name, calls, { addError = null, value = "" } = {}) {
  const listeners = new Map();
  return {
    value,
    addEventListener(type, listener) {
      calls.push([name, "addEventListener", type, listener]);
      if (addError) throw addError;
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      return listeners.get(type)?.(event);
    },
    removeEventListener(type, listener) {
      calls.push([name, "removeEventListener", type, listeners.get(type) === listener]);
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };
}

function createHarness(createUiLocaleControlsController, overrides = {}) {
  const calls = [];
  const load = overrides.load || deferred();
  const elements = {
    localeSelect: overrides.noLocaleSelect
      ? null
      : createControl("locale", calls, {
          addError: overrides.localeAddError,
          value: overrides.localeValue || "ca-ES"
        }),
    importInput: overrides.noImport ? null : createControl("import", calls, { addError: overrides.importAddError }),
    exportButton: overrides.noExport ? null : createControl("export", calls, { addError: overrides.exportAddError })
  };
  const loader = {
    ensure(locale) {
      calls.push(["ensure", locale]);
      if (overrides.ensureError) throw overrides.ensureError;
      return load.promise;
    }
  };
  const locale = {
    set(value) {
      calls.push(["set", value]);
      if (overrides.setError) throw overrides.setError;
      return overrides.setResult;
    }
  };
  const presentation = {
    refresh() {
      calls.push(["refresh"]);
      if (overrides.refreshError) throw overrides.refreshError;
      return overrides.refreshResult;
    }
  };
  const actions = {
    importCatalog(event) {
      calls.push(["importCatalog", event]);
      if (overrides.importError) throw overrides.importError;
      return overrides.importResult;
    },
    exportSource(event) {
      calls.push(["exportSource", event]);
      if (overrides.exportError) throw overrides.exportError;
      return overrides.exportResult;
    }
  };
  return {
    actions,
    calls,
    controller: createUiLocaleControlsController({ elements, loader, locale, presentation, actions }),
    elements,
    load,
    loader,
    locale,
    presentation
  };
}

test("UiLocaleControlsController preserves initial load and post-await live locale value sequencing", async () => {
  const { createUiLocaleControlsController } = await loadFactory();
  const harness = createHarness(createUiLocaleControlsController, {
    refreshResult: { ignored: true },
    setResult: { ignored: true }
  });
  harness.controller.mount();
  harness.calls.length = 0;

  const resultPromise = harness.elements.localeSelect.dispatch("change", { type: "change" });
  assert.equal(resultPromise instanceof Promise, true);
  assert.deepEqual(harness.calls, [["ensure", "ca-ES"]]);

  harness.elements.localeSelect.value = "tr-TR";
  harness.load.resolve({ loaded: true });
  assert.equal(await resultPromise, undefined);
  assert.deepEqual(harness.calls, [["ensure", "ca-ES"], ["set", "tr-TR"], ["refresh"]]);

  const optionalSetterCalls = [];
  const optionalLoad = deferred();
  const optionalSelect = createControl("optionalLocale", optionalSetterCalls, { value: "en" });
  let optionalLocale;
  const optionalController = createUiLocaleControlsController({
    elements: { localeSelect: optionalSelect },
    loader: {
      ensure(value) {
        optionalSetterCalls.push(["optionalEnsure", value]);
        return optionalLoad.promise;
      }
    },
    locale: { set: (value) => optionalLocale?.setLocale?.(value) },
    presentation: { refresh: () => optionalSetterCalls.push(["optionalRefresh"]) },
    actions: { importCatalog() {}, exportSource() {} }
  });
  optionalController.mount();
  const optionalResult = optionalSelect.dispatch("change");
  optionalLoad.resolve();
  assert.equal(await optionalResult, undefined);
  assert.deepEqual(optionalSetterCalls.slice(-2), [["optionalEnsure", "en"], ["optionalRefresh"]]);
});

test("UiLocaleControlsController preserves direct import and export event/result passthrough", async () => {
  const { createUiLocaleControlsController } = await loadFactory();
  const importResult = Promise.resolve({ imported: true });
  const exportResult = { exported: true };
  const harness = createHarness(createUiLocaleControlsController, { importResult, exportResult });
  harness.controller.mount();
  harness.calls.length = 0;
  const importEvent = { type: "change", marker: "import" };
  const exportEvent = { type: "click", marker: "export" };

  assert.equal(harness.elements.importInput.dispatch("change", importEvent), importResult);
  assert.equal(harness.elements.exportButton.dispatch("click", exportEvent), exportResult);
  assert.deepEqual(harness.calls, [
    ["importCatalog", importEvent],
    ["exportSource", exportEvent]
  ]);
});

test("UiLocaleControlsController owns exact idempotent listener lifecycle and immutable API", async () => {
  const { createUiLocaleControlsController } = await loadFactory();
  const harness = createHarness(createUiLocaleControlsController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  const added = harness.calls.slice();
  assert.deepEqual(
    added.map((call) => call.slice(0, 3)),
    [
      ["locale", "addEventListener", "change"],
      ["import", "addEventListener", "change"],
      ["export", "addEventListener", "click"]
    ]
  );

  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(harness.calls.slice(3), [
    ["locale", "removeEventListener", "change", true],
    ["import", "removeEventListener", "change", true],
    ["export", "removeEventListener", "click", true]
  ]);
});

test("UiLocaleControlsController independently skips absent optional controls", async () => {
  const { createUiLocaleControlsController } = await loadFactory();
  for (const absent of ["noLocaleSelect", "noImport", "noExport"]) {
    const harness = createHarness(createUiLocaleControlsController, { [absent]: true });
    assert.equal(harness.controller.mount(), true);
    assert.equal(harness.calls.filter(([, operation]) => operation === "addEventListener").length, 2);
    assert.equal(harness.controller.unmount(), true);
    assert.equal(harness.calls.filter(([, operation]) => operation === "removeEventListener").length, 2);
  }
});

test("UiLocaleControlsController preserves loader, locale, refresh, action, and listener failure timing", async () => {
  const { createUiLocaleControlsController } = await loadFactory();

  const ensureError = new Error("ensure failed");
  const ensureHarness = createHarness(createUiLocaleControlsController, { ensureError });
  ensureHarness.controller.mount();
  let ensureResult;
  assert.doesNotThrow(() => {
    ensureResult = ensureHarness.elements.localeSelect.dispatch("change");
  });
  await assert.rejects(ensureResult, ensureError);

  for (const [overrides, expectedCalls, error] of [
    [
      { setError: new Error("set failed") },
      [
        ["ensure", "ca-ES"],
        ["set", "ca-ES"]
      ],
      /set failed/
    ],
    [
      { refreshError: new Error("refresh failed") },
      [["ensure", "ca-ES"], ["set", "ca-ES"], ["refresh"]],
      /refresh failed/
    ]
  ]) {
    const harness = createHarness(createUiLocaleControlsController, overrides);
    harness.controller.mount();
    harness.calls.length = 0;
    const result = harness.elements.localeSelect.dispatch("change");
    harness.load.resolve();
    await assert.rejects(result, error);
    assert.deepEqual(harness.calls, expectedCalls);
  }

  for (const [control, type, overrides, error] of [
    ["importInput", "change", { importError: new Error("import failed") }, /import failed/],
    ["exportButton", "click", { exportError: new Error("export failed") }, /export failed/]
  ]) {
    const harness = createHarness(createUiLocaleControlsController, overrides);
    harness.controller.mount();
    assert.throws(() => harness.elements[control].dispatch(type), error);
  }

  const listenerError = new Error("import listener failed");
  const listenerHarness = createHarness(createUiLocaleControlsController, { importAddError: listenerError });
  assert.throws(() => listenerHarness.controller.mount(), listenerError);
  assert.deepEqual(
    listenerHarness.calls.map((call) => call.slice(0, 3)),
    [
      ["locale", "addEventListener", "change"],
      ["import", "addEventListener", "change"]
    ]
  );
});

test("UiLocaleControlsController validates boundaries and present optional controls", async () => {
  const { createUiLocaleControlsController } = await loadFactory();
  const valid = createHarness(createUiLocaleControlsController);
  for (const [group, member] of [
    ["loader", "ensure"],
    ["locale", "set"],
    ["presentation", "refresh"],
    ["actions", "importCatalog"],
    ["actions", "exportSource"]
  ]) {
    assert.throws(
      () =>
        createUiLocaleControlsController({
          elements: valid.elements,
          loader: group === "loader" ? { ...valid.loader, [member]: null } : valid.loader,
          locale: group === "locale" ? { ...valid.locale, [member]: null } : valid.locale,
          presentation: group === "presentation" ? { ...valid.presentation, [member]: null } : valid.presentation,
          actions: group === "actions" ? { ...valid.actions, [member]: null } : valid.actions
        }),
      /UiLocaleControlsController requires loader, locale, presentation, import, and export boundaries\./
    );
  }
  for (const element of ["localeSelect", "importInput", "exportButton"]) {
    assert.throws(
      () =>
        createUiLocaleControlsController({
          elements: { ...valid.elements, [element]: {} },
          loader: valid.loader,
          locale: valid.locale,
          presentation: valid.presentation,
          actions: valid.actions
        }),
      /UiLocaleControlsController requires checked optional control elements\./
    );
  }
});
