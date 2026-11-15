/* Browser DOM + real ZIP round trips for Office, OpenDocument and publishing formats. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { writeExcelEntries, readExcelEntries, multilingualExcelEntries } = require("../tests/fixtures/multilingual-excel.cjs");
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
app.setPath("userData", path.join(root, "tmp", `office-format-review-${process.pid}`));
app.disableHardwareAcceleration();
if (process.platform === "linux") app.commandLine.appendSwitch("disable-dev-shm-usage");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
let win;
const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const drawing = "http://schemas.openxmlformats.org/drawingml/2006/main";
const wordEntries = {
  "[Content_Types].xml": "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>",
  "word/document.xml": `<w:document xmlns:w="${word}"><w:body><w:p><w:r><w:t>Literal &amp;lt;b&amp;gt; &amp; </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:t> İstanbul 東京</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`,
  "word/header1.xml": `<w:hdr xmlns:w="${word}"><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>`,
  "word/footer1.xml": `<w:ftr xmlns:w="${word}"><w:p><w:r><w:t>Footer</w:t></w:r></w:p></w:ftr>`,
  "word/footnotes.xml": `<w:footnotes xmlns:w="${word}"><w:footnote w:id="1"><w:p><w:r><w:t>Footnote</w:t></w:r></w:p></w:footnote></w:footnotes>`,
  "word/endnotes.xml": `<w:endnotes xmlns:w="${word}"><w:endnote w:id="1"><w:p><w:r><w:t>Endnote</w:t></w:r></w:p></w:endnote></w:endnotes>`,
  "word/comments.xml": `<w:comments xmlns:w="${word}"><w:comment w:id="0"><w:p><w:r><w:t>Comment</w:t></w:r></w:p></w:comment></w:comments>`,
  "word/styles.xml": `<w:styles xmlns:w="${word}"/>`,
  "word/media/image1.bin": "opaque-image-bytes",
  "word/vbaProject.bin": "opaque-macro-bytes"
};
const presentationEntries = {
  "[Content_Types].xml": wordEntries["[Content_Types].xml"],
  "ppt/presentation.xml": "<presentation/>",
  "ppt/slides/slide1.xml": `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="${drawing}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide İstanbul 東京</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  "ppt/notesSlides/notesSlide1.xml": `<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="${drawing}"><a:p><a:r><a:t>Speaker note</a:t></a:r></a:p></p:notes>`,
  "ppt/media/image1.bin": "opaque-image-bytes", "ppt/vbaProject.bin": "opaque-macro-bytes"
};
const odfEntries = {
  mimetype: "application/vnd.oasis.opendocument.text",
  "content.xml": '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h>Heading</text:h><text:p>Hello <text:span text:style-name="Bold">world</text:span><text:s text:c="3"/>İstanbul</text:p></office:text></office:body></office:document-content>',
  "styles.xml": '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:master-styles><text:p>Page header</text:p></office:master-styles></office:document-styles>',
  "META-INF/manifest.xml": "<manifest/>", "Pictures/image.bin": "opaque-image-bytes"
};
const idmlEntries = {
  mimetype: "application/vnd.adobe.indesign-idml-package", "designmap.xml": "<Document/>",
  "Stories/Story_u1.xml": '<Story><ParagraphStyleRange><CharacterStyleRange AppliedCharacterStyle="Normal"><Content>Hello </Content></CharacterStyleRange><CharacterStyleRange AppliedCharacterStyle="Bold"><Content>world</Content></CharacterStyleRange><CharacterStyleRange AppliedCharacterStyle="Normal"><Content> İstanbul</Content></CharacterStyleRange></ParagraphStyleRange><ParagraphStyleRange><CharacterStyleRange AppliedCharacterStyle="Red"><Content>Red text</Content><Br/><Content>After break</Content></CharacterStyleRange><CharacterStyleRange AppliedCharacterStyle="Blue"><Content>Blue text</Content></CharacterStyleRange></ParagraphStyleRange></Story>',
  "Resources/Styles.xml": "<Styles/>", "Links/image.bin": "opaque-image-bytes"
};
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("about:blank");
    await win.webContents.executeJavaScript("window.CatHan = {};");
    for (const name of ["protected-tags.js", "docx.js", "localization.js"]) {
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, name), "utf8"));
    }
    const run = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const results = [];
    const excelEntries = multilingualExcelEntries();
    // Shared strings may be stored at a non-default path identified by a relationship.
    excelEntries["xl/strings/custom.xml"] = excelEntries["xl/sharedStrings.xml"];
    delete excelEntries["xl/sharedStrings.xml"];
    excelEntries["xl/_rels/workbook.xml.rels"] = excelEntries["xl/_rels/workbook.xml.rels"].replace('Target="sharedStrings.xml"', 'Target="strings/custom.xml"');
    for (const [extensions, entries, editablePaths] of [
      [["docm", "dotx", "dotm"], wordEntries, Object.keys(wordEntries).filter((name) => /^word\/(document|header1|footer1|footnotes|endnotes|comments)\.xml$/.test(name))],
      [["xlsx", "xlsm", "xltx", "xltm"], excelEntries, ["xl/strings/custom.xml", "xl/worksheets/multilingual.xml", "xl/worksheets/sheet2.xml"]],
      [["pptx", "pptm", "ppsx", "ppsm", "potx", "potm"], presentationEntries, ["ppt/slides/slide1.xml", "ppt/notesSlides/notesSlide1.xml"]],
      [["odt", "ott", "ods", "ots", "odp", "otp"], odfEntries, ["content.xml", "styles.xml"]],
      [["idml"], idmlEntries, ["Stories/Story_u1.xml"]]
    ]) {
      const bytes = await writeExcelEntries(entries);
      for (const extension of extensions) {
        const result = await run(async (input, ext) => {
          const api = window.CatHan.localization;
          const check = (condition, message) => { if (!condition) throw new Error(`${ext}: ${message}`); };
          const parsed = await api.parseLocalizationFile(new File([new Uint8Array(input)], `review.${ext}`));
          check(parsed.documentType === ext && parsed.segments.length > 0, "import and extension");
          if (["xlsx", "xlsm", "xltx", "xltm"].includes(ext)) {
            check(parsed.segments.some((segment) => segment.text === "Hello world"), "phonetic annotations must not enter source text");
            check(parsed.segments.some((segment) => segment.text === "Literal _x0041_ and CR \r"), "Excel escape decoding");
            check(parsed.segments.some((segment) => segment.text === "Multi\nline <literal> &"), "relationship-named worksheet");
            check(!parsed.segments.some((segment) => segment.text === "ab"), "formula result exclusion");
          }
          if (["docm", "dotx", "dotm"].includes(ext)) check(parsed.segments.some((segment) => segment.text === "Comment"), "Word comments");
          if (ext === "idml") check(parsed.segments.some((segment) => segment.text === "After break"), "multiple Content nodes");
          parsed.segments.forEach((segment) => { segment.target = segment.text.replace(/Hello|world|Heading|Page header|Slide|Speaker note|Header|Footer|Footnote|Endnote|Comment|Table|Red text|Blue text|After break/g, (word) => `TR ${word}`); });
          const output = await api.buildLocalizationFile(ext, parsed.segments, JSON.parse(JSON.stringify(parsed.structure)));
          const reparsed = await api.parseLocalizationFile(new File([output], `again.${ext}`));
          check(reparsed.segments.length === parsed.segments.length, "segment count survives export");
          check(reparsed.segments.every((segment, index) => segment.text === parsed.segments[index].target), "translated content round trip");
          if (parsed.structure.format === "openxml") {
            for (const mutation of [
              (segments) => { segments[0].structure.path = "missing.xml"; },
              (segments) => { segments[0].structure.itemIndex = 999999; },
              (segments) => { segments.push(segments[0]); }
            ]) {
              const invalid = JSON.parse(JSON.stringify(parsed.segments));
              mutation(invalid);
              let rejected = false;
              try { await api.buildLocalizationFile(ext, invalid, parsed.structure); } catch { rejected = true; }
              check(rejected, "invalid or duplicate mapping must not silently return untranslated data");
            }
            let mismatched = false;
            try { await api.parseLocalizationFile(new File([new Uint8Array(input)], parsed.structure.kind === "spreadsheet" ? "wrong.pptx" : "wrong.xlsx")); } catch { mismatched = true; }
            check(mismatched, "mismatched extension must be rejected");
          }
          return { bytes: Array.from(output), segments: parsed.segments.length };
        }, Array.from(bytes), extension);
        const restored = await readExcelEntries(result.bytes);
        assert.deepEqual(Object.keys(restored).sort(), Object.keys(entries).sort(), `${extension}: ZIP entry inventory`);
        for (const name of Object.keys(entries)) if (!editablePaths.includes(name)) assert.equal(restored[name], entries[name], `${extension}: untouched ${name}`);
        if (extension === "idml") {
          assert.match(restored["Stories/Story_u1.xml"], /<Br\s*\/>/, "IDML line breaks survive");
          assert.match(restored["Stories/Story_u1.xml"], /AppliedCharacterStyle="Blue"/, "IDML distinct nonsemantic styles survive");
        }
        if (["xlsx", "xlsm", "xltx", "xltm"].includes(extension)) {
          assert.match(restored["xl/worksheets/multilingual.xml"], /<f>SUM\(F2:F3\)<\/f><v>7<\/v>/, "Excel formulas preserved");
          assert.match(restored["xl/strings/custom.xml"], /<rPh\b|TR world/, "Excel shared strings updated");
        }
        results.push({ extension, segments: result.segments });
      }
    }
    const docxBytes = await writeExcelEntries(wordEntries);
    const docxResult = await run(async (input) => {
      const api = window.CatHan.docx;
      const parsed = await api.extractDocxSegments(new File([new Uint8Array(input)], "review.docx"));
      const segments = parsed.segments.map((segment) => ({ ...segment, source: segment.text, target: segment.text }));
      const output = await api.buildTargetDocx({ targetLang: "tr", docxStructure: JSON.parse(JSON.stringify(parsed.structure)) }, segments);
      return { bytes: Array.from(output), parts: parsed.structure.textPartSummary.map((part) => part.path), segments: segments.length };
    }, Array.from(docxBytes));
    assert.equal(docxResult.parts.length, 6, "DOCX document/header/footer/footnotes/endnotes/comments");
    const docxRestored = await readExcelEntries(docxResult.bytes);
    await run((xml) => {
      const document = new DOMParser().parseFromString(xml, "application/xml");
      const text = Array.from(document.getElementsByTagNameNS("*", "t")).map((node) => node.textContent).join("");
      if (text !== "Literal &lt;b&gt; & bold İstanbul 東京Table") throw new Error(`DOCX entity fidelity: ${text}`);
      if (!document.getElementsByTagNameNS("*", "b").length) throw new Error("DOCX bold formatting lost");
    }, docxRestored["word/document.xml"]);
    for (const name of ["word/media/image1.bin", "word/vbaProject.bin", "word/styles.xml"]) assert.equal(docxRestored[name], wordEntries[name]);
    results.push({ extension: "docx", segments: docxResult.segments });
    await run(async () => {
      const api = window.CatHan.localization;
      const input = '<Story><ParagraphStyleRange><CharacterStyleRange AppliedCharacterStyle="Bold"><Content>İstanbul &amp; 東京</Content></CharacterStyleRange></ParagraphStyleRange></Story>';
      const parsed = await api.parseLocalizationFile(new File([input], "review.icml"));
      parsed.segments[0].target = parsed.segments[0].text.replace("İstanbul", "Merhaba");
      const output = await api.buildLocalizationFile("icml", parsed.segments, parsed.structure);
      const again = await api.parseLocalizationFile(new File([output], "again.icml"));
      if (again.segments[0].text !== parsed.segments[0].target) throw new Error("ICML round trip");
      for (const extension of ["docx", "xlsx", "pptx", "odt", "idml"]) {
        let rejected = false;
        try {
          const file = new File(["not a ZIP"], `broken.${extension}`);
          await (extension === "docx" ? window.CatHan.docx.extractDocxSegments(file) : api.parseLocalizationFile(file));
        } catch { rejected = true; }
        if (!rejected) throw new Error(`${extension}: malformed package was accepted`);
      }
    });
    results.push({ extension: "icml", segments: 1 });
    console.log(JSON.stringify({ result: "PASS", formats: results.length, results }, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) {
    console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1);
  }
});
