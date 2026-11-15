/* Real XML/ZIP formatting invariants, plus artifacts from native Office fixtures when present. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { writeExcelEntries, readExcelEntries } = require("../tests/fixtures/multilingual-excel.cjs");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [...(process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1" ? ["--no-sandbox"] : []), __filename], { cwd: root, stdio: "inherit", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE")) });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `ooxml-formatting-${process.pid}`));
app.disableHardwareAcceleration();
if (process.platform === "linux") app.commandLine.appendSwitch("disable-dev-shm-usage");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const s = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const wordXml = `<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="24"/></w:rPr><w:t>Hello </w:t></w:r><w:r><w:rPr><w:b/><w:color w:val="FF0000"/></w:rPr><w:t>bold</w:t></w:r><w:hyperlink r:id="rId7"><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t> Link</w:t></w:r></w:hyperlink><w:r><w:br w:type="page"/></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:body></w:document>`;
const slideXml = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="${a}" xmlns:r="${r}"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="3000000" cy="1000000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US" sz="2400"><a:latin typeface="Aptos"/></a:rPr><a:t>Hello </a:t></a:r><a:r><a:rPr b="1" sz="2800"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:hlinkClick r:id="rId7"/></a:rPr><a:t>bold</a:t></a:r><a:br><a:rPr sz="2000"/></a:br><a:r><a:rPr i="1" baseline="30000"/><a:t> red</a:t></a:r><a:fld id="field1" type="slidenum"><a:rPr/><a:t>1</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
const sharedXml = `<sst xmlns="${s}" count="3" uniqueCount="3"><si><r><rPr><b/><color rgb="FFFF0000"/><sz val="14"/><rFont val="Arial"/></rPr><t>Hello </t></r><r><rPr><i/><u val="single"/><color rgb="FF0000FF"/></rPr><t>bold</t></r><rPh sb="0" eb="5"><t>source reading</t></rPh></si><si><r><rPr><b/><color rgb="FF00AA00"/></rPr><t>Old </t></r><r><rPr><i/><vertAlign val="superscript"/></rPr><t>target</t></r></si><si><t>Unrelated</t></si></sst>`;
const excelEntries = {
  "[Content_Types].xml": "<Types/>",
  "xl/workbook.xml": `<workbook xmlns="${s}" xmlns:r="${r}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${r}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${r}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  "xl/sharedStrings.xml": sharedXml,
  "xl/worksheets/sheet1.xml": `<worksheet xmlns="${s}"><dimension ref="A1:F3"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" state="frozen"/></sheetView></sheetViews><cols><col min="2" max="4" width="30" customWidth="1"/></cols><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>English</t></is></c><c r="D1" t="inlineStr"><is><t>Turkish</t></is></c></row><row r="2" ht="36" customHeight="1"><c r="B2" t="s" s="1"><v>0</v></c><c r="D2" t="s" s="2"><v>1</v></c><c r="E2"><f>SUM(1,2)</f><v>3</v></c><c r="F2" t="s"><v>2</v></c></row><row r="3"><c r="B3" t="s"><v>0</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:A2"/></mergeCells><hyperlinks><hyperlink ref="B2" location="Sheet1!A1"/></hyperlinks></worksheet>`,
  "xl/styles.xml": `<styleSheet xmlns="${s}"><fonts count="1"><font><name val="Aptos"/></font></fonts></styleSheet>`,
  "xl/drawings/drawing1.xml": "<drawing>untouched layout</drawing>",
  "xl/vbaProject.bin": "opaque macro content"
};
app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("about:blank");
    await win.webContents.executeJavaScript("window.CatHan = {};");
    for (const file of ["protected-tags.js", "docx.js", "localization.js"]) await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, file), "utf8"));
    const run = async (fn, ...args) => {
      const result = await win.webContents.executeJavaScript(`Promise.resolve().then(()=>(${fn.toString()})(...${JSON.stringify(args)})).catch(error=>({__error:error.stack||error.message}))`);
      if (result?.__error) throw Error(result.__error);
      return result;
    };
    const checks = [];
    const fixtures = [
      ["docm", {"[Content_Types].xml":"<Types/>", "word/document.xml":wordXml, "word/_rels/document.xml.rels":`<Relationships><Relationship Id="rId7" Target="https://example.com"/></Relationships>`, "word/styles.xml":"<styles>unchanged</styles>"}, "word/document.xml"],
      ["pptx", {"[Content_Types].xml":"<Types/>", "ppt/presentation.xml":"<presentation/>", "ppt/slides/slide1.xml":slideXml, "ppt/slides/_rels/slide1.xml.rels":`<Relationships><Relationship Id="rId7" Target="https://example.com"/></Relationships>`, "ppt/theme/theme1.xml":"<theme>unchanged</theme>"}, "ppt/slides/slide1.xml"],
      ["xlsx", excelEntries, "xl/sharedStrings.xml"]
    ];
    for (const [extension, entries, changedPath] of fixtures) {
      const input = await writeExcelEntries(entries);
      const output = await run(async (bytes, ext, originalXml) => {
        const api = window.CatHan.localization;
        const parsed = await api.parseLocalizationFile(new File([new Uint8Array(bytes)], `fixture.${ext}`));
        const copy = parsed.segments.map((segment) => ({...segment, target:segment.text}));
        const same = await api.buildLocalizationFile(ext, copy, JSON.parse(JSON.stringify(parsed.structure)));
        if (same.length !== bytes.length || !same.every((byte,index) => byte === bytes[index])) throw Error("Copy source changed package bytes");
        if (ext !== "xlsx") {
          const legacy = JSON.parse(JSON.stringify(copy));
          const oldDocument = new DOMParser().parseFromString(originalXml, "application/xml");
          legacy[0].target = Array.from(oldDocument.getElementsByTagNameNS("*", "t")).map((node) => node.textContent).join("");
          delete legacy[0].structure.richTextVersion;
          const oldCopy = await api.buildLocalizationFile(ext, legacy, parsed.structure);
          if (oldCopy.length !== bytes.length || !oldCopy.every((byte,index) => byte === bytes[index])) throw Error("Legacy copy-source with cached field text must retain original package");
        }
        const rich = parsed.segments.find((segment) => segment.text.includes("Hello"));
        if (!rich?.text.includes('<g id="o')) throw Error("Rich formatting boundaries were not imported");
        for (const segment of copy) segment.target = segment.text.replaceAll("Hello", "Merhaba").replaceAll("bold", "kalın").replaceAll("Link", "Bağlantı").replaceAll(" red", " kırmızı");
        const translated = await api.buildLocalizationFile(ext, copy, parsed.structure);
        const bad = JSON.parse(JSON.stringify(copy));
        const index = bad.findIndex((segment) => segment.text.includes("Hello"));
        bad[index].target = "flattened plain translation";
        let rejected = false;
        try { await api.buildLocalizationFile(ext, bad, parsed.structure); } catch { rejected = true; }
        if (!rejected) throw Error("Missing rich tags silently flattened formatting");
        bad[index].target = " " + copy[index].target;
        rejected = false;
        try { await api.buildLocalizationFile(ext, bad, parsed.structure); } catch { rejected = true; }
        if (!rejected) throw Error("Text outside formatting tags was silently discarded");
        bad[index].target = "flattened plain translation";
        delete bad[index].structure.richTextVersion;
        rejected = false;
        try { await api.buildLocalizationFile(ext, bad, parsed.structure); } catch (error) { rejected = /Reimport/.test(error.message); }
        if (!rejected) throw Error("Legacy ambiguous rich target must require reimport");
        return Array.from(translated);
      }, Array.from(input), extension, entries[changedPath]);
      const restored = await readExcelEntries(output);
      await run((before, after) => {
        const parse = (xml) => new DOMParser().parseFromString(xml,"application/xml");
        const normalize = (doc) => {
          for (const node of Array.from(doc.getElementsByTagNameNS("*","rPh"))) node.remove();
          for (const node of doc.getElementsByTagNameNS("*","t")) { node.textContent = "TEXT"; node.removeAttributeNS("http://www.w3.org/XML/1998/namespace","space"); }
          return doc;
        };
        const actual = parse(after);
        if (actual.querySelector("parsererror")) throw Error("Exported XML invalid");
        if (!actual.documentElement.textContent.includes("Merhaba")) throw Error("Translation missing");
        if (!normalize(parse(before)).documentElement.isEqualNode(normalize(actual).documentElement)) throw Error("Native properties, controls or layout changed beyond translated text");
      }, entries[changedPath], restored[changedPath]);
      for (const [name, content] of Object.entries(entries)) if (name !== changedPath) assert.equal(restored[name], content, `${extension}: unchanged package part ${name}`);
      checks.push(`${extension}: raw copy fidelity; edited rich runs, hyperlinks, controls and layout; missing/legacy-tag rejection`);
    }
    const excelInput = await writeExcelEntries(excelEntries);
    const multi = await run(async (bytes) => {
      const api = window.CatHan.localization;
      const parsed = await api.parseLocalizationFile(new File([new Uint8Array(bytes)],"multi.xlsx"), {multilingualExcel:{sheetPath:"xl/worksheets/sheet1.xml",sourceColumn:"B",targetColumn:"D",firstRowIsHeader:true,importExistingTargets:true}});
      if (!parsed.segments[0].target.includes('<g id="o') || !parsed.segments[1].text.includes('<g id="o')) throw Error("Target/source template formatting not exposed");
      parsed.segments[0].target = parsed.segments[0].target.replace("Old", "Yeni").replace("target","hedef");
      parsed.segments[1].target = parsed.segments[1].text.replace("Hello","Merhaba").replace("bold","kalın");
      return Array.from(await api.buildLocalizationFile("xlsx", parsed.segments, parsed.structure));
    }, Array.from(excelInput));
    const multiEntries = await readExcelEntries(multi);
    assert.equal(multiEntries["xl/sharedStrings.xml"], sharedXml, "Bilingual source and shared targets retained");
    await run((text) => {
      const doc = new DOMParser().parseFromString(text,"application/xml");
      const target = doc.querySelector('c[r="D2"]');
      if (target.getAttribute("s") !== "2" || !target.querySelector('color[rgb="FF00AA00"]') || !target.querySelector('vertAlign[val="superscript"]')) throw Error("Existing target style lost");
      if (target.textContent !== "Yeni hedef") throw Error("Target text lost");
      const added = doc.querySelector('c[r="D3"]');
      if (!added.querySelector('color[rgb="FFFF0000"]') || !added.querySelector('color[rgb="FF0000FF"]') || added.textContent !== "Merhaba kalın") throw Error("New target source rich template lost: " + new XMLSerializer().serializeToString(added));
    }, multiEntries["xl/worksheets/sheet1.xml"]);
    checks.push("multilingual Excel: existing target rich style and new target source style, source/shared data unchanged");
    await run(async (bytes) => {
      const api = window.CatHan.localization;
      const parsed = await api.parseLocalizationFile(new File([new Uint8Array(bytes)], "order.xlsx"));
      const copies = parsed.segments.map((s) => ({...s,target:s.text}));
      const first = copies[0];
      const markup = new DOMParser().parseFromString(`<root>${first.text}</root>`,"application/xml");
      const serializer = new XMLSerializer();
      first.target = Array.from(markup.documentElement.children).reverse().map((node) => serializer.serializeToString(node)).join("");
      const result = await api.buildLocalizationFile("xlsx", copies, parsed.structure);
      const again = await api.parseLocalizationFile(new File([result],"again.xlsx"));
      const text = new DOMParser().parseFromString(`<root>${again.segments[0].text}</root>`,"application/xml").documentElement.textContent;
      if (text !== "boldHello ") throw Error("Reordered styled runs did not move together");
    }, Array.from(excelInput));
    checks.push("rich run reordering moves original formatting with translated text");
    const nestedEntries = { "[Content_Types].xml":"<Types/>", "word/document.xml":`<w:document xmlns:w="${w}"><w:body><w:p><w:pPr><w:keepNext/></w:pPr><w:r><w:t>Hello outer</w:t></w:r><w:r><w:drawing><w:txbxContent><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Hello inner</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r><w:r><w:t> tail</w:t></w:r></w:p></w:body></w:document>` };
    const nestedInput = await writeExcelEntries(nestedEntries);
    const nestedOutput = await run(async (bytes) => {
      const api = window.CatHan.localization;
      const parsed = await api.parseLocalizationFile(new File([new Uint8Array(bytes)],"nested.docm"));
      if(parsed.segments.length!==2) throw Error("Nested text must import exactly once");
      const copy=parsed.segments.map((row)=>({...row,target:row.text.replaceAll("Hello","Merhaba")}));
      const result=await api.buildLocalizationFile("docm",copy,parsed.structure);
      const bad=JSON.parse(JSON.stringify(copy));
      const markup=new DOMParser().parseFromString(`<root>${bad[0].target}</root>`,"application/xml");
      const nodes=Array.from(markup.documentElement.children);
      bad[0].target=nodes.reverse().map((node)=>new XMLSerializer().serializeToString(node)).join("");
      let rejected=false;
      try { await api.buildLocalizationFile("docm",bad,parsed.structure); } catch {rejected=true;}
      if(!rejected)throw Error("Text moved across opaque drawing boundary without rejection");
      return Array.from(result);
    },Array.from(nestedInput));
    const nestedRestored=await readExcelEntries(nestedOutput);
    assert.match(nestedRestored["word/document.xml"],/Merhaba outer/);
    assert.match(nestedRestored["word/document.xml"],/Merhaba inner/);
    assert.match(nestedRestored["word/document.xml"],/<w:b\s*\/>/);
    checks.push("nested textbox paragraphs translate once and retain inner edits; drawing-boundary moves reject");
    const artifactDir = path.join(root,"test-artifacts","office-formatting","ooxml-agent");
    fs.mkdirSync(artifactDir,{recursive:true});
    for (const extension of ["xlsx","pptx"]) {
      const file = path.join(root,"test-artifacts","office-formatting","native","source",`formatting.${extension}`);
      if (!fs.existsSync(file)) continue;
      const bytes = fs.readFileSync(file);
      const outputs = await run(async (input,ext) => {
        const api = window.CatHan.localization;
        const parsed = await api.parseLocalizationFile(new File([new Uint8Array(input)],`formatting.${ext}`));
        const copy = parsed.segments.map((s) => ({...s,target:s.text}));
        const same = await api.buildLocalizationFile(ext,copy,parsed.structure);
        const replacements = [["Hello","Merhaba"],["bold","kalın"],["red","kırmızı"],["world","dünya"],["Reference link","Başvuru bağlantısı"],["Table cell","Tablo hücresi"],["First bullet","Birinci madde"],["Second bullet","İkinci madde"],["Merged banner","Birleşik başlık"]];
        for (const row of copy) for (const [source,target] of replacements) row.target=row.target.replaceAll(source,target);
        const changed=await api.buildLocalizationFile(ext,copy,parsed.structure);
        return {same:Array.from(same),changed:Array.from(changed),segments:parsed.segments.length};
      },Array.from(bytes),extension);
      assert.deepEqual(Buffer.from(outputs.same),bytes,`${extension} native copy-source exact bytes`);
      fs.writeFileSync(path.join(artifactDir,`native-copy.${extension}`),Buffer.from(outputs.same));
      fs.writeFileSync(path.join(artifactDir,`native-translated.${extension}`),Buffer.from(outputs.changed));
      checks.push(`${extension}: native-created fixture translated/exported (${outputs.segments} segments), copy is byte-identical`);
    }
    checks.forEach((message)=>console.log(`PASS ${message}`));
    fs.writeFileSync(path.join(artifactDir,"results.json"),JSON.stringify({passed:checks.length,checks},null,2));
    win.destroy(); app.exit(0);
  } catch(error) { console.error(error); if(win&&!win.isDestroyed())win.destroy(); app.exit(1); }
});
