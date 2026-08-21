const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeDocument() {
  const ownerDocument = {
    createElement(tagName) {
      return fakeElement(ownerDocument, tagName);
    },
    createTextNode(text) {
      return { nodeType: 3, textContent: String(text), parentElement: null };
    }
  };
  return ownerDocument;
}

function fakeElement(ownerDocument, tagName = "div") {
  const classes = new Set();
  const listeners = new Map();
  const queries = new Map();
  let text = "";
  const element = {
    ownerDocument,
    tagName: String(tagName).toUpperCase(),
    children: [],
    dataset: {},
    parentElement: null,
    type: "",
    title: "",
    onclick: null,
    focused: false,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      }
    },
    append(...nodes) {
      for (const node of nodes) {
        node.parentElement = element;
        element.children.push(node);
      }
    },
    querySelector(selector) {
      return queries.get(selector) || null;
    },
    setQuery(selector, value) {
      queries.set(selector, value);
      if (value) value.parentElement = element;
    },
    closest(selector) {
      let current = element;
      while (current) {
        if (selector === "tr" && current.tagName === "TR") return current;
        current = current.parentElement;
      }
      return null;
    },
    addEventListener(type, listener) {
      const group = listeners.get(type) || [];
      group.push(listener);
      listeners.set(type, group);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener.call(element, event);
      if (type === "click") element.onclick?.call(element, event);
    },
    focus() {
      element.focused = true;
    }
  };
  Object.defineProperties(element, {
    className: {
      get: () => [...classes].join(" "),
      set(value) {
        classes.clear();
        String(value || "")
          .split(/\s+/)
          .filter(Boolean)
          .forEach((name) => classes.add(name));
      }
    },
    textContent: {
      get: () => text,
      set(value) {
        text = String(value ?? "");
        element.children = [];
      }
    }
  });
  return element;
}

function elementShape(node) {
  if (node.nodeType === 3) return ["text", node.textContent];
  return [node.tagName, node.className, node.textContent, node.title];
}

function createHarness(createSegmentMarkupPresentationService, overrides = {}) {
  const document = fakeDocument();
  const calls = [];
  const sourceTags = overrides.sourceTags || [];
  const targetTags = overrides.targetTags || [];
  const projectTerms = overrides.projectTerms || [{ id: "term-one" }];
  const service = createSegmentMarkupPresentationService({
    document,
    protectedTags: {
      displayText(tag) {
        calls.push(["displayText", tag]);
        return tag.label || tag.text || "";
      },
      sourceTags(segment) {
        calls.push(["sourceTags", segment]);
        if (overrides.sourceTagsError) throw overrides.sourceTagsError;
        return sourceTags;
      },
      targetTags(segment) {
        calls.push(["targetTags", segment]);
        if (overrides.targetTagsError) throw overrides.targetTagsError;
        return targetTags;
      }
    },
    terms: {
      ranges(text, terms) {
        calls.push(["ranges", text, terms]);
        if (overrides.rangesError) throw overrides.rangesError;
        return overrides.ranges || [];
      },
      getProjectTerms() {
        calls.push(["getProjectTerms"]);
        if (overrides.getProjectTermsError) throw overrides.getProjectTermsError;
        return projectTerms;
      }
    },
    navigation: {
      select(index) {
        calls.push(["select", index]);
        if (overrides.selectError) throw overrides.selectError;
        return overrides.selectResult || Promise.resolve();
      }
    },
    targetProducer: {
      insertProtectedTag(text) {
        calls.push(["insertProtectedTag", text]);
        if (overrides.insertError) throw overrides.insertError;
        return overrides.insertResult;
      }
    }
  });
  return { calls, document, service };
}

test("SegmentMarkupPresentationService preserves protected-tag and nonoverlapping term source markup", async () => {
  const { createSegmentMarkupPresentationService } = await moduleAt(
    "src/features/editor/segment-markup-presentation-service.js"
  );
  const segment = { source: "A {x} beta gamma" };
  const tag = { text: "{x}", label: "Placeholder", type: "code", index: 2 };
  const overlap = { index: 2, length: 3, term: { sourceTerm: "{x}", targetTerm: "ignored" } };
  const beta = { index: 6, length: 4, term: { sourceTerm: "beta", targetTerm: "BETA" } };
  const gamma = { index: 11, length: 5, term: { sourceTerm: "gamma", targetTerm: "GAMMA" } };
  const { calls, document, service } = createHarness(createSegmentMarkupPresentationService, {
    sourceTags: [tag],
    ranges: [overlap, beta, gamma]
  });
  const container = fakeElement(document);

  assert.equal(service.appendSource(container, segment), undefined);
  assert.deepEqual(container.children.map(elementShape), [
    ["text", "A "],
    ["BUTTON", "tag-chip tag-chip-code tag-chip-action", "Placeholder", "Insert protected text: {x}"],
    ["text", " "],
    ["MARK", "term-highlight", "beta", "Termbase: beta -> BETA"],
    ["text", " "],
    ["MARK", "term-highlight", "gamma", "Termbase: gamma -> GAMMA"]
  ]);
  assert.deepEqual(calls.slice(0, 4), [
    ["sourceTags", segment],
    ["getProjectTerms"],
    ["ranges", segment.source, [{ id: "term-one" }]],
    ["displayText", tag]
  ]);
});

test("SegmentMarkupPresentationService preserves source tag fallback ordering and trailing text", async () => {
  const { createSegmentMarkupPresentationService } = await moduleAt(
    "src/features/editor/segment-markup-presentation-service.js"
  );
  const tags = [
    { text: "{0}", label: "Late", index: 7 },
    { text: "LONG", label: "Long", index: 2 },
    { text: "missing", label: "Missing" }
  ];
  const snapshot = structuredClone(tags);
  const { document, service } = createHarness(createSegmentMarkupPresentationService, { sourceTags: tags });
  const container = fakeElement(document);

  service.appendSource(container, { source: "A LONG {0} tail" });

  assert.deepEqual(tags, snapshot);
  assert.deepEqual(container.children.map(elementShape), [
    ["text", "A "],
    ["BUTTON", "tag-chip tag-chip-placeholder tag-chip-action", "Long", "Insert protected text: LONG"],
    ["text", " "],
    ["BUTTON", "tag-chip tag-chip-placeholder tag-chip-action", "Late", "Insert protected text: {0}"],
    ["text", " tail"]
  ]);
});

test("SegmentMarkupPresentationService selects an integer closest row before inserting a source tag", async () => {
  const { createSegmentMarkupPresentationService } = await moduleAt(
    "src/features/editor/segment-markup-presentation-service.js"
  );
  let resolveSelection;
  const selection = new Promise((resolve) => {
    resolveSelection = resolve;
  });
  const tag = { text: "{0}", index: 0 };
  const { calls, document, service } = createHarness(createSegmentMarkupPresentationService, {
    sourceTags: [tag],
    selectResult: selection
  });
  const row = fakeElement(document, "tr");
  row.dataset.index = "4";
  const container = fakeElement(document);
  row.append(container);
  service.appendSource(container, { source: "{0}" });
  let stopped = 0;

  container.children[0].dispatch("click", { stopPropagation: () => stopped++ });

  assert.equal(stopped, 1);
  assert.deepEqual(calls.slice(-1), [["select", 4]]);
  resolveSelection();
  await selection;
  await Promise.resolve();
  assert.deepEqual(calls.slice(-2), [
    ["select", 4],
    ["insertProtectedTag", "{0}"]
  ]);
});

test("SegmentMarkupPresentationService preserves noninteger row fallback and selection failure timing", async () => {
  const { createSegmentMarkupPresentationService } = await moduleAt(
    "src/features/editor/segment-markup-presentation-service.js"
  );
  const tag = { text: "{0}", index: 0 };
  const fallback = createHarness(createSegmentMarkupPresentationService, { sourceTags: [tag] });
  const fallbackContainer = fakeElement(fallback.document);
  fallback.service.appendSource(fallbackContainer, { source: "{0}" });
  fallbackContainer.children[0].dispatch("click", { stopPropagation() {} });
  await Promise.resolve();
  assert.equal(
    fallback.calls.some((call) => call[0] === "select"),
    false
  );
  assert.deepEqual(fallback.calls.slice(-1), [["insertProtectedTag", "{0}"]]);

  const failure = new Error("selection failed");
  const failed = createHarness(createSegmentMarkupPresentationService, { sourceTags: [tag], selectError: failure });
  const row = fakeElement(failed.document, "tr");
  row.dataset.index = "1";
  const failedContainer = fakeElement(failed.document);
  row.append(failedContainer);
  failed.service.appendSource(failedContainer, { source: "{0}" });
  assert.throws(
    () => failedContainer.children[0].dispatch("click", { stopPropagation() {} }),
    (error) => error === failure
  );
  assert.equal(
    failed.calls.some((call) => call[0] === "insertProtectedTag"),
    false
  );
});

test("SegmentMarkupPresentationService preserves tag tray guard, order, identity, and insertion", async () => {
  const { createSegmentMarkupPresentationService } = await moduleAt(
    "src/features/editor/segment-markup-presentation-service.js"
  );
  const first = { text: "<b>", label: "Bold", type: "html" };
  const second = { text: "{0}" };
  const { calls, document, service } = createHarness(createSegmentMarkupPresentationService, {
    sourceTags: [first, second]
  });
  const row = fakeElement(document, "tr");
  const targetCell = fakeElement(document);
  row.setQuery(".target-cell", targetCell);

  service.renderTagTray(row, { source: "source" });

  const tray = targetCell.children[0];
  assert.equal(tray.className, "tag-tray");
  assert.deepEqual(tray.children.map(elementShape), [
    ["BUTTON", "tag-chip tag-chip-html tag-chip-action", "Bold", "Insert protected text: <b>"],
    ["BUTTON", "tag-chip tag-chip-placeholder tag-chip-action", "{0}", "Insert protected text: {0}"]
  ]);
  tray.children[1].dispatch("click");
  assert.deepEqual(calls.slice(-1), [["insertProtectedTag", "{0}"]]);

  const empty = createHarness(createSegmentMarkupPresentationService);
  assert.equal(empty.service.renderTagTray({ querySelector: () => assert.fail("target queried") }, {}), undefined);
});

test("SegmentMarkupPresentationService preserves target preview tag DOM, classes, and editing focus", async () => {
  const { createSegmentMarkupPresentationService } = await moduleAt(
    "src/features/editor/segment-markup-presentation-service.js"
  );
  const tags = [
    { text: "{0}", label: "Placeholder", type: "code", index: 4 },
    { text: "<b>", label: "Bold", type: "html", index: 0 }
  ];
  const { document, service } = createHarness(createSegmentMarkupPresentationService, { targetTags: tags });
  const row = fakeElement(document, "tr");
  const preview = fakeElement(document);
  const targetCell = fakeElement(document);
  const textarea = fakeElement(document, "textarea");
  row.setQuery(".target-tag-preview", preview);
  row.setQuery(".target-cell", targetCell);
  row.setQuery("textarea", textarea);

  service.renderTargetPreview(row, { target: "<b> {0} tail" });

  assert.equal(targetCell.classList.contains("has-target-preview"), true);
  assert.equal(preview.classList.contains("hidden"), false);
  assert.deepEqual(preview.children.map(elementShape), [
    ["SPAN", "tag-chip tag-chip-html", "Bold", "Protected text: <b>"],
    ["text", " "],
    ["SPAN", "tag-chip tag-chip-code", "Placeholder", "Protected text: {0}"],
    ["text", " tail"]
  ]);
  preview.onclick();
  assert.equal(targetCell.classList.contains("editing"), true);
  assert.equal(textarea.focused, true);
});

test("SegmentMarkupPresentationService preserves missing-preview and empty-tag branches", async () => {
  const { createSegmentMarkupPresentationService } = await moduleAt(
    "src/features/editor/segment-markup-presentation-service.js"
  );
  const missing = createHarness(createSegmentMarkupPresentationService, {
    targetTagsError: new Error("must not read tags")
  });
  const missingQueries = [];
  assert.equal(
    missing.service.renderTargetPreview(
      {
        querySelector(selector) {
          missingQueries.push(selector);
          return null;
        }
      },
      {}
    ),
    undefined
  );
  assert.deepEqual(missingQueries, [".target-tag-preview", ".target-cell"]);

  const empty = createHarness(createSegmentMarkupPresentationService);
  const row = fakeElement(empty.document, "tr");
  const preview = fakeElement(empty.document);
  const targetCell = fakeElement(empty.document);
  const staleClick = () => {};
  preview.onclick = staleClick;
  preview.append(fakeElement(empty.document));
  row.setQuery(".target-tag-preview", preview);
  row.setQuery(".target-cell", targetCell);
  empty.service.renderTargetPreview(row, { target: "plain" });
  assert.equal(preview.children.length, 0);
  assert.equal(preview.classList.contains("hidden"), true);
  assert.equal(targetCell.classList.contains("has-target-preview"), false);
  assert.equal(preview.onclick, staleClick);
});

test("SegmentMarkupPresentationService preserves source failure boundaries and exposes an immutable API", async () => {
  const { createSegmentMarkupPresentationService } = await moduleAt(
    "src/features/editor/segment-markup-presentation-service.js"
  );
  const sourceFailure = new Error("source tags failed");
  const source = createHarness(createSegmentMarkupPresentationService, { sourceTagsError: sourceFailure });
  assert.throws(
    () => source.service.appendSource(fakeElement(source.document), { source: "text" }),
    (error) => error === sourceFailure
  );
  assert.equal(
    source.calls.some((call) => call[0] === "getProjectTerms"),
    false
  );

  const termFailure = new Error("terms failed");
  const terms = createHarness(createSegmentMarkupPresentationService, { getProjectTermsError: termFailure });
  assert.throws(
    () => terms.service.appendSource(fakeElement(terms.document), { source: "text" }),
    (error) => error === termFailure
  );
  assert.deepEqual(
    terms.calls.map((call) => call[0]),
    ["sourceTags", "getProjectTerms"]
  );

  const valid = createHarness(createSegmentMarkupPresentationService).service;
  assert.deepEqual(Object.keys(valid), ["appendSource", "renderTagTray", "renderTargetPreview"]);
  assert.equal(Object.isFrozen(valid), true);

  const makeValidOptions = () => ({
    document: { createElement() {}, createTextNode() {} },
    protectedTags: { displayText() {}, sourceTags() {}, targetTags() {} },
    terms: { ranges() {}, getProjectTerms() {} },
    navigation: { select() {} },
    targetProducer: { insertProtectedTag() {} }
  });
  for (const mutate of [
    (options) => (options.document.createElement = null),
    (options) => (options.document.createTextNode = null),
    (options) => (options.protectedTags.displayText = null),
    (options) => (options.protectedTags.sourceTags = null),
    (options) => (options.protectedTags.targetTags = null),
    (options) => (options.terms.ranges = null),
    (options) => (options.terms.getProjectTerms = null),
    (options) => (options.navigation.select = null),
    (options) => (options.targetProducer.insertProtectedTag = null)
  ]) {
    const options = makeValidOptions();
    mutate(options);
    assert.throws(
      () => createSegmentMarkupPresentationService(options),
      /SegmentMarkupPresentationService requires DOM, protected-tag, terminology, navigation, and target-producer boundaries\./
    );
  }
});
