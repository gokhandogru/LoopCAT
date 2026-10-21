const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function loadQa(detectProtectedTags) {
  const context = vm.createContext({ window: { CatHan: { docx: { detectProtectedTags } } } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../qa.js"), "utf8"), context);
  return context.window.CatHan.qa.runQaChecks;
}

test("QA recomputes stale PO placeholders using the same source and target format flags", () => {
  const structure = { format: "po", formatFlags: [] };
  const calls = [];
  const run = loadQa((text, context) => {
    calls.push({ text, context });
    return [];
  });
  const segment = {
    id: "percentage",
    source: "Discount 1%",
    target: "%1 indirim",
    tags: [{ text: "%1 i" }],
    structure
  };
  assert.equal(run([segment]).filter((issue) => issue.type === "tag").length, 0);
  assert.ok(calls.some(({ text }) => text === segment.source));
  assert.ok(calls.some(({ text }) => text === segment.target));
  assert.ok(calls.every(({ context }) => context === structure));
});

test("QA counts exact repeated PO placeholders instead of matching token prefixes", () => {
  const structure = { format: "po", formatFlags: ["qt-format"] };
  const run = loadQa((text, context) => {
    assert.equal(context, structure);
    return Array.from(text.matchAll(/%\d+/g), ([text]) => ({ text }));
  });
  const segment = { source: "%1 %1 %10 items", target: "%10 öge", structure };
  const tagIssues = (target) => run([{ ...segment, target }]).filter((issue) => issue.type === "tag");
  const missing = tagIssues(segment.target);
  assert.equal(missing.length, 2);
  assert.ok(missing.every((issue) => issue.messageValues.value1 === "%1"));
  assert.equal(tagIssues("%10 %1 öge").length, 1);
  assert.equal(tagIssues("%10 %1 %1 öge").length, 0);
});

test("QA preserves stored tags for non-PO formats", () => {
  const run = loadQa(() => {
    throw new Error("Stored non-PO tags must remain authoritative");
  });
  const segment = {
    source: "A custom tag",
    target: "Çeviri",
    structure: { format: "xliff" },
    tags: [{ text: "<x/>", label: "Protected code" }]
  };
  const missing = run([segment]).filter((issue) => issue.type === "tag");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].messageValues.value1, "Protected code");
});
