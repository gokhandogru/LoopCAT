const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function load() {
  let sequence = 0;
  const context = { window: { CatHan: { storage: { makeId: (prefix) => `${prefix}-${++sequence}` } } }, setTimeout };
  for (const file of ["tmx.js", "tbx.js"]) {
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"), context, { filename: file });
  }
  return context.window.CatHan;
}
const options = { sourceLang: "en", targetLang: "tr", tmName: "Memory", termBaseName: "Terms" };

test("TMX preserves CDATA literals and excludes commented units", async () => {
  const { tmx } = load();
  const unit =
    '<tu><tuv xml:lang="en"><seg><![CDATA[<b>Source &amp;</b>]]></seg></tuv><tuv xml:lang="tr"><seg><![CDATA[<b>Hedef &amp;</b>]]></seg></tuv></tu>';
  const xml = `<tmx><body><!--${unit}-->${unit}</body></tmx>`;
  for (const parse of [tmx.parseTmx, tmx.parseTmxAsync, tmx.parseTmxDom]) {
    const entries = await parse(xml, options);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].source, "<b>Source &amp;</b>");
    assert.equal(entries[0].target, "<b>Hedef &amp;</b>");
  }
});

test("TMX language selection never substitutes a different explicit language", () => {
  const { tmx } = load();
  assert.equal(
    tmx.parseTmx(
      '<tmx><body><tu><tuv xml:lang="en"><seg>Hello</seg></tuv><tuv xml:lang="fr"><seg>Bonjour</seg></tuv></tu></body></tmx>',
      options
    ).length,
    0
  );
  const ambiguous =
    '<tmx><body><tu><tuv xml:lang="en-US"><seg>US</seg></tuv><tuv xml:lang="en-GB"><seg>GB</seg></tuv><tuv xml:lang="tr"><seg>TR</seg></tuv></tu></body></tmx>';
  assert.throws(() => tmx.parseTmx(ambiguous, options), /ambiguous/);
  assert.equal(tmx.parseTmx(ambiguous, { ...options, sourceLang: "en-GB" })[0].source, "GB");
});

test("TMX still supports unlabelled bilingual legacy resources", () => {
  const { tmx } = load();
  const [entry] = tmx.parseTmx(
    "<tmx><body><tu><tuv><seg>Source</seg></tuv><tuv><seg>Target</seg></tuv></tu></body></tmx>",
    options
  );
  assert.equal(entry.source, "Source");
  assert.equal(entry.target, "Target");
});

test("TMX exports compact UTC timestamps and omits invalid dates", () => {
  const { tmx } = load();
  const output = tmx.buildTmx(
    [{ source: "Source", target: "Target", createdAt: "2026-11-15T09:24:32.123Z", updatedAt: "invalid" }],
    options
  );
  assert.match(output, /creationdate="20261115T092432Z"/);
  assert.doesNotMatch(output, /changedate=/);
});

test("TBX 2 martif imports all selected synonyms with per-term status", async () => {
  const { tbx } = load();
  const xml =
    '<martif type="TBX"><text><body><termEntry id="c"><langSet xml:lang="en"><tig id="s"><term>cat</term></tig></langSet><langSet xml:lang="tr"><tig id="t1"><term>kedi</term><termNote type="administrativeStatus">preferredTerm-admn-sts</termNote></tig><tig id="t2"><term>pisipisi</term><termNote type="administrativeStatus">deprecatedTerm-admn-sts</termNote></tig></langSet></termEntry></body></text></martif>';
  for (const parse of [tbx.parseTbx, tbx.parseTbxAsync, tbx.parseTbxDom]) {
    const terms = await parse(xml, options);
    assert.equal(terms.length, 2);
    assert.equal(terms[1].conceptId, "c");
    assert.equal(terms[1].targetDesignationId, "t2");
    assert.equal(terms[1].isForbidden, true);
    assert.equal(terms[0].status, "preferred");
  }
});

test("TBX preserves independent notes and examples on export/reimport", () => {
  const { tbx } = load();
  const xml = tbx.buildTbx(
    [{ sourceTerm: "cat", targetTerm: "kedi", notes: "Translator note", usageExample: "A cat.", definition: "Animal" }],
    options
  );
  assert.match(xml, /<martif type="TBX"/);
  assert.match(xml, /<martifHeader>/);
  const [term] = tbx.parseTbx(xml, options);
  assert.equal(term.notes, "Translator note");
  assert.equal(term.usageExample, "A cat.");
  assert.equal(term.definition, "Animal");
});

test("TMX and TBX do not import metadata as missing segment or term text", () => {
  const { tmx, tbx } = load();
  assert.equal(
    tmx.parseTmx(
      '<tmx><body><tu><tuv xml:lang="en"><note>Not source</note><seg/></tuv><tuv xml:lang="tr"><seg>Target</seg></tuv></tu></body></tmx>',
      options
    ).length,
    0
  );
  assert.equal(
    tbx.parseTbx(
      '<tbx><text><body><termEntry><langSet xml:lang="en"><note>Not term</note></langSet><langSet xml:lang="tr"><tig><term>Target</term></tig></langSet></termEntry></body></text></tbx>',
      options
    ).length,
    0
  );
});
