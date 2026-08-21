const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-validation-presentation-controller.js")).href);
}

function createHarness(createApplicationValidationPresentationController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "validation"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  const redaction = {
    sanitize(value) {
      calls.push(["redaction.sanitize", value]);
      fail("redaction.sanitize");
      if (typeof overrides.redact === "function") return overrides.redact(value);
      return String(value).replaceAll("secret", "[redacted]");
    }
  };
  const reports = {
    summary(report) {
      calls.push(["reports.summary", report]);
      fail("reports.summary");
      return overrides.summary ?? "Validation summary";
    },
    count(report) {
      calls.push(["reports.count", report]);
      fail("reports.count");
      return overrides.count ?? 0;
    }
  };
  let lastReport = overrides.lastReport;
  const state = {
    setLast(report) {
      calls.push(["state.setLast", report]);
      fail("state.setLast");
      lastReport = report;
      return overrides.setLastResult;
    }
  };
  const localization = {
    label(key) {
      calls.push(["localization.label", key]);
      fail(`localization.label:${key}`);
      return `label:${key}`;
    },
    source(value) {
      calls.push(["localization.source", value]);
      fail(`localization.source:${value}`);
      return `source:${value}`;
    }
  };
  const presentation = {
    render(model) {
      calls.push(["presentation.render", model]);
      fail("presentation.render");
      return overrides.renderResult;
    }
  };
  const controller = createApplicationValidationPresentationController({
    redaction,
    reports,
    state,
    localization,
    presentation
  });
  return {
    calls,
    controller,
    failure,
    getLastReport: () => lastReport,
    localization,
    presentation,
    redaction,
    reports,
    state
  };
}

test("ApplicationValidationPresentationController preserves every falsy report as null without effects", async () => {
  const { createApplicationValidationPresentationController } = await loadFactory();
  const harness = createHarness(createApplicationValidationPresentationController);
  for (const report of [undefined, null, false, 0, ""]) {
    assert.equal(harness.controller.sanitize(report), null);
  }
  assert.deepEqual(harness.calls, []);
});

test("ApplicationValidationPresentationController sanitizes all ordered groups without mutating the source", async () => {
  const { createApplicationValidationPresentationController } = await loadFactory();
  const metadata = { stable: true };
  const report = {
    ok: true,
    errors: ["  secret error  ", "", 0, " kept "],
    risky: "not-an-array",
    warnings: [false, " warning "],
    simplified: null,
    skipped: [" secret skipped "],
    preserved: [],
    metadata
  };
  const harness = createHarness(createApplicationValidationPresentationController);
  const clean = harness.controller.sanitize(report);

  assert.notEqual(clean, report);
  assert.deepEqual(clean, {
    ok: false,
    errors: ["[redacted] error", "kept"],
    risky: [],
    warnings: ["warning"],
    simplified: [],
    skipped: ["[redacted] skipped"],
    preserved: [],
    metadata
  });
  assert.deepEqual(report.errors, ["  secret error  ", "", 0, " kept "]);
  assert.equal(clean.metadata, metadata);
  assert.deepEqual(
    harness.calls,
    ["  secret error  ", "", "", " kept ", "", " warning ", " secret skipped "].map((value) => [
      "redaction.sanitize",
      value
    ])
  );
});

test("ApplicationValidationPresentationController recomputes ok from sanitized errors", async () => {
  const { createApplicationValidationPresentationController } = await loadFactory();
  const harness = createHarness(createApplicationValidationPresentationController, {
    redact: () => "   "
  });
  const clean = harness.controller.sanitize({ ok: false, errors: ["removed"] });
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.errors, []);
  assert.deepEqual(clean.risky, []);
  assert.deepEqual(clean.warnings, []);
  assert.deepEqual(clean.simplified, []);
  assert.deepEqual(clean.skipped, []);
  assert.deepEqual(clean.preserved, []);
});

test("ApplicationValidationPresentationController builds alert text from sanitized errors", async () => {
  const { createApplicationValidationPresentationController } = await loadFactory();
  const harness = createHarness(createApplicationValidationPresentationController);
  const value = harness.controller.alertText({ errors: [" secret one ", " two "] }, "unused secret fallback");
  assert.equal(value, "[redacted] one\ntwo");
  assert.equal(
    harness.calls.some((call) => call[1] === "unused secret fallback"),
    false
  );
});

test("ApplicationValidationPresentationController preserves default and explicit alert fallbacks", async () => {
  const { createApplicationValidationPresentationController } = await loadFactory();
  const harness = createHarness(createApplicationValidationPresentationController);
  assert.equal(harness.controller.alertText(null), "Validation failed.");
  assert.deepEqual(harness.calls, [["redaction.sanitize", "Validation failed."]]);

  harness.calls.length = 0;
  assert.equal(harness.controller.alertText({ errors: [] }, " secret fallback "), " [redacted] fallback ");
  assert.deepEqual(harness.calls, [["redaction.sanitize", " secret fallback "]]);
});

test("ApplicationValidationPresentationController renders null reports with exact localized model order", async () => {
  const { createApplicationValidationPresentationController } = await loadFactory();
  const previous = { previous: true };
  const harness = createHarness(createApplicationValidationPresentationController, { lastReport: previous });
  assert.equal(harness.controller.render(null), undefined);
  assert.equal(harness.getLastReport(), null);
  assert.deepEqual(
    harness.calls.map(([name, value]) => [name, name === "presentation.render" ? value.autoDismissMs : value]),
    [
      ["state.setLast", null],
      ["localization.label", "errors"],
      ["localization.label", "risk"],
      ["localization.source", "Warnings"],
      ["localization.label", "simplified"],
      ["localization.label", "skipped"],
      ["localization.label", "preserved"],
      ["localization.source", "Dismiss validation report"],
      ["localization.source", "Dismiss"],
      ["localization.source", "No validation issues."],
      ["presentation.render", 0]
    ]
  );
  assert.deepEqual(harness.calls.at(-1)[1], {
    report: null,
    summary: "",
    groups: [
      { key: "errors", label: "label:errors" },
      { key: "risky", label: "label:risk" },
      { key: "warnings", label: "source:Warnings" },
      { key: "simplified", label: "label:simplified" },
      { key: "skipped", label: "label:skipped" },
      { key: "preserved", label: "label:preserved" }
    ],
    dismissLabel: "source:Dismiss validation report",
    dismissText: "source:Dismiss",
    emptyLabel: "source:No validation issues.",
    autoDismissMs: 0
  });
});

test("ApplicationValidationPresentationController preserves successful report summary and 12-second dismissal", async () => {
  const { createApplicationValidationPresentationController } = await loadFactory();
  const harness = createHarness(createApplicationValidationPresentationController, { count: 2, summary: "2 warnings" });
  harness.controller.render({ ok: false, errors: [], warnings: [" warning "] });
  const displayReport = harness.getLastReport();
  assert.equal(displayReport.ok, true);
  assert.deepEqual(displayReport.warnings, ["warning"]);
  assert.equal(harness.calls.find(([name]) => name === "reports.summary")[1], displayReport);
  assert.equal(harness.calls.find(([name]) => name === "reports.count")[1], displayReport);
  assert.equal(harness.calls.at(-1)[1].summary, "2 warnings");
  assert.equal(harness.calls.at(-1)[1].autoDismissMs, 12000);
});

test("ApplicationValidationPresentationController preserves empty-success and error persistence policies", async () => {
  const { createApplicationValidationPresentationController } = await loadFactory();
  const empty = createHarness(createApplicationValidationPresentationController, { count: 0 });
  empty.controller.render({ errors: [] });
  assert.equal(empty.calls.at(-1)[1].autoDismissMs, 7000);

  const failed = createHarness(createApplicationValidationPresentationController, { count: 9 });
  failed.controller.render({ errors: ["failure"] });
  assert.equal(failed.calls.at(-1)[1].autoDismissMs, 0);
  assert.equal(
    failed.calls.some(([name]) => name === "reports.count"),
    false
  );
});

test("ApplicationValidationPresentationController preserves sanitizer, alert, and render failure timing", async () => {
  const { createApplicationValidationPresentationController } = await loadFactory();
  const redactionFailure = createHarness(createApplicationValidationPresentationController, {
    failAt: "redaction.sanitize"
  });
  assert.throws(() => redactionFailure.controller.render({ errors: ["failure"] }), redactionFailure.failure);
  assert.deepEqual(redactionFailure.calls, [["redaction.sanitize", "failure"]]);

  for (const failAt of [
    "state.setLast",
    "reports.summary",
    "localization.label:errors",
    "localization.source:Dismiss validation report",
    "reports.count",
    "presentation.render"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createApplicationValidationPresentationController, {
      failAt,
      failure,
      count: 1
    });
    assert.throws(() => harness.controller.render({ errors: [] }), failure);
    assert.equal(
      harness.calls.some(([name]) => name === "state.setLast"),
      true
    );
    assert.equal(
      harness.calls.some(([name]) => name === "presentation.render"),
      failAt === "presentation.render"
    );
  }

  const fallbackFailure = new Error("fallback failed");
  const fallback = createHarness(createApplicationValidationPresentationController, {
    failAt: "redaction.sanitize",
    failure: fallbackFailure
  });
  assert.throws(() => fallback.controller.alertText(null), fallbackFailure);
});

test("ApplicationValidationPresentationController validates every boundary and exposes an immutable API", async () => {
  const { createApplicationValidationPresentationController } = await loadFactory();
  const valid = {
    redaction: { sanitize() {} },
    reports: { summary() {}, count() {} },
    state: { setLast() {} },
    localization: { label() {}, source() {} },
    presentation: { render() {} }
  };
  const controller = createApplicationValidationPresentationController(valid);
  assert.equal(Object.isFrozen(controller), true);
  assert.deepEqual(Object.keys(controller), ["sanitize", "alertText", "render"]);

  for (const [key, value] of [
    ["redaction", {}],
    ["reports", { summary() {} }],
    ["state", {}],
    ["localization", { label() {} }],
    ["presentation", {}]
  ]) {
    assert.throws(() => createApplicationValidationPresentationController({ ...valid, [key]: value }), TypeError);
  }
});
