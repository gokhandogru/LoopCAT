const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeElement(tagName = "div") {
  const attributes = new Map();
  let text = "";
  return {
    tagName: String(tagName).toUpperCase(),
    children: [],
    className: "",
    colSpan: 0,
    style: {},
    append(...nodes) {
      this.children.push(...nodes);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    get textContent() {
      return text;
    },
    set textContent(value) {
      text = String(value ?? "");
      this.children = [];
    }
  };
}

function createHarness(createSegmentGridPresentationController, overrides = {}) {
  const calls = [];
  const created = [];
  const state = {
    activeIndex: overrides.activeIndex ?? 8,
    indexes: overrides.indexes || [],
    previousWindow: overrides.previousWindow || { start: 0, end: 0, total: 0 },
    scrollTop: overrides.scrollTop ?? 0,
    window: overrides.window || { start: 0, end: 0, total: 0, indexes: [] }
  };
  const activeElement = overrides.activeElement || {
    blur() {
      calls.push(["blur"]);
      if (overrides.blurError) throw overrides.blurError;
    }
  };
  const ownerDocument = {
    get activeElement() {
      calls.push(["activeElement"]);
      return activeElement;
    },
    createElement(tagName) {
      calls.push(["createElement", tagName]);
      if (overrides.createError) throw overrides.createError;
      const element = fakeElement(tagName);
      created.push(element);
      return element;
    },
    createDocumentFragment() {
      calls.push(["createDocumentFragment"]);
      if (overrides.fragmentError) throw overrides.fragmentError;
      return fakeElement("fragment");
    }
  };
  const viewport = {
    contains(element) {
      calls.push(["contains", element]);
      if (overrides.containsError) throw overrides.containsError;
      return overrides.containsActive ?? false;
    }
  };
  Object.defineProperty(viewport, "scrollTop", {
    get() {
      calls.push(["getScrollTop"]);
      return state.scrollTop;
    },
    set(value) {
      calls.push(["setScrollTop", value]);
      state.scrollTop = value;
    }
  });
  const body = {
    children: [],
    replaceChildren(...nodes) {
      calls.push(["replaceChildren", ...nodes]);
      if (overrides.replaceError) throw overrides.replaceError;
      body.children = nodes;
      if (overrides.scrollAfterReplace !== undefined) state.scrollTop = overrides.scrollAfterReplace;
    }
  };
  let scheduledRows = null;
  const grid = {
    calculateWindow(indexes) {
      calls.push(["calculateWindow", indexes]);
      if (overrides.calculateError) throw overrides.calculateError;
      return state.window;
    },
    getWindow() {
      calls.push(["getWindow"]);
      if (overrides.getWindowError) throw overrides.getWindowError;
      return state.previousWindow;
    },
    resetWindow() {
      calls.push(["resetWindow"]);
      if (overrides.resetError) throw overrides.resetError;
      return overrides.resetResult;
    },
    commitWindow(window) {
      calls.push(["commitWindow", window]);
      if (overrides.commitError) throw overrides.commitError;
      return overrides.commitResult;
    },
    scheduleRowUpdate(index, render) {
      calls.push(["scheduleRowUpdate", index, render]);
      if (overrides.scheduleError) throw overrides.scheduleError;
      scheduledRows = render;
      return overrides.scheduleResult ?? true;
    },
    cancelRowUpdate(index) {
      calls.push(["cancelRowUpdate", index]);
      if (overrides.cancelError) throw overrides.cancelError;
      return overrides.cancelResult ?? false;
    }
  };
  const controller = createSegmentGridPresentationController({
    document: ownerDocument,
    body,
    viewport,
    filters: {
      visibleIndexes() {
        calls.push(["visibleIndexes"]);
        if (overrides.filterError) throw overrides.filterError;
        return state.indexes;
      }
    },
    application: {
      getActiveIndex() {
        calls.push(["getActiveIndex"]);
        if (overrides.activeError) throw overrides.activeError;
        return state.activeIndex;
      }
    },
    grid,
    rows: {
      create(index) {
        calls.push(["createRow", index]);
        if (overrides.rowError) throw overrides.rowError;
        const row = fakeElement(`row-${index}`);
        row.index = index;
        return row;
      },
      update(index) {
        calls.push(["updateRow", index]);
        if (overrides.updateError) throw overrides.updateError;
      }
    },
    localization: {
      source(text) {
        calls.push(["source", text]);
        if (overrides.localizationError) throw overrides.localizationError;
        return `localized:${text}`;
      }
    },
    rowHeight: overrides.rowHeight ?? 118
  });
  return {
    activeElement,
    body,
    calls,
    controller,
    created,
    getScheduledRows: () => scheduledRows,
    state,
    viewport
  };
}

test("SegmentGridPresentationController preserves empty-view reset and localized row replacement", async () => {
  const { createSegmentGridPresentationController } = await moduleAt(
    "src/features/editor/segment-grid-presentation-controller.js"
  );
  const harness = createHarness(createSegmentGridPresentationController, { scrollTop: 44 });

  assert.equal(harness.controller.render(), undefined);

  const row = harness.body.children[0];
  const cell = row.children[0];
  assert.equal(row.tagName, "TR");
  assert.equal(cell.tagName, "TD");
  assert.equal(cell.colSpan, 4);
  assert.equal(cell.className, "muted");
  assert.equal(cell.textContent, "localized:No segments match this view.");
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ["visibleIndexes", "getScrollTop", "resetWindow", "createElement", "createElement", "source", "replaceChildren"]
  );
});

test("SegmentGridPresentationController preserves virtual rows, spacer semantics, and stable order", async () => {
  const { createSegmentGridPresentationController } = await moduleAt(
    "src/features/editor/segment-grid-presentation-controller.js"
  );
  const indexes = [10, 20, 30, 40];
  const window = { start: 1, end: 3, total: 4, indexes: [20, 30] };
  const harness = createHarness(createSegmentGridPresentationController, { indexes, window });

  harness.controller.render();

  const fragment = harness.body.children[0];
  assert.equal(fragment.children.length, 4);
  assert.equal(fragment.children[1].index, 20);
  assert.equal(fragment.children[2].index, 30);
  for (const spacer of [fragment.children[0], fragment.children[3]]) {
    assert.equal(spacer.className, "segment-spacer-row");
    assert.equal(spacer.getAttribute("aria-hidden"), "true");
    assert.equal(spacer.children[0].colSpan, 4);
    assert.equal(spacer.children[0].style.height, "118px");
    assert.equal(spacer.children[0].style.padding, "0");
    assert.equal(spacer.children[0].style.border, "0");
  }
  assert.deepEqual(
    harness.calls.filter(([name]) => ["calculateWindow", "getWindow", "commitWindow", "createRow"].includes(name)),
    [["calculateWindow", indexes], ["getWindow"], ["commitWindow", window], ["createRow", 20], ["createRow", 30]]
  );
});

test("SegmentGridPresentationController preserves unchanged scroll-window early return", async () => {
  const { createSegmentGridPresentationController } = await moduleAt(
    "src/features/editor/segment-grid-presentation-controller.js"
  );
  const window = { start: 2, end: 5, total: 9, indexes: [2, 3, 4] };
  const harness = createHarness(createSegmentGridPresentationController, {
    indexes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    previousWindow: { start: 2, end: 5, total: 9 },
    window
  });

  harness.controller.render({ fromScroll: true });

  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ["visibleIndexes", "getScrollTop", "calculateWindow", "getWindow"]
  );
  assert.deepEqual(harness.body.children, []);
});

test("SegmentGridPresentationController preserves off-window active-editor blur before commit", async () => {
  const { createSegmentGridPresentationController } = await moduleAt(
    "src/features/editor/segment-grid-presentation-controller.js"
  );
  const window = { start: 1, end: 2, total: 3, indexes: [4] };
  const harness = createHarness(createSegmentGridPresentationController, {
    activeIndex: 7,
    containsActive: true,
    indexes: [2, 4, 7],
    window
  });

  harness.controller.render({ fromScroll: true });

  assert.deepEqual(
    harness.calls
      .map(([name]) => name)
      .filter((name) => ["activeElement", "contains", "getActiveIndex", "blur", "commitWindow"].includes(name)),
    ["activeElement", "contains", "getActiveIndex", "blur", "commitWindow"]
  );
});

test("SegmentGridPresentationController preserves active-window focus and optional scroll restoration", async () => {
  const { createSegmentGridPresentationController } = await moduleAt(
    "src/features/editor/segment-grid-presentation-controller.js"
  );
  const window = { start: 0, end: 1, total: 1, indexes: [7] };
  const harness = createHarness(createSegmentGridPresentationController, {
    activeIndex: 7,
    containsActive: true,
    indexes: [7],
    scrollAfterReplace: 999,
    scrollTop: 125,
    window
  });

  harness.controller.render({ fromScroll: true, preserveScroll: true });

  assert.equal(
    harness.calls.some(([name]) => name === "blur"),
    false
  );
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "setScrollTop"),
    [["setScrollTop", 125]]
  );
  assert.equal(harness.state.scrollTop, 125);
});

test("SegmentGridPresentationController preserves scheduled row batch order and cancellation results", async () => {
  const { createSegmentGridPresentationController } = await moduleAt(
    "src/features/editor/segment-grid-presentation-controller.js"
  );
  const harness = createHarness(createSegmentGridPresentationController, {
    cancelResult: true,
    scheduleResult: "scheduled"
  });

  assert.equal(harness.controller.scheduleRowUpdate(3), "scheduled");
  harness.getScheduledRows()([4, 1, 4]);
  assert.equal(harness.controller.cancelRowUpdate(3), true);

  assert.deepEqual(
    harness.calls.filter(([name]) => ["updateRow", "cancelRowUpdate"].includes(name)),
    [
      ["updateRow", 4],
      ["updateRow", 1],
      ["updateRow", 4],
      ["cancelRowUpdate", 3]
    ]
  );
});

test("SegmentGridPresentationController preserves representative primary and downstream failure timing", async () => {
  const { createSegmentGridPresentationController } = await moduleAt(
    "src/features/editor/segment-grid-presentation-controller.js"
  );
  for (const [options, expectedNames] of [
    [{ filterError: new Error("filters failed") }, ["visibleIndexes"]],
    [
      { calculateError: new Error("window failed"), indexes: [1] },
      ["visibleIndexes", "getScrollTop", "calculateWindow"]
    ],
    [
      {
        activeError: new Error("active failed"),
        containsActive: true,
        indexes: [1],
        window: { start: 0, end: 1, total: 1, indexes: [1] }
      },
      ["visibleIndexes", "getScrollTop", "calculateWindow", "getWindow", "activeElement", "contains", "getActiveIndex"]
    ],
    [
      {
        indexes: [1],
        rowError: new Error("row failed"),
        window: { start: 0, end: 1, total: 1, indexes: [1] }
      },
      [
        "visibleIndexes",
        "getScrollTop",
        "calculateWindow",
        "getWindow",
        "activeElement",
        "commitWindow",
        "createDocumentFragment",
        "createRow"
      ]
    ]
  ]) {
    const harness = createHarness(createSegmentGridPresentationController, options);
    const expectedError = Object.values(options).find((value) => value instanceof Error);
    assert.throws(
      () => harness.controller.render({ fromScroll: Boolean(options.activeError) }),
      (error) => error === expectedError
    );
    assert.deepEqual(
      harness.calls.map(([name]) => name),
      expectedNames
    );
  }
});

test("SegmentGridPresentationController validates every boundary and exposes an immutable API", async () => {
  const { createSegmentGridPresentationController } = await moduleAt(
    "src/features/editor/segment-grid-presentation-controller.js"
  );
  const valid = createHarness(createSegmentGridPresentationController).controller;
  assert.deepEqual(Object.keys(valid), ["render", "scheduleRowUpdate", "cancelRowUpdate"]);
  assert.equal(Object.isFrozen(valid), true);

  const makeValidOptions = () => ({
    document: { activeElement: null, createElement() {}, createDocumentFragment() {} },
    body: { replaceChildren() {} },
    viewport: { scrollTop: 0, contains() {} },
    filters: { visibleIndexes() {} },
    application: { getActiveIndex() {} },
    grid: {
      calculateWindow() {},
      getWindow() {},
      resetWindow() {},
      commitWindow() {},
      scheduleRowUpdate() {},
      cancelRowUpdate() {}
    },
    rows: { create() {}, update() {} },
    localization: { source() {} },
    rowHeight: 118
  });
  for (const mutate of [
    (options) => (options.document.createElement = null),
    (options) => (options.document.createDocumentFragment = null),
    (options) => (options.body.replaceChildren = null),
    (options) => (options.viewport.contains = null),
    (options) => (options.filters.visibleIndexes = null),
    (options) => (options.application.getActiveIndex = null),
    (options) => (options.grid.calculateWindow = null),
    (options) => (options.grid.getWindow = null),
    (options) => (options.grid.resetWindow = null),
    (options) => (options.grid.commitWindow = null),
    (options) => (options.grid.scheduleRowUpdate = null),
    (options) => (options.grid.cancelRowUpdate = null),
    (options) => (options.rows.create = null),
    (options) => (options.rows.update = null),
    (options) => (options.localization.source = null),
    (options) => (options.rowHeight = 0)
  ]) {
    const options = makeValidOptions();
    mutate(options);
    assert.throws(
      () => createSegmentGridPresentationController(options),
      /SegmentGridPresentationController requires DOM, viewport, filter, application, virtual-grid, row, localization, and positive row-height boundaries\./
    );
  }
});
