const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeElement(properties = {}) {
  const listeners = new Map();
  const classes = new Set(properties.classes || []);
  const attributes = new Map();
  return Object.assign(
    {
      dataset: {},
      files: [],
      value: "",
      classList: {
        toggle(name, force) {
          if (force) classes.add(name);
          else classes.delete(name);
        },
        contains: (name) => classes.has(name)
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      getAttribute: (name) => attributes.get(name) ?? null,
      toggleAttribute(name, force) {
        if (force) attributes.set(name, "");
        else attributes.delete(name);
      },
      hasAttribute: (name) => attributes.has(name),
      addEventListener(type, listener) {
        const values = listeners.get(type) || [];
        values.push(listener);
        listeners.set(type, values);
      },
      removeEventListener(type, listener) {
        listeners.set(
          type,
          (listeners.get(type) || []).filter((value) => value !== listener)
        );
      },
      dispatch(type, event = {}) {
        const dispatched = {
          type,
          target: this,
          preventDefault() {
            this.defaultPrevented = true;
          },
          ...event
        };
        for (const listener of [...(listeners.get(type) || [])]) listener(dispatched);
        return dispatched;
      },
      contains: () => true,
      querySelector: () => null,
      querySelectorAll: () => [],
      click() {
        this.clicked = (this.clicked || 0) + 1;
      },
      focus() {
        this.focused = (this.focused || 0) + 1;
      }
    },
    properties
  );
}

function resourceElements() {
  return {
    viewButton: fakeElement(),
    tmTab: fakeElement(),
    tbTab: fakeElement(),
    tmPanel: fakeElement(),
    tbPanel: fakeElement({ classes: ["hidden"] }),
    tmDashboard: fakeElement(),
    tbDashboard: fakeElement(),
    tmDetail: fakeElement(),
    tbDetail: fakeElement(),
    tmSourceLanguageInput: fakeElement(),
    tmTargetLanguageInput: fakeElement(),
    tbSourceLanguageInput: fakeElement(),
    tbTargetLanguageInput: fakeElement(),
    tmImportInput: fakeElement(),
    tbImportInput: fakeElement(),
    termListImportInput: fakeElement()
  };
}

function createActionButton(action, type, options = {}) {
  const button = fakeElement({
    dataset: {
      resourceAction: action,
      resourceType: type,
      resourceKey: options.key || "",
      resourceId: options.id || ""
    }
  });
  button.closest = (selector) => {
    if (selector === "[data-resource-action]") return button;
    if (selector === "[data-resource-row]") return options.row || null;
    return null;
  };
  return button;
}

test("ResourcesController owns tab state, selection, rendering, and keyboard navigation", async () => {
  const { createResourcesController } = await moduleAt("src/features/resources/resources-controller.js");
  const elements = resourceElements();
  const renders = [];
  const closeButton = fakeElement();
  elements.tbDetail.querySelector = (selector) =>
    selector === '[data-resource-action="close-detail"]' ? closeButton : null;
  const openButton = createActionButton("open", "tb", { key: "Terms::en::tr" });
  elements.tbDashboard.querySelectorAll = () => [openButton];
  const controller = createResourcesController({
    elements,
    render: (state) => renders.push(state),
    keyForItem: (item, type) => `${type}:${item.id}`,
    scheduleFrame: (callback) => callback()
  });

  assert.equal(controller.mount(), true);
  controller.setResources({ tmEntries: [{ id: "tm-1" }], terms: [{ id: "term-1" }] });
  assert.equal(controller.getState().type, "tm");
  assert.equal(elements.tmTab.getAttribute("aria-selected"), "true");
  assert.equal(elements.tbPanel.hasAttribute("hidden"), true);

  const keyboardEvent = elements.tmTab.dispatch("keydown", { key: "ArrowRight" });
  assert.equal(keyboardEvent.defaultPrevented, true);
  assert.equal(controller.getState().type, "tb");
  assert.equal(elements.tbTab.focused >= 1, true);
  assert.equal(elements.tbTab.getAttribute("aria-selected"), "true");
  const wrappedKeyboardEvent = elements.tbTab.dispatch("keydown", { key: "ArrowRight" });
  assert.equal(wrappedKeyboardEvent.defaultPrevented, true);
  assert.equal(controller.getState().type, "tm", "Arrow navigation wraps across the two resource tabs");
  assert.equal(elements.tmTab.getAttribute("aria-selected"), "true");

  controller.openResource("tb", "Terms::en::tr");
  assert.equal(controller.getState().openKey, "Terms::en::tr");
  assert.equal(closeButton.focused >= 1, true);
  controller.closeResource();
  assert.equal(controller.getState().openKey, null);
  assert.equal(openButton.focused >= 1, true, "closing a detail returns focus to its originating resource card");
  assert.equal(renders.length >= 4, true);
});

test("ResourcesController restores a focused resource action after an asynchronous data refresh", async () => {
  const { createResourcesController } = await moduleAt("src/features/resources/resources-controller.js");
  const elements = resourceElements();
  const ownerDocument = { activeElement: null };
  const oldOpenButton = createActionButton("open", "tm", { key: "Main::en::tr" });
  const newOpenButton = createActionButton("open", "tm", { key: "Main::en::tr" });
  let dashboardButtons = [oldOpenButton];
  for (const element of [elements.tmDashboard, elements.tbDashboard, elements.tmDetail, elements.tbDetail]) {
    element.ownerDocument = ownerDocument;
  }
  elements.tmDashboard.contains = (element) => element === oldOpenButton || element === newOpenButton;
  elements.tmDashboard.querySelectorAll = () => dashboardButtons;
  newOpenButton.focus = () => {
    newOpenButton.focused = (newOpenButton.focused || 0) + 1;
    ownerDocument.activeElement = newOpenButton;
  };
  ownerDocument.activeElement = oldOpenButton;
  const scheduledFrames = [];

  const controller = createResourcesController({
    elements,
    render: () => {
      dashboardButtons = [newOpenButton];
    },
    keyForItem: (item, type) => `${type}:${item.id}`,
    scheduleFrame: (callback) => scheduledFrames.push(callback)
  });

  controller.mount();
  controller.setResources({ tmEntries: [{ id: "tm-1" }], terms: [] });

  assert.equal(newOpenButton.focused, 1, "focus is restored before another frame can observe the replacement DOM");
  assert.equal(ownerDocument.activeElement, newOpenButton);
  scheduledFrames.splice(0).forEach((callback) => callback());
  assert.equal(newOpenButton.focused, 2, "the next frame reinforces focus after layout settles");
});

test("ResourcesController delegates imports, resource cards, rows, and cleanup without owning domain data", async () => {
  const { createResourcesController } = await moduleAt("src/features/resources/resources-controller.js");
  const elements = resourceElements();
  const calls = [];
  const tmEntry = { id: "tm-entry-1", tmName: "Main", source: "Hello", target: "Merhaba" };
  const term = { id: "term-1", termBaseName: "Terms", sourceTerm: "cat", targetTerm: "kedi" };
  const controller = createResourcesController({
    elements,
    render: () => {},
    keyForItem: (item, type) => `${type}:${item.tmName || item.termBaseName}`,
    navigate: () => calls.push("navigate"),
    normalizeLanguageInput: (input) => calls.push(["normalize", input]),
    runImportTask: async (label, task) => {
      calls.push(["import-task", label]);
      await task();
    },
    importTm: (file) => Promise.resolve(calls.push(["import-tm", file.name])),
    importTb: (file) => Promise.resolve(calls.push(["import-tb", file.name])),
    importTermList: (file) => Promise.resolve(calls.push(["import-list", file.name])),
    deleteResource: (type, key) => {
      calls.push(["delete-resource", type, key]);
      return Promise.resolve(true);
    },
    exportResource: (type, key) => calls.push(["export-resource", type, key]),
    saveTmEntry: (entry, values) => {
      calls.push(["save-tm", entry.id, values]);
      return Promise.resolve(true);
    },
    deleteTmEntry: (entry) => {
      calls.push(["delete-tm", entry.id]);
      return Promise.resolve(true);
    },
    saveTerm: (entry, values) => {
      calls.push(["save-term", entry.id, values]);
      return Promise.resolve(true);
    },
    deleteTerm: (entry) => {
      calls.push(["delete-term", entry.id]);
      return Promise.resolve(true);
    },
    confirmEntryDelete: () => true,
    scheduleFrame: (callback) => callback()
  });
  controller.mount();
  controller.setResources({ tmEntries: [tmEntry], terms: [term] });

  elements.viewButton.dispatch("click");
  elements.tmSourceLanguageInput.dispatch("change");
  elements.tmSourceLanguageInput.dispatch("blur");
  elements.tmImportInput.files = [{ name: "memory.tmx" }];
  elements.tmImportInput.value = "selected";
  elements.tmImportInput.dispatch("change");

  const exportButton = createActionButton("export", "tm", { key: "tm:Main" });
  elements.tmDashboard.dispatch("click", { target: exportButton });
  const deleteResourceButton = createActionButton("delete-resource", "tb", { key: "tb:Terms" });
  elements.tbDashboard.dispatch("click", { target: deleteResourceButton });

  const tmRow = fakeElement({ dataset: { resourceRow: "tm", resourceId: tmEntry.id } });
  tmRow.querySelector = (selector) =>
    selector.includes('"source"') ? { value: "Edited source" } : { value: "Edited target" };
  const saveTmButton = createActionButton("save-entry", "tm", { id: tmEntry.id, row: tmRow });
  elements.tmDetail.dispatch("click", { target: saveTmButton });
  const deleteTmButton = createActionButton("delete-entry", "tm", { id: tmEntry.id, row: tmRow });
  elements.tmDetail.dispatch("click", { target: deleteTmButton });

  const termRow = fakeElement({ dataset: { resourceRow: "tb", resourceId: term.id } });
  termRow.querySelector = (selector) => {
    if (selector.includes("sourceTerm")) return { value: "edited cat" };
    if (selector.includes("targetTerm")) return { value: "edited kedi" };
    if (selector.includes("notes")) return { value: "note" };
    return { checked: true };
  };
  const saveTermButton = createActionButton("save-entry", "tb", { id: term.id, row: termRow });
  elements.tbDetail.dispatch("click", { target: saveTermButton });

  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(elements.tmImportInput.value, "", "resource file inputs reset after delegated import");
  assert.equal(
    calls.some((call) => Array.isArray(call) && call[0] === "import-tm"),
    true
  );
  assert.equal(
    calls.some((call) => Array.isArray(call) && call[0] === "export-resource"),
    true
  );
  assert.equal(
    calls.some((call) => Array.isArray(call) && call[0] === "delete-resource"),
    true
  );
  assert.deepEqual(
    calls.find((call) => Array.isArray(call) && call[0] === "save-tm"),
    ["save-tm", tmEntry.id, { source: "Edited source", target: "Edited target" }]
  );
  assert.equal(
    calls.some((call) => Array.isArray(call) && call[0] === "delete-tm"),
    true
  );
  assert.deepEqual(
    calls.find((call) => Array.isArray(call) && call[0] === "save-term"),
    ["save-term", term.id, { sourceTerm: "edited cat", targetTerm: "edited kedi", notes: "note", isForbidden: true }]
  );

  assert.equal(controller.unmount(), true);
  elements.tmSourceLanguageInput.dispatch("change");
  assert.equal(
    calls.filter((call) => Array.isArray(call) && call[0] === "normalize").length,
    2,
    "unmounted Resources controls must not retain normalization listeners"
  );
});
