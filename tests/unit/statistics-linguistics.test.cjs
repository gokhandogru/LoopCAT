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

test("malformed markup keeps the reliable subtotal and distinguishes source uncertainty from a TM search", async () => {
  const result = await stats.analyze({
    project,
    segments: [
      segment("1", "Known words"),
      segment("2", 'Visible before <custom payload="not words'),
      segment("3", null)
    ]
  });
  assert.equal(result.countingComplete, false);
  assert.equal(result.complete, false);
  assert.equal(result.totals.words, 4);
  assert.equal(result.unresolvedCountingSegments, 2);
  assert.equal(result.rows[1].words, 2);
  assert.equal(result.rows[1].band, "incomplete");
  assert.equal(result.searchComplete, true);
  assert.equal(result.unresolvedMatchingSegments, 0);
  assert.equal(result.files[0].countingComplete, false);
  assert.equal(result.files[0].unresolvedCountingSegments, 2);
  assert.match(stats.exportReport(result, "html"), /INCOMPLETE/);
  assert.match(stats.exportReport(result, "csv"), /Known source words/);
  assert.match(stats.exportReport(result, "csv"), /The total includes only words that could be counted/);
});

test("complete HTML and XML exclude tags, attributes, comments and native code payload from source word totals", () => {
  for (const [source, words] of [
    ['<h1>Welcome</h1><p title="rate > 5">Visitor&nbsp;guide</p><ul><li>Red</li><li>Blue</li></ul>', 5],
    ['<custom:note id="a b c">A <part>short</part> sentence.</custom:note>', 3],
    ['pre<strong>fix</strong><!--private notes--><br/>one<ph id="1">escaped code data</ph>two', 3],
    ["<script>var inside = 4;</script><style>body{color:red}</style>Visible", 1],
    ['<div><span data-note="1 > 0">trans</span>lation</div><p>works</p>', 2],
    ["<p>", 0],
    ["</p>", 0],
    ["<br/>", 0],
    ["", 0]
  ]) {
    const m = core.metricsForSegment({ source, documentType: "xlf" });
    assert.deepEqual([m.words, m.countingComplete], [words, true], source);
  }
});

test("source-only summaries reconcile with all analysis scopes, filtered-out files and structural rows", async () => {
  const segments = [
    segment("1", "<p>"),
    segment("2", "<p>Hello world</p>"),
    segment("3", "", "b"),
    { ...segment("4", "Already confirmed", "b"), status: "confirmed" },
    { ...segment("5", "Locked words", "b"), locked: true }
  ];
  for (const scope of [
    { kind: "project" },
    { kind: "files", documentIds: ["b"] },
    { kind: "segments", segmentIds: ["2", "4"] }
  ]) {
    const request = { project, segments, options: { remaining: true, excludeLocked: true }, scope };
    const quick = stats.sourceSummary(request),
      result = await stats.analyze(request);
    assert.deepEqual(quick.totals, result.totals);
    assert.deepEqual(
      quick.files,
      result.files.map(({ id, name, totals, countingComplete, unresolvedCountingSegments }) => ({
        id,
        name,
        totals,
        countingComplete,
        unresolvedCountingSegments
      }))
    );
    assert.equal(quick.excludedSegments, result.excludedSegments);
    assert.equal(quick.countingComplete, true);
    assert.ok(
      result.rows.filter((row) => row.structural).every((row) => !row.words && !row.score && row.band === "new")
    );
  }
});

test("TM ambiguity outside a candidate cap is retained, exhaustive scoring restores full coverage", async () => {
  const entries = Array.from({ length: 2001 }, (_, i) => ({
    ...entry(String(i), "Hello world", i === 2000 ? "Second" : "First"),
    updatedAt: String(i)
  }));
  const req = {
    project,
    segments: [segment("1", "Hello world")],
    entries,
    resources: [{ id: "tm", name: "Main" }],
    resourceLinks: [{ resourceId: "tm", type: "tm", priority: 4 }]
  };
  const allAlternatives = await stats.analyze(req);
  assert.equal(allAlternatives.complete, true);
  assert.equal(allAlternatives.rows[0].score, 99);
  entries.push(entry("different", "Another candidate"));
  const partial = await stats.analyze(req);
  assert.equal(partial.rows[0].band, "incomplete");
  assert.equal(partial.countingComplete, true);
  assert.equal(partial.unresolvedMatchingSegments, 1);
  assert.equal(partial.totals.words, 2);
  const complete = await stats.analyze({ ...req, options: { exhaustive: true } });
  assert.equal(complete.complete, true);
  assert.equal(complete.rows[0].score, 99);
  assert.equal(complete.rows[0].band, "95-99");
  assert.equal(complete.memories[0].priority, 4);
});

test("the winning context and complete exact match survive ranking beyond the candidate cap", async () => {
  const entries = Array.from({ length: 2001 }, (_, i) => entry(String(i), "Hello world"));
  entries.push({ ...entry("last", "Hello world"), documentKey: "a#1", previousBoundary: true, nextBoundary: true });
  const req = {
    project,
    segments: [segment("1", "Hello world")],
    entries,
    resources: [{ id: "tm" }],
    resourceLinks: [{ resourceId: "tm", type: "tm" }]
  };
  const report = await stats.analyze(req);
  assert.equal(report.complete, true);
  assert.equal(report.rows[0].band, "context");
  assert.equal(report.memories[0].words, 2);
});

test("only enabled translation memories with the project language pair and usable source and target can contribute", async () => {
  const enabled = { resourceId: "tm", type: "tm", lookup: true },
    disabled = { resourceId: "off", type: "tm", lookup: false },
    tb = { resourceId: "terms", type: "termbase", lookup: true };
  const segments = [segment("1", "Hello world")];
  const entries = [
    entry("missing", undefined),
    entry("empty", "Hello world", "   "),
    entry("off", "Hello world", "translated", "off"),
    entry("tb", "Hello world", "translated", "terms"),
    { ...entry("wrong-language", "Hello world"), languagePair: "en::fr" }
  ];
  const result = await stats.analyze({
    project,
    segments,
    entries,
    resourceLinks: [enabled, disabled, tb],
    resources: [{ id: "tm" }, { id: "off" }, { id: "terms" }]
  });
  assert.equal(result.complete, true);
  assert.equal(result.rows[0].band, "new");
  assert.deepEqual(
    result.memories.map((m) => m.id),
    ["tm"]
  );
});

test("opaque markup repeats when identical, blank rows stay separate, and a bounded fuzzy comparison stays incomplete", async () => {
  const src = '<custom:word id="x">Hello world</custom:word>';
  const segments = [segment("1", src), segment("2", src), segment("3", "<p>"), segment("4", "<p>")];
  const reports = await stats.analyze({ project, segments });
  assert.deepEqual(
    reports.rows.map((row) => row.band),
    ["new", "repetition", "new", "new"]
  );
  assert.equal(reports.structuralSegments, 2);
  const incomplete = await stats.analyze({
    project,
    segments: [segment("1", "a ".repeat(1100))],
    resourceLinks: [{ type: "tm", resourceId: "tm" }],
    entries: [entry("e", "b ".repeat(1100))],
    options: { exhaustive: true }
  });
  assert.equal(incomplete.totals.words, 1100);
  assert.equal(incomplete.countingComplete, true);
  assert.equal(incomplete.searchComplete, false);
  assert.equal(incomplete.rows[0].band, "incomplete");
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
