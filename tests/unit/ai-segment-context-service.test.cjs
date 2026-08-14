const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-segment-context-service.js")).href);
}

function createHarness(createService, overrides = {}) {
  const project = {
    id: "project-1",
    sourceLang: "en",
    targetLang: "tr",
    aiSettings: {
      useTermbaseContext: overrides.useTermbaseContext !== false,
      useTmContext: overrides.useTmContext !== false
    }
  };
  const allSegments = overrides.segments || [];
  const calls = [];
  const warnings = [];
  const service = createService({
    project: {
      get: () => (overrides.noProject ? null : project),
      normalizeAiSettings: (settings) => ({ ...settings })
    },
    resources: {
      getTermBaseNames: () => ["Project TB", "Shared TB"],
      getTmNames: () => ["Main TM", "Reference TM"]
    },
    lookup: {
      findTerms: (query) => {
        calls.push(["findTerms", query]);
        if (overrides.termLookup) return overrides.termLookup(query);
        return overrides.termError
          ? Promise.reject(overrides.termError)
          : Promise.resolve(overrides.termResult || [{ sourceTerm: "house", targetTerm: "ev" }]);
      },
      findTmMatches: (query) => {
        calls.push(["findTmMatches", query]);
        if (overrides.tmLookup) return overrides.tmLookup(query);
        return overrides.tmError
          ? Promise.reject(overrides.tmError)
          : Promise.resolve(overrides.tmResult || [{ target: "Örnek", score: 91 }]);
      }
    },
    settings: {
      read: () => ({ includeNearbyContext: overrides.includeNearbyContext !== false })
    },
    segments: {
      getAll: () => {
        calls.push(["getAllSegments"]);
        return allSegments;
      }
    },
    logger: { warn: (...details) => warnings.push(details) }
  });
  return { calls, project, service, warnings };
}

test("AI segment context preserves missing project, segment, and project-level context opt-outs", async () => {
  const { createAiSegmentContextService } = await loadFactory();
  const absent = createHarness(createAiSegmentContextService, { noProject: true });
  assert.deepEqual(await absent.service.glossaryTermsForSegment({ source: "House" }), []);
  assert.deepEqual(await absent.service.tmMatchesForSegment({ source: "House" }), []);
  assert.deepEqual(absent.service.surroundingSegmentsForSegment({ id: "segment-1" }), []);
  assert.deepEqual(absent.calls, []);
  const missingSegment = createHarness(createAiSegmentContextService);
  assert.deepEqual(await missingSegment.service.glossaryTermsForSegment(null), []);
  assert.deepEqual(await missingSegment.service.tmMatchesForSegment(null), []);
  const disabled = createHarness(createAiSegmentContextService, {
    useTermbaseContext: false,
    useTmContext: false
  });
  assert.deepEqual(await disabled.service.glossaryTermsForSegment({ source: "House" }), []);
  assert.deepEqual(await disabled.service.tmMatchesForSegment({ source: "House" }), []);
  assert.equal(
    disabled.calls.some(([name]) => name.startsWith("find")),
    false
  );
});

test("AI segment context routes exact language, resource, source, and TM-limit lookup parameters", async () => {
  const { createAiSegmentContextService } = await loadFactory();
  const harness = createHarness(createAiSegmentContextService);
  const segment = { id: "segment-1", source: "House" };
  assert.deepEqual(await harness.service.glossaryTermsForSegment(segment), [{ sourceTerm: "house", targetTerm: "ev" }]);
  assert.deepEqual(await harness.service.tmMatchesForSegment(segment), [{ target: "Örnek", score: 91 }]);
  assert.deepEqual(harness.calls, [
    [
      "findTerms",
      {
        source: "House",
        sourceLang: "en",
        targetLang: "tr",
        termBaseNames: ["Project TB", "Shared TB"]
      }
    ],
    [
      "findTmMatches",
      {
        source: "House",
        sourceLang: "en",
        targetLang: "tr",
        tmNames: ["Main TM", "Reference TM"],
        limit: 3
      }
    ]
  ]);
});

test("AI segment context contains lookup failures with the existing warning messages", async () => {
  const { createAiSegmentContextService } = await loadFactory();
  const termError = new Error("termbase unavailable");
  const tmError = new Error("TM unavailable");
  const harness = createHarness(createAiSegmentContextService, { termError, tmError });
  assert.deepEqual(await harness.service.glossaryTermsForSegment({ source: "House" }), []);
  assert.deepEqual(await harness.service.tmMatchesForSegment({ source: "House" }), []);
  assert.deepEqual(harness.warnings, [
    ["Local AI pretranslation termbase lookup failed.", termError],
    ["Local AI pretranslation TM lookup failed.", tmError]
  ]);
});

test("AI segment context composes explicit direct-OpenAI resources concurrently in TM-first order", async () => {
  const { createAiSegmentContextService } = await loadFactory();
  let resolveTerms;
  let resolveTm;
  const termPromise = new Promise((resolve) => {
    resolveTerms = resolve;
  });
  const tmPromise = new Promise((resolve) => {
    resolveTm = resolve;
  });
  const harness = createHarness(createAiSegmentContextService, {
    useTermbaseContext: false,
    useTmContext: false,
    termLookup: () => termPromise,
    tmLookup: () => tmPromise
  });
  const pending = harness.service.resourceContextForSegment(
    { id: "segment-1", source: "House" },
    { useTmContext: true, useTermbaseContext: true }
  );
  assert.deepEqual(harness.calls, [
    [
      "findTmMatches",
      {
        source: "House",
        sourceLang: "en",
        targetLang: "tr",
        tmNames: ["Main TM", "Reference TM"]
      }
    ],
    [
      "findTerms",
      {
        source: "House",
        sourceLang: "en",
        targetLang: "tr",
        termBaseNames: ["Project TB", "Shared TB"]
      }
    ]
  ]);
  resolveTerms([{ sourceTerm: "house", targetTerm: "ev" }]);
  resolveTm([{ target: "Ev", score: 94 }]);
  assert.deepEqual(await pending, [[{ target: "Ev", score: 94 }], [{ sourceTerm: "house", targetTerm: "ev" }]]);
});

test("AI segment context honors explicit direct-OpenAI opt-outs and propagates lookup rejection", async () => {
  const { createAiSegmentContextService } = await loadFactory();
  const disabled = createHarness(createAiSegmentContextService);
  assert.deepEqual(
    await disabled.service.resourceContextForSegment(
      { id: "segment-1", source: "House" },
      { useTmContext: false, useTermbaseContext: false }
    ),
    [[], []]
  );
  assert.deepEqual(disabled.calls, []);

  const tmError = new Error("direct OpenAI TM context failed");
  const rejected = createHarness(createAiSegmentContextService, { tmError });
  await assert.rejects(
    rejected.service.resourceContextForSegment(
      { id: "segment-1", source: "House" },
      { useTmContext: true, useTermbaseContext: false }
    ),
    tmError
  );
  assert.deepEqual(rejected.warnings, []);
});

test("AI segment context returns two ordered nonblank neighbors per side from the same document", async () => {
  const { createAiSegmentContextService } = await loadFactory();
  const active = { id: "active", documentId: "doc-1", source: "Active", target: "Etkin" };
  const segments = [
    { id: "before-2", documentId: "doc-1", source: "Far before", target: "Uzak önce" },
    { id: "other-before", documentId: "doc-2", source: "Other before" },
    { id: "blank-before", documentId: "doc-1", source: " " },
    { id: "before-1", documentId: "doc-1", source: "Near before" },
    active,
    { id: "other-after", documentId: "doc-2", source: "Other after" },
    { id: "after-1", documentId: "doc-1", source: "Near after", target: "Yakın sonra" },
    { id: "blank-after", documentId: "doc-1", source: "" },
    { id: "after-2", documentId: "doc-1", source: "Far after" },
    { id: "after-3", documentId: "doc-1", source: "Third after" }
  ];
  const harness = createHarness(createAiSegmentContextService, { segments: [{ id: "wrong" }] });
  assert.deepEqual(
    harness.service.surroundingSegmentsForSegment(active, {
      settings: { includeNearbyContext: true },
      segments
    }),
    [
      { relation: "Previous segment 2", source: "Far before", target: "Uzak önce" },
      { relation: "Previous segment 1", source: "Near before", target: "" },
      { relation: "Next segment 1", source: "Near after", target: "Yakın sonra" },
      { relation: "Next segment 2", source: "Far after", target: "" }
    ]
  );
  assert.equal(
    harness.calls.some(([name]) => name === "getAllSegments"),
    false
  );
});

test("AI segment context uses settings and segment fallbacks and rejects disabled or unknown selections", async () => {
  const { createAiSegmentContextService } = await loadFactory();
  const active = { id: "active", source: "Active" };
  const harness = createHarness(createAiSegmentContextService, {
    segments: [{ id: "before", source: "Before" }, active, { id: "after", source: "After" }]
  });
  assert.deepEqual(harness.service.surroundingSegmentsForSegment(active), [
    { relation: "Previous segment 1", source: "Before", target: "" },
    { relation: "Next segment 1", source: "After", target: "" }
  ]);
  assert.ok(harness.calls.some(([name]) => name === "getAllSegments"));
  assert.deepEqual(
    harness.service.surroundingSegmentsForSegment(active, {
      settings: { includeNearbyContext: false }
    }),
    []
  );
  assert.deepEqual(harness.service.surroundingSegmentsForSegment({ id: "unknown", source: "Unknown" }), []);
});
