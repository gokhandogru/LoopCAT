const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/quality/qa-results-controller.js")).href);
}

function createNode(tagName, calls) {
  const classes = new Set();
  return {
    tagName,
    type: "",
    className: "",
    textContent: "",
    children: [],
    listeners: new Map(),
    classes,
    classList: {
      add(name) {
        calls.push(["classAdd", tagName, name]);
        classes.add(name);
      },
      remove(name) {
        calls.push(["classRemove", tagName, name]);
        classes.delete(name);
      }
    },
    addEventListener(type, listener) {
      calls.push(["listen", tagName, type]);
      this.listeners.set(type, listener);
    },
    append(...children) {
      calls.push(["append", tagName, ...children.map((child) => child.tagName)]);
      this.children.push(...children);
    },
    replaceChildren(...children) {
      calls.push(["replaceChildren", tagName, ...children.map((child) => child.tagName)]);
      this.children = children;
    }
  };
}

function createHarness(createQaResultsController, overrides = {}) {
  const calls = [];
  let qaChecks = overrides.qaChecks || [];
  const segments = overrides.segments || [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
  const root = createNode("root", calls);
  const created = [];
  const controller = createQaResultsController({
    session: {
      getQaChecks() {
        calls.push(["getQaChecks"]);
        if (overrides.qaError) throw overrides.qaError;
        return qaChecks;
      },
      getSegments() {
        calls.push(["getSegments"]);
        if (overrides.segmentsError) throw overrides.segmentsError;
        return segments;
      }
    },
    getRoot() {
      calls.push(["getRoot"]);
      if (overrides.rootError) throw overrides.rootError;
      return root;
    },
    dom: {
      createElement(tagName) {
        calls.push(["createElement", tagName]);
        if (overrides.domError) throw overrides.domError;
        const node = createNode(tagName, calls);
        created.push(node);
        return node;
      },
      createDocumentFragment() {
        calls.push(["createDocumentFragment"]);
        if (overrides.fragmentError) throw overrides.fragmentError;
        const node = createNode("fragment", calls);
        created.push(node);
        return node;
      }
    },
    localization: {
      source(text, values) {
        calls.push(["source", text, values]);
        if (overrides.sourceError) throw overrides.sourceError;
        return values === undefined ? `L:${String(text)}` : `L:${String(text)}:${JSON.stringify(values)}`;
      },
      label(key) {
        calls.push(["label", key]);
        if (overrides.labelError) throw overrides.labelError;
        return `LABEL:${key}`;
      }
    },
    escapeHtml(value) {
      calls.push(["escapeHtml", value]);
      if (overrides.escapeError) throw overrides.escapeError;
      return `E[${String(value)}]`;
    },
    replaceSafeHtml(element, html) {
      calls.push(["replaceSafeHtml", element, html]);
      if (overrides.safeHtmlError) throw overrides.safeHtmlError;
      element.safeHtml = html;
    },
    navigation: {
      select(index) {
        calls.push(["select", index]);
        if (overrides.navigationError) throw overrides.navigationError;
        return overrides.navigationPromise;
      }
    },
    presentation: {
      renderSegments() {
        calls.push(["renderSegments"]);
        if (overrides.renderError) throw overrides.renderError;
      }
    },
    focus: {
      target() {
        calls.push(["focusTarget"]);
        if (overrides.focusError) throw overrides.focusError;
      }
    }
  });

  function fragment() {
    return root.children[0] || null;
  }

  function summaryWrap() {
    return fragment()?.children[0] || null;
  }

  function cards() {
    return (fragment()?.children || []).filter((node) => node.tagName === "article");
  }

  return {
    calls,
    cards,
    controller,
    created,
    root,
    segments,
    setQaChecks(value) {
      qaChecks = value;
    },
    summaryWrap
  };
}

test("QaResultsController preserves summary aggregation, insertion order, and matching type-severity double counts", async () => {
  const { createQaResultsController } = await loadFactory();
  const { controller } = createHarness(createQaResultsController);
  const checks = [
    { type: "warning", severity: "warning" },
    { type: "accuracy", severity: "error" },
    { type: "accuracy", severity: "info" }
  ];
  const result = controller.summary(checks);
  assert.deepEqual(result, { warning: 2, accuracy: 2, error: 1, info: 1 });
  assert.deepEqual(Object.keys(result), ["warning", "accuracy", "error", "info"]);
  assert.equal(controller.summary([]).constructor, Object);
});

test("QaResultsController preserves localized message and optional fix-hint values", async () => {
  const { createQaResultsController } = await loadFactory();
  const { calls, controller } = createHarness(createQaResultsController);
  assert.equal(controller.message(), "L::{}");
  assert.equal(
    controller.message({ message: "Issue {value1}", messageValues: { value1: 3 } }),
    'L:Issue {value1}:{"value1":3}'
  );
  assert.equal(controller.fixHint({}), "");
  assert.equal(
    controller.fixHint({ fixHint: "Fix {value1}", fixHintValues: { value1: "now" } }),
    'L:Fix {value1}:{"value1":"now"}'
  );
  assert.equal(calls.filter(([name]) => name === "source").length, 3);
});

test("QaResultsController preserves the localized muted no-issues state and clear return", async () => {
  const { createQaResultsController } = await loadFactory();
  const harness = createHarness(createQaResultsController);
  assert.equal(harness.controller.clear(), undefined);
  assert.equal(harness.controller.render(), undefined);
  assert.equal(harness.root.textContent, "L:No QA issues found.");
  assert.equal(harness.root.classes.has("muted"), true);
  assert.equal(
    harness.calls.some(([name]) => name === "createElement"),
    false
  );
  assert.equal(harness.root.children.length, 0);
});

test("QaResultsController preserves exact safe cards, summary controls, and filter toggle rerenders", async () => {
  const { createQaResultsController } = await loadFactory();
  const checks = [
    {
      id: "q1",
      type: "accuracy",
      severity: "error",
      segmentId: "s1",
      label: "1<2",
      message: "Wrong {value1}",
      messageValues: { value1: "term" },
      fixHint: "Use {value1}",
      fixHintValues: { value1: "right" }
    },
    {
      id: "q2",
      type: "terminology",
      segmentId: "s2",
      label: "2",
      message: "Term"
    }
  ];
  const harness = createHarness(createQaResultsController, { qaChecks: checks });
  assert.equal(harness.controller.render(), undefined);
  assert.equal(harness.root.classes.has("muted"), false);
  assert.equal(harness.summaryWrap().className, "qa-summary");
  assert.deepEqual(
    harness.summaryWrap().children.map((button) => [button.type, button.className, button.textContent]),
    [
      ["button", "active", 'L:All {value1}:{"value1":2}'],
      ["button", "", "L:accuracy 1"],
      ["button", "", "L:terminology 1"],
      ["button", "", "L:undefined 1"]
    ]
  );
  assert.equal(harness.cards().length, 2);
  assert.equal(
    harness.cards()[0].safeHtml,
    '<header><strong>E[L:accuracy]</strong><span class="severity-pill E[error]">E[L:error]</span><span>#E[1<2]</span></header><p>E[L:Wrong {value1}:{"value1":"term"}]</p><p class="muted">E[L:Use {value1}:{"value1":"right"}]</p>'
  );
  assert.equal(
    harness.cards()[1].safeHtml,
    '<header><strong>E[L:terminology]</strong><span class="severity-pill E[info]">E[L:info]</span><span>#E[2]</span></header><p>E[L:Term:{}]</p>'
  );
  assert.deepEqual(
    harness.cards().map((card) => card.children[0].textContent),
    ["LABEL:go", "LABEL:go"]
  );

  const accuracyButton = harness.summaryWrap().children[1];
  assert.equal(accuracyButton.listeners.get("click")(), undefined);
  assert.equal(harness.cards().length, 1);
  assert.equal(harness.summaryWrap().children[0].className, "");
  assert.equal(harness.summaryWrap().children[1].className, "active");
  assert.equal(harness.summaryWrap().children[1].listeners.get("click")(), undefined);
  assert.equal(harness.cards().length, 2);
  assert.equal(harness.summaryWrap().children[0].className, "active");
});

test("QaResultsController preserves active-filter no-match presentation, clear behavior, and the 100-card bound", async () => {
  const { createQaResultsController } = await loadFactory();
  const many = Array.from({ length: 105 }, (_, index) => ({
    type: index === 0 ? "accuracy" : "terminology",
    severity: "warning",
    segmentId: "s1",
    label: String(index),
    message: `Issue ${index}`
  }));
  const harness = createHarness(createQaResultsController, { qaChecks: many });
  harness.controller.render();
  assert.equal(harness.cards().length, 100);
  harness.summaryWrap().children[1].listeners.get("click")();
  assert.equal(harness.cards().length, 1);

  harness.setQaChecks(many.slice(1));
  harness.controller.render();
  assert.equal(harness.root.classes.has("muted"), false);
  assert.equal(harness.cards().length, 0);
  assert.ok(harness.summaryWrap());

  assert.equal(harness.controller.clear(), undefined);
  harness.controller.render();
  assert.equal(harness.cards().length, 100);
});

test("QaResultsController preserves awaited Go navigation, missing-segment no-op, and failure timing", async () => {
  const { createQaResultsController } = await loadFactory();
  let resolveNavigation;
  const navigationPromise = new Promise((resolve) => {
    resolveNavigation = resolve;
  });
  const harness = createHarness(createQaResultsController, {
    qaChecks: [{ type: "accuracy", severity: "error", segmentId: "s2", label: "2", message: "Issue" }],
    navigationPromise
  });
  harness.controller.render();
  const action = harness.cards()[0].children[0].listeners.get("click")();
  assert.deepEqual(
    harness.calls.filter(([name]) => ["getSegments", "select", "renderSegments", "focusTarget"].includes(name)),
    [["getSegments"], ["select", 1]]
  );
  resolveNavigation();
  await action;
  assert.deepEqual(harness.calls.slice(-2), [["renderSegments"], ["focusTarget"]]);

  const missing = createHarness(createQaResultsController, {
    qaChecks: [{ type: "accuracy", segmentId: "missing", label: "x", message: "Issue" }]
  });
  missing.controller.render();
  assert.equal(await missing.cards()[0].children[0].listeners.get("click")(), undefined);
  assert.equal(
    missing.calls.some(([name]) => name === "select"),
    false
  );

  const navigationError = new Error("navigation failed");
  const failing = createHarness(createQaResultsController, {
    qaChecks: [{ type: "accuracy", segmentId: "s1", label: "x", message: "Issue" }],
    navigationError
  });
  failing.controller.render();
  await assert.rejects(failing.cards()[0].children[0].listeners.get("click")(), navigationError);
  assert.equal(
    failing.calls.some(([name]) => name === "renderSegments"),
    false
  );
  assert.equal(
    failing.calls.some(([name]) => name === "focusTarget"),
    false
  );
});

test("QaResultsController validates boundaries, propagates rendering failures, and exposes an immutable API", async () => {
  const { createQaResultsController } = await loadFactory();
  assert.throws(() => createQaResultsController({}), /requires session, results-root, and DOM boundaries/);
  const base = {
    session: { getQaChecks: () => [], getSegments: () => [] },
    getRoot: () => createNode("root", []),
    dom: { createElement: () => createNode("node", []), createDocumentFragment: () => createNode("fragment", []) },
    localization: { source: (value) => value, label: (value) => value },
    escapeHtml: (value) => String(value),
    replaceSafeHtml: () => undefined,
    navigation: { select: () => undefined },
    presentation: { renderSegments: () => undefined },
    focus: { target: () => undefined }
  };
  assert.throws(
    () => createQaResultsController({ ...base, localization: null }),
    /requires localization and safe-HTML boundaries/
  );
  assert.throws(
    () => createQaResultsController({ ...base, navigation: null }),
    /requires navigation, presentation, and focus boundaries/
  );
  assert.equal(Object.isFrozen(createHarness(createQaResultsController).controller), true);

  const qaError = new Error("QA unavailable");
  assert.throws(() => createHarness(createQaResultsController, { qaError }).controller.render(), qaError);
  const safeHtmlError = new Error("safe HTML unavailable");
  assert.throws(
    () =>
      createHarness(createQaResultsController, {
        qaChecks: [{ type: "accuracy", message: "Issue" }],
        safeHtmlError
      }).controller.render(),
    safeHtmlError
  );
});
