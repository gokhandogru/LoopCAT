const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeElement(tagName = "DIV") {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map();
  const element = {
    tagName,
    children: [],
    className: "",
    textContent: "",
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      }
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event = {}) {
      const nextEvent = { target: element, ...event };
      listeners.get(type)?.forEach((listener) => listener(nextEvent));
      return nextEvent;
    },
    click() {
      element.dispatch("click");
    },
    append(child) {
      element.children.push(child);
    },
    replaceChildren(...children) {
      element.children = children;
    },
    querySelector(selector) {
      if (selector !== "footer") return null;
      element.footer ||= fakeElement("FOOTER");
      return element.footer;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    focus() {
      element.focused = (element.focused || 0) + 1;
    }
  };
  return element;
}

function createHarness(createConcordanceController, overrides = {}) {
  const calls = [];
  const overlay = fakeElement();
  overlay.classList.add("hidden");
  const closeButton = fakeElement("BUTTON");
  const meta = fakeElement();
  const results = fakeElement();
  let selectionText = overrides.selectionText || "";
  let activeElement = overrides.activeElement || null;
  const project =
    overrides.project === undefined ? { id: "p1", sourceLang: "en", targetLang: "tr" } : overrides.project;
  const entries = overrides.entries || [];
  const controller = createConcordanceController({
    elements: { overlay, closeButton, meta, results },
    session: {
      getProject() {
        calls.push(["getProject"]);
        return project;
      }
    },
    navigation: { getView: () => overrides.view || "editor" },
    tm: {
      listEntries() {
        calls.push(["listEntries"]);
        return overrides.listError ? Promise.reject(overrides.listError) : Promise.resolve(entries);
      },
      getNames() {
        calls.push(["getNames"]);
        return overrides.tmNames || ["Main TM"];
      }
    },
    resources: { summary: () => ({ tmLabel: "Main TM + linked" }) },
    languages: { display: () => "English → Turkish" },
    localization: {
      label(key, values) {
        calls.push(["label", key, values]);
        return `${values.keyword}|${values.resource}|${values.pair}|${values.count}`;
      },
      source(text) {
        calls.push(["source", text]);
        return `localized:${text}`;
      },
      sourceHtml(text) {
        calls.push(["sourceHtml", text]);
        return `safe:${text}`;
      }
    },
    text: {
      normalizeCase: (text) => String(text || "").toLocaleLowerCase("en"),
      escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      },
      escapeRegExp: (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    },
    safeHtml: {
      replace(element, html) {
        calls.push(["replaceSafeHtml", element, html]);
        element.html = html;
      }
    },
    target: { insert: (target, provenance) => calls.push(["insert", target, provenance]) },
    status: { set: (message, mode) => calls.push(["status", message, mode]) },
    dom: {
      getSelection: () => ({ toString: () => selectionText }),
      getActiveElement: () => activeElement,
      createElement: (tagName) => fakeElement(tagName.toUpperCase()),
      createFragment: () => fakeElement("FRAGMENT")
    }
  });
  return {
    calls,
    closeButton,
    controller,
    meta,
    overlay,
    results,
    setActiveElement(value) {
      activeElement = value;
    },
    setSelection(value) {
      selectionText = value;
    }
  };
}

test("ConcordanceController preserves global selection precedence, input fallback, whitespace collapse, and empty fallback", async () => {
  const { createConcordanceController } = await moduleAt("src/features/editor/concordance-controller.js");
  const harness = createHarness(createConcordanceController, {
    selectionText: "  global\n  phrase  ",
    activeElement: { tagName: "TEXTAREA", value: "input phrase", selectionStart: 0, selectionEnd: 5 }
  });
  assert.equal(harness.controller.selectedKeyword(), "global phrase");
  harness.setSelection("");
  assert.equal(harness.controller.selectedKeyword(), "input");
  harness.setActiveElement({ tagName: "DIV", value: "ignored", selectionStart: 0, selectionEnd: 7 });
  assert.equal(harness.controller.selectedKeyword(), "");
});

test("ConcordanceController escapes before case-insensitive repeated highlighting", async () => {
  const { createConcordanceController } = await moduleAt("src/features/editor/concordance-controller.js");
  const { controller } = createHarness(createConcordanceController);
  assert.equal(
    controller.highlight("<b>Alpha & alpha</b>", "alpha"),
    "&lt;b&gt;<mark>Alpha</mark> &amp; <mark>alpha</mark>&lt;/b&gt;"
  );
  assert.equal(controller.highlight("<b>text</b>", "<b>"), "<mark>&lt;b&gt;</mark>text&lt;/b&gt;");
});

test("ConcordanceController owns idempotent close-button and backdrop lifecycle with result clearing", async () => {
  const { createConcordanceController } = await moduleAt("src/features/editor/concordance-controller.js");
  const harness = createHarness(createConcordanceController);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  harness.overlay.classList.remove("hidden");
  harness.results.replaceChildren({ stale: true });
  harness.overlay.dispatch("click", { target: { child: true } });
  assert.equal(harness.overlay.classList.contains("hidden"), false);
  harness.overlay.dispatch("click");
  assert.equal(harness.overlay.classList.contains("hidden"), true);
  assert.deepEqual(harness.results.children, []);
  harness.overlay.classList.remove("hidden");
  harness.closeButton.dispatch("click");
  assert.equal(harness.overlay.classList.contains("hidden"), true);
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
});

test("ConcordanceController preserves editor/project guards and exact empty-keyword status", async () => {
  const { createConcordanceController } = await moduleAt("src/features/editor/concordance-controller.js");
  const wrongView = createHarness(createConcordanceController, { view: "projects", selectionText: "term" });
  assert.equal(await wrongView.controller.open(), undefined);
  assert.equal(
    wrongView.calls.some(([name]) => name === "listEntries"),
    false
  );
  const noProject = createHarness(createConcordanceController, { project: null, selectionText: "term" });
  assert.equal(await noProject.controller.open(), undefined);
  const empty = createHarness(createConcordanceController);
  assert.equal(await empty.controller.open(), undefined);
  assert.deepEqual(
    empty.calls.find(([name]) => name === "status"),
    ["status", "Select source or target text, then press Ctrl/Cmd+Shift+K.", "dirty"]
  );
});

test("ConcordanceController filters linked language-pair results, sorts newest first, renders safely, inserts, and closes", async () => {
  const { createConcordanceController } = await moduleAt("src/features/editor/concordance-controller.js");
  const harness = createHarness(createConcordanceController, {
    selectionText: "Alpha",
    tmNames: ["Main TM", "Linked TM"],
    entries: [
      {
        id: "old",
        source: "Alpha old",
        target: "Eski",
        sourceLang: "en",
        targetLang: "tr",
        tmName: "Main TM",
        projectName: "<Old>",
        createdAt: "2026-01-01"
      },
      {
        id: "new",
        source: "new ALPHA",
        target: "Yeni Alpha",
        sourceLang: "en",
        targetLang: "tr",
        tmName: "Linked TM",
        updatedAt: "2026-08-20"
      },
      { id: "wrong-pair", source: "Alpha", target: "Non", sourceLang: "fr", targetLang: "tr", tmName: "Main TM" },
      { id: "unlinked", source: "Alpha", target: "No", sourceLang: "en", targetLang: "tr", tmName: "Other TM" },
      { id: "no-match", source: "Beta", target: "No", sourceLang: "en", targetLang: "tr", tmName: "Main TM" }
    ]
  });
  await harness.controller.open();
  assert.equal(harness.overlay.classList.contains("hidden"), false);
  assert.equal(harness.meta.textContent, "Alpha|Main TM + linked|English → Turkish|2");
  const fragment = harness.results.children[0];
  assert.equal(fragment.children.length, 2);
  const newestCard = fragment.children[0];
  assert.match(newestCard.html, /new <mark>ALPHA<\/mark>/);
  assert.match(newestCard.html, /Yeni <mark>Alpha<\/mark>/);
  const oldestCard = fragment.children[1];
  assert.match(oldestCard.html, /&lt;Old&gt;/);
  const insertButton = newestCard.footer.children[0];
  assert.equal(insertButton.type, "button");
  assert.equal(insertButton.textContent, "localized:Insert target");
  insertButton.dispatch("click");
  assert.deepEqual(
    harness.calls.find(([name]) => name === "insert"),
    ["insert", "Yeni Alpha", { channel: "concordance", resourceId: "new" }]
  );
  assert.equal(harness.overlay.classList.contains("hidden"), true);
  assert.deepEqual(harness.results.children, []);
});

test("ConcordanceController renders the localized safe empty state and opens the overlay", async () => {
  const { createConcordanceController } = await moduleAt("src/features/editor/concordance-controller.js");
  const harness = createHarness(createConcordanceController, { selectionText: "missing" });
  await harness.controller.open();
  assert.equal(harness.results.html, '<div class="muted">safe:No TM units contain this keyword.</div>');
  assert.equal(harness.overlay.classList.contains("hidden"), false);
});

test("ConcordanceController supports keyboard result navigation, insertion, cancellation, and focus restoration", async () => {
  const { createConcordanceController } = await moduleAt("src/features/editor/concordance-controller.js");
  const returnTarget = fakeElement("TEXTAREA");
  returnTarget.value = "Alpha";
  returnTarget.selectionStart = 0;
  returnTarget.selectionEnd = 5;
  const harness = createHarness(createConcordanceController, {
    activeElement: returnTarget,
    entries: [
      { id: "one", source: "Alpha one", target: "Bir", sourceLang: "en", targetLang: "tr", tmName: "Main TM" },
      { id: "two", source: "Alpha two", target: "İki", sourceLang: "en", targetLang: "tr", tmName: "Main TM" }
    ]
  });
  harness.controller.mount();
  await harness.controller.open();
  const cards = harness.results.children[0].children;
  const firstButton = cards[0].footer.children[0];
  const secondButton = cards[1].footer.children[0];
  assert.equal(firstButton.getAttribute("aria-selected"), "true");

  harness.overlay.dispatch("keydown", { key: "ArrowDown", preventDefault() {} });
  assert.equal(secondButton.getAttribute("aria-selected"), "true");
  harness.overlay.dispatch("keydown", { key: "Enter", preventDefault() {} });
  assert.deepEqual(
    harness.calls.find(([name]) => name === "insert"),
    ["insert", "İki", { channel: "concordance", resourceId: "two" }]
  );
  assert.equal(returnTarget.focused, 1);

  await harness.controller.open();
  harness.overlay.dispatch("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(harness.overlay.classList.contains("hidden"), true);
  assert.equal(returnTarget.focused, 2);
});

test("ConcordanceController propagates repository failure before changing overlay visibility", async () => {
  const { createConcordanceController } = await moduleAt("src/features/editor/concordance-controller.js");
  const listError = new Error("TM unavailable");
  const harness = createHarness(createConcordanceController, { selectionText: "term", listError });
  await assert.rejects(() => harness.controller.open(), listError);
  assert.equal(harness.overlay.classList.contains("hidden"), true);
});

test("ConcordanceController validates collaborators and exposes an immutable API", async () => {
  const { createConcordanceController } = await moduleAt("src/features/editor/concordance-controller.js");
  assert.throws(() => createConcordanceController({}), /requires overlay elements/);
  const { controller } = createHarness(createConcordanceController);
  assert.equal(Object.isFrozen(controller), true);
});
