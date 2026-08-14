const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createProjectDocumentStatisticsService, overrides = {}) {
  const calls = [];
  const documents = overrides.documents || [{ id: "doc-a" }, { id: "metadata-only" }];
  const segments = overrides.segments || [
    { id: "a-1", documentId: "doc-a", status: "confirmed", words: 5 },
    { id: "a-2", documentId: "doc-a", status: "draft", words: 3 },
    { id: "b-1", documentId: "doc-b", status: "empty", words: 2 },
    { id: "default-1", status: "confirmed", words: 4 }
  ];
  const service = createProjectDocumentStatisticsService({
    getDocuments() {
      calls.push(["getDocuments"]);
      return documents;
    },
    getSegments() {
      calls.push(["getSegments"]);
      return segments;
    },
    sourceWordCount(segment) {
      calls.push(["sourceWordCount", segment.id]);
      return segment.words;
    }
  });
  return { calls, documents, segments, service };
}

test("ProjectDocumentStatisticsService preserves independent empty-stat records and immutable checked API", async () => {
  const { createProjectDocumentStatisticsService } = await moduleAt(
    "src/features/projects/project-document-statistics-service.js"
  );
  const { service } = createHarness(createProjectDocumentStatisticsService);

  const first = service.empty();
  const second = service.empty();
  assert.deepEqual(first, { segments: 0, confirmed: 0, draft: 0, empty: 0, words: 0, percent: 0 });
  assert.notEqual(first, second);
  first.segments = 9;
  assert.equal(second.segments, 0);
  assert.equal(Object.isFrozen(service), true);
});

test("ProjectDocumentStatisticsService preserves status, word, rounded percentage, and unknown-status accumulation", async () => {
  const { createProjectDocumentStatisticsService } = await moduleAt(
    "src/features/projects/project-document-statistics-service.js"
  );
  const { calls, service } = createHarness(createProjectDocumentStatisticsService, {
    documents: [{ id: "doc-a" }],
    segments: [
      { id: "a-1", documentId: "doc-a", status: "confirmed", words: 3 },
      { id: "a-2", documentId: "doc-a", status: "draft", words: 4 },
      { id: "a-3", documentId: "doc-a", status: "empty", words: 0 },
      { id: "a-4", documentId: "doc-a", status: "reviewed", words: 2 },
      { id: "a-5", documentId: "doc-a", status: "confirmed", words: 1 },
      { id: "a-6", documentId: "doc-a", status: "confirmed", words: 5 }
    ]
  });

  assert.deepEqual(service.forDocument("doc-a"), {
    segments: 6,
    confirmed: 3,
    draft: 1,
    empty: 1,
    words: 15,
    percent: 50
  });
  assert.deepEqual(
    calls.filter(([name]) => name === "sourceWordCount").map((entry) => entry[1]),
    ["a-1", "a-2", "a-3", "a-4", "a-5", "a-6"]
  );
});

test("ProjectDocumentStatisticsService preserves default documents, metadata-only entries, missing buckets, and map order", async () => {
  const { createProjectDocumentStatisticsService } = await moduleAt(
    "src/features/projects/project-document-statistics-service.js"
  );
  const { calls, documents, segments, service } = createHarness(createProjectDocumentStatisticsService);
  const originalDocuments = structuredClone(documents);
  const originalSegments = structuredClone(segments);

  const stats = service.byDocument();
  assert.deepEqual([...stats.keys()], ["doc-a", "metadata-only", "doc-b", "default-document"]);
  assert.deepEqual(stats.get("doc-a"), {
    segments: 2,
    confirmed: 1,
    draft: 1,
    empty: 0,
    words: 8,
    percent: 50
  });
  assert.deepEqual(stats.get("metadata-only"), service.empty());
  assert.deepEqual(stats.get("doc-b"), {
    segments: 1,
    confirmed: 0,
    draft: 0,
    empty: 1,
    words: 2,
    percent: 0
  });
  assert.deepEqual(stats.get("default-document"), {
    segments: 1,
    confirmed: 1,
    draft: 0,
    empty: 0,
    words: 4,
    percent: 100
  });
  assert.equal(calls.filter(([name]) => name === "getDocuments").length, 1);
  assert.deepEqual(documents, originalDocuments);
  assert.deepEqual(segments, originalSegments);
});

test("ProjectDocumentStatisticsService preserves explicit document lists without reading the default list", async () => {
  const { createProjectDocumentStatisticsService } = await moduleAt(
    "src/features/projects/project-document-statistics-service.js"
  );
  const { calls, service } = createHarness(createProjectDocumentStatisticsService);

  const stats = service.byDocument([{ id: "explicit" }]);
  assert.equal(
    calls.some(([name]) => name === "getDocuments"),
    false
  );
  assert.deepEqual([...stats.keys()], ["explicit", "doc-a", "doc-b", "default-document"]);
});

test("ProjectDocumentStatisticsService preserves aggregate totals, rounding, zero totals, and input records", async () => {
  const { createProjectDocumentStatisticsService } = await moduleAt(
    "src/features/projects/project-document-statistics-service.js"
  );
  const { service } = createHarness(createProjectDocumentStatisticsService);
  const statsById = new Map([
    ["a", { segments: 2, confirmed: 1, draft: 1, empty: 0, words: 8, percent: 50 }],
    ["b", { segments: 1, confirmed: 1, draft: 0, empty: 0, words: 4, percent: 100 }]
  ]);
  const snapshot = structuredClone([...statsById]);

  assert.deepEqual(service.aggregate(statsById), {
    segments: 3,
    confirmed: 2,
    draft: 1,
    empty: 0,
    words: 12,
    percent: 67
  });
  assert.deepEqual(service.aggregate(new Map()), service.empty());
  assert.deepEqual([...statsById], snapshot);
});

test("ProjectDocumentStatisticsService preserves exact single-document matching without default-id coercion", async () => {
  const { createProjectDocumentStatisticsService } = await moduleAt(
    "src/features/projects/project-document-statistics-service.js"
  );
  const { service } = createHarness(createProjectDocumentStatisticsService);

  assert.deepEqual(service.forDocument("doc-b"), {
    segments: 1,
    confirmed: 0,
    draft: 0,
    empty: 1,
    words: 2,
    percent: 0
  });
  assert.deepEqual(service.forDocument("default-document"), service.empty());
  assert.deepEqual(service.forDocument("missing"), service.empty());
});

test("ProjectDocumentStatisticsService validates every required boundary", async () => {
  const { createProjectDocumentStatisticsService } = await moduleAt(
    "src/features/projects/project-document-statistics-service.js"
  );
  assert.throws(
    () => createProjectDocumentStatisticsService({}),
    /requires document, segment, and source-word-count boundaries/
  );
});
