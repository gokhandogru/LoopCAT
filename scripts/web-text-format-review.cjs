/* Real Chromium parser/export checks. No user projects or resources are opened. */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename], {
    cwd: root, stdio: "inherit",
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"))
  });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `web-text-format-review-${process.pid}`));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("about:blank");
    await win.webContents.executeJavaScript("window.CatHan = {};");
    for (const file of ["encoding.js", "protected-tags.js", "localization.js"]) await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, file), "utf8"));
    const result = await win.webContents.executeJavaScript(`(${checks.toString()})()`);
    for (const row of result) console.log(`${row.error ? "FAIL" : "PASS"} ${row.name}${row.error ? ": " + row.error : ""}`);
    const output = path.join(root, "test-artifacts", "file-formats");
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "web-text.json"), JSON.stringify(result, null, 2));
    app.exit(result.some((row) => row.error) ? 1 : 0);
  } catch (error) { console.error(error); if (win) win.destroy(); app.exit(1); }
});

async function checks() {
  const api = window.CatHan.localization;
  const results = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const equal = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  const parse = (name, content, options) => api.parseLocalizationFile(new File([content], name), options);
  const build = async (parsed) => {
    const output = await api.buildLocalizationFile(parsed.documentType, parsed.segments, JSON.parse(JSON.stringify(parsed.structure)));
    return typeof output === "string" ? output : window.CatHan.encoding.decodeTextBytes(output).text;
  };
  const xml = (value) => { const doc = new DOMParser().parseFromString(value, "application/xml"); check(!doc.querySelector("parsererror"), "Export must be valid XML"); return doc; };
  const test = async (name, fn) => { try { await fn(); results.push({ name }); } catch (error) { results.push({ name, error: error.stack || String(error) }); } };
  const rejects = async (fn, expression) => { let error; try { await fn(); } catch (caught) { error = caught; } check(error && expression.test(error.message), `Expected rejection ${expression}, got ${error?.message || "success"}`); };

  await test("JSON nested arrays, exact keys, Unicode and non-string values", async () => {
    const parsed = await parse("messages.JSON", '{"a.b":{"[x]":"Hello"},"list":["World",3,true,null],"__proto__":{"label":"Safe"}}');
    parsed.segments.forEach((segment, index) => { segment.target = ["İyi & <literal> 😺", "世界", "آمن"][index]; });
    const output = JSON.parse(await build(parsed));
    equal(output["a.b"]["[x]"], "İyi & <literal> 😺", "Exact key");
    equal(output.list, ["世界", 3, true, null], "Array types");
    equal(output.__proto__.label, "آمن", "Own proto key");
    parsed.segments[0].structure.path = ["constructor", "prototype", "polluted"];
    await rejects(() => build(parsed), /path/);
    equal({}.polluted, undefined, "No inherited writes");
  });
  await test("JSON root scalar and invalid JSON", async () => {
    const parsed = await parse("root.json", '"Hello"'); parsed.segments[0].target = "Merhaba";
    equal(JSON.parse(await build(parsed)), "Merhaba", "Root string");
    await rejects(() => parse("bad.json", '{"a":}'), /JSON|Unexpected/);
  });
  for (const extension of ["csv", "tsv"]) await test(`${extension.toUpperCase()} bilingual multiline, quotes and untouched columns`, async () => {
    const separator = extension === "csv" ? ";" : "\t";
    const parsed = await parse(`strings.${extension}`, ["key;source;target;notes", 'a;"Hello\nworld";Old;"Keep; this"', 'b;Next;;Keep'].join("\r\n").replaceAll(";", separator));
    parsed.segments[0].target = 'Türkçe "quoted"\nالعربية'; parsed.segments[1].target = "";
    const again = await parse(`again.${extension}`, await build(parsed));
    equal(again.segments.map((s) => s.target), ['Türkçe "quoted"\nالعربية', ""], "Target values");
    equal(again.structure.rows[1][3], parsed.structure.rows[1][3], "Notes");
    equal(again.segments.map((s) => s.text), parsed.segments.map((s) => s.text), "Source values");
  });
  await test("CSV rejects unterminated quoted fields", () => rejects(() => parse("bad.csv", 'key,source,target\nx,"unclosed,'), /unterminated/));
  await test("YAML simple mappings/sequences, comments and scalar types", async () => {
    const parsed = await parse("messages.yml", '---\nmessages:\n  title: "Hello" # keep\n  names:\n    - World\n  flag: true\n  count: 1e3\n  hex: 0xff\n  quoted: "true"\n');
    equal(parsed.segments.map((s) => s.text), ["Hello", "World", "true"], "Only strings");
    parsed.segments.forEach((s) => { s.target = `Çeviri ${s.text}`; });
    const output = await build(parsed);
    check(output.includes("# keep") && output.includes("count: 1e3") && output.includes("hex: 0xff"), "Comments/types retained");
    equal((await parse("again.yaml", output)).segments.map((s) => s.text), parsed.segments.map((s) => s.target), "Translated scalars");
  });
  await test("YAML literal/folded blocks preserve indentation, line breaks and chomping", async () => {
    const source = "literal: |\n    Hello\n    world\nfolded: >-\n  Hello\n  world\n\n  Next paragraph\ntail: End\n";
    const parsed = await parse("blocks.yaml", source);
    equal(parsed.segments.map((s) => s.text), ["Hello\nworld\n", "Hello world\nNext paragraph", "End"], "YAML scalar semantics");
    parsed.segments.forEach((s) => { s.target = s.text; });
    equal((await build(parsed)).split("tail:")[0], source.split("tail:")[0], "Unchanged blocks retain exact source");
    parsed.segments[1].target = "Bir\nİki\n\n";
    const again = await parse("again.yaml", await build(parsed));
    equal(again.segments[1].text, "Bir\nİki\n\n", "Translated trailing newlines");
  });
  await test("YAML unsupported flow/aliases and multiline quotes fail visibly", async () => {
    for (const source of ['a: {hello: World}', 'a: &name Hello\nb: *name', 'a: "first\n  second"']) await rejects(() => parse("unsupported.yaml", source), /supported/);
  });
  await test("YAML leading spaces, sequence indentation and escaped-backslash comments", async () => {
    const parsed = await parse("sequence.yaml", '- msg: |2\n    Hello\n  other: "World"\npath: "C:\\\\" # keep\n');
    equal(parsed.segments.map((s) => s.text), ["Hello\n", "World", "C:\\"], "Sequence indentation and quoted comment");
    parsed.segments.forEach((s) => { s.target = s.text; });
    parsed.segments[0].target = "  Merhaba\n";
    const output = await build(parsed);
    equal((await parse("again.yaml", output)).segments[0].text, "  Merhaba\n", "Leading spaces survive");
    check(output.includes("# keep"), "Comment retained");
  });
  for (const extension of ["html", "htm"]) await test(`${extension.toUpperCase()} mixed text, attributes, exclusions and legacy encodings`, async () => {
    const parsed = await parse(`page.${extension}`, '<!doctype html><html><head><meta charset="windows-1252"><title>Title</title></head><body>Intro<p>Hello <b title="Bold tip">world</b></p>Tail<img alt="A cat" src="cat.png"><input placeholder="Name"><p translate="no">Untouched</p><script>const secret="Code"</script></body></html>');
    check(["Intro", "Tail", "A cat", "Name", "Bold tip"].every((value) => parsed.segments.some((s) => s.text === value)), "All visible and attribute text imported");
    check(!parsed.segments.some((s) => /Untouched|secret/.test(s.text)), "Excluded text stays out");
    parsed.segments.forEach((s) => { s.target = s.text.replaceAll("Hello", "Merhaba").replaceAll("world", "dünya").replaceAll("Bold tip", "Kalın ipucu").replaceAll("A cat", "Bir kedi"); });
    const doc = new DOMParser().parseFromString(await build(parsed), "text/html");
    equal(doc.querySelector("b").getAttribute("title"), "Kalın ipucu", "Nested attribute target retained");
    equal(doc.querySelector("img").getAttribute("alt"), "Bir kedi", "Alt text");
    equal(doc.querySelector("meta").getAttribute("charset"), "utf-8", "Output charset");
    equal(doc.querySelector('[translate="no"]').textContent, "Untouched", "Opt-out preserved");
  });
  await test("Legacy HTML reconstruction mapping remains readable", async () => {
    const output = await api.buildLocalizationFile("html", [{target:"Yeni", structure:{format:"html",elementIndex:0}}], {format:"html", source:"<p>Old</p>"});
    check(output.includes("<p>Yeni</p>"), "Old saved mappings");
  });
  for (const extension of ["html", "xml"]) await test(`${extension} reordered inline attributes retain identity and nested opt-outs stay excluded`, async () => {
    const body = '<p>Intro <a href="/a" title="A">Alpha</a><a href="/b" title="B">Beta</a></p><p>Hello <span translate="no">BRAND</span> tail</p>';
    const parsed = await parse(`reorder.${extension}`, extension === "xml" ? `<root>${body}</root>` : body);
    check(!parsed.segments.some((s) => s.text.includes("BRAND")), "Nested opt-out not editable");
    parsed.segments.forEach((s) => { s.target = s.text === "A" ? "AA" : s.text === "B" ? "BB" : s.text.includes("Intro") ? 'Başlangıç <a href="/b" title="B">Beta</a><a href="/a" title="A">Alpha</a>' : s.text; });
    const output = await build(parsed);
    const doc = extension === "xml" ? xml(output) : new DOMParser().parseFromString(output, "text/html");
    equal(doc.querySelector('a[href="/a"]').getAttribute("title"), "AA", "A attribute identity");
    equal(doc.querySelector('a[href="/b"]').getAttribute("title"), "BB", "B attribute identity");
    equal(doc.querySelector('[translate="no"]').textContent, "BRAND", "Opted-out content preserved");
  });
  for (const extension of ["xml", "xhtml", "dita", "xini", "wix"]) await test(`${extension.toUpperCase()} inline namespaces, literal entities and nested attributes`, async () => {
    const parsed = await parse(`document.${extension}`, '<root xmlns:i="urn:inline"><p>Hello <i:b title="Tip">world</i:b> &amp; more</p><literal><![CDATA[Use <b> literally & keep]]></literal><p translate="no">Untouched</p></root>');
    parsed.segments.forEach((s) => { s.target = s.text.replaceAll("Hello", "Merhaba").replaceAll("world", "dünya").replaceAll("Tip", "İpucu"); });
    const doc = xml(await build(parsed));
    equal(doc.getElementsByTagNameNS("urn:inline", "b")[0].textContent, "dünya", "Namespace and inline text");
    equal(doc.getElementsByTagNameNS("urn:inline", "b")[0].getAttribute("title"), "İpucu", "Nested attribute target");
    equal(doc.querySelector("literal").textContent, "Use <b> literally & keep", "CDATA literal preserved");
    equal(doc.querySelector("literal").children.length, 0, "Literal markup stays text");
    equal(doc.querySelector('[translate="no"]').textContent, "Untouched", "Opt-out");
  });
  await test("Android XML strings, plurals, arrays, references and apostrophes", async () => {
    const source = '<resources xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2"><string name="title">Hello <b>world</b> &amp; <xliff:g id="name">%1$s</xliff:g></string><string name="literal"><![CDATA[Use <b> literally]]></string><string name="ref">@string/title</string><string name="skip" translatable="false">Brand</string><plurals name="count"><item quantity="one">One file</item><item quantity="other">%d files</item></plurals><string-array name="tabs"><item>Home</item></string-array></resources>';
    const parsed = await parse("strings.xml", source);
    equal(parsed.segments.length, 5, "Resources and skipped references");
    parsed.segments.forEach((s) => { s.target = s.text.replaceAll("Hello", "Merhaba").replaceAll("world", "dünya").replaceAll("Home", "John's home"); });
    const doc = xml(await build(parsed));
    equal(doc.querySelector('[name="ref"]').textContent, "@string/title", "Reference untouched");
    equal(doc.querySelector('[name="literal"]').textContent, "Use <b> literally", "Literal markup");
    equal(doc.querySelector('[name="tabs"] item').textContent, "John\\'s home", "Android apostrophe escaping");
    equal(doc.getElementsByTagNameNS("urn:oasis:names:tc:xliff:document:1.2", "g")[0].textContent, "%1$s", "Namespaced placeholder retained");
  });
  await test("Android quoted whitespace wrappers retain resource semantics", async () => {
    const parsed = await parse("strings.xml", '<resources><string name="quoted">"  Hello  "</string><string name="plain">Hello</string></resources>');
    parsed.segments[0].target = '"  Merhaba  "'; parsed.segments[1].target = 'Say "Merhaba"';
    const doc = xml(await build(parsed));
    equal(doc.querySelector('[name="quoted"]').textContent, '"  Merhaba  "', "Grouping quotes retained");
    equal(doc.querySelector('[name="plain"]').textContent, 'Say \\"Merhaba\\"', "Literal quotes escaped");
  });
  for (const extension of ["md", "markdown"]) await test(`${extension} code fences/front matter/links retained`, async () => {
    const source = '---\ntitle: Meta\n---\n# Heading\n\nParagraph [link](https://example.com).\n\n````text\n```\nDo not translate\n~~~\n````\n\n    Indented code\n\n- List item\n';
    const parsed = await parse(`guide.${extension}`, source);
    check(!parsed.segments.some((s) => /Do not translate|Indented code|Meta/.test(s.text)), "Code/metadata excluded");
    parsed.segments.forEach((s) => { s.target = s.text.replaceAll("Heading", "Başlık").replaceAll("Paragraph", "Paragraf").replaceAll("List item", "Liste"); });
    const output = await build(parsed);
    check(output.includes("# Başlık") && output.includes("- Liste") && output.includes("Do not translate\n~~~\n````") && output.includes("https://example.com"), "Markup and code preserved");
  });
  await test("TXT UTF-16 and legacy encoding round trips", async () => {
    for (const encoding of ["utf-8", "utf-16le", "utf-16be", "windows-1254"]) {
      const bytes = window.CatHan.encoding.encodeText("Hello\n\nWorld", { encoding, bom: encoding.startsWith("utf-") }).content;
      const parsed = await parse("source.txt", bytes, { encoding });
      parsed.segments[0].target = "İyi günler"; parsed.segments[1].target = "Dünya";
      const output = await api.buildLocalizationFile("txt", parsed.segments, parsed.structure);
      equal(window.CatHan.encoding.decodeTextBytes(output, { encoding }).text, "İyi günler\n\nDünya", `Encoding ${encoding}`);
    }
  });
  await test("MIF String records preserve surrounding publishing markup", async () => {
    const parsed = await parse("document.mif", "<MIFFile 2020>\n<Para <String `Hello world'> >\n<Para <String `Second line'> >");
    equal(parsed.segments.map((s) => s.text), ["Hello world", "Second line"], "MIF String extraction");
    parsed.segments[0].target = "Merhaba dünya"; parsed.segments[1].target = "İkinci satır";
    const output = await build(parsed);
    check(output.includes("<MIFFile 2020>") && output.includes("<String `Merhaba dünya'>"), "MIF envelope");
    equal((await parse("again.mif", output)).segments.map((s) => s.text), parsed.segments.map((s) => s.target), "MIF translations");
  });
  await test("PO Unicode fallback updates its charset declaration", async () => {
    const source = 'msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=windows-1252\\n"\n\nmsgid "Hello"\nmsgstr ""\n';
    const bytes = window.CatHan.encoding.encodeText(source, "windows-1252").content;
    const parsed = await parse("legacy.po", bytes);
    parsed.segments[0].target = "こんにちは";
    const output = await api.buildLocalizationFile("po", parsed.segments, parsed.structure);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(output);
    check(decoded.includes("charset=UTF-8"), "PO header matches UTF-8 bytes");
    equal((await parse("again.po", output)).segments[0].target, "こんにちは", "Re-import uses updated declaration");
  });
  await test("Malformed XML and invalid reconstruction indexes reject", async () => {
    await rejects(() => parse("bad.xml", "<root><p>bad</root>"), /valid XML/);
    const parsed = await parse("page.html", "<p>Hello</p>");
    parsed.segments[0].structure.elementIndex = -1;
    await rejects(() => build(parsed), /mapping/);
  });
  return results;
}
