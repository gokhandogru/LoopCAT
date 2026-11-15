const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const browserWindow = { CatHan: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../validation.js"), "utf8"), {
  window: browserWindow
});
const { planDeliveryExport } = browserWindow.CatHan.validation;

test("multilingual Excel delivery retains blanks and drafts without changing saved segments", () => {
  const segments = [
    { source: "First", target: "", status: "empty" },
    { source: "Second", target: "İkinci", status: "draft" },
    { source: "Third", target: "Üçüncü", status: "confirmed" }
  ];
  for (const format of ["xlsx", "xlsm", "xltx", "xltm"]) {
    const plan = planDeliveryExport({
      format,
      structure: { format: "openxml", multilingualExcel: { sourceColumn: "B", targetColumn: "D" } },
      segments
    });
    assert.equal(plan.policy, "preserve-empty");
    assert.equal(plan.sourceFallbackCount, 0);
    assert.equal(plan.preservedEmptyTargetCount, 1);
    assert.equal(plan.draftTargetCount, 1);
    assert.equal(plan.requiresConfirmation, true);
    assert.deepEqual(
      Array.from(plan.segments, (segment) => segment.target),
      ["", "İkinci", "Üçüncü"]
    );
    assert.notEqual(plan.segments[0], segments[0]);
  }
  assert.equal(segments[0].target, "");
  assert.equal(segments[0].status, "empty");
});

test("ordinary Excel import keeps its existing source fallback export policy", () => {
  const plan = planDeliveryExport({
    format: "xlsx",
    structure: { format: "openxml" },
    segments: [{ source: "First", target: "", status: "empty" }]
  });
  assert.equal(plan.policy, "source-fallback");
  assert.equal(plan.segments[0].target, "First");
});
