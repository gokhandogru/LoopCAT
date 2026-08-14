const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-scope-selection-service.js")).href);
}

function createHarness(createService, overrides = {}) {
  const allSegments = overrides.allSegments || [
    { id: "s1", documentId: "d1", source: "One", target: "Bir" },
    { id: "s2", documentId: "d1", source: "Two", target: "" },
    { id: "s3", documentId: "d2", source: "Three", target: "Üç" },
    { id: "s4", documentId: "d2", source: "Four", target: " " }
  ];
  const documentSegments = overrides.documentSegments || allSegments.slice(0, 2);
  const activeSegment = Object.hasOwn(overrides, "activeSegment") ? overrides.activeSegment : allSegments[1];
  const calls = [];
  const service = createService({
    project: {
      get: () => {
        calls.push(["getProject"]);
        return overrides.noProject ? null : { id: "project-1" };
      }
    },
    settings: {
      read: () => {
        calls.push(["readSettings"]);
        return overrides.formSettings || { mode: "untranslated" };
      }
    },
    segments: {
      getAll: () => {
        calls.push(["getAll"]);
        return allSegments;
      },
      getDocument: () => {
        calls.push(["getDocument"]);
        return documentSegments;
      },
      getActive: () => {
        calls.push(["getActive"]);
        return activeSegment;
      }
    },
    filters: {
      getVisibleIndexes: () => {
        calls.push(["getVisibleIndexes"]);
        return overrides.visibleIndexes || [3, 0, 20];
      }
    }
  });
  return { allSegments, calls, documentSegments, service };
}

test("AI scope selection preserves missing-project and form-settings terminology behavior", async () => {
  const { createAiScopeSelectionService } = await loadFactory();
  const missing = createHarness(createAiScopeSelectionService, { noProject: true });
  assert.deepEqual(missing.service.terminologySegments(), []);
  assert.deepEqual(missing.calls, [["readSettings"], ["getProject"]]);
  const fallback = createHarness(createAiScopeSelectionService);
  assert.deepEqual(
    fallback.service.terminologySegments().map((segment) => segment.id),
    ["s2"]
  );
});

test("AI terminology scope preserves selected, sparse visible, project, untranslated, and document modes", async () => {
  const { createAiScopeSelectionService } = await loadFactory();
  const harness = createHarness(createAiScopeSelectionService);
  assert.deepEqual(
    harness.service.terminologySegments({ mode: "selected" }).map((segment) => segment.id),
    ["s2"]
  );
  assert.deepEqual(
    harness.service.terminologySegments({ mode: "visible" }).map((segment) => segment.id),
    ["s4", "s1"]
  );
  assert.equal(harness.service.terminologySegments({ mode: "project" }), harness.allSegments);
  assert.deepEqual(
    harness.service.terminologySegments({ mode: "untranslated" }).map((segment) => segment.id),
    ["s2"]
  );
  assert.equal(harness.service.terminologySegments({ mode: "document" }), harness.documentSegments);
  const noActive = createHarness(createAiScopeSelectionService, { activeSegment: null });
  assert.deepEqual(noActive.service.terminologySegments({ mode: "selected" }), []);
});

test("AI pretranslation scope preserves project-backed and document-backed source choices", async () => {
  const { createAiScopeSelectionService } = await loadFactory();
  const harness = createHarness(createAiScopeSelectionService);
  for (const mode of ["project", "visible", "selected"]) {
    assert.equal(harness.service.pretranslationSegments({ mode }), harness.allSegments);
  }
  for (const mode of ["untranslated", "document", "unknown"]) {
    assert.equal(harness.service.pretranslationSegments({ mode }), harness.documentSegments);
  }
});

test("AI pretranslation options preserve active and ordered sparse visible stable IDs", async () => {
  const { createAiScopeSelectionService } = await loadFactory();
  const harness = createHarness(createAiScopeSelectionService);
  assert.deepEqual(harness.service.pretranslationOptions({ mode: "visible" }), {
    mode: "visible",
    selectedSegmentIds: ["s2"],
    visibleSegmentIds: ["s4", "s1"]
  });
  const noActive = createHarness(createAiScopeSelectionService, { activeSegment: null });
  assert.deepEqual(noActive.service.pretranslationOptions({ mode: "selected" }).selectedSegmentIds, []);
});

test("AI project-brief samples prefer the active document, skip blank sources, and preserve target fallback", async () => {
  const { createAiScopeSelectionService } = await loadFactory();
  const documentSegments = [
    { id: "blank", source: " ", target: "Ignored" },
    { id: "one", source: "First", target: "İlk" },
    { id: "two", source: "Second", target: null },
    { id: "three", source: "Third", target: "Üçüncü" }
  ];
  const harness = createHarness(createAiScopeSelectionService, { documentSegments });
  assert.deepEqual(harness.service.projectBriefSampleSegments(2), [
    { source: "First", target: "İlk" },
    { source: "Second", target: "" }
  ]);
  assert.equal(harness.service.hasProjectBriefSamples(), true);
  assert.equal(
    harness.calls.some(([name]) => name === "getAll"),
    false
  );
});

test("AI project-brief samples fall back to the project and retain the default six-sample bound", async () => {
  const { createAiScopeSelectionService } = await loadFactory();
  const allSegments = Array.from({ length: 8 }, (_, index) => ({
    id: `s${index + 1}`,
    source: `Source ${index + 1}`,
    target: `Target ${index + 1}`
  }));
  const harness = createHarness(createAiScopeSelectionService, {
    allSegments,
    documentSegments: []
  });
  assert.equal(harness.service.projectBriefSampleSegments().length, 6);
  assert.deepEqual(harness.service.projectBriefSampleSegments(1), [{ source: "Source 1", target: "Target 1" }]);
});
