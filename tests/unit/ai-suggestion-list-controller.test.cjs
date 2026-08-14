const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootPath = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(rootPath, relativePath)).href);

function fakeDocument() {
  const document = {
    createElement(tagName) {
      return fakeElement(document, tagName);
    },
    createDocumentFragment() {
      return fakeElement(document, "fragment");
    }
  };
  return document;
}

function fakeElement(ownerDocument, tagName = "div") {
  const listeners = new Map();
  const classes = new Set();
  let ownText = "";
  const element = {
    ownerDocument,
    tagName: tagName.toUpperCase(),
    children: [],
    parentElement: null,
    type: "",
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name)
    },
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) listener({ type, target: element });
    },
    append(...nodes) {
      nodes.filter(Boolean).forEach((node) => {
        if (node.tagName === "FRAGMENT") {
          element.append(...node.children);
          return;
        }
        node.parentElement = element;
        element.children.push(node);
      });
    },
    replaceChildren(...nodes) {
      element.children.forEach((child) => {
        child.parentElement = null;
      });
      element.children = [];
      ownText = "";
      element.append(...nodes);
    },
    querySelectorAll(tagName) {
      const tag = tagName.toUpperCase();
      const results = [];
      for (const child of element.children) {
        if (child.tagName === tag) results.push(child);
        results.push(...child.querySelectorAll(tagName));
      }
      return results;
    }
  };
  Object.defineProperty(element, "className", {
    get: () => [...classes].join(" "),
    set(value) {
      classes.clear();
      String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .forEach((name) => classes.add(name));
    }
  });
  Object.defineProperty(element, "textContent", {
    get: () => ownText + element.children.map((child) => child.textContent).join(""),
    set(value) {
      ownText = String(value ?? "");
      element.children = [];
    }
  });
  return element;
}

function fixture(overrides = {}) {
  const ownerDocument = fakeDocument();
  const root = fakeElement(ownerDocument);
  const calls = [];
  const state = {
    segment: overrides.segment ?? null
  };
  return {
    root,
    calls,
    state,
    options: {
      root,
      getSegment: () => state.segment,
      apply: (...args) => calls.push(args),
      source: (text, values = {}) => String(text).replace(/\{([^}]+)\}/g, (_match, key) => String(values[key] ?? "")),
      label: (key) => ({ applyToTarget: "Apply" })[key] || key,
      formatDateTime: (value) => `date:${value}`,
      ...overrides.options
    }
  };
}

test("AI suggestion list requires checked DOM, segment, apply, and date boundaries", async () => {
  const { createAiSuggestionListController } = await moduleAt("src/features/ai/ai-suggestion-list-controller.js");
  assert.throws(() => createAiSuggestionListController({}), /suggestion-list root/);
  const { options } = fixture();
  assert.throws(
    () => createAiSuggestionListController({ ...options, apply: null }),
    /segment, apply, localization, date-formatting, and DOM boundaries/
  );
});

test("AI suggestion list preserves the localized muted empty state", async () => {
  const { createAiSuggestionListController } = await moduleAt("src/features/ai/ai-suggestion-list-controller.js");
  const item = fixture({
    options: { source: (text) => `localized:${text}` }
  });
  const controller = createAiSuggestionListController(item.options);

  controller.render();

  assert.equal(item.root.textContent, "localized:No AI suggestions yet.");
  assert.equal(item.root.classList.contains("muted"), true);
  assert.deepEqual(item.root.children, []);
});

test("AI suggestion list preserves the newest-first four-card bound and heading fallbacks", async () => {
  const { createAiSuggestionListController } = await moduleAt("src/features/ai/ai-suggestion-list-controller.js");
  const item = fixture({
    segment: {
      target: "Current",
      aiSuggestions: [
        { id: "one", provider: "P1", model: "M1" },
        { id: "two", provider: "P2", confidence: 88 },
        { id: "three", provider: "", model: "" },
        { id: "four", provider: "P4", model: "M4" },
        { id: "five", provider: "P5", model: "M5" }
      ]
    }
  });
  const controller = createAiSuggestionListController(item.options);

  controller.render();

  assert.equal(item.root.classList.contains("muted"), false);
  assert.equal(item.root.children.length, 4);
  assert.deepEqual(
    item.root.children.map((card) => card.children[0].children.map((entry) => entry.textContent)),
    [
      ["P5", "M5"],
      ["P4", "M4"],
      ["AI", "review"],
      ["P2", "88%"]
    ]
  );
  assert.equal(
    item.root.children.every((card) => card.classList.contains("ai-suggestion-card")),
    true
  );
});

test("AI suggestion list preserves safe provenance, inspection, and ordered explanations", async () => {
  const { createAiSuggestionListController } = await moduleAt("src/features/ai/ai-suggestion-list-controller.js");
  const item = fixture({
    segment: {
      target: "",
      aiSuggestions: [
        {
          id: "safe",
          provider: "Provider <b>",
          origin: "Origin <img>",
          scope: "project",
          createdAt: "now",
          suggestedTarget: "Suggested <script>",
          explanation: ["First <em>", "Second & final"]
        }
      ]
    }
  });
  const controller = createAiSuggestionListController(item.options);

  controller.render();

  const card = item.root.children[0];
  assert.deepEqual(
    card.children.map((child) => child.tagName),
    ["HEADER", "P", "DETAILS", "UL", "FOOTER"]
  );
  assert.equal(card.children[1].className, "ai-suggestion-provenance muted");
  assert.equal(card.children[1].textContent, "Origin <img> suggestion · project · date:now");
  const inspection = card.children[2];
  assert.equal(inspection.className, "ai-suggestion-inspection");
  assert.equal(inspection.children[0].textContent, "Inspect proposed change");
  const diff = inspection.children[1];
  assert.equal(diff.className, "ai-suggestion-diff");
  assert.deepEqual(
    diff.children[0].children.map((entry) => entry.textContent),
    ["Current target", "Empty target"]
  );
  assert.deepEqual(
    diff.children[1].children.map((entry) => entry.textContent),
    ["Suggested target", "Suggested <script>"]
  );
  assert.deepEqual(
    card.children[3].children.map((entry) => entry.textContent),
    ["First <em>", "Second & final"]
  );
  assert.equal(card.querySelectorAll("SCRIPT").length, 0);
});

test("AI suggestion list routes Apply and Apply and next as separate intents", async () => {
  const { createAiSuggestionListController } = await moduleAt("src/features/ai/ai-suggestion-list-controller.js");
  const item = fixture({
    segment: { target: "Current", aiSuggestions: [{ id: "suggestion-7" }] }
  });
  const controller = createAiSuggestionListController(item.options);
  controller.render();

  const buttons = item.root.querySelectorAll("button");
  assert.equal(buttons.length, 2);
  assert.deepEqual(
    buttons.map((button) => ({ text: button.textContent, type: button.type, className: button.className })),
    [
      { text: "Apply", type: "button", className: "" },
      { text: "Apply and next", type: "button", className: "primary" }
    ]
  );
  buttons[0].dispatch("click");
  buttons[1].dispatch("click");
  assert.deepEqual(item.calls, [["suggestion-7"], ["suggestion-7", { andNext: true }]]);
});
