const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function api() {
  const window = { CatHan: {} };
  const context = vm.createContext({ window, TextDecoder, TextEncoder });
  const root = path.resolve(__dirname, "../..");
  vm.runInContext(fs.readFileSync(path.join(root, "protected-tags.js"), "utf8"), context);
  window.CatHan.docx = window.CatHan.protectedTags;
  vm.runInContext(fs.readFileSync(path.join(root, "localization.js"), "utf8"), context);
  return window.CatHan.localization;
}

function parse(localization, extension, source) {
  return localization.parseLocalizationFile({ name: `messages.${extension}`, text: () => Promise.resolve(source) });
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("Java properties preserves escaped keys, joins continuations, and round-trips Unicode and leading spaces", async () => {
  const localization = api();
  const source = [
    "# Keep comments",
    "greeting Hello world",
    "  escaped\\ key\\:name : First \\",
    "    second \\",
    "\tthird",
    "literal = C:\\\\new\\\\test",
    "unicode=\\u0130stanbul",
    "empty=",
    "! Comment"
  ].join("\n");
  const imported = await parse(localization, "properties", source);
  assert.deepEqual(plain(imported.segments.map((segment) => [segment.key, segment.text])), [
    ["greeting", "Hello world"],
    ["escaped key:name", "First second third"],
    ["literal", "C:\\new\\test"],
    ["unicode", "İstanbul"]
  ]);
  const targets = ["  Merhaba dünya", "Bir\niki\tüç\f", "C:\\yeni\\test", "Çağrı 日本語 😀"];
  imported.segments.forEach((segment, index) => {
    segment.target = targets[index];
  });
  const output = await localization.buildLocalizationFile("properties", imported.segments, plain(imported.structure));
  const roundTrip = await parse(localization, "properties", output);
  assert.deepEqual(plain(roundTrip.segments.map((segment) => segment.text)), targets);
  assert.match(output, /^# Keep comments/m);
  assert.match(output, /^empty=$/m);
  assert.match(output, /^! Comment/m);
  assert.doesNotMatch(output, /second|third/);
});

test("Apple strings supports multiple entries, comments, Unicode escapes, and literal backslashes", async () => {
  const localization = api();
  const source = String.raw`/* "ignored" = "Ignore"; */
"first" = "C:\\new\\test"; "second" = "\U0130stanbul\nNext";
// "skip" = "Skip";
"escaped\"key" = "A \"quote\"";`;
  const imported = await parse(localization, "strings", source);
  assert.deepEqual(plain(imported.segments.map((segment) => segment.text)), [
    "C:\\new\\test",
    "İstanbul\nNext",
    'A "quote"'
  ]);
  const targets = ["C:\\new\\translated", "Çağrı\n次\t😀", 'A "translated" \\ key'];
  imported.segments.forEach((segment, index) => {
    segment.target = targets[index];
  });
  const output = await localization.buildLocalizationFile("strings", imported.segments, plain(imported.structure));
  const roundTrip = await parse(localization, "strings", output);
  assert.deepEqual(plain(roundTrip.segments.map((segment) => segment.text)), targets);
  assert.deepEqual(plain(roundTrip.segments.map((segment) => segment.key)), ["first", "second", 'escaped"key']);
  assert.match(output, /\/\* "ignored" = "Ignore"; \*\//);
  assert.match(output, /\/\/ "skip" = "Skip";/);
});

test("PHP resource exports preserve keys, comments, quote semantics, and interpolation", async () => {
  const localization = api();
  const source = String.raw`<?php
// "Do not translate"
return [
  'literal' => 'C:\new\path and \n',
  "hello" => "Hello $name, literal \$price and \nline",
  'nested' => ['save' => 'Save']
];`;
  const imported = await parse(localization, "php", source);
  assert.deepEqual(plain(imported.segments.map((segment) => segment.text)), [
    "C:\\new\\path and \\n",
    "Hello $name, literal $price and \nline",
    "Save"
  ]);
  const targets = ["C:\\yeni\\path and \\n\nIt's okay", "Merhaba $name, $price\n$bonus", "Kaydet"];
  imported.segments.forEach((segment, index) => {
    segment.target = targets[index];
  });
  const output = await localization.buildLocalizationFile("php", imported.segments, plain(imported.structure));
  const roundTrip = await parse(localization, "php", output);
  assert.deepEqual(plain(roundTrip.segments.map((segment) => segment.text)), targets);
  assert.match(output, /'literal' =>/);
  assert.match(output, /'nested' => \['save' =>/);
  assert.match(output, /\/\/ "Do not translate"/);
  assert.match(output, /Merhaba \$name, \\\$price\\n\\\$bonus/);
});

test("DTD translates only internal general entities and exports XML-safe entity literals", async () => {
  const localization = api();
  const source = String.raw`<!-- <!ENTITY ignored "Ignore"> -->
<!ENTITY external SYSTEM "https://example.invalid/entities.dtd">
<!ENTITY % parameter "parameter.dtd">
<!ENTITY greeting "Hello &quot;world&quot; &amp; &brand;">
<!ENTITY path 'C:\new\path'>`;
  const imported = await parse(localization, "dtd", source);
  assert.deepEqual(plain(imported.segments.map((segment) => [segment.key, segment.text])), [
    ["greeting", 'Hello "world" & &brand;'],
    ["path", "C:\\new\\path"]
  ]);
  const targets = ['Merhaba "dünya" & &brand; < %', "L'utilisateur C:\\yeni"];
  imported.segments.forEach((segment, index) => {
    segment.target = targets[index];
  });
  const output = await localization.buildLocalizationFile("dtd", imported.segments, plain(imported.structure));
  const roundTrip = await parse(localization, "dtd", output);
  assert.deepEqual(plain(roundTrip.segments.map((segment) => segment.text)), targets);
  assert.match(output, /external SYSTEM "https:\/\/example.invalid\/entities.dtd"/);
  assert.match(output, /&quot;dünya&quot; &amp; &brand; &lt; &#37;/);
  assert.match(output, /L&apos;utilisateur/);
});

test("SRT accepts whitespace cue separators, preserves timings and rejects malformed cues", async () => {
  const localization = api();
  const source =
    "1\r\n00:00:01,000 --> 00:00:03,000 X1:1\r\nHello\r\n  \r\n2\r\n100:00:00,000 --> 100:00:02,000\r\n<i>Goodbye</i>\r\n";
  const imported = await parse(localization, "srt", source);
  assert.equal(imported.segments.length, 2);
  imported.segments[0].target = "Merhaba\ndünya";
  imported.segments[1].target = "<i>Güle güle</i>";
  const output = await localization.buildLocalizationFile("srt", imported.segments, imported.structure);
  const roundTrip = await parse(localization, "srt", output);
  assert.deepEqual(plain(roundTrip.segments.map((segment) => segment.text)), ["Merhaba\ndünya", "<i>Güle güle</i>"]);
  assert.deepEqual(
    plain(roundTrip.segments.map((segment) => segment.structure.timing)),
    plain(imported.segments.map((segment) => segment.structure.timing))
  );
  await assert.rejects(
    parse(localization, "srt", source + "\n3\nBAD TIMESTAMP\nDo not silently drop"),
    /invalid timing/
  );
});

test("WebVTT preserves notes, regions, styles, cue IDs and settings without translating metadata", async () => {
  const localization = api();
  const source =
    "WEBVTT\n\nSTYLE\n::cue { color: lime; }\n\nREGION\nid:fred\n\nNOTE A sample timestamp\n00:00.000 --> 00:01.000\nDo not translate\n\ncue-1\n00:01.000 --> 00:03.000 line:90% align:start\n<v Alice>Hello</v>\n";
  const imported = await parse(localization, "vtt", source);
  assert.equal(imported.segments.length, 1);
  imported.segments[0].target = "<v Alice>Merhaba</v>";
  const output = await localization.buildLocalizationFile("vtt", imported.segments, plain(imported.structure));
  const roundTrip = await parse(localization, "vtt", output);
  assert.equal(roundTrip.segments[0].text, "<v Alice>Merhaba</v>");
  assert.ok(output.includes("NOTE A sample timestamp\n00:00.000 --> 00:01.000\nDo not translate"));
  assert.ok(output.includes("cue-1\n00:01.000 --> 00:03.000 line:90% align:start"));
  await assert.rejects(parse(localization, "vtt", "00:00.000 --> 00:01.000\nHello"), /WEBVTT header/);
});

test("SBV preserves timings across multiline Unicode translation", async () => {
  const localization = api();
  const imported = await parse(
    localization,
    "sbv",
    "0:00:01.000,0:00:03.000\nHello\n\n0:00:04.000,0:00:06.000\nGoodbye\n"
  );
  imported.segments[0].target = "Merhaba\ndünya";
  imported.segments[1].target = "Güle güle";
  const output = await localization.buildLocalizationFile("sbv", imported.segments, plain(imported.structure));
  const roundTrip = await parse(localization, "sbv", output);
  assert.deepEqual(plain(roundTrip.segments.map((segment) => segment.text)), ["Merhaba\ndünya", "Güle güle"]);
  assert.ok(output.includes("0:00:04.000,0:00:06.000"));
});
