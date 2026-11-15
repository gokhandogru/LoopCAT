/* Real browser XML/ZIP round trips, isolated from the user's workspace. */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { multilingualExcelEntries, readExcelEntries, writeExcelEntries } = require("../tests/fixtures/multilingual-excel.cjs");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename], {
    cwd: root,
    stdio: "inherit",
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"))
  });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `multilingual-excel-parser-${process.pid}`));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
let win;
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("about:blank");
    await win.webContents.executeJavaScript("window.CatHan = {};");
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, "localization.js"), "utf8"));
    const entries = multilingualExcelEntries();
    const bytes = await writeExcelEntries(entries);
    const run = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const output = await run(async (input) => {
      const check = (value, message) => { if (!value) throw new Error(message); };
      const api = window.CatHan.localization;
      const file = new File([new Uint8Array(input)], "multilingual.xlsx");
      const mapping = { sheetPath: "xl/worksheets/multilingual.xml", sourceColumn: "B", targetColumn: "D", firstRowIsHeader: true, importExistingTargets: true };
      const inspected = await api.inspectMultilingualExcel(file);
      check(inspected.sheets.length === 2 && inspected.sheets[0].name === "Languages & notes", "Workbook relationship names");
      check(inspected.sheets[1].hidden && inspected.sheets[1].path === "xl/worksheets/sheet2.xml", "Hidden sheet/root-relative relationships");
      check(inspected.sheets[0].columns[1].label === "English" && inspected.sheets[0].previewRows[1].cells.B === "Hello world", "Column labels and rich/shared preview");
      const parsed = await api.parseLocalizationFile(file, { multilingualExcel: mapping });
      check(parsed.segments.length === 7, "Only selected text rows should import");
      check(parsed.segments[0].target === "Merhaba" && parsed.segments[0].status === "draft", "Existing target/status");
      check(parsed.segments[1].text === "Hello world" && parsed.segments[1].status === "empty", "Duplicate source/absent target");
      check(parsed.segments[2].text === "Multi\nline <literal> &", "One multiline cell is one segment");
      check(parsed.segments[4].text === "Literal _x0041_ and CR \r", "Excel escape decoding");
      check(parsed.segments[0].structure.key.endsWith("#B2"), "Source-update stable row identity");
      const skipped = parsed.structure.multilingualExcel.skippedRows;
      check(skipped.emptySource === 1 && skipped.nonTextSource === 2 && skipped.nonTextTarget === 2 && skipped.mergedCells === 2, "Skipped row counts");
      const untouched = await api.buildLocalizationFile("xlsx", parsed.segments, parsed.structure);
      check(untouched.length === input.length && untouched.every((value, index) => value === input[index]), "Unedited workbook should return original bytes");
      const withoutTargets = await api.parseLocalizationFile(file, { multilingualExcel: { ...mapping, importExistingTargets: false } });
      check(withoutTargets.segments.every((segment) => segment.target === "" && segment.status === "empty"), "Ignore existing targets");
      const withHeader = await api.parseLocalizationFile(file, { multilingualExcel: { ...mapping, firstRowIsHeader: false } });
      check(withHeader.segments.length === 8 && withHeader.segments[0].text === "English", "Header switch");
      const freshColumn = await api.parseLocalizationFile(file, { multilingualExcel: { ...mapping, targetColumn: "AA" } });
      check(freshColumn.segments.every((segment) => segment.target === ""), "Blank column beyond current range");
      for (const invalid of [{ ...mapping, sourceColumn: "D" }, { ...mapping, targetColumn: "XFE" }, { ...mapping, sheetPath: "xl/missing.xml" }]) {
        let rejected = false;
        try { await api.parseLocalizationFile(file, { multilingualExcel: invalid }); } catch { rejected = true; }
        check(rejected, "Invalid mapping must reject");
      }
      const translated = ["New & <literal>", "New missing target", " One\ncell\rwith _x0041_ ", "", "Escaped _x005F_", "=SUM(1,2)", "New repeated target"];
      parsed.segments.forEach((segment, index) => { segment.target = translated[index]; });
      const serializedStructure = JSON.parse(JSON.stringify(parsed.structure));
      const outputBytes = await api.buildLocalizationFile("xlsx", parsed.segments, serializedStructure);
      const reparsed = await api.parseLocalizationFile(new File([outputBytes], "again.xlsx"), { multilingualExcel: mapping });
      check(reparsed.segments.every((segment, index) => segment.target === translated[index]), "Translations must round-trip exactly as literal text");
      check(reparsed.segments.every((segment, index) => segment.text === parsed.segments[index].text), "Source text must be unchanged");
      for (const mutation of [
        (segments) => { segments[0].structure.targetCell = "C2"; },
        (segments) => { segments.push({ ...segments[0] }); },
        (segments) => { segments[0].target = "a".repeat(32768); }
      ]) {
        const copy = JSON.parse(JSON.stringify(parsed.segments));
        mutation(copy);
        let rejected = false;
        try { await api.buildLocalizationFile("xlsx", copy, parsed.structure); } catch { rejected = true; }
        check(rejected, "Unsafe export mappings/oversized cells must reject");
      }
      const farColumnBytes = await api.buildLocalizationFile("xlsx", freshColumn.segments.map((segment) => ({ ...segment, target: "Far column" })), freshColumn.structure);
      const ordinary = await api.parseLocalizationFile(file);
      check(!ordinary.structure.multilingualExcel && ordinary.segments.length > 0, "Standard Excel import remains available");
      return { bytes: Array.from(outputBytes), farColumnBytes: Array.from(farColumnBytes) };
    }, Array.from(bytes));
    const restored = await readExcelEntries(output.bytes);
    assert.deepEqual(Object.keys(restored).sort(), Object.keys(entries).sort(), "All package entries retained");
    for (const [name, text] of Object.entries(entries)) {
      if (name !== "xl/worksheets/multilingual.xml") assert.equal(restored[name], text, `Untouched package entry: ${name}`);
    }
    const farColumn = await readExcelEntries(output.farColumnBytes);
    await run((before, after, extended) => {
      const parse = (xml) => new DOMParser().parseFromString(xml, "application/xml");
      const check = (value, message) => { if (!value) throw new Error(message); };
      const a = parse(before), b = parse(after), c = parse(extended);
      const text = (xml, reference) => xml.querySelector(`c[r="${reference}"]`);
      for (const cell of a.querySelectorAll("c")) {
        if (["D2", "D4", "D12", "D13", "D14", "D15"].includes(cell.getAttribute("r"))) continue;
        check(cell.isEqualNode(text(b, cell.getAttribute("r"))), "Unselected cell changed: " + cell.getAttribute("r"));
      }
      check(text(b, "D2").getAttribute("s") === "1" && text(b, "D4").getAttribute("s") === "1", "Target styles retained");
      check(text(b, "D3").nextElementSibling.getAttribute("r") === "E3", "New target inserted in column order");
      check(text(b, "D14").getAttribute("t") === "inlineStr" && !text(b, "D14").querySelector("f"), "Formula-like target stays literal");
      check(c.querySelector("dimension").getAttribute("ref") === "A1:AA15", "Used-range expansion");
      check(a.querySelector("cols").isEqualNode(b.querySelector("cols")) && a.querySelector("sheetViews").isEqualNode(b.querySelector("sheetViews")), "Widths and freeze panes retained");
    }, entries["xl/worksheets/multilingual.xml"], restored["xl/worksheets/multilingual.xml"], farColumn["xl/worksheets/multilingual.xml"]);
    const sparseEntries = {
      ...entries,
      "xl/worksheets/multilingual.xml": '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="AA5:AE7"/><sheetData><row r="5"><c r="AA5" t="inlineStr"><is><t>First sparse source</t></is></c><c r="AC5" t="inlineStr"><is><t>Keep left</t></is></c><c r="AE5" t="inlineStr"><is><t>Keep right</t></is></c></row><row><c r="AA6" t="inlineStr"><is><t>Inferred row reference</t></is></c></row><row r="7"><c r="AA7" t="inlineStr"><is><t>Last sparse source</t></is></c><c r="AD7" t="inlineStr"><is><t>Existing sparse target</t></is></c></row></sheetData></worksheet>'
    };
    await run(async (input) => {
      const check = (value, message) => { if (!value) throw new Error(message); };
      const api = window.CatHan.localization;
      const file = new File([new Uint8Array(input)], "sparse.xlsx");
      const mapping = { sheetPath: "xl/worksheets/multilingual.xml", sourceColumn: "AA", targetColumn: "AD", firstRowIsHeader: true };
      const inspected = await api.inspectMultilingualExcel(file);
      check(inspected.sheets[0].columns[26].letter === "AA" && inspected.sheets[0].columns[26].label === "", "A missing row 1 must not borrow sparse content as a header");
      check(inspected.sheets[0].previewRows[0].rowNumber === 5 && inspected.sheets[0].previewRows[0].cells.AA === "First sparse source", "Preview must support columns after Z");
      const parsed = await api.parseLocalizationFile(file, { multilingualExcel: mapping });
      check(parsed.segments.length === 3 && parsed.segments[0].text === "First sparse source", "Header selection must not skip actual row 5 when row 1 is absent");
      check(parsed.segments[1].structure.sourceCell === "AA6", "Omitted row reference must infer row 6");
      const output = await api.buildLocalizationFile("xlsx", parsed.segments.map((segment) => ({ ...segment, target: "Sparse translation" })), parsed.structure);
      const restored = await api.parseLocalizationFile(new File([output], "again.xlsx"), { multilingualExcel: mapping });
      check(restored.segments.length === 3 && restored.segments.every((segment) => segment.target === "Sparse translation"), "Sparse rows and later columns must round-trip without shifts");
    }, Array.from(await writeExcelEntries(sparseEntries)));
    console.log("Multilingual Excel parser: mapping, literal text, skipped rows, full-workbook preservation and target-only round trips passed.");
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
