const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/quality/quality-presentation-service.js")).href);
}

function createHarness(createQualityPresentationService, overrides = {}) {
  const calls = [];
  const service = createQualityPresentationService({
    localization: {
      source(value) {
        calls.push(["source", value]);
        if (overrides.localizationError) throw overrides.localizationError;
        return `localized:${String(value)}`;
      },
      label(key) {
        calls.push(["label", key]);
        if (overrides.labelErrorKey === key) throw overrides.labelError;
        if (Object.hasOwn(overrides.labelValues || {}, key)) return overrides.labelValues[key];
        return `label:${key}`;
      }
    },
    baseCategoryLabel: overrides.withoutBaseCategoryLabel
      ? undefined
      : (value) => {
          calls.push(["baseCategoryLabel", value]);
          if (overrides.baseCategoryError) throw overrides.baseCategoryError;
          return overrides.baseCategoryLabels?.[String(value)] || "";
        }
  });
  return { calls, service };
}

test("QualityPresentationService preserves every profile label and unknown or empty passthrough", async () => {
  const { createQualityPresentationService } = await loadFactory();
  const { calls, service } = createHarness(createQualityPresentationService);
  const expected = {
    "student-review": "Student review",
    "freelance-delivery": "Freelance delivery",
    "agency-delivery": "Agency delivery",
    regulated: "Regulated",
    targeted: "Targeted",
    full: "Full",
    lqa: "LQA",
    balanced: "Balanced",
    strict: "Strict",
    standard: "Standard",
    "not-used": "Not used",
    "local-only": "Local only",
    "hosted-disclosed": "Hosted disclosed",
    "client-approved": "Client approved"
  };

  for (const [value, label] of Object.entries(expected)) {
    assert.equal(service.profile(value), `localized:${label}`);
  }
  assert.equal(service.profile("custom"), "localized:custom");
  assert.equal(service.profile(""), "localized:");
  assert.equal(service.profile(null), "localized:");
  assert.equal(calls.filter(([name]) => name === "source").length, Object.keys(expected).length + 3);
});

test("QualityPresentationService preserves base category precedence, fallback mappings, and Review default", async () => {
  const { createQualityPresentationService } = await loadFactory();
  const { calls, service } = createHarness(createQualityPresentationService, {
    baseCategoryLabels: { accuracy: "Base accuracy", custom: "Base custom" }
  });

  assert.equal(service.category("accuracy"), "localized:Base accuracy");
  assert.equal(service.category("terminology"), "localized:Terminology");
  assert.equal(service.category("fluency"), "localized:Fluency");
  assert.equal(service.category("style"), "localized:Style");
  assert.equal(service.category("locale"), "localized:Locale");
  assert.equal(service.category("formatting"), "localized:Formatting");
  assert.equal(service.category("compliance"), "localized:Compliance");
  assert.equal(service.category("review"), "localized:Review");
  assert.equal(service.category("custom"), "localized:Base custom");
  assert.equal(service.category("unknown"), "localized:unknown");
  assert.equal(service.category(""), "localized:Review");
  assert.equal(service.category(null), "localized:Review");
  assert.equal(calls.filter(([name]) => name === "baseCategoryLabel").length, 12);

  const withoutBase = createHarness(createQualityPresentationService, { withoutBaseCategoryLabel: true });
  assert.equal(withoutBase.service.category("accuracy"), "localized:Accuracy");
});

test("QualityPresentationService preserves decision severity mappings and Medium fallback", async () => {
  const { createQualityPresentationService } = await loadFactory();
  const { service } = createHarness(createQualityPresentationService);

  assert.equal(service.decisionSeverity("low"), "localized:Low");
  assert.equal(service.decisionSeverity("medium"), "localized:Medium");
  assert.equal(service.decisionSeverity("high"), "localized:High");
  assert.equal(service.decisionSeverity("critical"), "localized:Critical");
  assert.equal(service.decisionSeverity("unknown"), "localized:Medium");
  assert.equal(service.decisionSeverity(null), "localized:Medium");
});

test("QualityPresentationService preserves risk-level mappings and Risk fallback", async () => {
  const { createQualityPresentationService } = await loadFactory();
  const { service } = createHarness(createQualityPresentationService);

  assert.equal(service.riskLevel("critical"), "localized:Critical");
  assert.equal(service.riskLevel("high"), "localized:High");
  assert.equal(service.riskLevel("medium"), "localized:Medium");
  assert.equal(service.riskLevel("low"), "localized:Low");
  assert.equal(service.riskLevel("clear"), "localized:Clear");
  assert.equal(service.riskLevel("unknown"), "localized:Risk");
  assert.equal(service.riskLevel(undefined), "localized:Risk");
});

test("QualityPresentationService preserves eager AI-review risk mappings and unranked fallbacks", async () => {
  const { createQualityPresentationService } = await loadFactory();
  const knownKeys = ["noIssuesFound", "lowRisk", "mediumRisk", "highRisk", "criticalRisk"];
  for (const [value, expected] of [
    ["none", "label:noIssuesFound"],
    ["low", "label:lowRisk"],
    ["medium", "label:mediumRisk"],
    ["high", "label:highRisk"],
    ["critical", "label:criticalRisk"]
  ]) {
    const { calls, service } = createHarness(createQualityPresentationService);
    assert.equal(service.aiReviewRisk(value), expected);
    assert.deepEqual(
      calls.filter(([name]) => name === "label").map(([, key]) => key),
      knownKeys
    );
  }

  for (const value of ["unknown", "", null, undefined]) {
    const { calls, service } = createHarness(createQualityPresentationService);
    assert.equal(service.aiReviewRisk(value), "label:unrankedRisk");
    assert.deepEqual(
      calls.filter(([name]) => name === "label").map(([, key]) => key),
      [...knownKeys, "unrankedRisk"]
    );
  }

  const emptySelected = createHarness(createQualityPresentationService, { labelValues: { lowRisk: "" } });
  assert.equal(emptySelected.service.aiReviewRisk("low"), "label:unrankedRisk");
});

test("QualityPresentationService preserves eager AI-review label delegate failure timing", async () => {
  const { createQualityPresentationService } = await loadFactory();
  const labelError = new Error("medium label unavailable");
  const { calls, service } = createHarness(createQualityPresentationService, {
    labelErrorKey: "mediumRisk",
    labelError
  });

  assert.throws(() => service.aiReviewRisk("none"), labelError);
  assert.deepEqual(
    calls.filter(([name]) => name === "label"),
    [
      ["label", "noIssuesFound"],
      ["label", "lowRisk"],
      ["label", "mediumRisk"]
    ]
  );
});

test("QualityPresentationService validates boundaries, propagates delegates, and exposes an immutable API", async () => {
  const { createQualityPresentationService } = await loadFactory();
  assert.throws(() => createQualityPresentationService({}), /requires source localization/);
  assert.throws(
    () => createQualityPresentationService({ localization: { source: (value) => value } }),
    /requires label localization/
  );
  assert.throws(
    () =>
      createQualityPresentationService({
        localization: { source: (value) => value, label: (key) => key },
        baseCategoryLabel: "invalid"
      }),
    /base category label must be a function/
  );

  const service = createHarness(createQualityPresentationService).service;
  assert.equal(Object.isFrozen(service), true);

  const baseCategoryError = new Error("category unavailable");
  const failingBase = createHarness(createQualityPresentationService, { baseCategoryError });
  assert.throws(() => failingBase.service.category("accuracy"), baseCategoryError);
  assert.equal(
    failingBase.calls.some(([name]) => name === "source"),
    false
  );

  const localizationError = new Error("localization unavailable");
  const failingLocalization = createHarness(createQualityPresentationService, { localizationError });
  assert.throws(() => failingLocalization.service.profile("strict"), localizationError);
  assert.deepEqual(failingLocalization.calls.at(-1), ["source", "Strict"]);
});
