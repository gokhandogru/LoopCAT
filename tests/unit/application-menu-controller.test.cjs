const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-menu-controller.js")).href);
}

function createMenu(name, calls, { open = false, addError = null } = {}) {
  const listeners = new Map();
  return {
    name,
    open,
    addEventListener(type, listener) {
      calls.push([name, "addEventListener", type]);
      if (addError) throw addError;
      listeners.set(type, listener);
    },
    removeAttribute(attribute) {
      calls.push([name, "removeAttribute", attribute]);
      if (attribute === "open") this.open = false;
    },
    removeEventListener(type, listener) {
      calls.push([name, "removeEventListener", type, listeners.get(type) === listener]);
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type, event = {}) {
      return listeners.get(type)?.(event);
    }
  };
}

function createHarness(createApplicationMenuController, overrides = {}) {
  const calls = [];
  const first = createMenu("first", calls, overrides.first);
  const second = createMenu("second", calls, overrides.second);
  let menus = overrides.menus || [first, second];
  let documentClickListener = null;
  const documentRoot = {
    addEventListener(type, listener) {
      calls.push(["document", "addEventListener", type]);
      if (overrides.documentAddError) throw overrides.documentAddError;
      documentClickListener = listener;
    },
    querySelectorAll(selector) {
      calls.push(["document", "querySelectorAll", selector]);
      if (overrides.queryError) throw overrides.queryError;
      if (selector === ".menu") return menus;
      return menus.filter((menu) => menu.open);
    },
    removeEventListener(type, listener) {
      calls.push(["document", "removeEventListener", type, listener === documentClickListener]);
      if (listener === documentClickListener) documentClickListener = null;
    },
    dispatchClick(event) {
      return documentClickListener?.(event);
    }
  };
  const controller = createApplicationMenuController({
    documentRoot,
    selectors: { buttons: "button", menus: ".menu", openMenus: ".menu[open]" }
  });
  return {
    calls,
    controller,
    documentRoot,
    first,
    second,
    setMenus(nextMenus) {
      menus = nextMenus;
    }
  };
}

function clickTarget(calls, match) {
  return {
    closest(selector) {
      calls.push(["target", "closest", selector]);
      return match(selector);
    }
  };
}

test("ApplicationMenuController owns exact mount, repeated-mount, unmount, and immutable lifecycle", async () => {
  const { createApplicationMenuController } = await loadFactory();
  const harness = createHarness(createApplicationMenuController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.deepEqual(harness.calls.slice(0, 6), [
    ["document", "querySelectorAll", ".menu"],
    ["first", "addEventListener", "toggle"],
    ["first", "addEventListener", "click"],
    ["second", "addEventListener", "toggle"],
    ["second", "addEventListener", "click"],
    ["document", "addEventListener", "click"]
  ]);
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(harness.calls.slice(6), [
    ["first", "removeEventListener", "toggle", true],
    ["first", "removeEventListener", "click", true],
    ["second", "removeEventListener", "toggle", true],
    ["second", "removeEventListener", "click", true],
    ["document", "removeEventListener", "click", true]
  ]);
});

test("ApplicationMenuController preserves closed-toggle no-op and exclusive open behavior", async () => {
  const { createApplicationMenuController } = await loadFactory();
  const harness = createHarness(createApplicationMenuController, {
    first: { open: false },
    second: { open: true }
  });
  harness.controller.mount();
  harness.calls.length = 0;

  harness.first.dispatch("toggle");
  assert.deepEqual(harness.calls, []);

  harness.first.open = true;
  harness.first.dispatch("toggle");
  assert.deepEqual(harness.calls, [
    ["document", "querySelectorAll", ".menu[open]"],
    ["second", "removeAttribute", "open"]
  ]);
  assert.equal(harness.first.open, true);
  assert.equal(harness.second.open, false);
});

test("ApplicationMenuController closes a containing menu only for button clicks", async () => {
  const { createApplicationMenuController } = await loadFactory();
  const harness = createHarness(createApplicationMenuController, { first: { open: true } });
  harness.controller.mount();
  harness.calls.length = 0;

  harness.first.dispatch("click", { target: clickTarget(harness.calls, () => null) });
  assert.deepEqual(harness.calls, [["target", "closest", "button"]]);
  assert.equal(harness.first.open, true);

  harness.first.dispatch("click", { target: clickTarget(harness.calls, (selector) => selector === "button") });
  assert.deepEqual(harness.calls.slice(1), [
    ["target", "closest", "button"],
    ["first", "removeAttribute", "open"]
  ]);
  assert.equal(harness.first.open, false);
});

test("ApplicationMenuController preserves inside-click no-op plus live outside and direct closing", async () => {
  const { createApplicationMenuController } = await loadFactory();
  const harness = createHarness(createApplicationMenuController, {
    first: { open: true },
    second: { open: true }
  });
  harness.controller.mount();
  const late = createMenu("late", harness.calls, { open: true });
  harness.setMenus([harness.first, harness.second, late]);
  harness.calls.length = 0;

  harness.documentRoot.dispatchClick({
    target: clickTarget(harness.calls, (selector) => selector === ".menu")
  });
  assert.deepEqual(harness.calls, [["target", "closest", ".menu"]]);

  harness.documentRoot.dispatchClick({ target: clickTarget(harness.calls, () => null) });
  assert.deepEqual(harness.calls.slice(1), [
    ["target", "closest", ".menu"],
    ["document", "querySelectorAll", ".menu[open]"],
    ["first", "removeAttribute", "open"],
    ["second", "removeAttribute", "open"],
    ["late", "removeAttribute", "open"]
  ]);

  harness.first.open = true;
  harness.calls.length = 0;
  assert.equal(harness.controller.closeAll(), undefined);
  assert.deepEqual(harness.calls, [
    ["document", "querySelectorAll", ".menu[open]"],
    ["first", "removeAttribute", "open"]
  ]);
});

test("ApplicationMenuController preserves selector and listener delegate failure timing", async () => {
  const { createApplicationMenuController } = await loadFactory();
  const queryError = new Error("query failed");
  const queryHarness = createHarness(createApplicationMenuController, { queryError });
  assert.throws(() => queryHarness.controller.mount(), queryError);
  assert.deepEqual(queryHarness.calls, [["document", "querySelectorAll", ".menu"]]);

  const listenerError = new Error("listener failed");
  const listenerHarness = createHarness(createApplicationMenuController, {
    first: { addError: listenerError }
  });
  assert.throws(() => listenerHarness.controller.mount(), listenerError);
  assert.deepEqual(listenerHarness.calls, [
    ["document", "querySelectorAll", ".menu"],
    ["first", "addEventListener", "toggle"]
  ]);
});

test("ApplicationMenuController validates every boundary and selector", async () => {
  const { createApplicationMenuController } = await loadFactory();
  const validDocument = {
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
    removeEventListener() {}
  };
  const selectors = { buttons: "button", menus: ".menu", openMenus: ".menu[open]" };

  for (const input of [
    {},
    { documentRoot: {}, selectors },
    { documentRoot: validDocument, selectors: {} },
    { documentRoot: validDocument, selectors: { ...selectors, menus: "" } },
    { documentRoot: validDocument, selectors: { ...selectors, openMenus: "" } },
    { documentRoot: validDocument, selectors: { ...selectors, buttons: "" } }
  ]) {
    assert.throws(
      () => createApplicationMenuController(input),
      /ApplicationMenuController requires a document root and menu selector policy\./
    );
  }
});
