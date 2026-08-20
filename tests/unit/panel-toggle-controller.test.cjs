const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/panel-toggle-controller.js")).href);
}

function createPanel(calls, { collapsed = false, heading = "Analysis", inspectorSection = "" } = {}) {
  let isCollapsed = collapsed;
  return {
    dataset: { inspectorSection },
    classList: {
      contains(name) {
        calls.push(["panel", "contains", name, isCollapsed]);
        return name === "collapsed" && isCollapsed;
      },
      toggle(name) {
        calls.push(["panel", "toggle", name]);
        if (name === "collapsed") isCollapsed = !isCollapsed;
        return isCollapsed;
      }
    },
    querySelector(selector) {
      calls.push(["panel", "querySelector", selector]);
      return heading === null ? null : { textContent: heading };
    }
  };
}

function createButton(calls, panel, { ariaLabel = "", panelLabel = "", addError, removeError } = {}) {
  let listener = null;
  const attributes = new Map([["aria-label", ariaLabel]]);
  const button = {
    dataset: { panelLabel },
    addEventListener(type, nextListener) {
      calls.push(["button", "addEventListener", type, nextListener]);
      if (addError) throw addError;
      listener = nextListener;
    },
    click(event = {}) {
      return listener?.call(button, event);
    },
    closest(selector) {
      calls.push(["button", "closest", selector]);
      return panel;
    },
    getAttribute(name) {
      calls.push(["button", "getAttribute", name]);
      return attributes.get(name) || null;
    },
    removeEventListener(type, nextListener) {
      calls.push(["button", "removeEventListener", type, nextListener === listener]);
      if (removeError) throw removeError;
      if (nextListener === listener) listener = null;
    },
    setAttribute(name, value) {
      calls.push(["button", "setAttribute", name, value]);
      attributes.set(name, value);
    }
  };
  return button;
}

function createHarness(createPanelToggleController, options = {}) {
  const calls = [];
  let buttons = [];
  const documentRoot = {
    querySelectorAll(selector) {
      calls.push(["document", "querySelectorAll", selector]);
      if (options.queryError) throw options.queryError;
      return buttons;
    }
  };
  const inspector = {
    setOpen(value) {
      calls.push(["inspector", "setOpen", value]);
      if (options.stateError) throw options.stateError;
    },
    persistOpen(value) {
      calls.push(["inspector", "persistOpen", value]);
      if (options.layoutError) throw options.layoutError;
      return options.layoutResult;
    },
    setContext(context) {
      calls.push(["inspector", "setContext", context]);
      if (options.contextError) throw options.contextError;
    }
  };
  const localization = {
    translate(value) {
      calls.push(["localization", "translate", value]);
      if (options.translateError) throw options.translateError;
      return `localized:${value}`;
    }
  };
  const controller = createPanelToggleController({
    documentRoot,
    selectors: {
      toggles: "[data-panel-toggle]",
      panel: "[data-collapsible-panel]",
      heading: "h2, h3"
    },
    localization,
    inspector
  });
  return {
    calls,
    controller,
    documentRoot,
    inspector,
    localization,
    makeButton(panelOptions, buttonOptions) {
      const panel = panelOptions === null ? null : createPanel(calls, panelOptions);
      const button = createButton(calls, panel, buttonOptions);
      return { button, panel };
    },
    setButtons(nextButtons) {
      buttons = nextButtons;
    }
  };
}

test("PanelToggleController renders collapsed state with every label precedence and fallback", async () => {
  const { createPanelToggleController } = await loadFactory();
  const harness = createHarness(createPanelToggleController);
  for (const [panelOptions, buttonOptions, expected] of [
    [{ collapsed: true, heading: "Heading" }, { panelLabel: "Cached" }, "Expand Cached"],
    [{ heading: "Heading" }, { ariaLabel: " Collapse Explicit " }, "Minimize Explicit"],
    [{ heading: "Heading" }, {}, "Minimize Heading"],
    [{ heading: null }, {}, "Minimize panel"]
  ]) {
    const { button } = harness.makeButton(panelOptions, buttonOptions);
    harness.controller.render(button);
    assert.equal(button.dataset.panelLabel, expected.replace(/^(?:Expand|Minimize) /, ""));
    assert.equal(
      harness.calls.some(
        ([owner, operation, name, value]) =>
          owner === "button" &&
          operation === "setAttribute" &&
          name === "aria-label" &&
          value === `localized:${expected}`
      ),
      true
    );
    harness.calls.length = 0;
  }
});

test("PanelToggleController owns exact mount synchronization and listener lifecycle", async () => {
  const { createPanelToggleController } = await loadFactory();
  const harness = createHarness(createPanelToggleController);
  const first = harness.makeButton({ heading: "First" }, {}).button;
  const second = harness.makeButton({ heading: "Second" }, {}).button;
  harness.setButtons([first, second]);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  const firstAdd = harness.calls.findIndex(
    ([owner, operation]) => owner === "button" && operation === "addEventListener"
  );
  assert.ok(harness.calls.findIndex(([owner]) => owner === "localization") < firstAdd);
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.equal(harness.calls.filter(([, operation]) => operation === "removeEventListener").length, 2);
  assert.equal(
    harness.calls.every((call) => call[1] !== "removeEventListener" || call[3] === true),
    true
  );
});

test("PanelToggleController toggles a plain panel and ignores the native event", async () => {
  const { createPanelToggleController } = await loadFactory();
  const harness = createHarness(createPanelToggleController);
  const { button } = harness.makeButton({ heading: "Plain" }, {});
  harness.setButtons([button]);
  harness.controller.mount();
  harness.calls.length = 0;

  assert.equal(
    button.click(
      new Proxy(
        {},
        {
          get: () => {
            throw new Error("event inspected");
          }
        }
      )
    ),
    undefined
  );
  assert.equal(
    harness.calls.some(([owner]) => owner === "inspector"),
    false
  );
  assert.ok(
    harness.calls.findIndex((call) => call[1] === "toggle") <
      harness.calls.findIndex(([owner]) => owner === "localization")
  );
});

test("PanelToggleController preserves inspector open, persistence, context, toggle, and render order", async () => {
  const { createPanelToggleController } = await loadFactory();
  const layoutResult = Promise.resolve("persisted");
  const harness = createHarness(createPanelToggleController, { layoutResult });
  const { button } = harness.makeButton({ heading: "Review", inspectorSection: "review" }, {});
  harness.setButtons([button]);
  harness.controller.mount();
  harness.calls.length = 0;
  button.click();

  assert.deepEqual(harness.calls.slice(0, 4), [
    ["button", "closest", "[data-collapsible-panel]"],
    ["inspector", "setOpen", true],
    ["inspector", "persistOpen", true],
    ["inspector", "setContext", { tab: "review" }]
  ]);
  assert.ok(harness.calls.findIndex((call) => call[1] === "toggle") > 3);
});

test("PanelToggleController uses live render-all queries and tolerates missing panels", async () => {
  const { createPanelToggleController } = await loadFactory();
  const harness = createHarness(createPanelToggleController);
  const missing = harness.makeButton(null, {}).button;
  harness.setButtons([missing]);
  assert.equal(harness.controller.render(missing), undefined);
  harness.controller.renderAll();
  const late = harness.makeButton({ heading: "Late" }, {}).button;
  harness.setButtons([late]);
  harness.controller.renderAll();
  assert.equal(late.dataset.panelLabel, "Late");
  assert.equal(
    harness.calls.filter(([owner, operation]) => owner === "document" && operation === "querySelectorAll").length,
    2
  );
});

test("PanelToggleController preserves synchronous click and lifecycle failure timing", async () => {
  const { createPanelToggleController } = await loadFactory();
  for (const [options, error, forbidden] of [
    [{ stateError: new Error("state failed") }, /state failed/, "persistOpen"],
    [{ layoutError: new Error("layout failed") }, /layout failed/, "setContext"],
    [{ contextError: new Error("context failed") }, /context failed/, "toggle"]
  ]) {
    const harness = createHarness(createPanelToggleController, options);
    const { button } = harness.makeButton({ inspectorSection: "review" }, {});
    harness.setButtons([button]);
    harness.controller.mount();
    harness.calls.length = 0;
    assert.throws(() => button.click(), error);
    assert.equal(
      harness.calls.some((call) => call[1] === forbidden),
      false
    );
  }

  const addHarness = createHarness(createPanelToggleController);
  const addButton = addHarness.makeButton({}, { addError: new Error("add failed") }).button;
  addHarness.setButtons([addButton]);
  assert.throws(() => addHarness.controller.mount(), /add failed/);
});

test("PanelToggleController validates injected query, selector, localization, and inspector boundaries", async () => {
  const { createPanelToggleController } = await loadFactory();
  const valid = {
    documentRoot: { querySelectorAll: () => [] },
    selectors: { toggles: "toggle", panel: "panel", heading: "heading" },
    localization: { translate: (value) => value },
    inspector: { setOpen() {}, persistOpen() {}, setContext() {} }
  };
  for (const mutation of [{ documentRoot: {} }, { selectors: {} }, { localization: {} }, { inspector: {} }]) {
    assert.throws(() => createPanelToggleController({ ...valid, ...mutation }), /PanelToggleController requires/);
  }
});
