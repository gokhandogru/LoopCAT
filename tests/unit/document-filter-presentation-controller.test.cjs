const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/document-filter-presentation-controller.js")).href);
}

function createHarness(createDocumentFilterPresentationController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "document-filter"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  const fragments = [];
  const optionsCreated = [];
  let selectedValue = overrides.selectedValue ?? "before-render";
  const select = {
    children: [],
    get value() {
      calls.push(["select.value:get", selectedValue]);
      fail("select.value:get");
      return selectedValue;
    },
    set value(value) {
      calls.push(["select.value:set", value]);
      fail("select.value:set");
      selectedValue = value;
    },
    replaceChildren(...children) {
      calls.push(["select.replaceChildren", ...children]);
      fail("select.replaceChildren");
      this.children = children;
    }
  };
  const currentReads = overrides.currentReads || [overrides.current ?? ""];
  let currentRead = 0;
  const selections = [];
  const navigation = {
    getDocumentId() {
      const current = currentReads[Math.min(currentRead, currentReads.length - 1)];
      currentRead += 1;
      calls.push(["navigation.getDocumentId", current]);
      fail("navigation.getDocumentId");
      return current;
    },
    selectDocument(options) {
      calls.push(["navigation.selectDocument", options]);
      fail("navigation.selectDocument");
      selections.push(options);
      return overrides.selectionResult;
    }
  };
  const documentReads = overrides.documentReads || [overrides.documents || []];
  let documentRead = 0;
  const documents = {
    list() {
      const records = documentReads[Math.min(documentRead, documentReads.length - 1)];
      documentRead += 1;
      calls.push(["documents.list", records]);
      fail("documents.list");
      return records;
    }
  };
  const localization = {
    source(value) {
      calls.push(["localization.source", value]);
      fail("localization.source");
      return `localized:${value}`;
    }
  };
  const text = {
    displaySafeText(value) {
      calls.push(["text.displaySafeText", value]);
      fail("text.displaySafeText");
      return `safe:${value}`;
    }
  };
  const dom = {
    createElement(tagName) {
      calls.push(["dom.createElement", tagName]);
      fail("dom.createElement");
      const option = { value: undefined, textContent: undefined };
      optionsCreated.push(option);
      return option;
    },
    createDocumentFragment() {
      calls.push(["dom.createDocumentFragment"]);
      fail("dom.createDocumentFragment");
      const fragment = {
        children: [],
        append(child) {
          calls.push(["fragment.append", child]);
          fail("fragment.append");
          fragment.children.push(child);
        }
      };
      fragments.push(fragment);
      return fragment;
    }
  };
  const options = { select, navigation, documents, localization, text, dom };
  return {
    calls,
    controller: createDocumentFilterPresentationController(options),
    failure,
    fragments,
    getSelectedValue: () => selectedValue,
    options,
    optionsCreated,
    select,
    selections
  };
}

test("DocumentFilterPresentationController preserves current-ID capture before catalog and DOM reads", async () => {
  const { createDocumentFilterPresentationController } = await loadFactory();
  const harness = createHarness(createDocumentFilterPresentationController, { current: "" });
  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(
    harness.calls.slice(0, 5).map(([name]) => name),
    [
      "navigation.getDocumentId",
      "documents.list",
      "dom.createDocumentFragment",
      "dom.createElement",
      "localization.source"
    ]
  );
  assert.deepEqual(harness.optionsCreated, [{ value: "", textContent: "localized:All documents" }]);
  assert.deepEqual(harness.fragments[0].children, harness.optionsCreated);
});

test("DocumentFilterPresentationController preserves stable safe option construction and one replacement", async () => {
  const { createDocumentFilterPresentationController } = await loadFactory();
  const documentRecords = [
    { id: "one", name: "One <unsafe>" },
    { id: "two", name: "Two" }
  ];
  const harness = createHarness(createDocumentFilterPresentationController, {
    current: "two",
    documents: documentRecords
  });
  harness.controller.render();
  assert.deepEqual(harness.optionsCreated, [
    { value: "", textContent: "localized:All documents" },
    { value: "one", textContent: "safe:One <unsafe>" },
    { value: "two", textContent: "safe:Two" }
  ]);
  assert.deepEqual(harness.fragments[0].children, harness.optionsCreated);
  assert.deepEqual(harness.select.children, [harness.fragments[0]]);
  assert.equal(harness.calls.filter(([name]) => name === "select.replaceChildren").length, 1);
});

test("DocumentFilterPresentationController retains a strict current document without navigation", async () => {
  const { createDocumentFilterPresentationController } = await loadFactory();
  const harness = createHarness(createDocumentFilterPresentationController, {
    current: 1,
    documents: [
      { id: 1, name: "Numeric" },
      { id: "1", name: "String" }
    ]
  });
  harness.controller.render();
  assert.equal(harness.getSelectedValue(), 1);
  assert.deepEqual(harness.selections, []);
  assert.deepEqual(
    harness.calls.slice(-3).map(([name]) => name),
    ["select.replaceChildren", "select.value:set", "select.value:get"]
  );
});

test("DocumentFilterPresentationController falls back strictly and corrects navigation after replacement", async () => {
  const { createDocumentFilterPresentationController } = await loadFactory();
  const harness = createHarness(createDocumentFilterPresentationController, {
    current: 1,
    documents: [{ id: "1", name: "String" }],
    selectionResult: "ignored"
  });
  assert.equal(harness.controller.render(), undefined);
  assert.equal(harness.getSelectedValue(), "");
  assert.deepEqual(harness.selections, [{ documentId: "" }]);
  assert.deepEqual(
    harness.calls.slice(-5).map(([name]) => name),
    ["select.replaceChildren", "select.value:set", "select.value:get", "select.value:get", "navigation.selectDocument"]
  );
});

test("DocumentFilterPresentationController preserves empty fallback and fresh repeated live renders", async () => {
  const { createDocumentFilterPresentationController } = await loadFactory();
  const first = [];
  const second = [{ id: "later", name: "Later" }];
  const harness = createHarness(createDocumentFilterPresentationController, {
    currentReads: ["", "later"],
    documentReads: [first, second]
  });
  const render = harness.controller.render;
  render();
  render();
  assert.equal(harness.controller.render, render);
  assert.equal(harness.fragments.length, 2);
  assert.equal(harness.getSelectedValue(), "later");
  assert.deepEqual(harness.selections, []);
  assert.equal(harness.optionsCreated.at(-1).value, "later");
});

test("DocumentFilterPresentationController preserves every populated failure boundary", async () => {
  const { createDocumentFilterPresentationController } = await loadFactory();
  for (const failAt of [
    "navigation.getDocumentId",
    "documents.list",
    "dom.createDocumentFragment",
    "dom.createElement",
    "localization.source",
    "fragment.append",
    "text.displaySafeText",
    "select.replaceChildren",
    "select.value:set",
    "select.value:get",
    "navigation.selectDocument"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createDocumentFilterPresentationController, {
      current: "missing",
      documents: [{ id: "one", name: "One" }],
      failAt,
      failure
    });
    assert.throws(() => harness.controller.render(), failure);
  }
});

test("DocumentFilterPresentationController validates every owner and exposes an immutable API", async () => {
  const { createDocumentFilterPresentationController } = await loadFactory();
  const valid = createHarness(createDocumentFilterPresentationController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["render"]);
  assert.throws(() => createDocumentFilterPresentationController(), TypeError);
  for (const options of [
    { ...valid.options, select: null },
    { ...valid.options, select: {} },
    { ...valid.options, navigation: { ...valid.options.navigation, getDocumentId: null } },
    { ...valid.options, navigation: { ...valid.options.navigation, selectDocument: null } },
    { ...valid.options, documents: { list: null } },
    { ...valid.options, localization: { source: null } },
    { ...valid.options, text: { displaySafeText: null } },
    { ...valid.options, dom: { ...valid.options.dom, createElement: null } },
    { ...valid.options, dom: { ...valid.options.dom, createDocumentFragment: null } }
  ]) {
    assert.throws(() => createDocumentFilterPresentationController(options), TypeError);
  }
});
