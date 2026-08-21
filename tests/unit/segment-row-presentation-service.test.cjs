const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeElement(tagName = "div") {
  const classes = new Set();
  const listeners = new Map();
  const queries = new Map();
  const attributes = new Map();
  let text = "";
  const element = {
    tagName: String(tagName).toUpperCase(),
    dataset: {},
    dir: "",
    value: "",
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      }
    },
    querySelector(selector) {
      return queries.get(selector) || null;
    },
    setQuery(selector, value) {
      queries.set(selector, value);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    addEventListener(type, listener) {
      const group = listeners.get(type) || [];
      group.push(listener);
      listeners.set(type, group);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener.call(element, event);
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
      }
    }
  });
  return element;
}

function createRow() {
  const row = fakeElement("tr");
  const number = fakeElement("td");
  const source = fakeElement("td");
  const target = fakeElement("td");
  const textarea = fakeElement("textarea");
  source.textContent = "stale source";
  row.setQuery(".num-col", number);
  row.setQuery(".source-cell", source);
  row.setQuery(".target-cell", target);
  row.setQuery("textarea", textarea);
  return { number, row, source, target, textarea };
}

function createHarness(createSegmentRowPresentationService, overrides = {}) {
  const calls = [];
  const rows = [];
  const state = {
    activeIndex: overrides.activeIndex ?? 2,
    hasIssue: overrides.hasIssue ?? true,
    segments: overrides.segments || [{ id: "s-0", target: "zero" }, { id: "s-1" }, { id: "s-2", target: "two" }]
  };
  const template = {
    content: {
      firstElementChild: {
        cloneNode(deep) {
          calls.push(["cloneNode", deep]);
          if (overrides.cloneError) throw overrides.cloneError;
          const parts = createRow();
          rows.push(parts);
          return parts.row;
        }
      }
    }
  };
  const body = {
    querySelector(selector) {
      calls.push(["body.querySelector", selector]);
      if (overrides.bodyError) throw overrides.bodyError;
      return overrides.updateRow === undefined ? rows.at(-1)?.row || null : overrides.updateRow;
    }
  };
  const service = createSegmentRowPresentationService({
    template,
    body,
    session: {
      getSegments() {
        calls.push(["getSegments"]);
        if (overrides.segmentsError) throw overrides.segmentsError;
        return state.segments;
      }
    },
    application: {
      getActiveIndex() {
        calls.push(["getActiveIndex"]);
        if (overrides.activeError) throw overrides.activeError;
        return state.activeIndex;
      }
    },
    protectedTags: {
      hasIssue(segment) {
        calls.push(["hasIssue", segment]);
        if (overrides.issueError) throw overrides.issueError;
        return state.hasIssue;
      }
    },
    markup: {
      appendSource(container, segment) {
        calls.push(["appendSource", container, segment]);
        if (overrides.sourceError) throw overrides.sourceError;
      },
      renderTargetPreview(row, segment) {
        calls.push(["renderTargetPreview", row, segment]);
        if (overrides.previewError) throw overrides.previewError;
      },
      renderTagTray(row, segment) {
        calls.push(["renderTagTray", row, segment]);
        if (overrides.trayError) throw overrides.trayError;
      }
    },
    status: {
      render(row, segment) {
        calls.push(["renderStatus", row, segment]);
        if (overrides.statusError) throw overrides.statusError;
      }
    },
    localization: {
      source(text, values) {
        calls.push(["source", text, values]);
        if (overrides.localizationError) throw overrides.localizationError;
        return `target:${values.value1}`;
      }
    },
    language: {
      applyTarget(textarea) {
        calls.push(["applyTarget", textarea]);
        if (overrides.languageError) throw overrides.languageError;
      }
    },
    targetEdit: {
      bind(options) {
        calls.push(["bind", options]);
        if (overrides.bindError) throw overrides.bindError;
      }
    },
    navigation: {
      select(index) {
        calls.push(["select", index]);
        if (overrides.selectError) throw overrides.selectError;
        return overrides.selectResult;
      }
    }
  });
  return { body, calls, rows, service, state, template };
}

test("SegmentRowPresentationService preserves full populated row construction and listener order", async () => {
  const { createSegmentRowPresentationService } = await moduleAt(
    "src/features/editor/segment-row-presentation-service.js"
  );
  const harness = createHarness(createSegmentRowPresentationService);
  const segment = harness.state.segments[2];

  const row = harness.service.create(2);
  const parts = harness.rows[0];

  assert.equal(row, parts.row);
  assert.equal(row.dataset.index, "2");
  assert.equal(row.classList.contains("active"), true);
  assert.equal(row.classList.contains("tag-warning-row"), true);
  assert.equal(parts.number.textContent, "3");
  assert.equal(parts.source.textContent, "");
  assert.equal(parts.source.dir, "auto");
  assert.equal(parts.textarea.dir, "auto");
  assert.equal(parts.textarea.getAttribute("aria-label"), "target:3");
  assert.equal(parts.textarea.value, "two");
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    [
      "getSegments",
      "cloneNode",
      "getActiveIndex",
      "hasIssue",
      "appendSource",
      "source",
      "applyTarget",
      "bind",
      "renderTargetPreview",
      "renderStatus",
      "renderTagTray"
    ]
  );
  assert.deepEqual(harness.calls.find(([name]) => name === "bind")[1], {
    textarea: parts.textarea,
    editingCell: parts.target,
    index: 2,
    segmentId: "s-2"
  });
  row.dispatch("click");
  assert.deepEqual(harness.calls.at(-1), ["select", 2]);
  assert.equal(segment.target, "two");
});

test("SegmentRowPresentationService preserves inactive clean row and empty-target fallback", async () => {
  const { createSegmentRowPresentationService } = await moduleAt(
    "src/features/editor/segment-row-presentation-service.js"
  );
  const harness = createHarness(createSegmentRowPresentationService, { activeIndex: 0, hasIssue: false });

  const row = harness.service.create(1);
  const parts = harness.rows[0];

  assert.equal(row.classList.contains("active"), false);
  assert.equal(row.classList.contains("tag-warning-row"), false);
  assert.equal(parts.number.textContent, "2");
  assert.equal(parts.textarea.value, "");
  assert.equal(parts.textarea.getAttribute("aria-label"), "target:2");
});

test("SegmentRowPresentationService reads live segment and active state for every fresh row", async () => {
  const { createSegmentRowPresentationService } = await moduleAt(
    "src/features/editor/segment-row-presentation-service.js"
  );
  const harness = createHarness(createSegmentRowPresentationService, { activeIndex: 0, hasIssue: false });
  const first = harness.service.create(0);
  harness.state.segments = [{ id: "replacement", target: "fresh" }];
  harness.state.activeIndex = 4;
  harness.state.hasIssue = true;

  const second = harness.service.create(0);

  assert.notEqual(first, second);
  assert.equal(harness.rows.length, 2);
  assert.equal(harness.rows[1].textarea.value, "fresh");
  assert.equal(second.classList.contains("active"), false);
  assert.equal(second.classList.contains("tag-warning-row"), true);
  assert.equal(harness.calls.filter(([name]) => name === "getSegments").length, 2);
  assert.equal(harness.calls.filter(([name]) => name === "cloneNode").length, 2);
});

test("SegmentRowPresentationService preserves live update lookup, classes, and preview-before-status order", async () => {
  const { createSegmentRowPresentationService } = await moduleAt(
    "src/features/editor/segment-row-presentation-service.js"
  );
  const row = createRow().row;
  const harness = createHarness(createSegmentRowPresentationService, {
    activeIndex: 1,
    hasIssue: false,
    updateRow: row
  });
  const segment = harness.state.segments[1];

  assert.equal(harness.service.update(1), undefined);

  assert.equal(row.classList.contains("active"), true);
  assert.equal(row.classList.contains("tag-warning-row"), false);
  assert.deepEqual(harness.calls, [
    ["body.querySelector", 'tr[data-index="1"]'],
    ["getSegments"],
    ["getActiveIndex"],
    ["hasIssue", segment],
    ["renderTargetPreview", row, segment],
    ["renderStatus", row, segment]
  ]);
});

test("SegmentRowPresentationService preserves missing-row and missing-segment no-op timing", async () => {
  const { createSegmentRowPresentationService } = await moduleAt(
    "src/features/editor/segment-row-presentation-service.js"
  );
  const missingRow = createHarness(createSegmentRowPresentationService, { updateRow: null });
  missingRow.service.update(0);
  assert.deepEqual(missingRow.calls, [["body.querySelector", 'tr[data-index="0"]'], ["getSegments"]]);

  const row = createRow().row;
  const missingSegment = createHarness(createSegmentRowPresentationService, { segments: [], updateRow: row });
  missingSegment.service.update(7);
  assert.deepEqual(missingSegment.calls, [["body.querySelector", 'tr[data-index="7"]'], ["getSegments"]]);
});

test("SegmentRowPresentationService preserves representative creation and update failure timing", async () => {
  const { createSegmentRowPresentationService } = await moduleAt(
    "src/features/editor/segment-row-presentation-service.js"
  );
  for (const [options, operation, expectedNames] of [
    [{ segmentsError: new Error("segments failed") }, (service) => service.create(0), ["getSegments"]],
    [
      { activeError: new Error("active failed") },
      (service) => service.create(0),
      ["getSegments", "cloneNode", "getActiveIndex"]
    ],
    [
      { sourceError: new Error("source failed") },
      (service) => service.create(0),
      ["getSegments", "cloneNode", "getActiveIndex", "hasIssue", "appendSource"]
    ],
    [
      { statusError: new Error("status failed") },
      (service) => service.create(0),
      [
        "getSegments",
        "cloneNode",
        "getActiveIndex",
        "hasIssue",
        "appendSource",
        "source",
        "applyTarget",
        "bind",
        "renderTargetPreview",
        "renderStatus"
      ]
    ],
    [
      { updateRow: createRow().row, previewError: new Error("preview failed") },
      (service) => service.update(0),
      ["body.querySelector", "getSegments", "getActiveIndex", "hasIssue", "renderTargetPreview"]
    ]
  ]) {
    const harness = createHarness(createSegmentRowPresentationService, options);
    assert.throws(
      () => operation(harness.service),
      (error) => error === Object.values(options).find(Error.isError)
    );
    assert.deepEqual(
      harness.calls.map(([name]) => name),
      expectedNames
    );
  }
});

test("SegmentRowPresentationService validates every boundary and exposes an immutable API", async () => {
  const { createSegmentRowPresentationService } = await moduleAt(
    "src/features/editor/segment-row-presentation-service.js"
  );
  const valid = createHarness(createSegmentRowPresentationService).service;
  assert.deepEqual(Object.keys(valid), ["create", "update"]);
  assert.equal(Object.isFrozen(valid), true);

  const makeValidOptions = () => ({
    template: { content: { firstElementChild: { cloneNode() {} } } },
    body: { querySelector() {} },
    session: { getSegments() {} },
    application: { getActiveIndex() {} },
    protectedTags: { hasIssue() {} },
    markup: { appendSource() {}, renderTargetPreview() {}, renderTagTray() {} },
    status: { render() {} },
    localization: { source() {} },
    language: { applyTarget() {} },
    targetEdit: { bind() {} },
    navigation: { select() {} }
  });
  for (const mutate of [
    (options) => (options.template.content.firstElementChild.cloneNode = null),
    (options) => (options.body.querySelector = null),
    (options) => (options.session.getSegments = null),
    (options) => (options.application.getActiveIndex = null),
    (options) => (options.protectedTags.hasIssue = null),
    (options) => (options.markup.appendSource = null),
    (options) => (options.markup.renderTargetPreview = null),
    (options) => (options.markup.renderTagTray = null),
    (options) => (options.status.render = null),
    (options) => (options.localization.source = null),
    (options) => (options.language.applyTarget = null),
    (options) => (options.targetEdit.bind = null),
    (options) => (options.navigation.select = null)
  ]) {
    const options = makeValidOptions();
    mutate(options);
    assert.throws(
      () => createSegmentRowPresentationService(options),
      /SegmentRowPresentationService requires template, body, session, application, protected-tag, markup, status, localization, language, target-edit, and navigation boundaries\./
    );
  }
});
