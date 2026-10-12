const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
require("../../linguistic-core.js");
require("../../statistics-core.js");
const core = globalThis.LoopCATLinguistics;
const stats = globalThis.LoopCATStatistics;

const project = {
  id: "p",
  name: "Example",
  sourceLang: "en",
  targetLang: "tr",
  documents: [
    { id: "a", name: "a.txt" },
    { id: "b", name: "b.txt" }
  ]
};
const segment = (id, source, documentId = "a") => ({
  id,
  source,
  documentId,
  index: Number(id) || 0,
  projectId: "p",
  status: "empty"
});
const entry = (id, source, target = "Çeviri", resourceId = "tm") => ({
  id,
  source,
  target,
  resourceId,
  tmName: resourceId,
  sourceLang: "en",
  targetLang: "tr",
  languagePair: "en::tr"
});

test("incomplete source interpretation is not billed as a complete word count", async () => {
  const result = await stats.analyze({
    project,
    segments: [segment("1", "Known words"), segment("2", '<custom payload="not words">Unknown</custom>')]
  });
  assert.equal(result.countingComplete, false);
  assert.equal(result.complete, false);
  assert.equal(result.totals.words, 2);
  assert.equal(result.unresolvedCountingSegments, 1);
  assert.equal(result.rows[1].words, null);
  assert.match(stats.exportReport(result, "html"), /INCOMPLETE/);
});

test("bounded candidate searches can be expanded and exact candidates rank first", () => {
  const entries = Array.from({ length: 2100 }, (_, i) => entry(String(i), `A candidate ${i}`));
  entries.push(entry("exact", "Wanted short text"));
  const search = core.createSearchIndex(entries);
  const bounded = search("Wanted short text");
  assert.equal(bounded.entries[0].id, "exact");
  assert.equal(bounded.complete, false);
  assert.equal(search("Wanted short text", Infinity).complete, true);
});

test("ambiguous translations have one explained adjustment and distinct alternatives", () => {
  const matches = core.scoreEntries([entry("a", "Save", "Kaydet"), entry("b", "Save", "Sakla")], { source: "Save" });
  assert.equal(matches.length, 2);
  assert.equal(matches[0].score, 99);
  assert.equal(matches[0].adjustments.filter((a) => a.reason === "Multiple translations").length, 1);
});

test("XLIFF codes do not count attributes and decoded literal entities stay literal", () => {
  assert.equal(
    core.metricsForSegment({
      documentType: "xlf",
      source: '<pc id="1" data-lc-key="pc:1">Save changes</pc><ph id="5"/>'
    }).words,
    2
  );
  assert.equal(core.metricsForSegment({ documentType: "xlf", source: "literal &amp; text" }).words, 3);
  assert.equal(core.sourceMetrics("&lt;b&gt; literal", "en", { encoded: true }).words, 2);
});
test("linguistic words exclude tag attributes, preserve inner-word formatting and use Unicode boundaries", () => {
  for (const [source, words] of [
    ["Click Save", 2],
    ['<span class="button primary large" style="color: red">Click Save</span>', 2],
    ["trans<b>la</b>tion", 1],
    ["!!!", 0],
    ["<b></b>", 0],
    ["well-known user's file", 3],
    ["Hello {name}", 1],
    ["{n, plural, one {One item} other {Many items}}", 4]
  ])
    assert.equal(core.sourceMetrics(source).words, words, source);
  assert.ok(core.sourceMetrics("今天天气很好", "zh").words > 1);
  assert.ok(core.sourceMetrics("ภาษาไทยทดสอบ", "th").words > 1);
  assert.equal(core.sourceMetrics("café").characters, core.sourceMetrics("cafe\u0301").characters);
  assert.equal(core.metricsForSegment({ source: "<b>literal</b>", documentType: "txt" }).words, 3);
});

test("tag-only changes receive an explicit small formatting adjustment, not lexical edit distance", () => {
  for (const source of [
    "<b>Click Save</b>",
    '<span class="button primary large" style="color: red">Click Save</span>'
  ]) {
    const match = core.scoreEntries([entry("e", source)], {
      source: "Click Save",
      sourceLang: "en",
      targetLang: "tr"
    })[0];
    assert.equal(match.textScore, 100);
    assert.equal(match.score, 99);
    assert.equal(match.safeToApply, false);
  }
  assert.ok(core.scoreEntries([entry("e", "automobile")], { source: "automoblie" })[0].score >= 70);
});

test("trusted DOCX style descriptors permit exact scoring and safe target remapping", () => {
  const old = {
      source: '<b id="fmt1">Save changes</b>',
      structure: { inlineTags: [{ id: "fmt1", rPrXml: "bold-style" }] }
    },
    active = {
      source: '<b id="fmt8">Save changes</b>',
      structure: { inlineTags: [{ id: "fmt8", rPrXml: "bold-style" }] }
    };
  const tm = { ...entry("e", old.source, '<b id="fmt1">Kaydet</b>'), sourceDescriptor: core.descriptorFor(old) };
  const match = core.scoreEntries([tm], { source: active.source, segment: active })[0];
  assert.equal(match.score, 100);
  assert.equal(match.safeToApply, true);
  assert.equal(match.adaptedTarget, '<b id="fmt8">Kaydet</b>');
  const unsafe = core.scoreEntries([{ ...tm, target: '<b id="other">Kaydet</b>' }], {
    source: active.source,
    segment: active
  })[0];
  assert.equal(unsafe.safeToApply, false);
});

test("higher effective score beats a newer penalized duplicate and disabled resources stay excluded", () => {
  const entries = [
    { ...entry("old", "Hello", "Merhaba", "a"), updatedAt: "2020" },
    { ...entry("new", "Hello", "Merhaba", "b"), updatedAt: "2026" }
  ];
  const links = [
    { type: "tm", resourceId: "a", penalty: 0 },
    { type: "tm", resourceId: "b", penalty: 30 }
  ];
  const best = core.scoreEntries(entries, { source: "Hello", resourceLinks: links })[0];
  assert.equal(best.score, 100);
  assert.equal(best.id, "old");
  assert.equal(best.provenance.length, 2);
  assert.deepEqual(core.scoreEntries(entries, { source: "Hello", resourceLinks: [] }), []);
  assert.equal(
    core.scoreEntries(entries, { source: "Hello", resourceLinks: [{ ...links[0], lookup: false }, links[1]] })[0].score,
    70
  );
});

test("context needs both actual neighbors or explicit boundaries", () => {
  const tm = { ...entry("e", "Hello"), documentKey: "file#2", previousSource: "Before", nextSource: "After" };
  assert.equal(
    core.scoreEntries([tm], {
      source: "Hello",
      context: { documentKey: "file#2", previousSource: "Wrong", nextSource: "Wrong" }
    })[0].contextExact,
    false
  );
  assert.equal(
    core.scoreEntries([tm], {
      source: "Hello",
      context: { documentKey: "file#2", previousSource: "Before", nextSource: "After" }
    })[0].contextExact,
    true
  );
});

test("worker and renderer produce identical complete match records", () => {
  let handler, reply;
  const context = vm.createContext({
    self: {
      addEventListener: (_name, fn) => {
        handler = fn;
      },
      postMessage: (value) => {
        reply = value;
      }
    }
  });
  for (const file of ["linguistic-core.js", "statistics-core.js", "cat-worker.js"])
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"), context);
  const entries = [entry("a", "<b>Hello world</b>"), entry("b", "Hello world!")],
    options = { source: "Hello world", sourceLang: "en", targetLang: "tr" };
  handler({ data: { id: 1, type: "tm-match", payload: { entries, options } } });
  assert.deepEqual(
    JSON.parse(JSON.stringify(reply.result)),
    JSON.parse(JSON.stringify(core.scoreEntries(entries, options)))
  );
  const retained = core.scoreEntries(entries, { ...options, limit: 1 });
  assert.equal(retained.length, 1);
  assert.deepEqual(retained[0].sourceDiff, core.scoreSource(retained[0].source, options.source).sourceDiff);
  assert.deepEqual(core.scoreEntries(entries, { ...options, limit: 1, differences: false })[0].sourceDiff, []);
  assert.deepEqual(
    core.scoreEntries(entries, { ...options, limit: 1 }),
    retained,
    "warm segmentation cache preserves complete match records"
  );
});

test("exclusive workload buckets reconcile with files and scope-local repetitions", async () => {
  const segments = [
    segment("1", "This is a sentence."),
    segment("2", "This is a sentence.", "b"),
    segment("3", "This is a sentence.", "b")
  ];
  const result = await stats.analyze({ project, segments });
  assert.equal(result.totals.words, 12);
  assert.equal(result.buckets.find((b) => b.band === "repetition").words, 8);
  assert.equal(result.buckets.find((b) => b.band === "new").words, 4);
  assert.equal(
    result.buckets.reduce((n, b) => n + b.words, 0),
    12
  );
  assert.equal(
    result.files.reduce((n, f) => n + f.totals.words, 0),
    12
  );
  const selected = await stats.analyze({ project, segments, scope: { kind: "segments", segmentIds: ["2", "2"] } });
  assert.equal(selected.totals.words, 4);
  assert.equal(selected.buckets.find((b) => b.band === "repetition").words, 0);
  await assert.rejects(
    stats.analyze({ project, segments, scope: { kind: "segments", segmentIds: ["deleted"] } }),
    /no longer/
  );
  const independent = await stats.analyze({ project, segments, options: { crossFileRepetitions: false } });
  assert.equal(independent.buckets.find((b) => b.band === "repetition").words, 4);
});

test("multi-TM best match, remaining work, locks, immutable export and neutral weights", async () => {
  const segments = [
    segment("1", "Hello world"),
    { ...segment("2", "Different text"), locked: true },
    { ...segment("3", "Done text"), status: "confirmed" }
  ];
  const request = {
    project,
    segments,
    entries: [entry("e", "Hello world")],
    resources: [{ id: "tm", name: "Main", storageVersion: 1 }],
    resourceLinks: [{ resourceId: "tm", type: "tm", lookup: true }],
    options: { remaining: true, excludeLocked: true, weighted: true }
  };
  const result = await stats.analyze(request);
  assert.equal(result.totals.words, 2);
  assert.equal(result.excludedSegments, 2);
  assert.equal(result.weightedWords, 2);
  assert.equal(result.memories[0].words, 2);
  const before = stats.exportReport(result);
  segments[0].source = "Changed";
  assert.equal(stats.exportReport(result), before);
  assert.match(stats.exportReport(result, "csv"), /Source words/);
  assert.match(stats.exportReport(result, "html"), /Main/);
});

test("50-file and byte boundaries reject before any mutation", async () => {
  const { validateImportBatch, BATCH_IMPORT_LIMITS } =
    await import("../../src/features/import-export/batch-import-controller.js");
  validateImportBatch(Array.from({ length: 50 }, () => ({ size: 1 })));
  validateImportBatch([{ size: BATCH_IMPORT_LIMITS.bytes }]);
  assert.throws(() => validateImportBatch(Array.from({ length: 51 }, () => ({ size: 1 }))), /50/);
  assert.throws(() => validateImportBatch([{ size: BATCH_IMPORT_LIMITS.bytes + 1 }]), /100 MiB/);
});

test("stable segment selection survives virtualization and resets across projects", async () => {
  const { createSegmentSelectionStore } = await import("../../src/features/editor/segment-selection-store.js");
  const selection = createSegmentSelectionStore(),
    rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  selection.sync("p", rows);
  selection.toggle(
    "a",
    true,
    false,
    rows.map((s) => s.id)
  );
  selection.toggle(
    "c",
    true,
    true,
    rows.map((s) => s.id)
  );
  assert.deepEqual(selection.ids(), ["a", "b", "c"]);
  selection.sync("p", [rows[0], rows[2]]);
  assert.deepEqual(selection.ids(), ["a", "c"]);
  selection.sync("other", rows);
  assert.deepEqual(selection.ids(), []);
});
