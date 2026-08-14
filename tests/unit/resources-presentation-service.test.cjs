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
    createDocumentFragment() {
      return fakeElement(ownerDocument, "fragment");
    }
  };
  return ownerDocument;
}

function fakeElement(ownerDocument, tagName = "div") {
  const classes = new Set();
  const attributes = new Map();
  const queries = new Map();
  const element = {
    ownerDocument,
    tagName: String(tagName).toUpperCase(),
    children: [],
    dataset: {},
    type: "",
    textContent: "",
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name)
    },
    append(...nodes) {
      for (const node of nodes.filter(Boolean)) {
        if (node.tagName === "FRAGMENT") element.append(...node.children);
        else element.children.push(node);
      }
    },
    replaceChildren(...nodes) {
      element.children = [];
      element.textContent = "";
      element.append(...nodes);
    },
    querySelector(selector) {
      return queries.get(selector) || null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    setQuery(selector, value) {
      queries.set(selector, value);
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
  return element;
}

function createHarness(createResourcesPresentationService, overrides = {}) {
  const document = fakeDocument();
  const elements = {
    tmDashboard: fakeElement(document),
    tbDashboard: fakeElement(document),
    tmDetail: fakeElement(document),
    tbDetail: fakeElement(document)
  };
  const html = [];
  const calls = [];
  const summaries = overrides.summaries || { tmName: [], termBaseName: [] };
  const resourceItems = overrides.items || { tm: [], tb: [] };
  const source = (text, values = {}) =>
    `source:${String(text).replace(/\{([^}]+)\}/g, (_match, key) => String(values[key] ?? ""))}`;
  const service = createResourcesPresentationService({
    elements,
    document,
    summarizeResources(items, nameField) {
      calls.push(["summarizeResources", items, nameField]);
      return summaries[nameField] || [];
    },
    labelFromKey(key) {
      calls.push(["labelFromKey", key]);
      return overrides.info || { name: "Glossary", sourceLang: "en", targetLang: "tr" };
    },
    items(type, key) {
      calls.push(["items", type, key]);
      return resourceItems[type] || [];
    },
    localization: {
      label: (key, values = {}) => `label:${key}:${values.count ?? ""}`,
      labelHtml: (key, values = {}) => `labelHtml:${key}:${values.count ?? values.date ?? ""}`,
      source,
      sourceHtml: (text) => `sourceHtml:${text}`
    },
    languagePairDisplay: (sourceLang, targetLang) => `pair:${sourceLang}->${targetLang}`,
    formatDate: (value) => `date:${value}`,
    displaySafeHtml: (value) => `safeHtml:${value}`,
    displaySafeText: (value, fallback = "") => `safeText:${value || fallback}`,
    escapeHtml: (value) => `escaped:${value}`,
    replaceSafeHtml(element, markup) {
      html.push({ element, markup });
      element.replaceChildren();
      if (markup.includes('class="resource-card-actions"')) {
        const actions = fakeElement(document);
        element.setQuery(".resource-card-actions", actions);
        element.append(actions);
      }
      if (markup.includes('class="resource-row-actions"')) {
        const actions = fakeElement(document);
        element.setQuery(".resource-row-actions", actions);
        element.append(actions);
      }
      if (markup.includes('class="resource-table"')) {
        const table = fakeElement(document);
        element.setQuery(".resource-table", table);
        element.append(table);
      }
    }
  });
  return { calls, elements, html, service };
}

test("ResourcesPresentationService preserves localized TM and termbase empty states", async () => {
  const { createResourcesPresentationService } = await moduleAt(
    "src/features/resources/resources-presentation-service.js"
  );
  const { elements, service } = createHarness(createResourcesPresentationService);

  assert.equal(service.render({ type: "tm", openKey: null, tmEntries: [], terms: [] }), undefined);

  for (const [dashboard, message, action, type] of [
    [elements.tmDashboard, "label:noTranslationMemories:", "source:Import a TMX file", "tm"],
    [elements.tbDashboard, "label:noTermbases:", "source:Import a TBX or term-list file", "tb"]
  ]) {
    assert.equal(dashboard.children[0].className, "empty-file-state actionable-empty-state");
    assert.equal(dashboard.children[0].children[0].textContent, message);
    assert.equal(dashboard.children[0].children[1].textContent, action);
    assert.equal(dashboard.children[0].children[1].dataset.resourceAction, "import");
    assert.equal(dashboard.children[0].children[1].dataset.resourceType, type);
  }
  assert.equal(elements.tmDetail.classList.contains("hidden"), true);
  assert.equal(elements.tbDetail.classList.contains("hidden"), true);
});

test("ResourcesPresentationService preserves safe resource cards, metadata, and delegated action attributes", async () => {
  const { createResourcesPresentationService } = await moduleAt(
    "src/features/resources/resources-presentation-service.js"
  );
  const resource = {
    key: "unsafe::en::tr",
    name: "<unsafe>",
    sourceLang: "en",
    targetLang: "tr",
    count: 2,
    updatedAt: "2026-08-14"
  };
  const { elements, html, service } = createHarness(createResourcesPresentationService, {
    summaries: { tmName: [resource], termBaseName: [] }
  });

  service.render({ type: "tm", openKey: null, tmEntries: [{ id: "one" }], terms: [] });

  const card = elements.tmDashboard.children[0];
  assert.equal(card.className, "resource-card");
  assert.match(html.find((entry) => entry.element === card).markup, /safeHtml:<unsafe>/);
  assert.match(html.find((entry) => entry.element === card).markup, /escaped:pair:en->tr/);
  assert.match(html.find((entry) => entry.element === card).markup, /labelHtml:updatedAt:date:2026-08-14/);
  const [deleteButton, exportButton, openButton] = card.querySelector(".resource-card-actions").children;
  assert.deepEqual(
    [deleteButton.dataset.resourceAction, exportButton.dataset.resourceAction, openButton.dataset.resourceAction],
    ["delete-resource", "export", "open"]
  );
  assert.equal(deleteButton.dataset.resourceKey, resource.key);
  assert.equal(exportButton.dataset.resourceType, "tm");
  assert.equal(openButton.getAttribute("aria-label"), "source:Open resource safeText:<unsafe>");
  assert.equal(deleteButton.className, "danger-small");
  assert.equal(openButton.className, "primary");
});

test("ResourcesPresentationService preserves TM detail visibility, counts, rows, escaping, and batched replacement", async () => {
  const { createResourcesPresentationService } = await moduleAt(
    "src/features/resources/resources-presentation-service.js"
  );
  const entries = [
    { id: "tm-1", source: "<source>", target: "<target>" },
    { id: "tm-2", source: "second", target: "ikinci" }
  ];
  const { calls, elements, html, service } = createHarness(createResourcesPresentationService, {
    items: { tm: entries, tb: [] },
    info: { name: "<TM>", sourceLang: "en", targetLang: "tr" }
  });

  service.render({ type: "tm", openKey: "tm-key", tmEntries: [], terms: [] });

  assert.equal(elements.tmDetail.classList.contains("hidden"), false);
  assert.equal(elements.tbDetail.classList.contains("hidden"), true);
  const detailMarkup = html.find((entry) => entry.element === elements.tmDetail).markup;
  assert.match(detailMarkup, /safeHtml:<TM>/);
  assert.match(detailMarkup, /labelHtml:entryCount:2/);
  assert.match(detailMarkup, /data-resource-action="close-detail" data-resource-type="tm"/);
  const rows = elements.tmDetail.querySelector(".resource-table").children;
  assert.deepEqual(
    rows.map((row) => row.dataset.resourceId),
    ["tm-1", "tm-2"]
  );
  assert.match(html.find((entry) => entry.element === rows[0]).markup, /escaped:<source>/);
  assert.match(html.find((entry) => entry.element === rows[0]).markup, /escaped:<target>/);
  assert.deepEqual(
    rows[0]
      .querySelector(".resource-row-actions")
      .children.map((button) => [
        button.dataset.resourceAction,
        button.dataset.resourceType,
        button.dataset.resourceId
      ]),
    [
      ["save-entry", "tm", "tm-1"],
      ["delete-entry", "tm", "tm-1"]
    ]
  );
  assert.deepEqual(
    calls.filter(([name]) => name === "items"),
    [["items", "tm", "tm-key"]]
  );
});

test("ResourcesPresentationService preserves term rows, notes, forbidden state, and immutable checked API", async () => {
  const { createResourcesPresentationService } = await moduleAt(
    "src/features/resources/resources-presentation-service.js"
  );
  const term = {
    id: "term-1",
    sourceTerm: "<light>",
    targetTerm: "<isik>",
    notes: "<note>",
    isForbidden: true
  };
  const { elements, html, service } = createHarness(createResourcesPresentationService, {
    items: { tm: [], tb: [term] }
  });

  service.render({ type: "tb", openKey: "tb-key", tmEntries: [], terms: [] });

  assert.equal(Object.isFrozen(service), true);
  assert.equal(elements.tbDetail.classList.contains("hidden"), false);
  const detailMarkup = html.find((entry) => entry.element === elements.tbDetail).markup;
  assert.match(detailMarkup, /labelHtml:termCount:1/);
  assert.match(detailMarkup, /data-resource-action="close-detail" data-resource-type="tb"/);
  const row = elements.tbDetail.querySelector(".resource-table").children[0];
  const rowMarkup = html.find((entry) => entry.element === row).markup;
  assert.match(rowMarkup, /value="escaped:<light>"/);
  assert.match(rowMarkup, /value="escaped:<isik>"/);
  assert.match(rowMarkup, /value="escaped:<note>"/);
  assert.match(rowMarkup, /type="checkbox" checked/);
  assert.match(rowMarkup, /labelHtml:forbidden:/);
  assert.deepEqual(
    row.querySelector(".resource-row-actions").children.map((button) => button.dataset.resourceType),
    ["tb", "tb"]
  );

  const document = fakeDocument();
  assert.throws(
    () =>
      createResourcesPresentationService({
        elements: {
          tmDashboard: fakeElement(document),
          tbDashboard: fakeElement(document),
          tmDetail: fakeElement(document),
          tbDetail: fakeElement(document)
        },
        document
      }),
    /requires resource lookup, localization, formatting, safe-display, and DOM boundaries/
  );
});
