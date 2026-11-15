/* Formatting-preservation contract for IDML/ICML, using the browser DOM and real ZIP files. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { idmlFormattingEntries } = require("../tests/fixtures/idml-formatting.cjs");
const { writeExcelEntries, readExcelEntries } = require("../tests/fixtures/multilingual-excel.cjs");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const child = spawnSync(require("electron"), [...(process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1" ? ["--no-sandbox"] : []), __filename], {
    cwd: root, stdio: "inherit",
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "ELECTRON_RUN_AS_NODE"))
  });
  if (child.error) console.error(child.error);
  process.exit(child.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `idml-formatting-${process.pid}`));
app.disableHardwareAcceleration();
if (process.platform === "linux") app.commandLine.appendSwitch("disable-dev-shm-usage");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  let win;
  try {
    const entries = idmlFormattingEntries();
    const bytes = await writeExcelEntries(entries);
    const legacyBytes = await writeExcelEntries({ mimetype: entries.mimetype, "designmap.xml": entries["designmap.xml"], "Stories/Story_legacy.xml": '<Story Self="legacy"><ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body"><CharacterStyleRange AppliedCharacterStyle="Normal"><Content>Before </Content></CharacterStyleRange><CharacterStyleRange AppliedCharacterStyle="Bold"><Content>bold</Content></CharacterStyleRange><CharacterStyleRange AppliedCharacterStyle="Normal"><Content> after</Content></CharacterStyleRange></ParagraphStyleRange></Story>' });
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("about:blank");
    await win.webContents.executeJavaScript("window.CatHan = {};");
    for (const name of ["protected-tags.js", "docx.js", "localization.js"]) await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, name), "utf8"));
    const run = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const results = await run(async (input, icmlSource, legacyInput) => {
      const api = window.CatHan.localization;
      const messages = [];
      const check = (condition, label) => { if (!condition) throw new Error(label); messages.push(label); };
      const rejects = async (fn, label) => { let error; try { await fn(); } catch (value) { error = value; } check(Boolean(error), label); };
      const parse = (bytes) => api.parseLocalizationFile(new File([new Uint8Array(bytes)], "formatting.idml"));
      const original = await parse(input);
      const copy = JSON.parse(JSON.stringify(original));
      copy.segments.forEach((segment) => { segment.target = segment.text; });
      const unchanged = await api.buildLocalizationFile("idml", copy.segments, copy.structure);
      check(unchanged.length === input.length && unchanged.every((byte, index) => byte === input[index]), "IDML unchanged import/export returns the exact original package bytes");
      const group = original.segments.find((segment) => segment.structure.inlineRanges?.length === 3);
      check(group && group.text.includes(">  Prefix </"), "IDML styled paragraph retains boundary whitespace and distinct run identities");
      check(original.segments.some((segment) => segment.text === "Before instruction") && original.segments.some((segment) => segment.text === "After instruction"), "IDML Content processing instructions remain structural barriers");
      const sourceLiteral = "Literal <b> &lt;entity&gt; & text";
      const literal = original.segments.find((segment) => segment.text === sourceLiteral);
      check(literal && !literal.tags.some((tag) => tag.type === "tag"), "IDML CDATA and literal markup remain plain text, not inline tags");
      const translated = JSON.parse(JSON.stringify(original));
      translated.segments.forEach((segment) => { segment.target = segment.text.replace(/Prefix|Alpha|Beta|Before break|After break|After tab|After anchor|Clickable text|Footnote content|Before instruction|After instruction|Table cell|Literal/g, (value) => `TR ${value} İstanbul`); });
      const output = await api.buildLocalizationFile("idml", translated.segments, translated.structure);
      const reparsed = await parse(output);
      check(JSON.stringify(reparsed.segments.map((segment) => segment.text)) === JSON.stringify(translated.segments.map((segment) => segment.target)), "IDML translations and all whitespace re-import without flattening");
      const reordered = JSON.parse(JSON.stringify(translated));
      const styled = reordered.segments.find((segment) => segment.structure.inlineRanges?.length === 3);
      const doc = new DOMParser().parseFromString(`<root>${styled.target}</root>`, "application/xml");
      const serializer = new XMLSerializer();
      const nodes = Array.from(doc.documentElement.children);
      styled.target = [nodes[2], nodes[0], nodes[1]].map((node) => serializer.serializeToString(node)).join("");
      const reorderedOutput = await api.buildLocalizationFile("idml", reordered.segments, reordered.structure);
      const invalidCases = [
        ["missing style token", (value) => { const s = value.segments.find((item) => item.structure.inlineRanges); s.target = s.target.replace(/<[^>]+>[^<]*<\/[^>]+>/, ""); }],
        ["duplicate style token", (value) => { const s = value.segments.find((item) => item.structure.inlineRanges); s.target += s.target; }],
        ["unknown style identity", (value) => { const s = value.segments.find((item) => item.structure.inlineRanges); s.target = s.target.replace(/id="[^"]+"/, 'id="unknown"'); }],
        ["missing stored style map", (value) => { const s = value.segments.find((item) => item.structure.inlineRanges); delete s.structure.inlineRanges; }],
        ["fractional paragraph mapping", (value) => { const s = value.segments.find((item) => item.structure.inlineRanges); s.structure.paragraphIndex = 0.5; }],
        ["missing story mapping", (value) => { value.segments[0].structure.path = "Stories/missing.xml"; }],
        ["out-of-range Content mapping", (value) => { const s = value.segments.find((item) => !item.structure.inlineRanges); s.structure.contentIndex = 99999; }],
        ["duplicate Content mapping", (value) => { value.segments.push(value.segments.at(-1)); }]
      ];
      for (const [name, mutate] of invalidCases) {
        const invalid = JSON.parse(JSON.stringify(translated)); mutate(invalid);
        await rejects(() => api.buildLocalizationFile("idml", invalid.segments, invalid.structure), `IDML rejects ${name}`);
      }
      const icml = await api.parseLocalizationFile(new File([icmlSource], "formatted.icml"));
      icml.segments.forEach((segment) => { segment.target = segment.text; });
      check(await api.buildLocalizationFile("icml", icml.segments, icml.structure) === icmlSource, "ICML unchanged export preserves exact source XML");
      icml.segments.forEach((segment) => { segment.target = segment.text.replace(/Alpha|Table cell|Before instruction/g, (word) => `TR ${word}`); });
      const icmlOutput = await api.buildLocalizationFile("icml", icml.segments, icml.structure);
      const icmlAgain = await api.parseLocalizationFile(new File([icmlOutput], "again.icml"));
      check(JSON.stringify(icmlAgain.segments.map((segment) => segment.text)) === JSON.stringify(icml.segments.map((segment) => segment.target)), "ICML text and whitespace round-trip with nested formatting structures");
      await rejects(() => api.buildLocalizationFile("icml", [...icml.segments, icml.segments[0]], icml.structure), "ICML rejects duplicate mappings");
      const legacy = await parse(legacyInput);
      const legacyStructure = { format: "idml", packageBase64: legacy.structure.packageBase64, storyPaths: ["Stories/Story_legacy.xml"] };
      const legacySegment = { target: "Before<b>bold</b>after", structure: { format: "idml", path: "Stories/Story_legacy.xml", paragraphIndex: 0, contentIndex: 0, contentIndexes: [0, 1, 2] } };
      const legacyCopy = await api.buildLocalizationFile("idml", [legacySegment], legacyStructure);
      check(legacyCopy.length === legacyInput.length && legacyCopy.every((byte, index) => byte === legacyInput[index]), "Older semantic IDML mappings preserve the original package on copy-source export");
      legacySegment.target = "Önce <b>kalın çeviri</b> sonra";
      const legacyTranslated = await parse(await api.buildLocalizationFile("idml", [legacySegment], legacyStructure));
      check(legacyTranslated.segments[0].text.includes(">kalın çeviri</b>"), "Older semantic IDML mappings still export styled translations");
      return { messages, translated: Array.from(output), reordered: Array.from(reorderedOutput), icmlOutput };
    }, Array.from(bytes), entries["Stories/Story_story1.xml"], Array.from(legacyBytes));
    const translatedEntries = await readExcelEntries(results.translated);
    const reorderedEntries = await readExcelEntries(results.reordered);
    assert.deepEqual(Object.keys(translatedEntries).sort(), Object.keys(entries).sort(), "All package entries retained");
    for (const name of Object.keys(entries)) if (!name.startsWith("Stories/")) {
      assert.equal(translatedEntries[name], entries[name], `Unchanged package entry ${name}`);
      assert.equal(reorderedEntries[name], entries[name], `Reordered package entry ${name}`);
    }
    await run((original, translated, reordered, icml) => {
      const parse = (text) => { const doc = new DOMParser().parseFromString(text, "application/xml"); if (doc.querySelector("parsererror")) throw new Error("Invalid XML output"); return doc; };
      const shape = (node, inContent = false) => {
        if (node.nodeType === Node.ELEMENT_NODE) return [node.namespaceURI || "", node.localName, Array.from(node.attributes).filter((a) => !a.name.startsWith("xmlns")).map((a) => [a.name, a.value]).sort(), Array.from(node.childNodes).map((child) => shape(child, inContent || node.localName === "Content")).filter((value) => value !== null)];
        if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return inContent ? ["text", "CONTENT"] : node.nodeValue.trim() ? ["text", node.nodeValue] : null;
        if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) return ["pi", node.nodeName, node.nodeValue];
        return null;
      };
      for (const name of Object.keys(original).filter((name) => name.startsWith("Stories/"))) {
        if (JSON.stringify(shape(parse(original[name]).documentElement)) !== JSON.stringify(shape(parse(translated[name]).documentElement))) throw new Error(`Formatting/nontext structure changed: ${name}`);
      }
      if (JSON.stringify(shape(parse(original["Stories/Story_story1.xml"]).documentElement)) !== JSON.stringify(shape(parse(icml).documentElement))) throw new Error("ICML formatting/nontext structure changed");
      const changed = parse(reordered["Stories/Story_story1.xml"]);
      const firstParagraph = changed.getElementsByTagName("ParagraphStyleRange")[0];
      const ranges = Array.from(firstParagraph.children).filter((node) => node.localName === "CharacterStyleRange");
      const styles = ranges.map((node) => [node.getAttribute("AppliedCharacterStyle"), node.getAttribute("FillColor"), node.getAttribute("PointSize"), node.textContent.trim()]);
      if (!styles[0][0].endsWith("BoldBlue") || styles[0][1] !== "Color/Blue" || styles[0][2] !== "14" || !styles[0][3].includes("TR Beta")) throw new Error("Reordered blue text lost its original formatting");
      if (!styles[2][0].endsWith("BoldRed") || styles[2][1] !== "Color/Red" || styles[2][2] !== "12" || !styles[2][3].includes("TR Alpha")) throw new Error("Reordered red text lost its original formatting");
      for (const name of ["Br", "Tab", "Rectangle", "Image", "Link", "HyperlinkTextSource", "Footnote", "Table", "Cell"]) {
        const before = parse(original["Stories/Story_story1.xml"]).getElementsByTagName(name);
        const after = changed.getElementsByTagName(name);
        if (before.length !== after.length) throw new Error(`Structural element count changed: ${name}`);
      }
    }, entries, translatedEntries, reorderedEntries, results.icmlOutput);
    results.messages.push("All non-Content XML nodes/attributes, style properties, object geometry, table cells, links and control nodes preserved");
    results.messages.push("Reordered IDML styles stay attached to the corresponding translated text");
    const outputDir = path.join(root, "test-artifacts", "office-formatting");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "idml-rich-source.idml"), bytes);
    fs.writeFileSync(path.join(outputDir, "idml-rich-target.idml"), Buffer.from(results.translated));
    fs.writeFileSync(path.join(outputDir, "idml-rich-reordered.idml"), Buffer.from(results.reordered));
    fs.writeFileSync(path.join(outputDir, "idml.json"), JSON.stringify({ passed: results.messages.length, checks: results.messages, nativeInDesign: "not available; structural verification only" }, null, 2));
    results.messages.forEach((label) => console.log(`PASS ${label}`));
    console.log(`IDML/ICML formatting verification passed: ${results.messages.length} checks.`);
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1); }
});
