const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/quick-insert-controller.js")).href);
}

function createDocument(calls) {
  const document = {
    activeElement: null,
    createElement(tagName) {
      return createNode(tagName, document, calls);
    },
    createDocumentFragment() {
      return createNode("#fragment", document, calls);
    }
  };
  return document;
}

function createNode(tagName, ownerDocument, calls) {
  const classes = new Set();
  const listeners = new Map();
  const attributes = new Map();
  const node = {
    tagName,
    ownerDocument,
    children: [],
    dataset: {},
    tabIndex: 0,
    textContent: "",
    type: "",
    classList: {
      add(...names) {
        names.forEach((name) => classes.add(name));
      },
      remove(...names) {
        names.forEach((name) => classes.delete(name));
      },
      contains(name) {
        return classes.has(name);
      },
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      }
    },
    get className() {
      return [...classes].join(" ");
    },
    set className(value) {
      classes.clear();
      String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .forEach((name) => classes.add(name));
    },
    addEventListener(type, listener) {
      const group = listeners.get(type) || [];
      group.push(listener);
      listeners.set(type, group);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) || []).filter((candidate) => candidate !== listener)
      );
    },
    dispatch(type, event = {}) {
      const nextEvent = {
        target: node,
        preventDefault: () => calls.push(["preventDefault", type]),
        ...event
      };
      for (const listener of listeners.get(type) || []) listener(nextEvent);
      return nextEvent;
    },
    click() {
      node.dispatch("click");
    },
    append(...children) {
      for (const child of children) {
        if (child?.tagName === "#fragment") node.children.push(...child.children);
        else node.children.push(child);
      }
    },
    replaceChildren(...children) {
      node.children = [...children];
    },
    querySelectorAll(selector) {
      const found = [];
      function visit(current) {
        for (const child of current.children || []) {
          if (selector === "[data-quick-insert-index]" && child.dataset?.quickInsertIndex !== undefined) {
            found.push(child);
          }
          visit(child);
        }
      }
      visit(node);
      return found;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    focus() {
      ownerDocument.activeElement = node;
      calls.push(["focus", tagName, node.dataset.quickInsertIndex]);
    }
  };
  return node;
}

function createHarness(createQuickInsertController, overrides = {}) {
  const calls = [];
  const document = createDocument(calls);
  const returnTarget = createNode("textarea", document, calls);
  document.activeElement = returnTarget;
  const overlay = createNode("overlay", document, calls);
  overlay.classList.add("hidden");
  const results = createNode("results", document, calls);
  const closeButton = createNode("close", document, calls);
  const meta = createNode("meta", document, calls);
  let project = overrides.project === undefined ? { id: "p1" } : overrides.project;
  let segment = overrides.segment === undefined ? { id: "s1" } : overrides.segment;
  const tm = overrides.tm || [];
  const terms = overrides.terms || [];
  const ai = overrides.ai || [];
  const controller = createQuickInsertController({
    elements: { overlay, results, closeButton, meta },
    session: {
      getProject: () => project,
      getSegment: () => segment
    },
    sources: {
      refreshTm: () => {
        calls.push(["refreshTm"]);
        return Promise.resolve();
      },
      getTm: () => tm,
      refreshTerms: () => {
        calls.push(["refreshTerms"]);
        return Promise.resolve();
      },
      getTerms: () => terms,
      getAi: () => ai
    },
    actions: {
      insertTm: (...args) => {
        calls.push(["insertTm", ...args]);
        return Promise.resolve();
      },
      insertTerm: (...args) => {
        calls.push(["insertTerm", ...args]);
        return Promise.resolve();
      },
      applyAi: (...args) => {
        calls.push(["applyAi", ...args]);
        return Promise.resolve();
      }
    },
    localization: { source: (value) => `L:${value}` },
    status: { set: (...args) => calls.push(["status", ...args]) },
    focus: {
      open: (_surface, options) => {
        calls.push(["focusOpen"]);
        options.initialFocus?.focus();
      },
      close: () => calls.push(["focusClose"])
    }
  });
  return {
    calls,
    closeButton,
    controller,
    meta,
    overlay,
    results,
    returnTarget,
    setProject: (value) => {
      project = value;
    },
    setSegment: (value) => {
      segment = value;
    }
  };
}

function tm(index) {
  return { id: `tm-${index}`, score: 100 - index, source: `source ${index}`, target: `target ${index}` };
}

function term(index, overrides = {}) {
  return {
    id: `term-${index}`,
    sourceTerm: `source term ${index}`,
    targetTerm: `target term ${index}`,
    termBaseName: "Main",
    ...overrides
  };
}

test("Quick Insert ranks four TM, three approved terms, and two newest saved AI results", async () => {
  const { createQuickInsertController } = await loadFactory();
  const harness = createHarness(createQuickInsertController, {
    tm: [tm(1), tm(2), tm(3), tm(4), tm(5)],
    terms: [term(1), term(2, { isForbidden: true }), term(3), term(4), term(5)],
    ai: [
      { id: "ai-old", suggestedTarget: "old", provider: "Local" },
      { id: "ai-newer", suggestedTarget: "newer", provider: "Local" },
      { id: "ai-newest", suggestedTarget: "newest", provider: "Local" }
    ]
  });

  assert.equal(harness.controller.hasSuggestions(), true);
  assert.equal(await harness.controller.open(), true);
  assert.equal(harness.controller.isOpen(), true);
  assert.deepEqual(
    harness.calls.filter(([name]) => name.startsWith("refresh")),
    [["refreshTm"], ["refreshTerms"]]
  );
  assert.equal(harness.results.children.length, 9);
  assert.deepEqual(
    harness.results.children.map((button) => button.children[3].textContent),
    [
      "target 1",
      "target 2",
      "target 3",
      "target 4",
      "target term 1",
      "target term 3",
      "target term 4",
      "newest",
      "newer"
    ]
  );
  assert.equal(harness.results.children[0].getAttribute("aria-selected"), "true");
  assert.match(harness.meta.textContent, /terms insert at the caret/);
});

test("Quick Insert applies TM replacement, term insertion metadata, and saved AI identity", async () => {
  const { createQuickInsertController } = await loadFactory();

  const tmHarness = createHarness(createQuickInsertController, { tm: [tm(1)] });
  await tmHarness.controller.open();
  assert.equal(await tmHarness.controller.execute(0), true);
  assert.deepEqual(
    tmHarness.calls.find(([name]) => name === "insertTm"),
    ["insertTm", "target 1", { channel: "match", resourceId: "tm-1" }]
  );

  const termHarness = createHarness(createQuickInsertController, { terms: [term(1)] });
  await termHarness.controller.open();
  assert.equal(await termHarness.controller.execute(0), true);
  assert.deepEqual(
    termHarness.calls.find(([name]) => name === "insertTerm"),
    ["insertTerm", "target term 1", { resourceId: "term-1", sourceTerm: "source term 1" }]
  );

  const aiHarness = createHarness(createQuickInsertController, {
    ai: [{ id: "ai-1", suggestedTarget: "suggested", provider: "OpenAI" }]
  });
  await aiHarness.controller.open();
  assert.equal(await aiHarness.controller.execute(0), true);
  assert.deepEqual(
    aiHarness.calls.find(([name]) => name === "applyAi"),
    ["applyAi", "ai-1"]
  );
  assert.ok(aiHarness.calls.some(([name]) => name === "focusClose"));
  assert.ok(aiHarness.calls.filter(([name, tag]) => name === "focus" && tag === "textarea").length >= 1);
});

test("Quick Insert keyboard navigation supports wrap, direct numbers, Enter, Escape, and IME safety", async () => {
  const { createQuickInsertController } = await loadFactory();
  const harness = createHarness(createQuickInsertController, { tm: [tm(1), tm(2)] });
  harness.controller.mount();
  await harness.controller.open();

  harness.overlay.dispatch("keydown", { key: "ArrowUp" });
  assert.equal(harness.results.children[1].getAttribute("aria-selected"), "true");
  harness.overlay.dispatch("keydown", { key: "1" });
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.ok(harness.calls.some(([name, value]) => name === "insertTm" && value === "target 1"));

  await harness.controller.open();
  harness.overlay.dispatch("keydown", { isComposing: true, key: "Enter" });
  assert.equal(harness.controller.isOpen(), true);
  harness.overlay.dispatch("keydown", { key: "Escape" });
  assert.equal(harness.controller.isOpen(), false);
  assert.equal(harness.controller.unmount(), true);
});

test("Quick Insert keeps the editor closed for empty or stale contexts and reports empty results", async () => {
  const { createQuickInsertController } = await loadFactory();
  const empty = createHarness(createQuickInsertController);
  assert.equal(empty.controller.hasSuggestions(), false);
  assert.equal(await empty.controller.open(), false);
  assert.equal(empty.controller.isOpen(), false);
  assert.deepEqual(
    empty.calls.find(([name]) => name === "status"),
    ["status", "L:No TM, terminology, or saved AI suggestions are available.", "saved"]
  );

  const missing = createHarness(createQuickInsertController, { project: null });
  assert.equal(await missing.controller.open(), false);
  assert.equal(
    missing.calls.some(([name]) => name.startsWith("refresh")),
    false
  );
});

test("Quick Insert validates boundaries and exposes an immutable lifecycle API", async () => {
  const { createQuickInsertController } = await loadFactory();
  assert.throws(() => createQuickInsertController({}), /requires an overlay/);
  const harness = createHarness(createQuickInsertController);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  harness.closeButton.dispatch("click");
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
});
