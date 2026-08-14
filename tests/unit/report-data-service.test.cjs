const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createReportDataService, overrides = {}) {
  const calls = [];
  const project = {
    id: "project-1",
    sourceLang: "en",
    targetLang: "tr",
    qualityProfile: { standard: "iso" }
  };
  const segments = [
    { id: "segment-1", reviewState: "reviewed", targetHistory: [{}, {}] },
    { id: "segment-2", reviewState: "", targetHistory: null },
    { id: "segment-3", reviewState: "needs-review", targetHistory: [{}] }
  ];
  const tmEntries = [
    { id: "tm-1", tmName: "Linked TM" },
    { id: "tm-2", tmName: "Other TM" }
  ];
  const terms = [
    {
      id: "term-2",
      sourceTerm: "Zulu",
      targetTerm: "Z",
      termBaseName: "TB B",
      notes: "secret-token",
      isForbidden: true
    },
    { id: "term-1", sourceTerm: "Alpha", targetTerm: "A", termBaseName: "TB A", notes: "  note  " }
  ];
  const activityEvents = [
    { id: "activity-1", type: "export" },
    { id: "activity-2", type: "" }
  ];
  const qaChecks = [
    { id: "qa-1", severity: "high", type: "tag" },
    { id: "qa-2", severity: "", type: "" }
  ];
  const validation = { ok: false, warnings: ["warning"] };
  const analysis = { totals: { segments: 3 } };
  const qualityPassport = { confidenceScore: 88 };
  let qualityInput = null;
  let workerInput = null;
  let fallbackInput = null;
  const missingTags = (segment) => [`missing:${segment.id}`];

  const service = createReportDataService({
    session: {
      getProject() {
        calls.push(["getProject"]);
        return project;
      },
      getSegments() {
        calls.push(["getSegments"]);
        return segments;
      }
    },
    autosave: {
      flush() {
        calls.push(["flush"]);
        return overrides.flushFailure ? Promise.reject(overrides.flushFailure) : Promise.resolve();
      }
    },
    resources: {
      getTmNames() {
        calls.push(["getTmNames"]);
        return ["Linked TM"];
      },
      getTermBaseNames() {
        calls.push(["getTermBaseNames"]);
        return ["TB A", "TB B"];
      },
      summarize(value) {
        calls.push(["summarize", value]);
        return { mainTm: "Linked TM" };
      }
    },
    repositories: {
      getAllByIndex(...args) {
        calls.push(["getAllByIndex", ...args]);
        return overrides.repositoryFailure ? Promise.reject(overrides.repositoryFailure) : Promise.resolve(tmEntries);
      },
      listTerms(query) {
        calls.push(["listTerms", query]);
        return Promise.resolve(terms);
      },
      listActivityEvents(projectId) {
        calls.push(["listActivityEvents", projectId]);
        return Promise.resolve(activityEvents);
      }
    },
    portable: {
      sanitize(value, key) {
        calls.push(["sanitize", value, key]);
        return value;
      }
    },
    reporting: {
      validateExportReadiness(input) {
        calls.push(["validateExportReadiness", input]);
        return validation;
      },
      analyzeProject(...args) {
        calls.push(["analyzeProject", ...args]);
        return analysis;
      },
      runQaChecks(...args) {
        fallbackInput = args;
        calls.push(["runQaChecks", ...args]);
        return qaChecks;
      },
      buildQualityPassportData(input) {
        qualityInput = input;
        calls.push(["buildQualityPassportData", input]);
        return qualityPassport;
      }
    },
    worker:
      overrides.worker === undefined
        ? {
            runQaChecks(input) {
              workerInput = input;
              calls.push(["worker.runQaChecks", input]);
              return overrides.workerFailure ? Promise.reject(overrides.workerFailure) : Promise.resolve(qaChecks);
            }
          }
        : overrides.worker,
    tags: {
      forSegment(segment) {
        calls.push(["forSegment", segment]);
        return [`tag:${segment.id}`];
      },
      missing: missingTags
    },
    redactSensitiveText(value) {
      calls.push(["redactSensitiveText", value]);
      return String(value || "").replace(/secret-[\w-]+/g, "[redacted]");
    },
    timestamp() {
      calls.push(["timestamp"]);
      return "2026-08-14T12:00:00.000Z";
    }
  });
  return {
    activityEvents,
    analysis,
    calls,
    getFallbackInput: () => fallbackInput,
    getQualityInput: () => qualityInput,
    getWorkerInput: () => workerInput,
    missingTags,
    project,
    qaChecks,
    segments,
    service,
    terms,
    validation
  };
}

test("ReportDataService preserves flush, query, worker QA, quality aggregation, counts, redaction, and ordering", async () => {
  const { createReportDataService } = await moduleAt("src/reports/report-data-service.js");
  const harness = createHarness(createReportDataService);
  const result = await harness.service.build();

  assert.equal(harness.calls[0][0], "flush");
  assert.deepEqual(harness.calls.find(([name]) => name === "getAllByIndex").slice(1), [
    "tmEntries",
    "languagePair",
    "en::tr"
  ]);
  assert.deepEqual(harness.calls.find(([name]) => name === "listTerms")[1], {
    sourceLang: "en",
    targetLang: "tr",
    termBaseNames: ["TB A", "TB B"]
  });
  assert.deepEqual(
    harness.calls.find(([name]) => name === "listActivityEvents"),
    ["listActivityEvents", "project-1"]
  );
  assert.deepEqual(
    harness.getWorkerInput().segments.map((segment) => segment.tags),
    [["tag:segment-1"], ["tag:segment-2"], ["tag:segment-3"]]
  );
  assert.equal(typeof harness.getWorkerInput().fallback, "function");
  assert.equal(harness.getFallbackInput(), null);
  assert.deepEqual(harness.getQualityInput(), {
    project: harness.project,
    segments: harness.segments,
    qaChecks: harness.qaChecks,
    validation: harness.validation,
    analysis: harness.analysis,
    terms: harness.terms,
    activityEvents: harness.activityEvents,
    tmEntries: [{ id: "tm-1", tmName: "Linked TM" }],
    tmEntryCount: 1,
    termCount: 2,
    profile: { standard: "iso" }
  });
  assert.equal(result.generatedAt, "2026-08-14T12:00:00.000Z");
  assert.equal(result.project, harness.project);
  assert.deepEqual(result.resources, { mainTm: "Linked TM" });
  assert.deepEqual(result.qaBySeverity, { high: 1, unknown: 1 });
  assert.deepEqual(result.qaByType, { tag: 1, unknown: 1 });
  assert.deepEqual(result.reviewByState, { reviewed: 1, "needs-review": 1 });
  assert.deepEqual(result.activityByType, { export: 1, unknown: 1 });
  assert.equal(result.tmEntryCount, 1);
  assert.equal(result.termCount, 2);
  assert.equal(result.forbiddenTermCount, 1);
  assert.equal(result.revisionCount, 3);
  assert.deepEqual(result.terms, [
    { sourceTerm: "Alpha", targetTerm: "A", termBaseName: "TB A", notes: "note", isForbidden: false },
    {
      sourceTerm: "Zulu",
      targetTerm: "Z",
      termBaseName: "TB B",
      notes: "[redacted]",
      isForbidden: true
    }
  ]);
});

test("ReportDataService preserves QA fallback for absent or capability-missing workers", async () => {
  const { createReportDataService } = await moduleAt("src/reports/report-data-service.js");
  for (const worker of [null, {}]) {
    const harness = createHarness(createReportDataService, { worker });
    const result = await harness.service.build();
    const fallbackInput = harness.getFallbackInput();
    assert.equal(fallbackInput[0], harness.segments);
    assert.equal(fallbackInput[1], harness.terms);
    assert.equal(fallbackInput[2].missingTags, harness.missingTags);
    assert.equal(result.qaChecks, harness.qaChecks);
  }
});

test("ReportDataService is immutable, validates boundaries, and propagates flush, query, and worker failures", async () => {
  const { createReportDataService } = await moduleAt("src/reports/report-data-service.js");
  assert.throws(() => createReportDataService(), /requires session, autosave, resource, repository/);
  const flushFailure = new Error("flush failed");
  const flushHarness = createHarness(createReportDataService, { flushFailure });
  await assert.rejects(flushHarness.service.build(), (error) => error === flushFailure);
  assert.equal(
    flushHarness.calls.some(([name]) => name === "getTmNames"),
    false
  );

  const repositoryFailure = new Error("repository failed");
  const repositoryHarness = createHarness(createReportDataService, { repositoryFailure });
  await assert.rejects(repositoryHarness.service.build(), (error) => error === repositoryFailure);

  const workerFailure = new Error("worker failed");
  const workerHarness = createHarness(createReportDataService, { workerFailure });
  await assert.rejects(workerHarness.service.build(), (error) => error === workerFailure);
  assert.equal(Object.isFrozen(workerHarness.service), true);
  assert.equal(workerHarness.service.build, workerHarness.service.build);
});
