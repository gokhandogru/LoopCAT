const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function textElement(calls, name, overrides = {}) {
  let text = "";
  return {
    get textContent() {
      return text;
    },
    set textContent(value) {
      calls.push([`set:${name}`, value]);
      if (overrides[`${name}Error`]) throw overrides[`${name}Error`];
      text = String(value ?? "");
    }
  };
}

function createHarness(createSegmentProgressPresentationService, overrides = {}) {
  const calls = [];
  const state = {
    progress: overrides.progress || { total: 3, confirmed: 2, words: 41 }
  };
  const progressText = textElement(calls, "progress", overrides);
  const wordCountText = textElement(calls, "words", overrides);
  let width = "stale";
  const style = {};
  Object.defineProperty(style, "width", {
    get: () => width,
    set(value) {
      calls.push(["set:width", value]);
      if (overrides.widthError) throw overrides.widthError;
      width = value;
    }
  });
  const service = createSegmentProgressPresentationService({
    summary: {
      refresh(options) {
        calls.push(["refresh", options]);
        if (overrides.refreshError) throw overrides.refreshError;
        return state.progress;
      }
    },
    elements: { progressText, wordCountText, progressFill: { style } },
    localization: {
      label(key, values) {
        calls.push(["label", key, values]);
        if (overrides.labelError?.key === key) throw overrides.labelError.error;
        if (Object.prototype.hasOwnProperty.call(overrides.labels || {}, key)) return overrides.labels[key];
        return `${key}:${JSON.stringify(values)}`;
      }
    }
  });
  return { calls, progressText, service, state, wordCountText, getWidth: () => width };
}

test("SegmentProgressPresentationService forwards options and preserves label and width order", async () => {
  const { createSegmentProgressPresentationService } = await moduleAt(
    "src/features/editor/segment-progress-presentation-service.js"
  );
  const harness = createHarness(createSegmentProgressPresentationService);
  const options = { previousStatus: "draft", nextStatus: "confirmed" };

  assert.equal(harness.service.render(options), undefined);

  assert.deepEqual(harness.calls, [
    ["refresh", options],
    ["label", "progressSummary", { confirmed: 2, open: 1, total: 3 }],
    ["set:progress", 'progressSummary:{"confirmed":2,"open":1,"total":3}'],
    ["label", "sourceWordCount", { count: 41 }],
    ["set:words", 'sourceWordCount:{"count":41}'],
    ["set:width", "67%"]
  ]);
});

test("SegmentProgressPresentationService preserves zero-total width fallback and raw summary values", async () => {
  const { createSegmentProgressPresentationService } = await moduleAt(
    "src/features/editor/segment-progress-presentation-service.js"
  );
  const harness = createHarness(createSegmentProgressPresentationService, {
    progress: { total: 0, confirmed: 2, words: 0 }
  });

  harness.service.render();

  assert.deepEqual(harness.calls[0][1], {});
  assert.deepEqual(harness.calls[1], ["label", "progressSummary", { confirmed: 2, open: -2, total: 0 }]);
  assert.equal(harness.getWidth(), "0");
});

test("SegmentProgressPresentationService reads a fresh summary and default options on every render", async () => {
  const { createSegmentProgressPresentationService } = await moduleAt(
    "src/features/editor/segment-progress-presentation-service.js"
  );
  const harness = createHarness(createSegmentProgressPresentationService);
  harness.service.render();
  harness.state.progress = { total: 8, confirmed: 1, words: 99 };
  harness.service.render();

  const refreshOptions = harness.calls.filter(([name]) => name === "refresh").map(([, options]) => options);
  assert.equal(refreshOptions.length, 2);
  assert.notEqual(refreshOptions[0], refreshOptions[1]);
  assert.deepEqual(refreshOptions, [{}, {}]);
  assert.equal(harness.getWidth(), "13%");
  assert.equal(harness.wordCountText.textContent, 'sourceWordCount:{"count":99}');
});

test("SegmentProgressPresentationService preserves falsy localized text assignment", async () => {
  const { createSegmentProgressPresentationService } = await moduleAt(
    "src/features/editor/segment-progress-presentation-service.js"
  );
  const harness = createHarness(createSegmentProgressPresentationService, {
    labels: { progressSummary: "", sourceWordCount: null }
  });

  harness.service.render();

  assert.equal(harness.progressText.textContent, "");
  assert.equal(harness.wordCountText.textContent, "");
  assert.equal(harness.getWidth(), "67%");
});

test("SegmentProgressPresentationService preserves primary and downstream failure timing", async () => {
  const { createSegmentProgressPresentationService } = await moduleAt(
    "src/features/editor/segment-progress-presentation-service.js"
  );
  for (const [overrides, expectedNames] of [
    [{ refreshError: new Error("refresh failed") }, ["refresh"]],
    [{ labelError: { key: "progressSummary", error: new Error("progress label failed") } }, ["refresh", "label"]],
    [{ progressError: new Error("progress assignment failed") }, ["refresh", "label", "set:progress"]],
    [
      { labelError: { key: "sourceWordCount", error: new Error("word label failed") } },
      ["refresh", "label", "set:progress", "label"]
    ],
    [{ widthError: new Error("width failed") }, ["refresh", "label", "set:progress", "label", "set:words", "set:width"]]
  ]) {
    const harness = createHarness(createSegmentProgressPresentationService, overrides);
    const expectedError =
      Object.values(overrides).find((value) => value instanceof Error) || overrides.labelError?.error;
    assert.throws(
      () => harness.service.render(),
      (error) => error === expectedError
    );
    assert.deepEqual(
      harness.calls.map(([name]) => name),
      expectedNames
    );
  }
});

test("SegmentProgressPresentationService validates every boundary and exposes an immutable API", async () => {
  const { createSegmentProgressPresentationService } = await moduleAt(
    "src/features/editor/segment-progress-presentation-service.js"
  );
  const valid = createHarness(createSegmentProgressPresentationService).service;
  assert.deepEqual(Object.keys(valid), ["render"]);
  assert.equal(Object.isFrozen(valid), true);

  const makeValidOptions = () => ({
    summary: { refresh() {} },
    elements: { progressText: {}, wordCountText: {}, progressFill: { style: {} } },
    localization: { label() {} }
  });
  for (const mutate of [
    (options) => (options.summary.refresh = null),
    (options) => (options.elements.progressText = null),
    (options) => (options.elements.wordCountText = null),
    (options) => (options.elements.progressFill.style = null),
    (options) => (options.localization.label = null)
  ]) {
    const options = makeValidOptions();
    mutate(options);
    assert.throws(
      () => createSegmentProgressPresentationService(options),
      /SegmentProgressPresentationService requires summary, progress text, word-count text, progress-fill, and localization boundaries\./
    );
  }
});
