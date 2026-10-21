const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");

function loadLocalization() {
  const browserWindow = { CatHan: {} };
  const context = vm.createContext({ window: browserWindow, TextDecoder, TextEncoder });
  vm.runInContext(fs.readFileSync(path.join(root, "protected-tags.js"), "utf8"), context);
  browserWindow.CatHan.docx = browserWindow.CatHan.protectedTags;
  vm.runInContext(fs.readFileSync(path.join(root, "localization.js"), "utf8"), context);
  return browserWindow.CatHan.localization;
}

function parsePo(localization, source, name = "messages.po") {
  return localization.parseLocalizationFile({ name, text: () => Promise.resolve(source) });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("PO import leaves ambiguous numbered percentages and following words editable", async () => {
  const localization = loadLocalization();
  const parsed = await parsePo(
    localization,
    [
      'msgid "%0 bites %1\'s bait"',
      'msgstr "%0 muerde el anzuelo de %1"',
      "",
      'msgid "İndirim %1 ve %10"',
      'msgstr ""'
    ].join("\n")
  );

  assert.equal(parsed.segments.length, 2);
  for (const segment of parsed.segments) {
    assert.deepEqual(plain(segment.structure.formatFlags), []);
    assert.deepEqual(plain(segment.tags), []);
  }
});

test("PO import supplies each entry's declared format to placeholder detection", async () => {
  const localization = loadLocalization();
  const parsed = await parsePo(
    localization,
    [
      "#, c-format",
      'msgid "Hello %1$s, count: %02d"',
      'msgstr ""',
      "",
      "#, qt-format",
      'msgid "Hello %1, count: %L2"',
      'msgstr ""',
      "",
      "#, python-format",
      'msgid "Hello %(name)s"',
      'msgstr ""'
    ].join("\n")
  );

  assert.deepEqual(plain(parsed.segments.map((segment) => segment.tags.map((tag) => tag.text))), [
    ["%1$s", "%02d"],
    ["%1", "%L2"],
    ["%(name)s"]
  ]);
});

test("PO plural forms inherit all flag lines without sharing mutable arrays", async () => {
  const localization = loadLocalization();
  const parsed = await parsePo(
    localization,
    [
      "#, fuzzy, c-format",
      "#, c-format, range: 1..5",
      'msgid "%d file"',
      'msgid_plural "%d files"',
      'msgstr[0] "%d dosya"',
      'msgstr[1] "%d dosya"'
    ].join("\n")
  );

  assert.deepEqual(plain(parsed.segments.map((segment) => segment.structure.formatFlags)), [
    ["fuzzy", "c-format", "range: 1..5"],
    ["fuzzy", "c-format", "range: 1..5"]
  ]);
  assert.deepEqual(plain(parsed.segments.map((segment) => segment.tags.map((tag) => tag.text))), [["%d"], ["%d"]]);
  assert.deepEqual(plain(parsed.segments.map((segment) => segment.structure.msgstrStart)), [4, 5]);
  assert.notEqual(parsed.segments[0].structure.formatFlags, parsed.segments[1].structure.formatFlags);
});

test("PO flags stay with their entry across headers, obsolete messages, and omitted blank separators", async () => {
  const localization = loadLocalization();
  const parsed = await parsePo(
    localization,
    [
      "#, fuzzy, qt-format",
      'msgid ""',
      'msgstr ""',
      '"Language: tr\\n"',
      "# First active message",
      'msgid "İndirim %1"',
      'msgstr ""',
      "#, c-format",
      'msgctxt "count"',
      'msgid "%d items"',
      'msgstr ""',
      'msgctxt "percent"',
      'msgid "%1 oran"',
      'msgstr ""',
      "#, qt-format",
      '#~ msgid "Obsolete %1"',
      '#~ msgstr "Eski %1"',
      'msgid "Oran %2"',
      'msgstr ""',
      'msgid "Oran %3"',
      'msgstr ""',
      "#, qt-format",
      'msgid "Current %1"',
      'msgstr ""'
    ].join("\n")
  );

  assert.deepEqual(plain(parsed.segments.map((segment) => [segment.text, segment.structure.formatFlags])), [
    ["İndirim %1", []],
    ["%d items", ["c-format"]],
    ["%1 oran", []],
    ["Oran %2", []],
    ["Oran %3", []],
    ["Current %1", ["qt-format"]]
  ]);
});

test("PO and POT exports retain flags, comments, contexts, source layout, and obsolete entries", async () => {
  const localization = loadLocalization();
  const source = [
    "# Translator comment",
    "#. Extracted comment",
    "#: example.c:42",
    "#, fuzzy, c-format",
    'msgctxt "greeting"',
    'msgid ""',
    '"Hello "',
    '"%s"',
    'msgstr ""',
    '"Merhaba "',
    '"%s"',
    "",
    "#, qt-format",
    '#~ msgid "Obsolete %1"',
    '#~ msgstr "Eski %1"',
    ""
  ].join("\n");
  const expected = source.replace('msgstr ""\n"Merhaba "\n"%s"', 'msgstr "Selam %s"');

  for (const format of ["po", "pot"]) {
    const parsed = await parsePo(localization, source, `messages.${format}`);
    assert.deepEqual(plain(parsed.structure.sourceLines), source.split("\n"));
    assert.equal(parsed.segments.length, 1);
    parsed.segments[0].target = "Selam %s";
    const exported = localization.buildLocalizationFile(format, parsed.segments, parsed.structure);
    assert.equal(exported, expected);
    const imported = await parsePo(localization, exported);
    assert.deepEqual(plain(imported.segments[0].structure.formatFlags), ["fuzzy", "c-format"]);
    assert.equal(imported.segments[0].target, "Selam %s");
  }
});
