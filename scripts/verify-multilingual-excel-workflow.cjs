/* Multilingual Excel regression through the hidden, isolated production renderer. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { ZipWriter, Uint8ArrayWriter, TextReader, ZipReader, Uint8ArrayReader, TextWriter } = require("@zip.js/zip.js");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename, ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"))
  });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `multilingual-excel-profile-${process.pid}`));
app.disableHardwareAcceleration();
if (process.platform === "linux") app.commandLine.appendSwitch("disable-dev-shm-usage");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
let server, win;
const evaluate = async (source) => {
  try {
    return await win.webContents.executeJavaScript(source, true);
  } catch (error) {
    throw new Error(`${error.message}\nRenderer expression: ${source.slice(0, 300)}`, { cause: error });
  }
};
const run = async (fn, ...args) => {
  const result = await evaluate(
    `Promise.resolve().then(()=>(${fn.toString()})(...${JSON.stringify(args)})).catch(error=>({__workflowError:error.stack||error.message}))`
  );
  if (result?.__workflowError) throw new Error(result.__workflowError);
  return result;
};
async function wait(expression, label) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Timed out: " + label);
}
async function checkVisibleActions() {
  await run(() => {
    const buttons = [...document.querySelectorAll("#multilingualExcelImportDialog .excel-column-actions button")];
    if (buttons.length !== 3) throw Error("Mapping action buttons missing");
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth)
        throw Error("Mapping action requires scrolling or is clipped: " + button.textContent);
    }
  });
}
const click = (selector, label) =>
  run(
    (scope, text) => {
      const button = [...document.querySelectorAll(`${scope} button`)].find((b) => b.textContent === text);
      if (!button) throw Error("Missing button: " + text);
      button.click();
    },
    selector,
    label
  );

async function fixture(updated = false) {
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const cell = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const entries = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Strings" sheetId="1" r:id="rId1"/><sheet name="Reference" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/sharedStrings.xml": `<sst xmlns="${ns}" count="3" uniqueCount="2"><si><t>${updated ? "Updated hello" : "Hello"}</t></si><si><t>Merhaba</t></si></sst>`,
    "xl/styles.xml": `<styleSheet xmlns="${ns}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf applyAlignment="1"><alignment wrapText="1"/></xf></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${ns}"><dimension ref="A1:E7"/><cols><col min="2" max="4" width="28" customWidth="1"/></cols><sheetData><row r="1">${cell("A1", "ID")}${cell("B1", "English")}${cell("C1", "French")}${cell("D1", "Turkish")}${cell("E1", "Calculation")}</row><row r="2">${cell("A2", "hello.id")}<c r="B2" t="s"><v>0</v></c>${cell("C2", "Bonjour")}<c r="D2" s="1" t="s"><v>1</v></c><c r="E2"><f>1+1</f><v>2</v></c></row><row r="3">${cell("A3", "new.id")}${cell("B3", "Missing target")}${cell("C3", "Autre langue")}<c r="E3"><f>2+2</f><v>4</v></c></row><row r="4">${cell("B4", "Keep empty")}${cell("D4", "")}</row><row r="5">${cell("B5", " ")}${cell("D5", "Keep without source")}</row><row r="6">${cell("B6", "Do not overwrite formula")}<c r="D6"><f>3+3</f><v>6</v></c></row><row r="7"><c r="B7"><v>123</v></c>${cell("D7", "Keep numeric row")}</row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet xmlns="${ns}"><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c>${cell("B1", "Untouched reference")}</row></sheetData></worksheet>`,
    "customXml/item1.xml": "<metadata>Untouched customer metadata</metadata>"
  };
  const writer = new ZipWriter(new Uint8ArrayWriter());
  for (const [name, content] of Object.entries(entries)) await writer.add(name, new TextReader(content));
  return { bytes: Array.from(await writer.close()), entries };
}

async function workbookEntries(bytes) {
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)));
  try {
    const entries = {};
    for (const entry of await reader.getEntries()) entries[entry.filename] = await entry.getData(new TextWriter());
    return entries;
  } finally {
    await reader.close();
  }
}

async function checkWorkbook(bytes, original) {
  const entries = await workbookEntries(bytes);
  assert.deepEqual(Object.keys(entries).sort(), Object.keys(original).sort(), "Workbook parts were lost");
  for (const [name, value] of Object.entries(original)) {
    if (name !== "xl/worksheets/sheet1.xml") assert.equal(entries[name], value, "Unselected part changed: " + name);
  }
  await run(
    (xml, originalXml) => {
      const trusted = window.CatHan.appRuntime.safeHtml.trusted;
      const document = new DOMParser().parseFromString(trusted(xml), "application/xml");
      const before = new DOMParser().parseFromString(trusted(originalXml), "application/xml");
      const cell = (ref) =>
        [...document.getElementsByTagNameNS("*", "c")].find((item) => item.getAttribute("r") === ref);
      const text = (ref) => cell(ref)?.textContent || "";
      if (document.getElementsByTagName("parsererror").length) throw Error("Exported worksheet is not valid XML");
      const edited = new Set(["D2", "D3", "D4"]),
        serializer = new XMLSerializer();
      for (const originalCell of before.getElementsByTagNameNS("*", "c")) {
        const ref = originalCell.getAttribute("r");
        if (!edited.has(ref) && serializer.serializeToString(originalCell) !== serializer.serializeToString(cell(ref)))
          throw Error("Unselected or skipped cell changed: " + ref);
      }
      if (text("D3") !== "Yeni çeviri & metin") throw Error("Translation was not written into D3");
      if (text("D4").trim()) throw Error("An untranslated target was filled with source text");
      if (text("B3") !== "Missing target" || text("B4") !== "Keep empty") throw Error("Source cells changed");
      if (text("C2") !== "Bonjour" || text("A3") !== "new.id") throw Error("Other columns changed");
      if (text("D5") !== "Keep without source" || text("D7") !== "Keep numeric row")
        throw Error("Skipped rows changed");
      if (cell("D6").getElementsByTagNameNS("*", "f")[0]?.textContent !== "3+3") throw Error("Target formula changed");
      if (cell("E3").getElementsByTagNameNS("*", "f")[0]?.textContent !== "2+2")
        throw Error("Other column formula changed");
      if (cell("D2").getAttribute("s") !== "1") throw Error("Target cell style changed");
      if (text("D1") !== "Turkish") throw Error("Header changed");
    },
    entries["xl/worksheets/sheet1.xml"],
    original["xl/worksheets/sheet1.xml"]
  );
}

app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  try {
    const production = path.join(root, ".cache/renderer/production");
    server = http.createServer((req, res) => {
      const relative = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html";
      const resolved = path.resolve(root, relative);
      if (!resolved.startsWith(root + path.sep)) return res.writeHead(403).end();
      const generated = path.join(production, relative);
      try {
        res.setHeader(
          "Content-Type",
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".svg": "image/svg+xml",
            ".png": "image/png"
          }[path.extname(relative)] || "application/octet-stream"
        );
        res.end(fs.readFileSync(fs.existsSync(generated) ? generated : resolved));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    win = new BrowserWindow({
      show: false,
      width: 1360,
      height: 960,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
    await wait("!!document.querySelector('#statisticsBtn')", "startup");
    await evaluate("document.querySelector('#newProjectBtn').click()");
    await wait("document.querySelector('#projectDialog').open", "project dialog");
    await evaluate(
      "document.querySelector('#projectNameInput').value='Multilingual Excel verification'; document.querySelector('#sourceLangInput').value='en-GB'; document.querySelector('#targetLangInput').value='tr-TR'; document.querySelector('#projectForm').requestSubmit()"
    );
    await wait(
      "!document.querySelector('#projectDialog').open && !document.querySelector('#projectHomeView').classList.contains('hidden')",
      "project created"
    );
    const initial = await fixture();
    await run((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], "multilingual.xlsx"));
      const input = document.querySelector("#projectFileImportInput");
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, initial.bytes);
    await wait(
      "document.querySelector('#batchImportDialog').open && !document.querySelector('#batchImportDialog button').disabled",
      "batch review"
    );
    await click("#batchImportDialog", "Columns…");
    await wait("document.querySelector('#multilingualExcelImportDialog')?.open", "Excel mapping window");
    await run(() => {
      const source = document.querySelector("#excelImportSource"),
        target = document.querySelector("#excelImportTarget");
      source.value = "B";
      source.dispatchEvent(new Event("change"));
      target.value = "D";
      target.dispatchEvent(new Event("input"));
      if (
        !document.querySelector("#excelImportHeader").checked ||
        !document.querySelector("#excelImportExisting").checked
      )
        throw Error("Expected header and existing-target defaults");
      if (!document.querySelector("#multilingualExcelImportDialog").textContent.includes("Hello"))
        throw Error("Workbook preview missing");
    });
    await evaluate(require("axe-core").source);
    const axe = await evaluate(
      "axe.run(document.querySelector('#multilingualExcelImportDialog'), {runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})"
    );
    assert.equal(
      axe.violations.filter((v) => ["serious", "critical"].includes(v.impact)).length,
      0,
      JSON.stringify(axe.violations)
    );
    await checkVisibleActions();
    const evidence = path.join(root, "tmp", "multilingual-excel-verification");
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, "column-mapping.png"), (await win.webContents.capturePage()).toPNG());
    win.setSize(520, 850);
    await evaluate("document.documentElement.dir='rtl'; new Promise(resolve=>requestAnimationFrame(resolve))");
    assert.equal(
      await evaluate(
        "document.querySelector('#multilingualExcelImportDialog').getBoundingClientRect().width > innerWidth + 1"
      ),
      false,
      "Mapping dialog exceeds narrow viewport"
    );
    await checkVisibleActions();
    fs.writeFileSync(
      path.join(evidence, "column-mapping-narrow-rtl.png"),
      (await win.webContents.capturePage()).toPNG()
    );
    win.setSize(1360, 960);
    await evaluate("document.documentElement.dir='ltr'");
    if (process.argv.includes("--visual-only")) {
      console.log(
        "Multilingual Excel mapping visual checks passed: desktop and narrow RTL, visible action buttons, accessibility."
      );
      app.exit(0);
      return;
    }
    await click("#multilingualExcelImportDialog", "Use these columns");
    await wait("!document.querySelector('#multilingualExcelImportDialog')?.open", "mapping accepted");
    await click("#batchImportDialog", "Import ready files");
    await wait(
      "document.querySelector('#batchImportDialog [role=status]').textContent.includes('1 imported')",
      "mapped workbook imported"
    );
    await run(async () => {
      const api = window.CatHan,
        project = (await api.storage.getAll("projects"))[0];
      const document = project.documents[0],
        segments = await api.project.getProjectSegments(project.id);
      if (
        segments.length !== 3 ||
        segments[0].source !== "Hello" ||
        segments[0].target !== "Merhaba" ||
        segments[0].status !== "draft" ||
        segments[1].status !== "empty"
      )
        throw Error("Mapped import included other cells or lost existing target/status");
      if (
        document.importOptions.multilingualExcel?.sourceColumn !== "B" ||
        document.importOptions.multilingualExcel?.targetColumn !== "D"
      )
        throw Error("Mapping was not saved with document");
      const plan = api.validation.planDeliveryExport({
        format: "xlsx",
        structure: project.localizationStructures[document.id],
        segments
      });
      if (plan.policy !== "preserve-empty" || plan.preservedEmptyTargetCount !== 2)
        throw Error("Mapped Excel uses source fallback");
    });
    await click("#batchImportDialog", "Close");
    await evaluate("document.querySelector('#projectFileList .file-open').click()");
    await wait("document.querySelectorAll('#segmentBody .target-editor').length===3", "editor opened");
    await run(() => {
      const editor = document.querySelectorAll("#segmentBody .target-editor")[1];
      editor.focus();
      editor.value = "Yeni çeviri & metin";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      editor.blur();
    });
    await wait(
      "window.CatHan.storage.getAll('segments').then(rows=>rows.some(s=>s.target==='Yeni çeviri & metin'))",
      "translation saved"
    );
    await evaluate(
      "window.confirm=()=>true; window.__excelDownload=null; const originalCreate=URL.createObjectURL.bind(URL); URL.createObjectURL=(blob)=>{window.__excelDownload=blob; return originalCreate(blob)}; document.addEventListener('click',event=>{if(event.target.closest?.('a[download]'))event.preventDefault()},true); document.querySelector('#exportLocalizationBtn').click()"
    );
    await wait("!!window.__excelDownload", "Excel delivery action");
    const output = await evaluate(
      "window.__excelDownload.arrayBuffer().then(buffer=>Array.from(new Uint8Array(buffer)))"
    );
    await checkWorkbook(output, initial.entries);
    const updated = await fixture(true);
    await evaluate("document.querySelector('#projectFileList [data-file-action=update]').click()");
    await wait("document.querySelector('#fileManagementDialog input[type=file]')", "source update picker");
    await run((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], "replacement.xlsx"));
      const input = document.querySelector("#fileManagementDialog input[type=file]");
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, updated.bytes);
    await wait(
      "document.querySelector('#fileManagementTitle').textContent==='Review source update'",
      "mapped source comparison"
    );
    await evaluate(
      "[...document.querySelectorAll('#fileManagementDialog button')].find(b=>b.textContent==='Use incoming for all conflicts')?.click(); [...document.querySelectorAll('#fileManagementDialog button')].find(b=>b.textContent==='Apply source update').click()"
    );
    await wait("!document.querySelector('#fileManagementDialog').open", "source update committed");
    await run(async () => {
      const api = window.CatHan,
        project = (await api.storage.getAll("projects"))[0];
      const doc = project.documents[0],
        segments = await api.project.getProjectSegments(project.id);
      if (
        doc.sourceRevision !== 2 ||
        doc.importOptions.multilingualExcel?.targetColumn !== "D" ||
        segments.length !== 3 ||
        segments[0].source !== "Updated hello"
      )
        throw Error("Source update lost mapping or imported all cells");
      if (!segments.some((s) => s.target === "Yeni çeviri & metin"))
        throw Error("Source update lost saved translation");
      if (!(await api.storage.getAll("documentVersions")).some((v) => v.documentId === doc.id))
        throw Error("Prior workbook version missing");
    });
    await evaluate(
      "window.__excelDownload=null; window.showSaveFilePicker=undefined; document.querySelector('#projectPackageExportBtn').click()"
    );
    await wait("window.__excelDownload?.type==='application/zip'", "project package exported");
    await run(async () => {
      const api = window.CatHan;
      window.__excelPackage = window.__excelDownload;
      const { value: pkg } = await api.archive.readPackage(window.__excelPackage);
      const report = api.validation.validateProjectPackage(pkg);
      if (!report.ok) throw Error("Invalid Excel project package: " + JSON.stringify(report));
      const doc = pkg.project.documents[0];
      if (
        doc.importOptions.multilingualExcel?.sourceColumn !== "B" ||
        !pkg.project.localizationStructures[doc.id].packageBase64
      )
        throw Error("Package lost mapping or original workbook");
      window.confirm = (message) => !message.includes("Replace it with this package?");
      const transfer = new DataTransfer();
      transfer.items.add(new File([window.__excelPackage], "mapped.loopcat.zip"));
      const input = document.querySelector("#projectPackageImportInput");
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await wait("window.CatHan.storage.getAll('projects').then(rows=>rows.length===2)", "package restored as copy");
    const restored = await run(async () => {
      const api = window.CatHan,
        project = (await api.storage.getAll("projects")).find((p) => p.name.endsWith("(copy)"));
      const doc = project.documents[0],
        segments = await api.project.getProjectSegments(project.id);
      if (doc.importOptions.multilingualExcel?.targetColumn !== "D" || segments.length !== 3)
        throw Error("Restored package lost mapping or segments");
      const result = await api.localization.buildLocalizationFile(
        "xlsx",
        segments,
        project.localizationStructures[doc.id]
      );
      return Array.from(new Uint8Array(await new Blob([result]).arrayBuffer()));
    });
    await checkWorkbook(restored, updated.entries);
    await win.reload();
    await wait("!!document.querySelector('#statisticsBtn')", "reload");
    await run(async () => {
      const api = window.CatHan,
        projects = await api.storage.getAll("projects"),
        segments = await api.storage.getAll("segments");
      if (
        projects.length !== 2 ||
        projects.some((p) => p.documents[0].importOptions.multilingualExcel?.targetColumn !== "D") ||
        segments.filter((s) => s.target === "Yeni çeviri & metin").length !== 2
      )
        throw Error("Reload lost mapping or translation");
      const backup = await api.storage.exportAllData();
      if (!api.validation.validateBackupFile(backup).ok) throw Error("Mapped Excel backup is invalid");
    });
    console.log(
      "Multilingual Excel workflow passed: UI mapping B→D, preview, draft targets, saved edit, original-format export, untouched workbook parts, empty targets, source update, package import, reload, backup, accessibility, narrow RTL."
    );
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    if (win)
      console.error(
        await Promise.race([
          evaluate("document.body?.innerText.slice(-4500)").catch(() => ""),
          new Promise((resolve) => setTimeout(() => resolve("Renderer diagnostics unavailable."), 1000))
        ])
      );
    app.exit(1);
  } finally {
    server?.close();
  }
});
