const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-aggregate-presentation-controller.js")).href);
}

const presentationMethods = [
  "renderProjectList",
  "renderEditor",
  "renderProjectHome",
  "renderProjectAnalysis",
  "renderDocumentFilter",
  "renderSegments",
  "renderProgress"
];

function createHarness(createApplicationAggregatePresentationController, overrides = {}) {
  const calls = [];
  const receivers = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "aggregate"} failed`);
  const filters = {
    invalidate(...args) {
      calls.push(["filters.invalidate", args]);
      receivers.push(["filters.invalidate", this]);
      if (overrides.failAt === "filters.invalidate") throw failure;
      return overrides.results?.["filters.invalidate"];
    }
  };
  const presentation = Object.fromEntries(
    presentationMethods.map((method) => [
      method,
      function (...args) {
        calls.push([`presentation.${method}`, args]);
        receivers.push([`presentation.${method}`, this]);
        if (overrides.failAt === `presentation.${method}`) throw failure;
        return overrides.results?.[`presentation.${method}`];
      }
    ])
  );
  const options = { filters, presentation };
  return {
    calls,
    controller: createApplicationAggregatePresentationController(options),
    failure,
    filters,
    options,
    presentation,
    receivers
  };
}

test("ApplicationAggregatePresentationController preserves the exact synchronous presentation order", async () => {
  const { createApplicationAggregatePresentationController } = await loadFactory();
  const harness = createHarness(createApplicationAggregatePresentationController);
  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    [
      "filters.invalidate",
      "presentation.renderProjectList",
      "presentation.renderEditor",
      "presentation.renderProjectHome",
      "presentation.renderProjectAnalysis",
      "presentation.renderDocumentFilter",
      "presentation.renderSegments",
      "presentation.renderProgress"
    ]
  );
  assert.equal(
    harness.calls.every(([, args]) => args.length === 0),
    true
  );
  assert.equal(harness.receivers[0][1], harness.filters);
  assert.equal(
    harness.receivers.slice(1).every(([, receiver]) => receiver === harness.presentation),
    true
  );
});

test("ApplicationAggregatePresentationController ignores every step result without awaiting analysis", async () => {
  const { createApplicationAggregatePresentationController } = await loadFactory();
  let settleAnalysis;
  const analysisResult = new Promise((resolve) => {
    settleAnalysis = resolve;
  });
  const results = Object.fromEntries(
    ["filters.invalidate", ...presentationMethods.map((method) => `presentation.${method}`)].map((name) => [
      name,
      { name }
    ])
  );
  results["presentation.renderProjectAnalysis"] = analysisResult;
  const harness = createHarness(createApplicationAggregatePresentationController, { results });
  assert.equal(harness.controller.render(), undefined);
  assert.equal(harness.calls.at(-1)[0], "presentation.renderProgress");
  settleAnalysis("late analysis");
  assert.equal(await analysisResult, "late analysis");
});

test("ApplicationAggregatePresentationController preserves unobserved analysis rejection timing", async () => {
  const { createApplicationAggregatePresentationController } = await loadFactory();
  const failure = new Error("analysis rejected");
  const analysisResult = Promise.reject(failure);
  analysisResult.catch(() => {});
  const harness = createHarness(createApplicationAggregatePresentationController, {
    results: { "presentation.renderProjectAnalysis": analysisResult }
  });
  assert.equal(harness.controller.render(), undefined);
  assert.equal(harness.calls.at(-1)[0], "presentation.renderProgress");
  await assert.rejects(analysisResult, failure);
});

test("ApplicationAggregatePresentationController repeats the complete live sequence through one stable method", async () => {
  const { createApplicationAggregatePresentationController } = await loadFactory();
  const harness = createHarness(createApplicationAggregatePresentationController);
  const render = harness.controller.render;
  render();
  render();
  assert.equal(harness.controller.render, render);
  assert.equal(harness.calls.length, 16);
  assert.deepEqual(
    harness.calls.slice(0, 8).map(([name]) => name),
    harness.calls.slice(8).map(([name]) => name)
  );
});

test("ApplicationAggregatePresentationController stops synchronously at every failing boundary", async () => {
  const { createApplicationAggregatePresentationController } = await loadFactory();
  const orderedBoundaries = ["filters.invalidate", ...presentationMethods.map((method) => `presentation.${method}`)];
  for (const [index, failAt] of orderedBoundaries.entries()) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createApplicationAggregatePresentationController, { failAt, failure });
    assert.throws(() => harness.controller.render(), failure);
    assert.deepEqual(
      harness.calls.map(([name]) => name),
      orderedBoundaries.slice(0, index + 1)
    );
  }
});

test("ApplicationAggregatePresentationController validates every boundary and exposes an immutable API", async () => {
  const { createApplicationAggregatePresentationController } = await loadFactory();
  const valid = createHarness(createApplicationAggregatePresentationController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["render"]);
  assert.throws(() => createApplicationAggregatePresentationController(), TypeError);
  assert.throws(
    () => createApplicationAggregatePresentationController({ ...valid.options, filters: { invalidate: null } }),
    /filter boundary/
  );
  for (const method of presentationMethods) {
    assert.throws(
      () =>
        createApplicationAggregatePresentationController({
          ...valid.options,
          presentation: { ...valid.presentation, [method]: null }
        }),
      new RegExp(`presentation\\.${method}`)
    );
  }
});
