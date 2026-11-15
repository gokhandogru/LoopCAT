/* Word DOM/ZIP fidelity checks, including an optional locally generated native fixture. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { writeExcelEntries, readExcelEntries } = require("../tests/fixtures/multilingual-excel.cjs");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const child = spawnSync(require("electron"), [...(process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1" ? ["--no-sandbox"] : []), __filename], { cwd: root, stdio: "inherit", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE")) });
  if (child.error) console.error(child.error);
  process.exit(child.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `word-formatting-${process.pid}`));
app.disableHardwareAcceleration();
if (process.platform === "linux") app.commandLine.appendSwitch("disable-dev-shm-usage");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const documentXml = (content) => `<w:document xmlns:w="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml"><w:body>${content}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("about:blank");
    await win.webContents.executeJavaScript("window.CatHan={};");
    for (const file of ["protected-tags.js", "docx.js"]) await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, file), "utf8"));
    const run = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const fixtures = [
      ["mixed-wrappers", documentXml('<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="200"/></w:pPr><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t xml:space="preserve">Hello </w:t></w:r><w:bookmarkStart w:id="3" w:name="Anchor"/><w:hyperlink r:id="link"><w:r><w:rPr><w:u w:val="double"/><w:sz w:val="36"/></w:rPr><w:t>Link</w:t></w:r></w:hyperlink><w:bookmarkEnd w:id="3"/><w:r><w:t xml:space="preserve"> after </w:t></w:r><w:sdt><w:sdtPr><w:id w:val="4"/><w:tag w:val="Customer"/></w:sdtPr><w:sdtContent><w:r><w:rPr><w:i/></w:rPr><w:t>Control</w:t></w:r></w:sdtContent></w:sdt><w:r><w:br w:type="page"/><w:t>End</w:t></w:r></w:p>'), true],
      ["nested-wrapper", documentXml('<w:p><w:sdt><w:sdtPr><w:id w:val="9"/></w:sdtPr><w:sdtContent><w:r><w:t>Before </w:t></w:r><w:hyperlink r:id="link"><w:r><w:rPr><w:b/></w:rPr><w:t>Link</w:t></w:r></w:hyperlink><w:r><w:t> after</w:t></w:r></w:sdtContent></w:sdt></w:p>'), true],
      ["mixed-field", documentXml('<w:p><w:r><w:t>Before </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/><w:instrText> REF Anchor </w:instrText><w:fldChar w:fldCharType="separate"/><w:t>Result</w:t><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t> after</w:t></w:r></w:p>'), true],
      ["legacy-field-boundaries", documentXml('<w:p>\n  <w:pPr><w:keepNext/></w:pPr>\n  <w:r><w:fldChar w:fldCharType="begin"/></w:r>\n  <w:r><w:instrText> REF Anchor </w:instrText></w:r>\n  <w:r><w:fldChar w:fldCharType="separate"/></w:r>\n  <w:r><w:t>Before </w:t></w:r>\n  <w:r><w:rPr><w:i/></w:rPr><w:t>Result</w:t></w:r>\n  <w:r><w:t> after</w:t></w:r>\n  <w:r><w:fldChar w:fldCharType="end"/></w:r>\n</w:p>'), true],
      ["drawing-textbox", documentXml('<w:p><w:r><w:t>Outer </w:t><w:pict><v:shape id="shape" style="width:120pt;height:40pt"><v:textbox><w:txbxContent><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Inner</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r><w:r><w:t>End</w:t></w:r></w:p>'), false],
      ["spaces", documentXml('<w:p><w:r><w:t xml:space="preserve">  Hello  world again  </w:t></w:r></w:p>'), true],
      ["exact-run-properties", documentXml('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>LongestBaseText</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>Italic</w:t></w:r><w:r><w:rPr><w:u w:val="double" w:color="AA0000"/></w:rPr><w:t>Underline</w:t></w:r><w:r><w:rPr><w:bCs/><w:szCs w:val="30"/></w:rPr><w:t>Complex</w:t></w:r></w:p>'), false]
    ];
    const messages = [];
    for (const [name, source, exactTree] of fixtures) {
      const entries = { "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', "word/document.xml": source, "word/_rels/document.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="link" Target="https://example.com" TargetMode="External" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"/></Relationships>', "word/styles.xml": '<w:styles xmlns:w="' + ns + '"/>' };
      const input = await writeExcelEntries(entries);
      const result = await run(async (input, exactTree) => {
        const api = window.CatHan.docx;
        const check = (value, message) => { if (!value) throw new Error(message); };
        const parsed = await api.extractDocxSegments(new File([new Uint8Array(input)], "source.docx"));
        const sourceCopies = parsed.segments.map((segment) => ({ ...segment, source: segment.text, target: segment.text }));
        const project = { docxStructure: JSON.parse(JSON.stringify(parsed.structure)) };
        const copied = await api.buildTargetDocx(project, sourceCopies);
        check(copied.length === input.length && copied.every((byte, i) => byte === input[i]), "Copy source must retain original bytes");
        const translate = (text) => text.replace(/Hello|Link|Control|Before|Result|Outer|Inner|End|LongestBaseText|Italic|Underline|Complex|world|again|after/g, (word) => ({Hello:"Merhaba",Link:"Bağlantı",Control:"Denetim",Before:"Önce",Result:"Sonuç",Outer:"Dış",Inner:"İç",End:"Son",LongestBaseText:"EnUzunTemelMetin",Italic:"İtalik",Underline:"AltÇizgi",Complex:"Karmaşık",world:"dünya",again:"yeniden",after:"sonra"})[word]);
        const edited = sourceCopies.map((segment) => ({ ...segment, target: translate(segment.text) }));
        const output = await api.buildTargetDocx(project, edited);
        const again = await api.extractDocxSegments(new File([output], "again.docx"));
        check(again.segments.length === parsed.segments.length, "Paragraph count");
        check(again.segments.every((segment) => !/>?(Hello|Link|Control|Before|Result|Outer|Inner|End)</.test(segment.text)), "All visible text translated");
        const fidelity = edited.find((segment) => segment.structure.fidelityVersion === 2);
        if (fidelity) {
          for (const target of [fidelity.target.replace(/<x id="[^"]+"\/>|<g id="[^"]+">/, ""), fidelity.target + '<x id="unknown"/>']) {
            let rejected = false;
            try { await api.buildTargetDocx(project, edited.map((segment) => segment === fidelity ? {...segment, target} : segment)); } catch { rejected = true; }
            check(rejected, "Missing/unknown tags must reject");
          }
          const legacy = edited.map((segment) => ({ ...segment, structure: {...segment.structure, fidelityVersion: undefined} }));
          let rejected = false;
          try { await api.buildTargetDocx(project, legacy); } catch { rejected = true; }
          check(rejected, "Changed unsafe legacy imports must request reimport");
        }
        return { bytes: Array.from(output), targets: edited.map((segment) => segment.target), exactTree };
      }, Array.from(input), exactTree);
      const restored = await readExcelEntries(result.bytes);
      for (const file of Object.keys(entries)) if (file !== "word/document.xml") assert.equal(restored[file], entries[file], `${name}: unchanged ${file}`);
      await run((before, after, exactTree, name) => {
        const parser = new DOMParser();
        const a = parser.parseFromString(before, "application/xml"), b = parser.parseFromString(after, "application/xml");
        if (b.querySelector("parsererror")) throw new Error("Invalid Word XML");
        const clean = (node) => {
          if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.trim() ? node.nodeValue : "";
          if (node.nodeType !== Node.ELEMENT_NODE) return "";
          const attrs = Array.from(node.attributes).filter((attr) => !attr.name.startsWith("xmlns") && attr.name !== "xml:space").map((attr) => [attr.namespaceURI, attr.localName, attr.value]).sort();
          return [node.namespaceURI, node.localName, attrs, node.localName === "t" ? "TEXT" : Array.from(node.childNodes).map(clean).filter(Boolean)];
        };
        if (exactTree && JSON.stringify(clean(a.documentElement)) !== JSON.stringify(clean(b.documentElement))) throw new Error(`${name}: formatting/container tree changed`);
        if (name === "exact-run-properties") {
          const runs = Array.from(b.getElementsByTagNameNS("*", "r"));
          const italic = runs.find((run) => run.textContent === "İtalik");
          if (!italic.getElementsByTagNameNS("*", "i").length || italic.getElementsByTagNameNS("*", "b").length) throw new Error("Base bold leaked into italic-only run");
          if (b.getElementsByTagNameNS("*", "u")[0].getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "val") !== "double") throw new Error("Double underline lost");
          if (!b.getElementsByTagNameNS("*", "bCs").length || !b.getElementsByTagNameNS("*", "szCs").length) throw new Error("Complex-script properties lost");
        }
        if (name === "drawing-textbox" && !b.documentElement.textContent.includes("İç")) throw new Error("Nested text box detached or untranslated");
      }, source, restored["word/document.xml"], exactTree, name);
      messages.push(name);
    }
    const native = path.join(root, "test-artifacts/office-formatting/native/source/formatting.docx");
    if (fs.existsSync(native)) {
      const bytes = Array.from(fs.readFileSync(native));
      await run(async (input) => {
        const api = window.CatHan.docx;
        const parsed = await api.extractDocxSegments(new File([new Uint8Array(input)], "formatting.docx"));
        const copied = await api.buildTargetDocx({docxStructure:parsed.structure}, parsed.segments.map((segment)=>({...segment,source:segment.text,target:segment.text})));
        if (copied.length !== input.length || copied.some((value,index)=>value !== input[index])) throw new Error("Native Word source-copy bytes changed");
        const substitutions = [["Reference link","Başvuru bağlantısı"],["Header identity","Üstbilgi kimliği"],["Table cell","Tablo hücresi"],["Second line","İkinci satır"],["Hello","Merhaba"],["bold","kalın"],["red","kırmızı"],["world","dünya"]];
        const edited=parsed.segments.map(segment=>({...segment,source:segment.text,target:substitutions.reduce((text,[from,to])=>text.replaceAll(from,to),segment.text)}));
        const output=await api.buildTargetDocx({docxStructure:JSON.parse(JSON.stringify(parsed.structure))},edited);
        const again=await api.extractDocxSegments(new File([output],"again.docx"));
        if (again.segments.length !== parsed.segments.length || !again.segments.some(segment=>segment.text.includes("Başvuru bağlantısı"))) throw new Error("Native Word rich translation failed");
      }, bytes);
      messages.push("native-source copy bytes and translated reimport");
    }
    messages.forEach((message) => console.log(`PASS Word formatting: ${message}`));
    console.log(`Word formatting verification passed: ${messages.length} cases.`);
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); if (win) win.destroy(); app.exit(1); }
});
