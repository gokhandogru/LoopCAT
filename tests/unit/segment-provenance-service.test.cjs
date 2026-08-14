const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createSegmentProvenanceService) {
  const calls = [];
  const service = createSegmentProvenanceService({
    localization: {
      source(text, values) {
        calls.push(["source", text, values]);
        return `source:${text}:${JSON.stringify(values)}`;
      },
      label(key, values) {
        calls.push(["label", key, values]);
        return `label:${key}:${JSON.stringify(values)}`;
      }
    }
  });
  return { calls, service };
}

test("SegmentProvenanceService preserves trimmed allowlisted AI review risk levels", async () => {
  const { createSegmentProvenanceService } = await moduleAt("src/features/editor/segment-provenance-service.js");
  const { service } = createHarness(createSegmentProvenanceService);
  assert.equal(service.aiRiskLevel({ aiReviewRisk: { level: " high " } }), "high");
  assert.equal(service.aiRiskLevel({ aiReviewRisk: { level: "critical" } }), "critical");
  assert.equal(service.aiRiskLevel({ aiReviewRisk: { level: "HIGH" } }), "");
  assert.equal(service.aiRiskLevel({ aiReviewRisk: { level: "unknown" } }), "");
  assert.equal(service.aiRiskLevel(), "");
});

test("SegmentProvenanceService preserves provider/model AI draft and array/nonempty suggestion classification", async () => {
  const { createSegmentProvenanceService } = await moduleAt("src/features/editor/segment-provenance-service.js");
  const { service } = createHarness(createSegmentProvenanceService);
  assert.equal(service.hasAiDraft({ aiPretranslation: { provider: "openai" } }), true);
  assert.equal(service.hasAiDraft({ aiPretranslation: { model: "gpt" } }), true);
  assert.equal(service.hasAiDraft({ aiPretranslation: { provider: "", model: "" } }), false);
  assert.equal(service.hasAiDraft(), false);
  assert.equal(service.hasAiSuggestions({ aiSuggestions: [{}] }), true);
  assert.equal(service.hasAiSuggestions({ aiSuggestions: [] }), false);
  assert.equal(service.hasAiSuggestions({ aiSuggestions: "suggestion" }), false);
});

test("SegmentProvenanceService preserves AI badge class, text, and model/no-model localized titles", async () => {
  const { createSegmentProvenanceService } = await moduleAt("src/features/editor/segment-provenance-service.js");
  const { calls, service } = createHarness(createSegmentProvenanceService);
  assert.deepEqual(service.aiBadge({ aiPretranslation: { model: "gpt-5" } }), {
    className: "ai-initiated",
    text: "source:AI initiated:undefined",
    title: 'label:aiInitiatedPretranslationModel:{"model":"gpt-5"}'
  });
  assert.deepEqual(service.aiBadge({}), {
    className: "ai-initiated",
    text: "source:AI initiated:undefined",
    title: "label:aiInitiatedPretranslation:undefined"
  });
  assert.deepEqual(calls, [
    ["source", "AI initiated", undefined],
    ["label", "aiInitiatedPretranslationModel", { model: "gpt-5" }],
    ["source", "AI initiated", undefined],
    ["label", "aiInitiatedPretranslation", undefined]
  ]);
});

test("SegmentProvenanceService preserves TM numeric conversion, rounding, clamp, nonfinite null, and zero presence", async () => {
  const { createSegmentProvenanceService } = await moduleAt("src/features/editor/segment-provenance-service.js");
  const { service } = createHarness(createSegmentProvenanceService);
  assert.equal(service.tmScore({ tmPretranslation: { score: "74.6" } }), 75);
  assert.equal(service.tmScore({ tmPretranslation: { score: -5 } }), 0);
  assert.equal(service.tmScore({ tmPretranslation: { score: 120 } }), 100);
  assert.equal(service.tmScore({ tmPretranslation: { score: "" } }), 0);
  assert.equal(service.tmScore({ tmPretranslation: { score: "not-a-number" } }), null);
  assert.equal(service.tmScore(), null);
  assert.equal(service.hasTmPretranslation({ tmPretranslation: { score: 0 } }), true);
  assert.equal(service.hasTmPretranslation({ tmPretranslation: { score: "invalid" } }), false);
});

test("SegmentProvenanceService preserves named and unnamed TM badge metadata", async () => {
  const { createSegmentProvenanceService } = await moduleAt("src/features/editor/segment-provenance-service.js");
  const { service } = createHarness(createSegmentProvenanceService);
  assert.deepEqual(service.tmBadge({ tmPretranslation: { score: 88.4, tmName: " Main TM " } }), {
    className: "tm-pretranslation",
    text: "TM 88%",
    title: 'source:TM pretranslation match: {value1}% from {value2}:{"value1":88,"value2":"Main TM"}'
  });
  assert.deepEqual(service.tmBadge({ tmPretranslation: { score: 0, tmName: " " } }), {
    className: "tm-pretranslation",
    text: "TM 0%",
    title: 'source:TM pretranslation match: {value1}%:{"value1":0}'
  });
});

test("SegmentProvenanceService validates localization and exposes an immutable API", async () => {
  const { createSegmentProvenanceService } = await moduleAt("src/features/editor/segment-provenance-service.js");
  assert.throws(() => createSegmentProvenanceService({}), /requires a localization boundary/);
  const { service } = createHarness(createSegmentProvenanceService);
  assert.equal(Object.isFrozen(service), true);
});
