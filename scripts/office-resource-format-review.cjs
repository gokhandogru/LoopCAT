/* Exercise both glossary XLSX import routes and CSV/TSV resource round trips. */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { writeExcelEntries } = require("../tests/fixtures/multilingual-excel.cjs");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename], { cwd: root, stdio: "inherit",
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE")) });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `office-resource-format-review-${process.pid}`));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
let win;
app.whenReady().then(async () => {
  try {
    const bundled = await require("esbuild").build({ entryPoints: [path.join(root, "src/features/resources/resource-transfer-service.js")],
      bundle: true, write: false, format: "iife", globalName: "ResourceTransfer", platform: "browser", logLevel: "silent" });
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("about:blank");
    await win.webContents.executeJavaScript(`let reviewId = 0; window.CatHan = { storage: { makeId: () => 'review-' + (++reviewId), get: async () => null, getAllByIndex: async () => [] }, tm: { normalizeText: (text) => String(text).toLowerCase().replace(/\\s+/g, " ").trim() } }; void 0;`);
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, "termbase.js"), "utf8"));
    await win.webContents.executeJavaScript(bundled.outputFiles[0].text);
    const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const cell = (reference, text) => `<c r="${reference}" t="inlineStr"><is><t>${text}</t></is></c>`;
    const entries = {
      "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Glossary" sheetId="1" r:id="first"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="first" Type="${rel}/worksheet" Target="worksheets/glossary.xml"/><Relationship Id="strings" Type="${rel}/sharedStrings" Target="strings/custom.xml"/></Relationships>`,
      "xl/strings/custom.xml": `<sst xmlns="${ns}"><si>\n<r><t>東京</t></r><rPh sb="0" eb="2"><t>とうきょう</t></rPh>\n</si><si><t>İstanbul _x005F_x0041_</t></si></sst>`,
      "xl/worksheets/glossary.xml": `<worksheet xmlns="${ns}"><sheetData><row r="1">${cell("A1", "source")}${cell("B1", "target")}${cell("C1", "notes")}</row><row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>1</v></c>${cell("C2", "Line_x000A_break")}</row><row r="3"><c r="A3" t="str"><f>CONCAT(&quot;cached&quot;)</f><v>cached</v></c>${cell("B3", "Do not import formula")}</row><row r="4">${cell("A4", "Quoted &quot;text&quot;")}${cell("B4", "Target, with comma")}</row></sheetData></worksheet>`
    };
    const run = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const bytes = await writeExcelEntries(entries);
    await run(async (input) => {
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      const api = window.CatHan;
      const options = { sourceLang: "ja", targetLang: "tr", termBaseName: "Glossary" };
      const terms = await api.termbase.parseTermWorkbook(new Uint8Array(input), options);
      check(terms.length === 2, "legacy glossary must skip formula rows");
      check(terms[0].sourceTerm === "東京" && terms[0].targetTerm === "İstanbul _x0041_", "legacy glossary phonetics/escape fidelity");
      check(terms[0].notes === "Line\nbreak", "legacy glossary Excel newline escape");
      const service = ResourceTransfer.createResourceTransferService({ storage: api.storage, tm: api.tm, termbase: api.termbase, tmx: {}, tbx: {}, project: { createResource: async () => ({}) } });
      const preview = await service.prepareImport(new File([new Uint8Array(input)], "glossary.xlsx"), { type: "tb", name: "Glossary", sourceLang: "ja", targetLang: "tr" });
      check(!preview.validation.errors.length && preview.rows.length === 2, "resource glossary preview");
      check(preview.rows[0].sourceTerm === "東京" && preview.rows[0].targetTerm === "İstanbul _x0041_" && preview.rows[0].notes === "Line\nbreak", "resource glossary phonetics/escape fidelity");
      const resource = { name: "Glossary", sourceLang: "ja", targetLang: "tr" };
      for (const format of ["csv", "tsv"]) {
        const output = service.exportEntries("tb", resource, preview.rows, format);
        const again = await service.prepareImport(new File([output.content], output.filename), { type: "tb", ...resource });
        check(again.rows.length === 2 && again.rows.every((row, index) => row.sourceTerm === preview.rows[index].sourceTerm && row.targetTerm === preview.rows[index].targetTerm && row.notes === preview.rows[index].notes), `${format} resource round trip preserves quotes, delimiters, Unicode and multiline notes`);
      }
      for (const parse of [() => api.termbase.parseTermList('source,target\n"unterminated,target', { ...options, fileName: "broken.csv" }), () => ResourceTransfer.readDelimitedResourceRows('source,target\n"unterminated,target', "broken.csv")]) {
        let rejected = false; try { parse(); } catch { rejected = true; }
        check(rejected, "unclosed glossary CSV quote must be rejected");
      }
    }, Array.from(bytes));
    const broken = { ...entries, "xl/worksheets/glossary.xml": entries["xl/worksheets/glossary.xml"].replace("<v>0</v>", "<v>99</v>") };
    await run(async (input) => {
      const api = window.CatHan;
      const service = ResourceTransfer.createResourceTransferService({ storage: api.storage, tm: api.tm, termbase: api.termbase, tmx: {}, tbx: {}, project: { createResource: async () => ({}) } });
      for (const parse of [() => api.termbase.parseTermWorkbook(new Uint8Array(input), { sourceLang: "ja", targetLang: "tr", termBaseName: "Glossary" }), () => service.prepareImport(new File([new Uint8Array(input)], "broken.xlsx"), { type: "tb", name: "Glossary", sourceLang: "ja", targetLang: "tr" })]) {
        let rejected = false; try { await parse(); } catch { rejected = true; }
        if (!rejected) throw new Error("Invalid shared-string reference must be rejected");
      }
    }, Array.from(await writeExcelEntries(broken)));
    console.log("PASS: glossary XLSX legacy/resource routes; CSV/TSV round trips; phonetics, Excel escapes, formulas, malformed input.");
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1); }
});
