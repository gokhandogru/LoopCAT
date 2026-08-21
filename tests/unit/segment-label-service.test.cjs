const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/segment-label-service.js")).href);
}

function createHarness(createSegmentLabelService, overrides = {}) {
  const calls = [];
  const sourceValues = overrides.sourceValues || new Map();
  const labelValues = overrides.labelValues || new Map();
  const localization = {
    source(value) {
      calls.push(["source", value]);
      if (overrides.sourceError?.value === value) throw overrides.sourceError.error;
      return sourceValues.has(value) ? sourceValues.get(value) : `source:${value}`;
    },
    label(key) {
      calls.push(["label", key]);
      if (overrides.labelError?.key === key) throw overrides.labelError.error;
      return labelValues.has(key) ? labelValues.get(key) : `label:${key}`;
    }
  };
  return {
    calls,
    localization,
    service: createSegmentLabelService({ localization })
  };
}

test("SegmentLabelService preserves eager review localization order and exact mappings", async () => {
  const { createSegmentLabelService } = await loadFactory();
  for (const [value, expected] of [
    ["needs-review", "source:Needs review"],
    ["reviewed", "source:Reviewed"],
    ["blocked", "source:Blocked"],
    ["unknown", ""],
    ["", ""]
  ]) {
    const { service, calls } = createHarness(createSegmentLabelService);
    assert.equal(service.review(value), expected);
    assert.deepEqual(calls, [
      ["source", "Needs review"],
      ["source", "Reviewed"],
      ["source", "Blocked"]
    ]);
  }
});

test("SegmentLabelService preserves falsy review translations and inherited-key lookup", async () => {
  const { createSegmentLabelService } = await loadFactory();
  const falsy = createHarness(createSegmentLabelService, {
    sourceValues: new Map([["Reviewed", ""]])
  });
  assert.equal(falsy.service.review("reviewed"), "");
  assert.deepEqual(falsy.calls, [
    ["source", "Needs review"],
    ["source", "Reviewed"],
    ["source", "Blocked"]
  ]);

  const inherited = createHarness(createSegmentLabelService);
  assert.equal(inherited.service.review("toString"), Object.prototype.toString);
  assert.deepEqual(inherited.calls, [
    ["source", "Needs review"],
    ["source", "Reviewed"],
    ["source", "Blocked"]
  ]);
});

test("SegmentLabelService preserves eager status localization order and exact mappings", async () => {
  const { createSegmentLabelService } = await loadFactory();
  for (const [value, expected] of [
    ["empty", "label:empty"],
    ["draft", "label:draft"],
    ["confirmed", "label:confirmed"]
  ]) {
    const { service, calls } = createHarness(createSegmentLabelService);
    assert.equal(service.status(value), expected);
    assert.deepEqual(calls, [
      ["label", "empty"],
      ["label", "draft"],
      ["label", "confirmed"]
    ]);
  }
});

test("SegmentLabelService preserves status source fallback, falsy mappings, and inherited keys", async () => {
  const { createSegmentLabelService } = await loadFactory();
  const unknown = createHarness(createSegmentLabelService);
  assert.equal(unknown.service.status("custom"), "source:custom");
  assert.deepEqual(unknown.calls, [
    ["label", "empty"],
    ["label", "draft"],
    ["label", "confirmed"],
    ["source", "custom"]
  ]);

  const falsy = createHarness(createSegmentLabelService, {
    labelValues: new Map([["draft", ""]])
  });
  assert.equal(falsy.service.status("draft"), "source:draft");
  assert.deepEqual(falsy.calls, [
    ["label", "empty"],
    ["label", "draft"],
    ["label", "confirmed"],
    ["source", "draft"]
  ]);

  const inherited = createHarness(createSegmentLabelService);
  assert.equal(inherited.service.status("__proto__"), Object.prototype);
  assert.deepEqual(inherited.calls, [
    ["label", "empty"],
    ["label", "draft"],
    ["label", "confirmed"]
  ]);
});

test("SegmentLabelService preserves localization failure timing", async () => {
  const { createSegmentLabelService } = await loadFactory();
  const reviewError = new Error("review localization failed");
  const reviewFailure = createHarness(createSegmentLabelService, {
    sourceError: { value: "Reviewed", error: reviewError }
  });
  assert.throws(() => reviewFailure.service.review("blocked"), reviewError);
  assert.deepEqual(reviewFailure.calls, [
    ["source", "Needs review"],
    ["source", "Reviewed"]
  ]);

  const statusError = new Error("status localization failed");
  const statusFailure = createHarness(createSegmentLabelService, {
    labelError: { key: "draft", error: statusError }
  });
  assert.throws(() => statusFailure.service.status("confirmed"), statusError);
  assert.deepEqual(statusFailure.calls, [
    ["label", "empty"],
    ["label", "draft"]
  ]);

  const fallbackError = new Error("fallback localization failed");
  const fallbackFailure = createHarness(createSegmentLabelService, {
    sourceError: { value: "custom", error: fallbackError }
  });
  assert.throws(() => fallbackFailure.service.status("custom"), fallbackError);
  assert.deepEqual(fallbackFailure.calls, [
    ["label", "empty"],
    ["label", "draft"],
    ["label", "confirmed"],
    ["source", "custom"]
  ]);
});

test("SegmentLabelService validates boundaries and exposes an immutable API", async () => {
  const { createSegmentLabelService } = await loadFactory();
  const localization = { source: (value) => value, label: (key) => key };
  const service = createSegmentLabelService({ localization });
  assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(Object.keys(service), ["review", "status"]);
  assert.throws(
    () => createSegmentLabelService({ localization: { ...localization, source: null } }),
    /localization boundaries/
  );
  assert.throws(
    () => createSegmentLabelService({ localization: { ...localization, label: null } }),
    /localization boundaries/
  );
});
