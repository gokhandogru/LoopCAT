const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/resources/resource-catalog-refresh-controller.js")).href);
}

function createHarness(createResourceCatalogRefreshController, overrides = {}) {
  const calls = [];
  let presented;
  const options = {
    repository: {
      listTmEntries() {
        calls.push(["repository.listTmEntries"]);
        if (overrides.tmError) throw overrides.tmError;
        return Object.prototype.hasOwnProperty.call(overrides, "tmResult") ? overrides.tmResult : [];
      },
      listTerms() {
        calls.push(["repository.listTerms"]);
        if (overrides.termError) throw overrides.termError;
        return Object.prototype.hasOwnProperty.call(overrides, "termResult") ? overrides.termResult : [];
      }
    },
    presentation: {
      setResources(resources) {
        calls.push(["presentation.setResources", resources]);
        presented = resources;
        if (overrides.presentationError) throw overrides.presentationError;
        return overrides.presentationResult;
      }
    }
  };

  return {
    calls,
    options,
    getPresented: () => presented,
    controller: createResourceCatalogRefreshController(options)
  };
}

test("ResourceCatalogRefreshController starts both repository reads in order and presents after both settle", async () => {
  const { createResourceCatalogRefreshController } = await loadFactory();
  let resolveTm;
  let resolveTerms;
  const tmEntries = [{ id: "tm" }];
  const terms = [{ id: "term" }];
  const tmResult = new Promise((resolve) => {
    resolveTm = resolve;
  });
  const termResult = new Promise((resolve) => {
    resolveTerms = resolve;
  });
  const presentationResult = { rendered: true };
  const harness = createHarness(createResourceCatalogRefreshController, {
    tmResult,
    termResult,
    presentationResult
  });

  const refreshPromise = harness.controller.refresh();
  assert.deepEqual(harness.calls, [["repository.listTmEntries"], ["repository.listTerms"]]);

  resolveTerms(terms);
  await Promise.resolve();
  assert.equal(harness.calls.length, 2);

  resolveTm(tmEntries);
  assert.equal(await refreshPromise, presentationResult);
  assert.deepEqual(harness.calls, [
    ["repository.listTmEntries"],
    ["repository.listTerms"],
    ["presentation.setResources", { tmEntries, terms }]
  ]);
  assert.equal(harness.getPresented().tmEntries, tmEntries);
  assert.equal(harness.getPresented().terms, terms);
});

test("ResourceCatalogRefreshController preserves every falsy presentation fallback and raw values", async () => {
  const { createResourceCatalogRefreshController } = await loadFactory();
  for (const presentationResult of [undefined, null, false, 0, "", Number.NaN]) {
    const harness = createHarness(createResourceCatalogRefreshController, {
      tmResult: null,
      termResult: "raw terms",
      presentationResult
    });
    const result = await harness.controller.refresh();
    assert.deepEqual(result, { tmEntries: null, terms: "raw terms" });
    assert.notEqual(result, harness.getPresented());
    assert.equal(harness.getPresented().tmEntries, null);
    assert.equal(harness.getPresented().terms, "raw terms");
  }
});

test("ResourceCatalogRefreshController returns truthy presentation identity and assimilates promise results", async () => {
  const { createResourceCatalogRefreshController } = await loadFactory();
  const identity = { state: "resources" };
  const direct = createHarness(createResourceCatalogRefreshController, { presentationResult: identity });
  assert.equal(await direct.controller.refresh(), identity);

  const promisedFalsy = createHarness(createResourceCatalogRefreshController, {
    presentationResult: Promise.resolve(false)
  });
  assert.equal(await promisedFalsy.controller.refresh(), false);

  const rejection = new Error("async presentation failed");
  const promisedFailure = createHarness(createResourceCatalogRefreshController, {
    presentationResult: Promise.reject(rejection)
  });
  await assert.rejects(promisedFailure.controller.refresh(), rejection);
  assert.equal(promisedFailure.calls.at(-1)[0], "presentation.setResources");
});

test("ResourceCatalogRefreshController preserves synchronous repository short circuiting", async () => {
  const { createResourceCatalogRefreshController } = await loadFactory();
  const tmError = new Error("TM read failed");
  const first = createHarness(createResourceCatalogRefreshController, { tmError });
  await assert.rejects(first.controller.refresh(), tmError);
  assert.deepEqual(first.calls, [["repository.listTmEntries"]]);

  const termError = new Error("term read failed");
  const second = createHarness(createResourceCatalogRefreshController, { termError });
  await assert.rejects(second.controller.refresh(), termError);
  assert.deepEqual(second.calls, [["repository.listTmEntries"], ["repository.listTerms"]]);
});

test("ResourceCatalogRefreshController preserves concurrent rejection and presentation failure timing", async () => {
  const { createResourceCatalogRefreshController } = await loadFactory();
  const tmRejection = new Error("TM rejected");
  const first = createHarness(createResourceCatalogRefreshController, {
    tmResult: Promise.reject(tmRejection),
    termResult: Promise.resolve([])
  });
  await assert.rejects(first.controller.refresh(), tmRejection);
  assert.deepEqual(first.calls, [["repository.listTmEntries"], ["repository.listTerms"]]);

  const termRejection = new Error("terms rejected");
  const second = createHarness(createResourceCatalogRefreshController, {
    tmResult: Promise.resolve([]),
    termResult: Promise.reject(termRejection)
  });
  await assert.rejects(second.controller.refresh(), termRejection);
  assert.deepEqual(second.calls, [["repository.listTmEntries"], ["repository.listTerms"]]);

  const presentationError = new Error("presentation failed");
  const presentation = createHarness(createResourceCatalogRefreshController, { presentationError });
  await assert.rejects(presentation.controller.refresh(), presentationError);
  assert.equal(presentation.calls.at(-1)[0], "presentation.setResources");
});

test("ResourceCatalogRefreshController validates every boundary and exposes an immutable API", async () => {
  const { createResourceCatalogRefreshController } = await loadFactory();
  const valid = createHarness(createResourceCatalogRefreshController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["refresh"]);

  for (const options of [
    undefined,
    {},
    { ...valid.options, repository: { ...valid.options.repository, listTmEntries: null } },
    { ...valid.options, repository: { ...valid.options.repository, listTerms: null } },
    { ...valid.options, presentation: { setResources: null } }
  ]) {
    assert.throws(() => createResourceCatalogRefreshController(options), /ResourceCatalogRefreshController requires/);
  }
});
