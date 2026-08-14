const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-term-candidate-persistence-service.js")).href);
}

function createHarness(createService, overrides = {}) {
  const project = { id: "project-1", sourceLang: "en", targetLang: "tr" };
  const calls = [];
  const saved = [];
  let saveAttempt = 0;
  const service = createService({
    project: {
      get: () => {
        calls.push(["getProject"]);
        return project;
      }
    },
    termbase: {
      list: (query) => {
        calls.push(["list", query]);
        return Promise.resolve(overrides.existingTerms || []);
      },
      save: (term) => {
        saveAttempt += 1;
        calls.push(["save", structuredClone(term)]);
        if (overrides.failAt === saveAttempt) return Promise.reject(new Error("term save unavailable"));
        const durable = { id: `term-${saveAttempt}`, ...term };
        saved.push(durable);
        return Promise.resolve(durable);
      }
    },
    normalize: { stableLower: (value) => String(value || "").toLowerCase() },
    workspace: {
      markProjectsUsingResourceDirty: (...details) => calls.push(["markDirty", ...details])
    }
  });
  return { calls, project, saved, service };
}

test("AI term candidate persistence deduplicates existing and repeated pairs before ordered saves", async () => {
  const { createAiTermCandidatePersistenceService } = await loadFactory();
  const harness = createHarness(createAiTermCandidatePersistenceService, {
    existingTerms: [{ sourceTerm: "House", targetTerm: "Ev" }]
  });
  const result = await harness.service.saveCandidates(
    [
      { sourceTerm: "house", targetTerm: "EV", note: "duplicate" },
      { sourceTerm: "Cat", targetTerm: "Kedi", note: "preferred project term" },
      { sourceTerm: "CAT", targetTerm: "KEDI", note: "repeat" },
      { sourceTerm: "Dog", targetTerm: "Köpek" }
    ],
    "Project TB"
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "list"),
    ["list", { sourceLang: "en", targetLang: "tr", termBaseNames: ["Project TB"] }]
  );
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "save").map(([, term]) => term),
    [
      {
        sourceTerm: "Cat",
        targetTerm: "Kedi",
        notes: "AI extracted term candidate. Review before relying on it. preferred project term",
        sourceLang: "en",
        targetLang: "tr",
        termBaseName: "Project TB",
        isForbidden: false
      },
      {
        sourceTerm: "Dog",
        targetTerm: "Köpek",
        notes: "AI extracted term candidate. Review before relying on it.",
        sourceLang: "en",
        targetLang: "tr",
        termBaseName: "Project TB",
        isForbidden: false
      }
    ]
  );
  assert.deepEqual(result.savedTerms, harness.saved);
  assert.equal(result.duplicateCount, 2);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "markDirty"),
    ["markDirty", "termbase", "Project TB", "en", "tr"]
  );
});

test("AI term candidate persistence reports empty input without writes or linked-project dirtiness", async () => {
  const { createAiTermCandidatePersistenceService } = await loadFactory();
  const harness = createHarness(createAiTermCandidatePersistenceService);
  const result = await harness.service.saveCandidates([], "Project TB");
  assert.deepEqual(result, { savedTerms: [], duplicateCount: 0 });
  assert.equal(
    harness.calls.some(([name]) => name === "save"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    false
  );
});

test("AI term candidate persistence counts all existing duplicates without marking projects dirty", async () => {
  const { createAiTermCandidatePersistenceService } = await loadFactory();
  const harness = createHarness(createAiTermCandidatePersistenceService, {
    existingTerms: [{ sourceTerm: "One", targetTerm: "Bir" }]
  });
  const result = await harness.service.saveCandidates(
    [
      { sourceTerm: "one", targetTerm: "bir" },
      { sourceTerm: "ONE", targetTerm: "BIR" }
    ],
    "Project TB"
  );
  assert.deepEqual(result, { savedTerms: [], duplicateCount: 2 });
  assert.equal(
    harness.calls.some(([name]) => name === "save"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    false
  );
});

test("AI term candidate persistence preserves sequential partial saves and propagates failure before dirtiness", async () => {
  const { createAiTermCandidatePersistenceService } = await loadFactory();
  const harness = createHarness(createAiTermCandidatePersistenceService, { failAt: 2 });
  await assert.rejects(
    harness.service.saveCandidates(
      [
        { sourceTerm: "One", targetTerm: "Bir" },
        { sourceTerm: "Two", targetTerm: "İki" },
        { sourceTerm: "Three", targetTerm: "Üç" }
      ],
      "Project TB"
    ),
    /term save unavailable/
  );
  assert.equal(harness.saved.length, 1);
  assert.equal(harness.calls.filter(([name]) => name === "save").length, 2);
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    false
  );
});
