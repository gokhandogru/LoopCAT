const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function interpolate(text, values = {}) {
  return String(text ?? "").replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}

function redactSensitiveText(value) {
  return String(value ?? "").replace(/secret-[\w-]+/g, "[redacted]");
}

function fixtureData() {
  const profile = {
    standard: "iso",
    reviewDepth: "full",
    riskTolerance: "low",
    terminologyStrictness: "strict",
    aiDisclosure: "client-approved",
    audience: "Audience secret-audience",
    tone: "Warm"
  };
  const riskItems = Array.from({ length: 21 }, (_, index) => ({
    label: String(index + 1),
    documentName: `Document ${index + 1}`,
    category: index % 2 ? "style" : "accuracy",
    level: index % 2 ? "medium" : "high",
    score: 90 - index,
    reasons: ["one", "two", "three", "four"].map((label) => ({ label: `${label}-${index + 1}` }))
  }));
  return {
    generatedAt: "2026-08-14T10:00:00.000Z",
    project: {
      name: "Project secret-project",
      domain: "Legal secret-domain",
      sourceLang: "en",
      targetLang: "tr",
      qualityProfile: profile
    },
    resources: {
      mainTm: "Main secret-tm",
      tmNames: ["TM One", "TM secret-two"],
      tbNames: ["TB One", "TB secret-two"]
    },
    analysis: {
      totals: {
        files: 2,
        segments: 8,
        words: 144,
        confirmed: 6,
        confirmedPercent: 75,
        untranslated: 1,
        repetitions: 2,
        comments: 3
      },
      files: [
        { name: "source.html", type: "html", segments: 5, words: 100, confirmed: 4, untranslated: 1 },
        { name: "secret-file.docx", type: "docx", segments: 3, words: 44, confirmed: 2, untranslated: 0 }
      ],
      ai: {
        drafts: 2,
        suggestionSegments: 3,
        suggestions: 4,
        reviewRisk: 1,
        highRisk: 1,
        risk: { high: 1, low: 2 }
      }
    },
    validation: {
      errors: ["Error secret-validation"],
      risky: ["Risk note"],
      warnings: ["Warning note"],
      preserved: ["Preserved note"],
      simplified: [],
      skipped: ["Skipped note"],
      ok: false
    },
    qualityPassport: {
      generatedAt: "2026-08-14T10:01:00.000Z",
      profile,
      confidenceScore: 82,
      postEditingEffort: { label: "Moderate", score: 4, drivers: ["Driver one", "Driver two"] },
      riskQueue: {
        items: riskItems,
        byLevel: { high: 11, medium: 10 },
        byCategory: { accuracy: 11, style: 10 },
        totalRiskItems: 21,
        highRiskCount: 11,
        averageScore: 80
      },
      ai: { drafts: 2, reviewRisk: 1, highRisk: 1 },
      reviewByState: { reviewed: 2, "needs-review": 1 }
    },
    qaChecks: [
      { label: "1", type: "tag", severity: "high", message: "Missing tag", fixHint: "Restore tag" },
      { label: "2", type: "term", severity: "warning", message: "Term warning", fixHint: "" }
    ],
    qaBySeverity: { high: 1, warning: 1 },
    qaByType: { tag: 1, term: 1 },
    activityEvents: Array.from({ length: 11 }, (_, index) => ({
      createdAt: `2026-08-14T10:${String(index).padStart(2, "0")}:00.000Z`,
      type: `event-${index}`,
      summary: index === 10 ? "ELEVENTH_ACTIVITY_SENTINEL" : `Activity ${index}`
    })),
    activityByType: { edit: 7, export: 4 },
    tmEntryCount: 12,
    termCount: 2,
    forbiddenTermCount: 1,
    revisionCount: 5,
    terms: [
      {
        sourceTerm: "source term",
        targetTerm: "target term",
        isForbidden: false,
        termBaseName: "TB secret-name",
        notes: "Term note"
      }
    ]
  };
}

async function createHarness(overrides = {}) {
  const [{ createReportDocumentCompositionService }, { createReportPresentationService }] = await Promise.all([
    moduleAt("src/reports/report-document-composition-service.js"),
    moduleAt("src/reports/report-presentation-service.js")
  ]);
  const localization = {
    source(text, values) {
      if (overrides.source) return overrides.source(text, values);
      return `L:${interpolate(text, values)}`;
    },
    sourceHtml(text, values) {
      return escapeHtml(localization.source(text, values));
    },
    locale: () => "ca-ES",
    direction: () => "rtl"
  };
  const presentation = createReportPresentationService({
    localization,
    escapeHtml,
    redactSensitiveText,
    qualityCategoryName: (value) => `category:${value}`,
    qaCheckMessage: (check) => localization.source(check.message || ""),
    qaCheckFixHint: (check) => (check.fixHint ? localization.source(check.fixHint) : "")
  });
  const service = createReportDocumentCompositionService({
    localization,
    presentation,
    escapeHtml,
    redactSensitiveText,
    defaultQualityProfile: (profile = {}) => ({
      standard: "default-standard",
      reviewDepth: "default-review",
      riskTolerance: "default-risk",
      terminologyStrictness: "default-terms",
      aiDisclosure: "default-disclosure",
      audience: "",
      tone: "",
      ...profile
    }),
    sanitizeValidationReportForDisplay: (report) =>
      Object.fromEntries(
        Object.entries(report).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.map(redactSensitiveText) : value
        ])
      ),
    languagePairDisplay: (sourceLang, targetLang) => `${sourceLang}->${targetLang}`,
    formatDateTime: (value) => `date:${value}`,
    qualityLabel: (value) => `quality:${value}`,
    qualityCategoryName: (value) => `category:${value}`,
    qualityRiskLevelLabel: (value) => `risk:${value}`
  });
  return { service };
}

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

test("ReportDocumentCompositionService preserves complete normal and anonymized Project Report documents", async () => {
  const { service } = await createHarness();
  const data = fixtureData();
  const normal = service.projectReportHtml(data);
  const anonymized = service.projectReportHtml(data, { anonymized: true });

  assert.equal(hash(normal), "8d1bed58355b927fc9541e7fe10b467af5b71a17ef7f08c215481b985509195b");
  assert.equal(hash(anonymized), "f098d2fefffb16bbd7feaa0a8cce379a6ec7c9a50a558ab9ca73e4257f5ecbff");
  assert.match(normal, /^<!doctype html>\n<html lang="ca-ES" dir="rtl">/);
  assert.match(normal, /Content-Security-Policy/);
  assert.doesNotMatch(normal, /secret-[\w-]+/);
  assert.match(normal, /Activity 9/);
  assert.doesNotMatch(normal, /ELEVENTH_ACTIVITY_SENTINEL/);
  assert.match(anonymized, /L:Anonymized project/);
  assert.match(anonymized, /File 1/);
  assert.doesNotMatch(anonymized, /source\.html|source term|Activity 0|QA details|TM One|TB One/);
});

test("ReportDocumentCompositionService preserves the complete Quality Passport and 20-risk bound", async () => {
  const { service } = await createHarness();
  const output = service.qualityPassportHtml(fixtureData());

  assert.equal(hash(output), "b4a665f0416515db9d81ba1a41c0cb65c7b1404055f8e1b167228a745c6b0512");
  assert.match(output, /^<!doctype html>\n<html lang="ca-ES" dir="rtl">/);
  assert.match(output, /L:LoopCAT Quality Passport/);
  assert.match(output, /<td>#20<\/td>/);
  assert.doesNotMatch(output, /<td>#21<\/td>/);
  assert.match(output, /three-20/);
  assert.doesNotMatch(output, /four-20/);
  assert.doesNotMatch(output, /secret-[\w-]+/);
});

test("ReportDocumentCompositionService is immutable, validates every boundary, and propagates delegate failures", async () => {
  const { createReportDocumentCompositionService } = await moduleAt(
    "src/reports/report-document-composition-service.js"
  );
  assert.throws(() => createReportDocumentCompositionService(), /requires localization, presentation, escaping/);
  const failure = new Error("translation failed");
  const { service } = await createHarness({
    source() {
      throw failure;
    }
  });

  assert.equal(Object.isFrozen(service), true);
  assert.equal(service.projectReportHtml, service.projectReportHtml);
  assert.throws(
    () => service.projectReportHtml(fixtureData()),
    (error) => error === failure
  );
});
