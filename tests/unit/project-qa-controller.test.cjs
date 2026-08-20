const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/quality/project-qa-controller.js")).href);
}

function createHarness(createProjectQaController, overrides = {}) {
  const calls = [];
  const observed = {};
  const listeners = new Map();
  let project = Object.hasOwn(overrides, "project")
    ? overrides.project
    : { id: "p1", sourceLang: "en", targetLang: "tr" };
  const documentSegments = overrides.documentSegments || [
    { id: "s1", source: "One", tags: ["stored-one"] },
    { id: "s2", source: "Two" }
  ];
  const termRecords = overrides.termRecords || [{ id: "t1", sourceTerm: "One" }];
  const checks = Object.hasOwn(overrides, "checks")
    ? overrides.checks
    : [
        { id: "q1", segmentId: "s1" },
        { id: "q2", segmentId: "s2" }
      ];
  const riskQueue = overrides.riskQueue || [{ id: "risk-1" }];
  const runButton = {
    addEventListener(type, listener) {
      calls.push(["addEventListener", type]);
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      calls.push(["removeEventListener", type, listeners.get(type) === listener]);
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };
  const missingTags = (segment) => {
    calls.push(["missingTags", segment.id]);
    return [];
  };
  const options = {
    elements: { runButton },
    session: {
      getProject() {
        calls.push(["getProject", project?.id]);
        return project;
      },
      replaceQaChecks(value) {
        calls.push(["replaceQaChecks", value]);
        observed.replacedChecks = value;
        if (overrides.replaceChecksError) throw overrides.replaceChecksError;
      },
      replaceQualityRiskQueue(value) {
        calls.push(["replaceQualityRiskQueue", value]);
        observed.replacedRiskQueue = value;
        if (overrides.replaceRiskError) throw overrides.replaceRiskError;
      }
    },
    terms: {
      list(query) {
        calls.push(["listTerms", structuredClone(query)]);
        observed.termQuery = query;
        if (overrides.termError) throw overrides.termError;
        return overrides.termPromise || Promise.resolve(termRecords);
      },
      getNames() {
        calls.push(["getTermBaseNames"]);
        if (overrides.termNamesError) throw overrides.termNamesError;
        return overrides.termBaseNames || ["Project TB"];
      }
    },
    documents: {
      currentSegments() {
        calls.push(["currentSegments"]);
        if (overrides.documentError) throw overrides.documentError;
        return documentSegments;
      }
    },
    tags: {
      sourceTags(segment) {
        calls.push(["sourceTags", segment.id]);
        if (overrides.sourceTagsError) throw overrides.sourceTagsError;
        return [`detected-${segment.id}`];
      },
      missing: missingTags
    },
    qa: {
      runChecks(segments, terms, qaOptions) {
        calls.push(["runChecks"]);
        observed.runSegments = segments;
        observed.runTerms = terms;
        observed.runOptions = qaOptions;
        if (overrides.runChecksError) throw overrides.runChecksError;
        return checks;
      }
    },
    worker: overrides.worker,
    presentation: {
      clearResults() {
        calls.push(["clearResults"]);
        if (overrides.clearError) throw overrides.clearError;
      },
      renderResults() {
        calls.push(["renderResults"]);
        if (overrides.renderResultsError) throw overrides.renderResultsError;
      },
      buildRiskQueue(value) {
        calls.push(["buildRiskQueue", value]);
        observed.riskChecks = value;
        if (overrides.buildRiskError) throw overrides.buildRiskError;
        return riskQueue;
      },
      renderWorkbench() {
        calls.push(["renderWorkbench"]);
        if (overrides.renderWorkbenchError) throw overrides.renderWorkbenchError;
      }
    },
    navigation: {
      getDocumentId() {
        calls.push(["getDocumentId"]);
        if (overrides.navigationError) throw overrides.navigationError;
        return overrides.documentId ?? "doc-1";
      }
    },
    activity: {
      log(type, summary, detail) {
        calls.push(["logActivity", type, summary, structuredClone(detail)]);
        observed.activity = { type, summary, detail };
        if (overrides.activityError) throw overrides.activityError;
        return overrides.activityPromise;
      }
    },
    status: {
      set(message, mode) {
        calls.push(["status", message, mode]);
        if (overrides.statusError) throw overrides.statusError;
      }
    },
    logger: {
      warn(message, error) {
        calls.push(["warn", message, error]);
        if (overrides.warnError) throw overrides.warnError;
      }
    },
    testHooks: {
      beforeRun() {
        calls.push(["beforeRun"]);
        if (overrides.beforeRunError) throw overrides.beforeRunError;
      },
      beforeActivity() {
        calls.push(["beforeActivity"]);
        if (overrides.beforeActivityError) throw overrides.beforeActivityError;
      }
    }
  };
  const controller = createProjectQaController(options);
  return {
    calls,
    checks,
    controller,
    documentSegments,
    listeners,
    missingTags,
    observed,
    options,
    riskQueue,
    runButton,
    termRecords,
    setProject(value) {
      project = value;
    }
  };
}

test("ProjectQaController preserves the no-project guard with exact short-circuit effects", async () => {
  const { createProjectQaController } = await loadFactory();
  const harness = createHarness(createProjectQaController, { project: null });

  assert.equal(await harness.controller.run(), null);
  assert.deepEqual(harness.calls, [["getProject", undefined]]);
});

test("ProjectQaController preserves fallback terminology, document, tag, cache, presentation, activity, and success order", async () => {
  const { createProjectQaController } = await loadFactory();
  const harness = createHarness(createProjectQaController);

  const result = await harness.controller.run();

  assert.equal(result, harness.checks);
  assert.deepEqual(harness.observed.termQuery, {
    sourceLang: "en",
    targetLang: "tr",
    termBaseNames: ["Project TB"]
  });
  assert.equal(harness.observed.runSegments, harness.documentSegments);
  assert.equal(harness.observed.runTerms, harness.termRecords);
  assert.equal(harness.observed.runOptions.missingTags, harness.missingTags);
  assert.equal(harness.observed.replacedChecks, harness.checks);
  assert.equal(harness.observed.riskChecks, harness.checks);
  assert.equal(harness.observed.replacedRiskQueue, harness.riskQueue);
  assert.deepEqual(harness.observed.activity, {
    type: "qa-run",
    summary: "QA checks run",
    detail: { issueCount: 2, documentId: "doc-1" }
  });
  assert.deepEqual(harness.documentSegments, [
    { id: "s1", source: "One", tags: ["stored-one"] },
    { id: "s2", source: "Two" }
  ]);
  assert.deepEqual(
    harness.calls.map((call) => call[0]),
    [
      "getProject",
      "beforeRun",
      "getProject",
      "getProject",
      "getTermBaseNames",
      "listTerms",
      "currentSegments",
      "sourceTags",
      "sourceTags",
      "currentSegments",
      "runChecks",
      "replaceQaChecks",
      "clearResults",
      "renderResults",
      "buildRiskQueue",
      "replaceQualityRiskQueue",
      "renderWorkbench",
      "beforeActivity",
      "getDocumentId",
      "logActivity",
      "status"
    ]
  );
  assert.deepEqual(harness.calls.at(-1), ["status", "QA found 2 issues", "dirty"]);
});

test("ProjectQaController preserves optional worker request shape, method receiver, and fallback closure", async () => {
  const { createProjectQaController } = await loadFactory();
  const workerChecks = [{ id: "worker-check" }];
  let request;
  let receiver;
  const worker = {
    runQaChecks(value) {
      request = value;
      receiver = this;
      return Promise.resolve(workerChecks);
    }
  };
  const harness = createHarness(createProjectQaController, { worker });

  assert.equal(await harness.controller.run(), workerChecks);
  assert.equal(receiver, worker);
  assert.equal(request.terms, harness.termRecords);
  assert.deepEqual(request.segments, [
    { id: "s1", source: "One", tags: ["detected-s1"] },
    { id: "s2", source: "Two", tags: ["detected-s2"] }
  ]);
  assert.equal(typeof request.fallback, "function");
  assert.equal(harness.calls.filter((call) => call[0] === "currentSegments").length, 1);
  assert.equal(
    harness.calls.some((call) => call[0] === "runChecks"),
    false
  );

  assert.equal(await request.fallback(), harness.checks);
  assert.equal(harness.observed.runSegments, harness.documentSegments);
  assert.equal(harness.observed.runTerms, harness.termRecords);
  assert.equal(harness.observed.runOptions.missingTags, harness.missingTags);
});

test("ProjectQaController preserves durable results and exact warnings after either activity failure", async () => {
  const { createProjectQaController } = await loadFactory();
  for (const failure of ["beforeActivityError", "activityError"]) {
    const error = new Error(failure);
    const harness = createHarness(createProjectQaController, { [failure]: error });

    assert.equal(await harness.controller.run(), harness.checks);
    assert.equal(harness.observed.replacedChecks, harness.checks);
    assert.equal(harness.observed.replacedRiskQueue, harness.riskQueue);
    assert.deepEqual(
      harness.calls.find((call) => call[0] === "warn"),
      ["warn", "QA activity log failed.", error]
    );
    assert.deepEqual(harness.calls.at(-1), ["status", "QA found 2 issues", "dirty"]);
    assert.equal(
      harness.calls.some((call) => call[0] === "logActivity"),
      failure === "activityError"
    );
  }
});

test("ProjectQaController preserves zero, singular, and plural result statuses", async () => {
  const { createProjectQaController } = await loadFactory();
  for (const [checks, expected] of [
    [[], ["status", "QA found no issues", "saved"]],
    [[{ id: "one" }], ["status", "QA found 1 issue", "dirty"]],
    [
      [{ id: "one" }, { id: "two" }],
      ["status", "QA found 2 issues", "dirty"]
    ]
  ]) {
    const harness = createHarness(createProjectQaController, { checks });
    assert.equal(await harness.controller.run(), checks);
    assert.deepEqual(harness.calls.at(-1), expected);
  }
});

test("ProjectQaController preserves previous results on primary failure and completed effects on late failure", async () => {
  const { createProjectQaController } = await loadFactory();
  const primaryError = new Error("QA primary failure");
  const primary = createHarness(createProjectQaController, { beforeRunError: primaryError });

  assert.equal(await primary.controller.run(), null);
  assert.deepEqual(primary.calls, [
    ["getProject", "p1"],
    ["beforeRun"],
    ["renderResults"],
    ["status", "QA primary failure", "dirty"]
  ]);
  assert.equal(primary.observed.replacedChecks, undefined);

  const lateError = new Error("");
  const late = createHarness(createProjectQaController, { renderWorkbenchError: lateError });
  assert.equal(await late.controller.run(), null);
  assert.equal(late.observed.replacedChecks, late.checks);
  assert.equal(late.observed.replacedRiskQueue, late.riskQueue);
  assert.equal(late.calls.filter((call) => call[0] === "renderResults").length, 2);
  assert.deepEqual(late.calls.at(-1), ["status", "QA checks failed", "dirty"]);
  assert.equal(
    late.calls.some((call) => call[0] === "beforeActivity"),
    false
  );
});

test("ProjectQaController owns idempotent Run QA lifecycle and direct promise results", async () => {
  const { createProjectQaController } = await loadFactory();
  const harness = createHarness(createProjectQaController);

  assert.equal(harness.controller.mount(), undefined);
  assert.equal(harness.controller.mount(), undefined);
  assert.deepEqual(harness.calls, [["addEventListener", "click"]]);
  assert.equal(await harness.listeners.get("click")({ type: "click" }), harness.checks);
  assert.equal(harness.controller.unmount(), undefined);
  assert.equal(harness.controller.unmount(), undefined);
  assert.deepEqual(harness.calls.slice(-1), [["removeEventListener", "click", true]]);
  assert.equal(harness.listeners.has("click"), false);
});

test("ProjectQaController validates boundaries, preserves delegate failure timing, and exposes an immutable API", async () => {
  const { createProjectQaController } = await loadFactory();
  assert.throws(
    () => createProjectQaController(),
    /ProjectQaController requires a Run QA button and session boundaries\./
  );
  const valid = createHarness(createProjectQaController);
  assert.throws(
    () => createProjectQaController({ ...valid.options, terms: null }),
    /ProjectQaController requires terminology, document, tag, and QA boundaries\./
  );
  assert.throws(
    () => createProjectQaController({ ...valid.options, presentation: null }),
    /ProjectQaController requires QA results and workbench presentation boundaries\./
  );
  assert.throws(
    () => createProjectQaController({ ...valid.options, status: null }),
    /ProjectQaController requires navigation, activity, status, logger, and test-hook boundaries\./
  );
  assert.equal(Object.isFrozen(valid.controller), true);

  const statusError = new Error("status unavailable");
  const statusFailure = createHarness(createProjectQaController, { statusError });
  await assert.rejects(statusFailure.controller.run(), statusError);
  assert.equal(statusFailure.calls.filter((call) => call[0] === "status").length, 2);
  assert.equal(statusFailure.calls.filter((call) => call[0] === "renderResults").length, 2);
});
