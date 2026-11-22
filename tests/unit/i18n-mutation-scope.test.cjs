const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function runtime() {
  const frames = [],
    walks = [];
  let mutate;
  const body = element("BODY");
  const document = {
    body,
    documentElement: {},
    querySelectorAll: () => [],
    createTreeWalker(root) {
      walks.push(root);
      return { nextNode: () => false };
    }
  };
  const context = vm.createContext({
    window: { dispatchEvent() {} },
    document,
    navigator: { languages: ["ar"] },
    Intl,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    CustomEvent: class {},
    requestAnimationFrame: (fn) => frames.push(fn),
    MutationObserver: class {
      constructor(fn) {
        mutate = fn;
      }
      observe() {}
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../i18n.js"), "utf8"), context);
  const api = context.window.CatHan.i18n;
  api.registerSource({ hello: "Hello", save: "Save" });
  api.registerLocale({ locale: "ar", messages: { hello: "مرحبا", save: "حفظ" } });
  api.init();
  walks.length = 0;
  return {
    api,
    body,
    walks,
    frames,
    mutate: (...args) => mutate(...args),
    flush: () => frames.splice(0).forEach((f) => f())
  };
}
function element(tagName = "DIV", parentNode = null, attrs = {}) {
  return {
    nodeType: 1,
    tagName,
    parentNode,
    parentElement: parentNode,
    isConnected: true,
    dataset: {},
    textContent: "",
    attrs,
    skipped: false,
    closest(selector) {
      if (selector === "[data-i18n]") return this.dataset.i18n ? this : this.parentElement?.closest(selector);
      return this.skipped || this.parentElement?.closest() ? this : null;
    },
    querySelectorAll: () => [],
    hasAttribute(name) {
      return Object.hasOwn(this.attrs, name);
    },
    getAttribute(name) {
      return this.attrs[name] ?? null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    matches(selector) {
      return (
        (selector === "[data-i18n]" && Boolean(this.dataset.i18n)) ||
        (selector === "[data-i18n-title]" && Boolean(this.dataset.i18nTitle))
      );
    }
  };
}
const text = (value, parent) => ({
  nodeType: 3,
  nodeValue: value,
  parentNode: parent,
  parentElement: parent,
  isConnected: true
});

test("typing never rescans the shell and status text localizes without a tree walk", () => {
  const r = runtime();
  const editor = element("DIV", r.body);
  editor.skipped = true;
  const target = text("Hello", editor);
  r.mutate([
    { type: "characterData", target },
    { type: "childList", target: editor, addedNodes: [target] }
  ]);
  assert.equal(r.frames.length, 0);
  assert.equal(target.nodeValue, "Hello");
  const status = text("Save", element("SPAN", r.body));
  r.mutate([{ type: "characterData", target: status }]);
  r.flush();
  assert.equal(status.nodeValue, "حفظ");
  assert.deepEqual(r.walks, []);
  status.nodeValue = "Hello";
  r.mutate([{ type: "characterData", target: status }]);
  r.flush();
  assert.equal(status.nodeValue, "مرحبا");
});

test("inserted sibling roots are batched, nested roots deduplicated, removed nodes ignored, manual root keys included", () => {
  const r = runtime();
  const first = element("SPAN", r.body),
    second = element("BUTTON", r.body),
    nested = element("EM", first);
  const removed = element("DIV", r.body);
  removed.isConnected = false;
  first.dataset.i18n = "hello";
  r.mutate([{ type: "childList", target: r.body, addedNodes: [first, second, nested, removed] }]);
  assert.equal(r.frames.length, 1);
  r.flush();
  assert.deepEqual(r.walks, [first, second]);
  assert.equal(first.textContent, "مرحبا");
  assert.ok(!r.walks.includes(r.body));
  r.mutate([{ type: "childList", target: r.body, addedNodes: [] }]);
  assert.equal(r.frames.length, 0);
  r.api.setLocale("en-US");
  assert.equal(r.walks.at(-1), r.body, "locale changes still localize the whole shell");
  r.api.localizeStaticDom(first);
  assert.equal(first.textContent, "Hello");
});

test("attribute-only updates localize one control and preserve editable content", () => {
  const r = runtime();
  const input = element("INPUT", r.body, { title: "Save" });
  input.skipped = true;
  input.value = "Hello";
  input.querySelectorAll = () => {
    throw Error("attribute update traversed descendants");
  };
  r.mutate([{ type: "attributes", target: input }]);
  r.flush();
  assert.equal(input.attrs.title, "حفظ");
  assert.equal(input.value, "Hello");
  assert.deepEqual(r.walks, []);
  r.api.registerLocale({ locale: "ar", messages: { save: "حفظ جديد" } });
  r.mutate([{ type: "attributes", target: input }]);
  r.flush();
  assert.equal(input.attrs.title, "حفظ جديد", "custom catalog replacement invalidates cached attributes");
  input.dataset.i18nTitle = "save";
  input.attrs.title = "Hello";
  r.mutate([{ type: "attributes", target: input }]);
  r.flush();
  assert.equal(input.attrs.title, "حفظ جديد", "an explicit attribute key remains authoritative");
});

test("replacing a catalog in the same locale invalidates cached text translations", () => {
  const r = runtime();
  const status = text("Save", r.body);
  r.mutate([{ type: "characterData", target: status }]);
  r.flush();
  assert.equal(status.nodeValue, "حفظ");
  r.api.registerLocale({ locale: "ar", messages: { save: "حفظ جديد" } });
  r.api.localizeStaticDom(status);
  assert.equal(status.nodeValue, "حفظ جديد");
});

test("an existing explicit text key remains authoritative when its descendants change", () => {
  const r = runtime(),
    button = element("BUTTON", r.body),
    nested = element("SPAN", button);
  button.dataset.i18n = "save";
  const content = text("Hello", nested);
  r.mutate([{ type: "childList", target: button, addedNodes: [nested] }]);
  r.flush();
  assert.equal(button.textContent, "حفظ");
  button.textContent = "Hello";
  r.mutate([{ type: "characterData", target: content }]);
  r.flush();
  assert.equal(button.textContent, "حفظ");
  assert.ok(!r.walks.includes(r.body));
});
