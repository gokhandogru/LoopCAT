const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/editor-filter-controls-controller.js")).href);
}

function createElement(calls, name, options = {}) {
  let listener = null;
  return {
    value: options.value || "",
    checked: options.checked === true,
    addEventListener(type, nextListener) {
      calls.push([name, "addEventListener", type, nextListener]);
      if (options.addError) throw options.addError;
      listener = nextListener;
    },
    dispatch(event = {}) {
      return listener?.(event);
    },
    removeEventListener(type, nextListener) {
      calls.push([name, "removeEventListener", type, nextListener === listener]);
      if (options.removeError) throw options.removeError;
      if (nextListener === listener) listener = null;
    }
  };
}

function createHarness(createEditorFilterControlsController, overrides = {}) {
  const calls = [];
  const elements = {
    documentFilter: createElement(calls, "document", { value: "doc-1" }),
    searchInput: createElement(calls, "search", { value: "  invoice  " }),
    searchScope: createElement(calls, "scope", { value: "target" }),
    regexInput: createElement(calls, "regex", { checked: true }),
    caseInput: createElement(calls, "case", { checked: true }),
    statusFilter: createElement(calls, "status", { value: "draft" }),
    reviewStateFilter: overrides.noReview ? null : createElement(calls, "review", { value: "needs-review" }),
    aiStateFilter: overrides.noAi ? null : createElement(calls, "ai", { value: "ai-draft" })
  };
  const boundaries = {
    navigation: {
      selectDocument(value) {
        calls.push(["navigation", "selectDocument", value]);
        if (overrides.navigationError) throw overrides.navigationError;
      }
    },
    store: {
      update(patch) {
        calls.push(["store", "update", patch]);
        if (overrides.storeError) throw overrides.storeError;
      }
    },
    filters: {
      firstVisible() {
        calls.push(["filters", "firstVisible"]);
        if (overrides.filterError) throw overrides.filterError;
        return overrides.firstVisible ?? 3;
      }
    },
    presentation: {
      renderSegments() {
        calls.push(["presentation", "renderSegments"]);
        if (overrides.renderError) throw overrides.renderError;
      },
      renderProgress() {
        calls.push(["presentation", "renderProgress"]);
        if (overrides.progressError) throw overrides.progressError;
      }
    },
    preset: {
      markCustom() {
        calls.push(["preset", "markCustom"]);
        if (overrides.presetError) throw overrides.presetError;
      }
    },
    selection: {
      select(index) {
        calls.push(["selection", "select", index]);
        if (overrides.selectionError) return Promise.reject(overrides.selectionError);
        return Promise.resolve(overrides.selectionResult);
      }
    }
  };
  return {
    boundaries,
    calls,
    controller: createEditorFilterControlsController({ elements, ...boundaries }),
    elements
  };
}

test("EditorFilterControlsController owns exact ordered listener lifecycle and optional controls", async () => {
  const { createEditorFilterControlsController } = await loadFactory();
  const harness = createHarness(createEditorFilterControlsController);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.deepEqual(
    harness.calls.filter(([, operation]) => operation === "addEventListener").map((call) => call.slice(0, 3)),
    [
      ["document", "addEventListener", "change"],
      ["search", "addEventListener", "input"],
      ["scope", "addEventListener", "change"],
      ["regex", "addEventListener", "change"],
      ["case", "addEventListener", "change"],
      ["status", "addEventListener", "change"],
      ["review", "addEventListener", "change"],
      ["ai", "addEventListener", "change"]
    ]
  );
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.equal(harness.calls.filter(([, operation]) => operation === "removeEventListener").length, 8);

  const optional = createHarness(createEditorFilterControlsController, { noReview: true, noAi: true });
  assert.equal(optional.controller.mount(), true);
  assert.equal(optional.controller.unmount(), true);
  assert.equal(
    optional.calls.some(([owner]) => owner === "review" || owner === "ai"),
    false
  );
});

test("EditorFilterControlsController preserves document selection and presentation sequence", async () => {
  const { createEditorFilterControlsController } = await loadFactory();
  const harness = createHarness(createEditorFilterControlsController, { selectionResult: "selected" });
  harness.controller.mount();
  harness.calls.length = 0;
  assert.equal(await harness.elements.documentFilter.dispatch({ type: "change" }), undefined);
  assert.deepEqual(harness.calls, [
    ["navigation", "selectDocument", { documentId: "doc-1" }],
    ["presentation", "renderSegments"],
    ["presentation", "renderProgress"],
    ["filters", "firstVisible"],
    ["selection", "select", 3]
  ]);
});

test("EditorFilterControlsController preserves every live segment-filter patch and preset branch", async () => {
  const { createEditorFilterControlsController } = await loadFactory();
  const harness = createHarness(createEditorFilterControlsController);
  harness.controller.mount();
  const cases = [
    ["searchInput", { query: "invoice" }, false],
    ["searchScope", { scope: "target" }, false],
    ["regexInput", { regex: true }, false],
    ["caseInput", { caseSensitive: true }, false],
    ["statusFilter", { status: "draft" }, true],
    ["reviewStateFilter", { reviewState: "needs-review" }, true],
    ["aiStateFilter", { aiState: "ai-draft" }, true]
  ];
  for (const [key, patch, marked] of cases) {
    harness.calls.length = 0;
    await harness.elements[key].dispatch({ ignored: true });
    assert.deepEqual(
      harness.calls.find(([owner]) => owner === "store"),
      ["store", "update", patch]
    );
    assert.equal(
      harness.calls.some(([owner]) => owner === "preset"),
      marked
    );
    assert.ok(
      harness.calls.findIndex(([owner]) => owner === "store") <
        harness.calls.findIndex(([, operation]) => operation === "renderSegments")
    );
    assert.deepEqual(harness.calls.slice(-2), [
      ["filters", "firstVisible"],
      ["selection", "select", 3]
    ]);
  }
});

test("EditorFilterControlsController rereads live controls and skips absent first selection", async () => {
  const { createEditorFilterControlsController } = await loadFactory();
  const harness = createHarness(createEditorFilterControlsController, { firstVisible: -1 });
  harness.controller.mount();
  harness.elements.searchInput.value = "  changed  ";
  await harness.elements.searchInput.dispatch();
  assert.deepEqual(
    harness.calls.find(([owner]) => owner === "store"),
    ["store", "update", { query: "changed" }]
  );
  assert.equal(
    harness.calls.some(([owner]) => owner === "selection"),
    false
  );
});

test("EditorFilterControlsController preserves synchronous and awaited failure timing", async () => {
  const { createEditorFilterControlsController } = await loadFactory();
  for (const [overrides, expected, forbidden] of [
    [{ presetError: new Error("preset failed") }, /preset failed/, "store"],
    [{ storeError: new Error("store failed") }, /store failed/, "presentation"],
    [{ renderError: new Error("render failed") }, /render failed/, "filters"],
    [{ filterError: new Error("filter failed") }, /filter failed/, "selection"]
  ]) {
    const harness = createHarness(createEditorFilterControlsController, overrides);
    harness.controller.mount();
    harness.calls.length = 0;
    await assert.rejects(() => harness.elements.statusFilter.dispatch(), expected);
    assert.equal(
      harness.calls.some(([owner]) => owner === forbidden),
      false
    );
  }
  const selection = createHarness(createEditorFilterControlsController, {
    selectionError: new Error("selection failed")
  });
  selection.controller.mount();
  await assert.rejects(() => selection.elements.searchScope.dispatch(), /selection failed/);
});

test("EditorFilterControlsController validates required, optional, and collaborator boundaries", async () => {
  const { createEditorFilterControlsController } = await loadFactory();
  const valid = createHarness(createEditorFilterControlsController);
  for (const key of [
    "documentFilter",
    "searchInput",
    "searchScope",
    "regexInput",
    "caseInput",
    "statusFilter",
    "reviewStateFilter",
    "aiStateFilter"
  ]) {
    assert.throws(
      () =>
        createEditorFilterControlsController({
          elements: { ...valid.elements, [key]: { addEventListener() {}, removeEventListener: null } },
          ...valid.boundaries
        }),
      /EditorFilterControlsController requires/
    );
  }
  for (const boundary of ["navigation", "store", "filters", "presentation", "preset", "selection"]) {
    assert.throws(
      () =>
        createEditorFilterControlsController({
          elements: valid.elements,
          ...valid.boundaries,
          [boundary]: {}
        }),
      /EditorFilterControlsController requires/
    );
  }
});
