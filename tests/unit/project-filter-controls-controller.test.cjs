const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-filter-controls-controller.js")).href);
}

function createElement(calls, name, options = {}) {
  const listeners = new Map();
  let value = options.value || "";
  const element = {
    addEventListener(type, listener) {
      calls.push([name, "addEventListener", type, listener]);
      if (options.addError?.[type]) throw options.addError[type];
      listeners.set(type, listener);
    },
    dispatch(type, event) {
      return listeners.get(type)?.call(element, event);
    },
    focus() {
      calls.push([name, "focus"]);
      if (options.focusError) throw options.focusError;
      return options.focusResult;
    },
    removeEventListener(type, listener) {
      calls.push([name, "removeEventListener", type, listeners.get(type) === listener]);
      if (options.removeError?.[type]) throw options.removeError[type];
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };
  Object.defineProperty(element, "value", {
    enumerable: true,
    get() {
      return value;
    },
    set(nextValue) {
      calls.push([name, "setValue", nextValue]);
      if (options.valueError) throw options.valueError;
      value = nextValue;
    }
  });
  return element;
}

function createHarness(createProjectFilterControlsController, overrides = {}) {
  const calls = [];
  const searchInput = createElement(calls, "search", {
    value: "invoice",
    addError: overrides.searchAddError,
    removeError: overrides.searchRemoveError,
    valueError: overrides.searchValueError,
    focusError: overrides.focusError,
    focusResult: overrides.focusResult
  });
  const languagePairFilter = createElement(calls, "pair", {
    value: "en::tr",
    addError: overrides.pairAddError,
    removeError: overrides.pairRemoveError,
    valueError: overrides.pairValueError
  });
  const renderResult = overrides.renderResult || { rendered: true };
  const presentation = {
    render(...args) {
      calls.push(["presentation", "render", args, this]);
      if (overrides.renderError) throw overrides.renderError;
      return renderResult;
    }
  };
  return {
    calls,
    controller: createProjectFilterControlsController({
      elements: { searchInput, languagePairFilter },
      presentation
    }),
    languagePairFilter,
    presentation,
    renderResult,
    searchInput
  };
}

test("ProjectFilterControlsController binds both native render events to the exact injected callback", async () => {
  const { createProjectFilterControlsController } = await loadFactory();
  const harness = createHarness(createProjectFilterControlsController);

  assert.equal(harness.controller.mount(), true);
  const addCalls = harness.calls.filter(([, operation]) => operation === "addEventListener");
  assert.deepEqual(
    addCalls.map(([owner, operation, type, listener]) => [
      owner,
      operation,
      type,
      listener === harness.presentation.render
    ]),
    [
      ["search", "addEventListener", "input", true],
      ["pair", "addEventListener", "change", true]
    ]
  );

  harness.calls.length = 0;
  const inputEvent = { type: "input" };
  const changeEvent = { type: "change" };
  assert.equal(harness.searchInput.dispatch("input", inputEvent), harness.renderResult);
  assert.equal(harness.languagePairFilter.dispatch("change", changeEvent), harness.renderResult);
  assert.deepEqual(
    harness.calls.map(([owner, operation, args, receiver]) => [owner, operation, args, receiver]),
    [
      ["presentation", "render", [inputEvent], harness.searchInput],
      ["presentation", "render", [changeEvent], harness.languagePairFilter]
    ]
  );
});

test("ProjectFilterControlsController clears, renders, and focuses in exact order while ignoring the click event", async () => {
  const { createProjectFilterControlsController } = await loadFactory();
  const harness = createHarness(createProjectFilterControlsController, {
    renderResult: { ignored: "render" },
    focusResult: { ignored: "focus" }
  });
  const clickEvent = new Proxy(
    {},
    {
      get() {
        throw new Error("native event was inspected");
      }
    }
  );

  assert.equal(harness.controller.clear(clickEvent), undefined);
  assert.equal(harness.searchInput.value, "");
  assert.equal(harness.languagePairFilter.value, "");
  assert.deepEqual(
    harness.calls.map((call) => call.slice(0, 3)),
    [
      ["search", "setValue", ""],
      ["pair", "setValue", ""],
      ["presentation", "render", []],
      ["search", "focus"]
    ]
  );
});

test("ProjectFilterControlsController owns exact idempotent listener lifecycle and immutable API", async () => {
  const { createProjectFilterControlsController } = await loadFactory();
  const harness = createHarness(createProjectFilterControlsController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(
    harness.calls.map((call) => call.slice(0, 4)),
    [
      ["search", "addEventListener", "input", harness.presentation.render],
      ["pair", "addEventListener", "change", harness.presentation.render],
      ["search", "removeEventListener", "input", true],
      ["pair", "removeEventListener", "change", true]
    ]
  );
});

test("ProjectFilterControlsController preserves every clear failure boundary", async () => {
  const { createProjectFilterControlsController } = await loadFactory();
  for (const [overrides, error, forbidden] of [
    [{ searchValueError: new Error("search failed") }, /search failed/, "pair"],
    [{ pairValueError: new Error("pair failed") }, /pair failed/, "presentation"],
    [{ renderError: new Error("render failed") }, /render failed/, "focus"],
    [{ focusError: new Error("focus failed") }, /focus failed/, "missing"]
  ]) {
    const harness = createHarness(createProjectFilterControlsController, overrides);
    assert.throws(() => harness.controller.clear(), error);
    if (forbidden === "pair") {
      assert.equal(
        harness.calls.some(([owner]) => owner === "pair"),
        false
      );
    } else if (forbidden === "presentation") {
      assert.equal(
        harness.calls.some(([owner]) => owner === "presentation"),
        false
      );
    } else if (forbidden === "focus") {
      assert.equal(
        harness.calls.some(([, operation]) => operation === "focus"),
        false
      );
    }
  }
});

test("ProjectFilterControlsController preserves listener failure timing and retry state", async () => {
  const { createProjectFilterControlsController } = await loadFactory();
  const searchAdd = createHarness(createProjectFilterControlsController, {
    searchAddError: { input: new Error("search add failed") }
  });
  assert.throws(() => searchAdd.controller.mount(), /search add failed/);
  assert.equal(
    searchAdd.calls.some(([owner]) => owner === "pair"),
    false
  );

  const pairAdd = createHarness(createProjectFilterControlsController, {
    pairAddError: { change: new Error("pair add failed") }
  });
  assert.throws(() => pairAdd.controller.mount(), /pair add failed/);
  assert.deepEqual(
    pairAdd.calls.map((call) => call.slice(0, 3)),
    [
      ["search", "addEventListener", "input"],
      ["pair", "addEventListener", "change"]
    ]
  );

  const searchRemove = createHarness(createProjectFilterControlsController, {
    searchRemoveError: { input: new Error("search remove failed") }
  });
  searchRemove.controller.mount();
  assert.throws(() => searchRemove.controller.unmount(), /search remove failed/);
  assert.equal(
    searchRemove.calls.some(([owner, operation]) => owner === "pair" && operation === "removeEventListener"),
    false
  );
});

test("ProjectFilterControlsController validates required elements and presentation", async () => {
  const { createProjectFilterControlsController } = await loadFactory();
  const valid = createHarness(createProjectFilterControlsController);
  for (const missing of ["addEventListener", "removeEventListener", "focus"]) {
    assert.throws(
      () =>
        createProjectFilterControlsController({
          elements: {
            searchInput: { ...valid.searchInput, [missing]: null },
            languagePairFilter: valid.languagePairFilter
          },
          presentation: valid.presentation
        }),
      /ProjectFilterControlsController requires a checked search input\./
    );
  }
  for (const missing of ["addEventListener", "removeEventListener"]) {
    assert.throws(
      () =>
        createProjectFilterControlsController({
          elements: {
            searchInput: valid.searchInput,
            languagePairFilter: { ...valid.languagePairFilter, [missing]: null }
          },
          presentation: valid.presentation
        }),
      /ProjectFilterControlsController requires a checked language-pair filter\./
    );
  }
  assert.throws(
    () =>
      createProjectFilterControlsController({
        elements: {
          searchInput: valid.searchInput,
          languagePairFilter: valid.languagePairFilter
        },
        presentation: {}
      }),
    /ProjectFilterControlsController requires a Projects-view presentation boundary\./
  );
});
