const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createSegmentFilterService, overrides = {}) {
  const calls = [];
  const segments = overrides.segments || [
    { id: "a", documentId: "doc-a", source: "Install app", target: "Kur", status: "draft" },
    { id: "b", documentId: "doc-a", source: "Open file", target: "Dosya", status: "confirmed" },
    { id: "c", documentId: "doc-b", source: "Review", target: "İncele", status: "empty" }
  ];
  let filters = {
    query: "",
    scope: "both",
    regex: false,
    caseSensitive: false,
    status: "all",
    reviewState: "",
    aiState: "",
    ...(overrides.filters || {})
  };
  let documentId = overrides.documentId || "";
  const service = createSegmentFilterService({
    getSegments() {
      calls.push(["getSegments"]);
      return segments;
    },
    getFilters() {
      calls.push(["getFilters"]);
      return filters;
    },
    getDocumentId() {
      calls.push(["getDocumentId"]);
      return documentId;
    },
    normalizeCase(value) {
      calls.push(["normalizeCase", value]);
      return String(value || "").toLocaleLowerCase("en-US");
    },
    provenance: {
      hasAiDraft(segment) {
        calls.push(["hasAiDraft", segment.id]);
        return Boolean(segment.aiDraft);
      },
      hasAiSuggestions(segment) {
        calls.push(["hasAiSuggestions", segment.id]);
        return Boolean(segment.aiSuggestions);
      },
      aiRiskLevel(segment) {
        calls.push(["aiRiskLevel", segment.id]);
        return segment.risk || "";
      }
    }
  });
  return {
    calls,
    segments,
    service,
    setDocumentId(value) {
      documentId = value;
    },
    patchFilters(patch) {
      filters = { ...filters, ...patch };
    }
  };
}

test("SegmentFilterService preserves empty, scoped literal, normalized, and case-sensitive query matching", async () => {
  const { createSegmentFilterService } = await moduleAt("src/features/editor/segment-filter-service.js");
  const harness = createHarness(createSegmentFilterService);
  assert.equal(harness.service.queryMatcher()(harness.segments[0]), true);
  harness.patchFilters({ query: "install", scope: "source" });
  assert.equal(harness.service.queryMatcher()(harness.segments[0]), true);
  harness.patchFilters({ scope: "target" });
  assert.equal(harness.service.queryMatcher()(harness.segments[0]), false);
  harness.patchFilters({ query: "Install", scope: "both", caseSensitive: true });
  assert.equal(harness.service.queryMatcher()(harness.segments[0]), true);
  harness.patchFilters({ query: "install" });
  assert.equal(harness.service.queryMatcher()(harness.segments[0]), false);
});

test("SegmentFilterService preserves regex case flags, scope, and invalid-pattern containment", async () => {
  const { createSegmentFilterService } = await moduleAt("src/features/editor/segment-filter-service.js");
  const harness = createHarness(createSegmentFilterService, {
    filters: { query: "^install", scope: "source", regex: true }
  });
  assert.equal(harness.service.queryMatcher()(harness.segments[0]), true);
  harness.patchFilters({ caseSensitive: true });
  assert.equal(harness.service.queryMatcher()(harness.segments[0]), false);
  harness.patchFilters({ query: "[" });
  assert.equal(harness.service.queryMatcher()(harness.segments[0]), false);
});

test("SegmentFilterService preserves AI filter modes and unknown-filter passthrough", async () => {
  const { createSegmentFilterService } = await moduleAt("src/features/editor/segment-filter-service.js");
  const segment = { id: "ai", aiDraft: true, aiSuggestions: true, risk: "high" };
  const harness = createHarness(createSegmentFilterService);
  assert.equal(harness.service.passesAiFilter(segment), true);
  harness.patchFilters({ aiState: "ai-draft" });
  assert.equal(harness.service.passesAiFilter(segment), true);
  harness.patchFilters({ aiState: "ai-suggestions" });
  assert.equal(harness.service.passesAiFilter(segment), true);
  harness.patchFilters({ aiState: "ai-review-risk" });
  assert.equal(harness.service.passesAiFilter(segment), true);
  harness.patchFilters({ aiState: "high-ai-risk" });
  assert.equal(harness.service.passesAiFilter(segment), true);
  segment.risk = "medium";
  assert.equal(harness.service.passesAiFilter(segment), false);
  harness.patchFilters({ aiState: "future-filter" });
  assert.equal(harness.service.passesAiFilter(segment), true);
});

test("SegmentFilterService preserves document, comments, review-state, open, exact-status, and query ordering", async () => {
  const { createSegmentFilterService } = await moduleAt("src/features/editor/segment-filter-service.js");
  const segment = {
    id: "review",
    documentId: "doc-a",
    source: "Source",
    target: "Target",
    status: "draft",
    comments: [],
    reviewNote: " note ",
    reviewState: "needs-review"
  };
  const harness = createHarness(createSegmentFilterService, { documentId: "doc-a" });
  let queryCalls = 0;
  assert.equal(
    harness.service.matches(segment, () => (++queryCalls, true)),
    true
  );
  harness.setDocumentId("doc-b");
  assert.equal(
    harness.service.matches(segment, () => (++queryCalls, true)),
    false
  );
  assert.equal(queryCalls, 1);
  harness.setDocumentId("");
  harness.patchFilters({ reviewState: "comments" });
  assert.equal(harness.service.matches(segment), true);
  segment.reviewNote = "";
  assert.equal(harness.service.matches(segment), false);
  harness.patchFilters({ reviewState: "needs-review" });
  assert.equal(harness.service.matches(segment), true);
  harness.patchFilters({ reviewState: "reviewed" });
  assert.equal(harness.service.matches(segment), false);
  harness.patchFilters({ reviewState: "", status: "open" });
  assert.equal(harness.service.matches(segment), true);
  segment.status = "confirmed";
  assert.equal(harness.service.matches(segment), false);
  harness.patchFilters({ status: "confirmed" });
  assert.equal(harness.service.matches(segment), true);
});

test("SegmentFilterService preserves project indexes, revision-keyed cache identity, filter-key refresh, and invalidation", async () => {
  const { createSegmentFilterService } = await moduleAt("src/features/editor/segment-filter-service.js");
  const harness = createHarness(createSegmentFilterService);
  assert.deepEqual(harness.service.allIndexes(), [0, 1, 2]);
  const first = harness.service.visibleIndexes();
  assert.deepEqual(first, [0, 1, 2]);
  assert.equal(harness.service.visibleIndexes(), first);
  harness.patchFilters({ status: "open" });
  const open = harness.service.visibleIndexes();
  assert.deepEqual(open, [0, 2]);
  assert.notEqual(open, first);
  harness.service.invalidate();
  const invalidated = harness.service.visibleIndexes();
  assert.deepEqual(invalidated, [0, 2]);
  assert.notEqual(invalidated, open);
});

test("SegmentFilterService preserves visible positions, missing fallback, first-visible fallback, and document-key refresh", async () => {
  const { createSegmentFilterService } = await moduleAt("src/features/editor/segment-filter-service.js");
  const harness = createHarness(createSegmentFilterService, { filters: { status: "open" } });
  assert.equal(harness.service.visiblePosition(0), 0);
  assert.equal(harness.service.visiblePosition(2), 1);
  assert.equal(harness.service.visiblePosition(1), -1);
  assert.equal(harness.service.firstVisible(), 0);
  harness.setDocumentId("missing");
  assert.deepEqual(harness.service.visibleIndexes(), []);
  assert.equal(harness.service.firstVisible(), -1);
});

test("SegmentFilterService validates boundaries and exposes an immutable API", async () => {
  const { createSegmentFilterService } = await moduleAt("src/features/editor/segment-filter-service.js");
  assert.throws(
    () => createSegmentFilterService({}),
    /requires segment, filter, document, case-normalization, and provenance boundaries/
  );
  const { service } = createHarness(createSegmentFilterService);
  assert.equal(Object.isFrozen(service), true);
});
