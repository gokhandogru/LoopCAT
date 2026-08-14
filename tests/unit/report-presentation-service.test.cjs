const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createReportPresentationService, overrides = {}) {
  const calls = [];
  const service = createReportPresentationService({
    localization: {
      source(text) {
        calls.push(["source", text]);
        if (overrides.source) return overrides.source(text);
        return `localized:${text}`;
      },
      sourceHtml(text) {
        calls.push(["sourceHtml", text]);
        return `localized-html:${text}`;
      }
    },
    escapeHtml(value) {
      calls.push(["escapeHtml", value]);
      return `escaped:${value}`;
    },
    redactSensitiveText(value) {
      calls.push(["redactSensitiveText", value]);
      return overrides.redactSensitiveText ? overrides.redactSensitiveText(value) : String(value || "");
    },
    qualityCategoryName(value) {
      calls.push(["qualityCategoryName", value]);
      return overrides.qualityCategoryName ? overrides.qualityCategoryName(value) : `category:${value}`;
    },
    qaCheckMessage(check) {
      calls.push(["qaCheckMessage", check]);
      return overrides.qaCheckMessage ? overrides.qaCheckMessage(check) : `message:${check.label}`;
    },
    qaCheckFixHint(check) {
      calls.push(["qaCheckFixHint", check]);
      return overrides.qaCheckFixHint ? overrides.qaCheckFixHint(check) : check.fixHint || "";
    }
  });
  return { calls, service };
}

test("ReportPresentationService preserves escaped lists, localized empty states, and sorted count tables", async () => {
  const { createReportPresentationService } = await moduleAt("src/reports/report-presentation-service.js");
  const { calls, service } = createHarness(createReportPresentationService);

  assert.equal(service.listHtml(["second", "<first>"]), "<ul><li>escaped:second</li><li>escaped:<first></li></ul>");
  assert.equal(service.listHtml([]), '<p class="muted">localized-html:None</p>');
  assert.equal(service.listHtml(null, "Nothing here"), '<p class="muted">localized-html:Nothing here</p>');
  assert.equal(
    service.countTableHtml({ zebra: 2, alpha: 1 }),
    "<table><tbody><tr><th>escaped:localized:alpha</th><td>1</td></tr><tr><th>escaped:localized:zebra</th><td>2</td></tr></tbody></table>"
  );
  assert.equal(service.countTableHtml({}, "No counts"), '<p class="muted">localized-html:No counts</p>');
  assert.deepEqual(
    calls.filter(([name]) => name === "sourceHtml"),
    [
      ["sourceHtml", "None"],
      ["sourceHtml", "Nothing here"],
      ["sourceHtml", "No counts"]
    ]
  );
});

test("ReportPresentationService sorts localized quality categories and preserves safe-label redaction fallbacks", async () => {
  const { createReportPresentationService } = await moduleAt("src/reports/report-presentation-service.js");
  const { service } = createHarness(createReportPresentationService, {
    qualityCategoryName: (value) => ({ accuracy: "Zulu", style: "Alpha" })[value],
    redactSensitiveText: (value) => (value === "credential" ? "  [redacted]  " : "   ")
  });

  assert.equal(
    service.qualityCategoryCountTableHtml({ accuracy: 3, style: 4 }),
    "<table><tbody><tr><th>escaped:Alpha</th><td>4</td></tr><tr><th>escaped:Zulu</th><td>3</td></tr></tbody></table>"
  );
  assert.equal(service.qualityCategoryCountTableHtml(null), '<p class="muted">localized-html:None</p>');
  assert.equal(service.safeLabel("credential", "fallback"), "[redacted]");
  assert.equal(service.safeLabel("", "fallback"), "fallback");
  assert.equal(service.safeLabel(null), "");
});

test("ReportPresentationService preserves QA columns, fallbacks, escaping, and the 50-row bound", async () => {
  const { createReportPresentationService } = await moduleAt("src/reports/report-presentation-service.js");
  const checks = Array.from({ length: 52 }, (_, index) => ({
    label: String(index),
    type: index === 0 ? "<tag>" : "type",
    severity: index === 0 ? "" : "warning",
    fixHint: index === 0 ? "" : `fix:${index}`
  }));
  const { calls, service } = createHarness(createReportPresentationService);

  assert.equal(service.qaChecksTableHtml([]), '<p class="muted">localized-html:No QA issues found.</p>');
  const output = service.qaChecksTableHtml(checks);
  assert.match(
    output,
    /<thead><tr><th>localized-html:Segment<\/th><th>localized-html:Type<\/th><th>localized-html:Severity<\/th><th>localized-html:Message<\/th><th>localized-html:Recommendation<\/th><\/tr><\/thead>/
  );
  assert.match(
    output,
    /<td>#escaped:0<\/td>\s*<td>escaped:localized:<tag><\/td>\s*<td>escaped:localized:info<\/td>\s*<td>escaped:message:0<\/td>\s*<td>escaped:localized:None<\/td>/
  );
  assert.match(output, /<td>#escaped:49<\/td>/);
  assert.doesNotMatch(output, /<td>#escaped:50<\/td>/);
  assert.equal(calls.filter(([name]) => name === "qaCheckMessage").length, 50);
  assert.equal(calls.filter(([name]) => name === "qaCheckFixHint").length, 50);
});

test("ReportPresentationService is immutable, validates every boundary, and propagates delegate failures", async () => {
  const { createReportPresentationService } = await moduleAt("src/reports/report-presentation-service.js");
  assert.throws(() => createReportPresentationService(), /requires localization, escaping, redaction/);
  const failure = new Error("translation failed");
  const { service } = createHarness(createReportPresentationService, {
    source() {
      throw failure;
    }
  });

  assert.equal(Object.isFrozen(service), true);
  assert.equal(service.listHtml, service.listHtml);
  assert.throws(
    () => service.countTableHtml({ label: 1 }),
    (error) => error === failure
  );
});
