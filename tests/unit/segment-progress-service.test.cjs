const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createSegmentProgressService, overrides = {}) {
  const calls = [];
  let segments = overrides.segments || [
    { id: "a", source: "One two", status: "confirmed" },
    { id: "b", source: "Three", status: "draft" },
    { id: "c", source: "", status: "empty" }
  ];
  let projectId = overrides.projectId === undefined ? "project-1" : overrides.projectId;
  let cachedSummary = overrides.cachedSummary ?? null;
  const service = createSegmentProgressService({
    getSegments() {
      calls.push(["getSegments"]);
      return segments;
    },
    getProjectId() {
      calls.push(["getProjectId"]);
      return projectId;
    },
    getCachedSummary() {
      calls.push(["getCachedSummary"]);
      return cachedSummary;
    },
    replaceCachedSummary(summary) {
      calls.push(["replaceCachedSummary", summary]);
      cachedSummary = summary;
      return summary;
    }
  });
  return {
    calls,
    service,
    getCachedSummary: () => cachedSummary,
    setCachedSummary: (value) => {
      cachedSummary = value;
    },
    setProjectId: (value) => {
      projectId = value;
    },
    setSegments: (value) => {
      segments = value;
    }
  };
}

test("SegmentProgressService preserves whitespace word counts and non-record source fallbacks", async () => {
  const { createSegmentProgressService } = await moduleAt("src/features/editor/segment-progress-service.js");
  const { service } = createHarness(createSegmentProgressService);
  assert.equal(service.wordCount(), 0);
  assert.equal(service.wordCount("   \n\t "), 0);
  assert.equal(service.wordCount(" one  two\nthree "), 3);
  assert.equal(service.sourceWordCount(), 0);
  assert.equal(service.sourceWordCount("not-a-record"), 0);
});

test("SegmentProgressService preserves source-identity caching and refreshes after source mutation", async () => {
  const { createSegmentProgressService } = await moduleAt("src/features/editor/segment-progress-service.js");
  const { service } = createHarness(createSegmentProgressService);
  let trims = 0;
  const firstSource = {
    trim() {
      trims += 1;
      return "one two";
    }
  };
  const segment = { source: firstSource };
  assert.equal(service.sourceWordCount(segment), 2);
  assert.equal(service.sourceWordCount(segment), 2);
  assert.equal(trims, 1);
  segment.source = {
    trim() {
      trims += 1;
      return "one two three";
    }
  };
  assert.equal(service.sourceWordCount(segment), 3);
  assert.equal(trims, 2);
});

test("SegmentProgressService preserves project totals, status counts, words, rounding, and input records", async () => {
  const { createSegmentProgressService } = await moduleAt("src/features/editor/segment-progress-service.js");
  const { service } = createHarness(createSegmentProgressService);
  const segments = [
    { source: "one two", status: "confirmed" },
    { source: "three", status: "draft" },
    { source: "four five", status: "empty" }
  ];
  const snapshot = structuredClone(segments);
  assert.deepEqual(service.projectProgress(segments), {
    total: 3,
    confirmed: 1,
    draft: 1,
    words: 5,
    percent: 33
  });
  assert.deepEqual(segments, snapshot);
  assert.deepEqual(service.projectProgress([]), {
    total: 0,
    confirmed: 0,
    draft: 0,
    words: 0,
    percent: 0
  });
});

test("SegmentProgressService preserves the exact active summary shape and empty project identity fallback", async () => {
  const { createSegmentProgressService } = await moduleAt("src/features/editor/segment-progress-service.js");
  const harness = createHarness(createSegmentProgressService);
  assert.deepEqual(harness.service.activeSummary(), {
    projectId: "project-1",
    total: 3,
    confirmed: 1,
    words: 3
  });
  harness.setProjectId("");
  harness.setSegments([]);
  assert.deepEqual(harness.service.activeSummary(), {
    projectId: "",
    total: 0,
    confirmed: 0,
    words: 0
  });
});

test("SegmentProgressService refresh falls back for absent or invalid cached summaries and replaces the cache", async () => {
  const { createSegmentProgressService } = await moduleAt("src/features/editor/segment-progress-service.js");
  const harness = createHarness(createSegmentProgressService);
  const missing = harness.service.refresh({ previousStatus: "draft", nextStatus: "confirmed" });
  assert.deepEqual(missing, { projectId: "project-1", total: 3, confirmed: 1, words: 3 });
  assert.equal(harness.getCachedSummary(), missing);
  harness.setCachedSummary({ projectId: "other", total: 3, confirmed: 0, words: 99 });
  assert.deepEqual(harness.service.refresh({ previousStatus: "draft", nextStatus: "confirmed" }), missing);
  harness.setCachedSummary({ projectId: "project-1", total: 2, confirmed: 0, words: 99 });
  assert.deepEqual(harness.service.refresh({ previousStatus: "draft", nextStatus: "confirmed" }), missing);
  harness.setCachedSummary({ projectId: "project-1", total: 3, confirmed: 0, words: 99 });
  assert.deepEqual(harness.service.refresh(), missing);
});

test("SegmentProgressService preserves incremental confirmed deltas, extra cache fields, and clamps", async () => {
  const { createSegmentProgressService } = await moduleAt("src/features/editor/segment-progress-service.js");
  const harness = createHarness(createSegmentProgressService, {
    cachedSummary: { projectId: "project-1", total: 3, confirmed: 1, words: 3, marker: "keep" }
  });
  assert.deepEqual(harness.service.refresh({ previousStatus: "draft", nextStatus: "confirmed" }), {
    projectId: "project-1",
    total: 3,
    confirmed: 2,
    words: 3,
    marker: "keep"
  });
  harness.setCachedSummary({ projectId: "project-1", total: 3, confirmed: 0, words: 3 });
  assert.equal(harness.service.refresh({ previousStatus: "confirmed", nextStatus: "draft" }).confirmed, 0);
  harness.setCachedSummary({ projectId: "project-1", total: 3, confirmed: 3, words: 3 });
  assert.equal(harness.service.refresh({ previousStatus: "draft", nextStatus: "confirmed" }).confirmed, 3);
});

test("SegmentProgressService validates boundaries and exposes an immutable API", async () => {
  const { createSegmentProgressService } = await moduleAt("src/features/editor/segment-progress-service.js");
  assert.throws(() => createSegmentProgressService({}), /requires segment, project, and progress-summary boundaries/);
  const { service } = createHarness(createSegmentProgressService);
  assert.equal(Object.isFrozen(service), true);
});
