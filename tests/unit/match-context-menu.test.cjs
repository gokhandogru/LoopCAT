const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

async function setup() {
  const { createMatchContextMenu } = await import(
    pathToFileURL(path.resolve(__dirname, "../../src/ui/match-context-menu.js")).href
  );
  function eventTarget() {
    const listeners = new Map();
    return {
      listeners,
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      removeEventListener(type, listener) {
        if (listeners.get(type) === listener) listeners.delete(type);
      }
    };
  }
  const document = { ...eventTarget(), activeElement: null, body: null, createElement };
  function createElement(tagName) {
    return {
      ...eventTarget(),
      tagName,
      children: [],
      attributes: {},
      style: {},
      textContent: "",
      isConnected: true,
      offsetWidth: 180,
      offsetHeight: 120,
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return this.attributes[name];
      },
      append(child) {
        this.children.push(child);
        child.parent = this;
      },
      remove() {
        this.isConnected = false;
        if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      },
      contains(target) {
        return this === target || this.children.includes(target);
      },
      focus() {
        document.activeElement = this;
      },
      getBoundingClientRect() {
        return { left: 30, bottom: 60 };
      }
    };
  }
  document.body = createElement("body");
  const window = { ...eventTarget(), innerWidth: 400, innerHeight: 300 };
  const anchor = createElement("article");
  anchor.textContent = "source target termbase";
  const errors = [];
  const controller = createMatchContextMenu({ document, window, onError: (error) => errors.push(error) });
  const event = { type: "contextmenu", clientX: 390, clientY: 290, preventDefault() {} };
  const key = (value) => {
    let prevented = false,
      stopped = false;
    document.listeners.get("keydown")?.({
      key: value,
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      }
    });
    return { prevented, stopped };
  };
  return { controller, document, window, anchor, errors, event, key };
}

test("match context menu stays within the viewport and skips disabled actions during keyboard navigation", async () => {
  const h = await setup();
  h.controller.open({
    event: h.event,
    anchor: h.anchor,
    items: [
      { label: "Insert", disabled: true, action() {} },
      { label: "Edit", action() {} },
      { label: "Delete", action() {} }
    ]
  });
  const menu = h.document.body.children[0];
  assert.equal(menu.attributes.role, "menu");
  assert.equal(menu.style.left, "212px");
  assert.equal(menu.style.top, "172px");
  assert.equal(h.document.activeElement.textContent, "Edit");
  assert.deepEqual(h.key("ArrowDown"), { prevented: true, stopped: true });
  assert.equal(h.document.activeElement.textContent, "Delete");
  h.key("ArrowDown");
  assert.equal(h.document.activeElement.textContent, "Edit");
  h.key("ArrowUp");
  assert.equal(h.document.activeElement.textContent, "Delete");
  h.key("Home");
  assert.equal(h.document.activeElement.textContent, "Edit");
  h.key("End");
  assert.equal(h.document.activeElement.textContent, "Delete");
  assert.deepEqual(h.key("Escape"), { prevented: true, stopped: true });
  assert.equal(h.document.activeElement, h.anchor);
  assert.equal(h.document.body.children.length, 0);
  assert.equal(h.document.listeners.size, 0);
  assert.equal(h.window.listeners.size, 0);
});

test("match context menu anchors keyboard opening to its row and closes on outside clicks, scrolling, and Tab", async () => {
  const h = await setup();
  const open = () =>
    h.controller.open({
      event: { type: "keydown", preventDefault() {} },
      anchor: h.anchor,
      items: [{ label: "Edit", action() {} }]
    });
  open();
  const menu = h.document.body.children[0];
  assert.equal(menu.style.left, "30px");
  assert.equal(menu.style.top, "60px");
  h.document.listeners.get("pointerdown")({ target: menu.children[0] });
  assert.equal(h.document.body.children.length, 1);
  h.document.listeners.get("pointerdown")({ target: h.anchor });
  assert.equal(h.document.body.children.length, 0);
  open();
  h.document.listeners.get("scroll")();
  assert.equal(h.document.body.children.length, 0);
  open();
  assert.equal(h.key("Tab").prevented, false);
  assert.equal(h.document.activeElement, h.anchor);
  assert.equal(h.document.body.children.length, 0);
});

test("match context menu closes before invoking an action and routes async failures to the error boundary", async () => {
  const h = await setup();
  let called = 0;
  const failure = new Error("save failed");
  h.controller.open({
    event: h.event,
    anchor: h.anchor,
    items: [
      {
        label: "Insert",
        disabled: true,
        action() {
          called++;
        }
      },
      {
        label: "Edit",
        async action() {
          assert.equal(h.document.body.children.length, 0);
          called++;
          return await Promise.reject(failure);
        }
      }
    ]
  });
  const menu = h.document.body.children[0];
  menu.children[0].listeners.get("click")();
  assert.equal(called, 0);
  menu.children[1].listeners.get("click")();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(called, 1);
  assert.deepEqual(h.errors, [failure]);
  assert.equal(h.document.activeElement, h.anchor);
});

test("opening another match context menu removes previous listeners and never leaves empty menus", async () => {
  const h = await setup();
  const items = [{ label: "Edit", action() {} }];
  h.controller.open({ event: h.event, anchor: h.anchor, items });
  const first = h.document.body.children[0];
  h.controller.open({ event: h.event, anchor: h.anchor, items });
  assert.equal(first.isConnected, false);
  assert.equal(h.document.body.children.length, 1);
  assert.equal(h.document.listeners.size, 3);
  h.controller.open({ event: h.event, anchor: h.anchor, items: [{ ...items[0], disabled: true }] });
  assert.equal(h.document.body.children.length, 0);
  assert.equal(h.document.listeners.size, 0);
  assert.equal(h.window.listeners.size, 0);
});
