/* TMX project-document regression in a hidden, isolated production renderer. */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename], {
    cwd: root,
    stdio: "inherit",
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"))
  });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `tmx-profile-${process.pid}`));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
let server, win;
const evaluate = (source) => win.webContents.executeJavaScript(source, true);
const run = (fn, ...args) => evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
async function wait(expression, label) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Timed out: " + label);
}
const click = (text) =>
  run((label) => {
    const button = [...document.querySelectorAll("#batchImportDialog button")].find((b) => b.textContent === label);
    if (!button) throw Error("Missing button: " + label);
    button.click();
  }, text);

async function parserChecks() {
  const assert = (value, message) => {
    if (!value) throw Error(message);
  };
  const api = window.CatHan.localization;
  const options = { sourceLang: "en-GB", targetLang: "tr-TR" };
  const fixture = `<?xml version="1.0" encoding="UTF-8"?>
    <tmx version="1.4"><header srclang="*all*"/><body>
    <tu tuid="same"><prop type="domain">Test metadata</prop><tuv xml:lang="fr"><seg>Bonjour</seg></tuv>
      <tuv xml:lang="tr-TR"><seg> Merhaba &amp; dünya </seg></tuv><tuv xml:lang="en-GB"><seg> Hello &amp; world </seg></tuv></tu>
    <tu tuid="same"><tuv xml:lang="en"><seg>Missing target</seg></tuv></tu>
    <tu><tuv xml:lang="en-GB"><seg>Empty target</seg></tuv><tuv xml:lang="tr"><seg> </seg></tuv></tu>
    <tu><tuv xml:lang="en"><seg>Repeat</seg></tuv><tuv xml:lang="tr"><seg>Tekrar</seg></tuv></tu>
    <tu><tuv xml:lang="en"><seg>Repeat</seg></tuv><tuv xml:lang="tr"><seg>Yine</seg></tuv></tu>
    <tu><tuv xml:lang="en"><seg> </seg></tuv><tuv xml:lang="tr"><seg>Boş</seg></tuv></tu>
    </body></tmx>`;
  const parse = (text, settings = options) => api.parseLocalizationFile(new File([text], "sample.TMX"), settings);
  const parsed = await parse(fixture);
  assert(parsed.segments.length === 5, "TMX must retain duplicate units and skip only blank sources");
  assert(
    parsed.segments[0].text === " Hello & world " && parsed.segments[0].target === " Merhaba & dünya ",
    "Language order, entities or whitespace lost"
  );
  assert(parsed.segments.map((s) => s.status).join() === "draft,empty,empty,draft,draft", "Draft and empty statuses");
  const confirmed = await parse(fixture, { ...options, importedTranslationStatus: "confirmed" });
  assert(
    confirmed.segments.map((s) => s.status).join() === "confirmed,empty,empty,confirmed,confirmed",
    "Confirmed choice changed empty targets"
  );
  const edited = parsed.segments.map((s, i) => ({
    ...s,
    source: s.text,
    target: i === 1 ? "Yeni <literal> & metin" : s.target
  }));
  const output = await api.buildLocalizationFile("tmx", edited, parsed.structure);
  const restored = await parse(output);
  assert(restored.segments[1].target === edited[1].target, "New target or literal XML characters lost");
  assert(
    restored.segments[0].text === parsed.segments[0].text &&
      output.includes("Bonjour") &&
      output.includes("Test metadata"),
    "Source, other language or metadata changed"
  );
  const reversed = await parse(
    fixture
      .replace(/<tu tuid="same"><tuv xml:lang="en"><seg>Missing target<\/seg><\/tuv><\/tu>/, "")
      .replace(/<tu><tuv xml:lang="en"><seg> <\/seg><\/tuv><tuv xml:lang="tr"><seg>Boş<\/seg><\/tuv><\/tu>/, ""),
    { sourceLang: "tr", targetLang: "en" }
  );
  assert(
    reversed.segments[0].text === " Merhaba & dünya " && reversed.segments[0].target === " Hello & world ",
    "Reversed project pair"
  );
  const inline =
    '<tmx version="1.4"><header srclang="en"/><body><tu><tuv xml:lang="en"><seg>A &amp; <bpt i="1">&lt;b&gt;</bpt>bold<ept i="1">&lt;/b&gt;</ept><hi type="bold"> &amp; hi</hi></seg></tuv><tuv xml:lang="tr"><seg>B &amp; <bpt i="1">&lt;b&gt;</bpt>kalın<ept i="1">&lt;/b&gt;</ept><hi type="bold"> &amp; merhaba</hi></seg></tuv></tu></body></tmx>';
  const tags = await parse(inline);
  tags.segments[0].target = tags.segments[0].target.replace("kalın", "yeni kalın");
  const tagsAgain = await parse(await api.buildLocalizationFile("tmx", tags.segments, tags.structure));
  assert(tagsAgain.segments[0].target === tags.segments[0].target, "Inline codes or ampersands lost on reconstruction");
  const namespaced = await parse(
    '<m:tmx xmlns:m="urn:tmx"><m:body><m:tu><m:tuv xml:lang="EN_gb"><m:seg>Hi</m:seg></m:tuv></m:tu></m:body></m:tmx>'
  );
  namespaced.segments[0].target = "Selam";
  assert(
    (await parse(await api.buildLocalizationFile("tmx", namespaced.segments, namespaced.structure))).segments[0]
      .target === "Selam",
    "Namespaced missing target reconstruction"
  );
  const regional = fixture.replace(
    '<tuv xml:lang="en-GB"><seg> Hello',
    '<tuv xml:lang="en-US"><seg>Other locale</seg></tuv><tuv xml:lang="en-GB"><seg> Hello'
  );
  assert((await parse(regional)).segments[0].text === " Hello & world ", "Exact locale must win");
  for (const [input, settings, pattern] of [
    ["<tmx><body>", options, /valid XML/],
    ["<other><body/></other>", options, /root/],
    [fixture, { sourceLang: "de", targetLang: "tr" }, /no source variant/],
    [regional, { sourceLang: "en", targetLang: "tr" }, /ambiguous/],
    [fixture, { ...options, importedTranslationStatus: "invalid" }, /Draft or Confirmed/]
  ]) {
    let rejected = false;
    try {
      await parse(input, settings);
    } catch (error) {
      rejected = pattern.test(error.message);
    }
    assert(rejected, "Expected rejection: " + pattern);
  }
  const utf16 = new Uint8Array(2 + fixture.length * 2);
  utf16.set([255, 254]);
  const view = new DataView(utf16.buffer);
  for (let i = 0; i < fixture.length; i++) view.setUint16(2 + i * 2, fixture.charCodeAt(i), true);
  const decoded = await api.parseLocalizationFile(new File([utf16], "utf16.tmx"), options);
  assert(decoded.segments[0].target === parsed.segments[0].target, "UTF-16 import");
  const plan = window.CatHan.validation.planDeliveryExport({ format: "tmx", segments: parsed.segments });
  assert(
    plan.policy === "preserve-empty" && plan.preservedEmptyTargetCount === 2,
    "TMX delivery must preserve missing targets"
  );
  return fixture;
}

app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  try {
    const production = path.join(root, ".cache/renderer/production");
    server = http.createServer((req, res) => {
      const relative = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html";
      const resolved = path.resolve(root, relative);
      if (!resolved.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
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
    const fixture = await run(parserChecks);
    await evaluate("document.querySelector('#newProjectBtn').click()");
    await wait("document.querySelector('#projectDialog').open", "project dialog");
    await evaluate(
      "document.querySelector('#projectNameInput').value='TMX verification'; document.querySelector('#sourceLangInput').value='en-GB'; document.querySelector('#targetLangInput').value='tr-TR'; document.querySelector('#projectForm').requestSubmit()"
    );
    await wait(
      "!document.querySelector('#projectDialog').open && !document.querySelector('#projectHomeView').classList.contains('hidden')",
      "project created"
    );
    await run((text) => {
      const transfer = new DataTransfer();
      for (const [name, content] of [
        ["draft.TMX", text],
        ["confirmed.tmx", text],
        ["broken.tmx", "<tmx>"],
        ["plain.txt", "Ordinary document"]
      ])
        transfer.items.add(new File([content], name));
      const input = document.querySelector("#projectFileImportInput");
      if (!input.accept.includes(".tmx")) throw Error("TMX missing from project picker");
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, fixture);
    await wait(
      "document.querySelector('#batchImportDialog').open && !document.querySelector('#batchImportDialog button').disabled",
      "batch review"
    );
    await run(() => {
      const rows = [...document.querySelectorAll("#batchImportDialog tbody tr")];
      for (const row of rows) {
        const status = row.querySelector('select[aria-describedby="tmxImportHelp"]');
        if (row.textContent.includes(".tmx") || row.textContent.includes(".TMX")) {
          if (status?.value !== "draft") throw Error("TMX draft default missing");
        } else if (status) throw Error("Non-TMX file has TMX status choice");
        if (row.textContent.includes("confirmed.tmx")) {
          const check = row.querySelector('input[type="checkbox"]');
          check.checked = true;
          check.dispatchEvent(new Event("change"));
          status.value = "confirmed";
          status.dispatchEvent(new Event("change"));
        }
      }
    });
    await evaluate(require("axe-core").source);
    const axe = await evaluate(
      "axe.run(document.querySelector('#batchImportDialog'), {runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})"
    );
    if (axe.violations.some((v) => ["serious", "critical"].includes(v.impact)))
      throw Error(JSON.stringify(axe.violations));
    fs.mkdirSync(path.join(root, "output/tmx-verification"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "output/tmx-verification/import-review.png"),
      (await win.webContents.capturePage()).toPNG()
    );
    win.setSize(520, 850);
    await evaluate("document.documentElement.dir='rtl'; new Promise(resolve=>requestAnimationFrame(resolve))");
    if (await evaluate("document.querySelector('#batchImportDialog').getBoundingClientRect().width > innerWidth + 1"))
      throw Error("TMX import dialog overflows a narrow viewport");
    fs.writeFileSync(
      path.join(root, "output/tmx-verification/narrow-rtl.png"),
      (await win.webContents.capturePage()).toPNG()
    );
    win.setSize(1360, 960);
    await evaluate("document.documentElement.dir='ltr'");
    await click("Import ready files");
    await wait(
      "document.querySelector('#batchImportDialog [role=status]').textContent.includes('3 imported') && document.querySelector('#batchImportDialog [role=status]').textContent.includes('1 failed')",
      "mixed TMX import"
    );
    const persisted = await run(async () => {
      const api = window.CatHan;
      const projects = await api.storage.getAll("projects");
      const project = projects[0];
      const segments = await api.project.getProjectSegments(project.id);
      for (const [name, status] of [
        ["draft.TMX", "draft"],
        ["confirmed.tmx", "confirmed"]
      ]) {
        const doc = project.documents.find((d) => d.name === name);
        const rows = segments.filter((s) => s.documentId === doc?.id);
        if (
          rows.length !== 5 ||
          rows[0].target !== " Merhaba & dünya " ||
          rows[0].status !== status ||
          rows[1].status !== "empty"
        )
          throw Error("Stored bilingual text or status mismatch: " + name);
        if (doc.importOptions.importedTranslationStatus !== status) throw Error("Import setting lost");
        const report = api.validation.validateExportReadiness({
          project,
          segments: rows,
          documentInfo: doc,
          format: "tmx",
          structure: project.localizationStructures[doc.id]
        });
        if (!report.canExport) throw Error("TMX cannot export: " + JSON.stringify(report));
      }
      const backup = await api.storage.exportAllData();
      const report = api.validation.validateBackupFile(backup);
      if (!report.ok) throw Error("Invalid backup: " + JSON.stringify(report));
      const restored = await api.storage.importAllData(JSON.parse(JSON.stringify(backup)), { prepareOnly: true });
      if (restored.segments.filter((s) => s.status === "confirmed").length !== 3)
        throw Error("Backup lost confirmed status");
      if ((await api.storage.getAll("tmEntries")).length) throw Error("Project import unexpectedly populated the TM");
      return {
        documents: project.documents.length,
        segments: segments.length,
        confirmed: segments.filter((s) => s.status === "confirmed").length
      };
    });
    await click("Close");
    await run((text) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text.replace("Hello", "Legacy")], "other-formats.tmx"));
      const input = document.querySelector("#localizationInput");
      if (!input.accept.includes(".tmx")) throw Error("TMX missing from Other formats picker");
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, fixture);
    await wait(
      "document.querySelector('#batchImportDialog').open && !document.querySelector('#batchImportDialog button').disabled",
      "Other formats uses shared review"
    );
    await click("Import ready files");
    await wait(
      "document.querySelector('#batchImportDialog [role=status]').textContent.includes('1 imported')",
      "Other formats TMX import"
    );
    await click("Close");
    await evaluate(
      "window.confirm=()=>true; window.__tmxDownload=null; const originalCreate=URL.createObjectURL.bind(URL); URL.createObjectURL=(blob)=>{window.__tmxDownload=blob; return originalCreate(blob)}; document.addEventListener('click',event=>{if(event.target.closest?.('a[download]'))event.preventDefault()},true); document.querySelector('#exportLocalizationBtn').click()"
    );
    await wait("!!window.__tmxDownload", "TMX delivery action");
    const download = await evaluate("window.__tmxDownload.text()");
    if (!download.includes("<tmx") || !download.includes("Merhaba"))
      throw Error("TMX delivery did not reconstruct a bilingual file");
    await evaluate(
      "[...document.querySelectorAll('#projectFileList .file-card')].find(card=>card.querySelector('h4').textContent==='draft.TMX').querySelector('[data-file-action=update]').click()"
    );
    await wait("document.querySelector('#fileManagementDialog input[type=file]')", "source update picker");
    await run((text) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text.replace("Hello", "Updated hello")], "replacement.tmx"));
      const input = document.querySelector("#fileManagementDialog input[type=file]");
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, fixture);
    await wait(
      "document.querySelector('#fileManagementTitle').textContent==='Review source update'",
      "TMX source comparison"
    );
    await evaluate(
      "[...document.querySelectorAll('#fileManagementDialog button')].find(b=>b.textContent==='Use incoming for all conflicts')?.click(); [...document.querySelectorAll('#fileManagementDialog button')].find(b=>b.textContent==='Apply source update').click()"
    );
    await wait("!document.querySelector('#fileManagementDialog').open", "TMX source update committed");
    await run(async () => {
      const api = window.CatHan;
      const project = (await api.storage.getAll("projects"))[0];
      const doc = project.documents.find((d) => d.name === "draft.TMX");
      const segments = (await api.project.getProjectSegments(project.id)).filter((s) => s.documentId === doc.id);
      if (
        doc.sourceRevision !== 2 ||
        doc.importOptions.importedTranslationStatus !== "draft" ||
        !segments[0].source.includes("Updated hello") ||
        !segments[0].target.includes("Merhaba")
      )
        throw Error("TMX source update lost text or settings");
      const output = await api.localization.buildLocalizationFile(
        "tmx",
        segments,
        project.localizationStructures[doc.id]
      );
      if (!output.includes("Updated hello") || !output.includes("Merhaba"))
        throw Error("Updated TMX reconstruction failed");
      if (!(await api.storage.getAll("documentVersions")).some((v) => v.documentId === doc.id))
        throw Error("TMX old version not archived");
    });
    await evaluate(
      "window.__tmxDownload=null; window.showSaveFilePicker=undefined; document.querySelector('#projectPackageExportBtn').click()"
    );
    await wait("window.__tmxDownload?.type==='application/zip'", "TMX project package export");
    await run(async () => {
      const api = window.CatHan;
      const { value: pkg } = await api.archive.readPackage(window.__tmxDownload);
      const report = api.validation.validateProjectPackage(pkg);
      if (!report.ok) throw Error("TMX package invalid: " + JSON.stringify(report));
      const doc = pkg.project.documents.find((d) => d.name === "confirmed.tmx");
      const rows = pkg.segments.filter((s) => s.documentId === doc.id);
      if (
        doc.importOptions.importedTranslationStatus !== "confirmed" ||
        rows.filter((s) => s.status === "confirmed").length !== 3
      )
        throw Error("TMX package lost import settings or confirmed targets");
      const output = await api.localization.buildLocalizationFile(
        "tmx",
        rows,
        pkg.project.localizationStructures[doc.id]
      );
      const parsed = await api.localization.parseLocalizationFile(new File([output], "restored.tmx"), {
        sourceLang: pkg.project.sourceLang,
        targetLang: pkg.project.targetLang
      });
      if (parsed.segments[0].target !== " Merhaba & dünya ") throw Error("TMX package reconstruction lost translation");
    });
    await win.reload();
    await wait("!!document.querySelector('#statisticsBtn')", "reload");
    const afterReload = await evaluate(
      "window.CatHan.storage.getAll('segments').then(rows=>rows.filter(s=>s.status==='confirmed').length)"
    );
    if (afterReload !== 3) throw Error("Confirmed translations lost after reload");
    console.log(
      "TMX workflow passed:",
      JSON.stringify({
        ...persisted,
        parserCases: true,
        backup: true,
        projectPackage: true,
        legacyPicker: true,
        export: true,
        reload: true,
        accessibility: true,
        sourceUpdate: true,
        narrowRtl: true
      })
    );
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    if (win) console.error(await evaluate("document.body.innerText.slice(-3500)").catch(() => ""));
    app.exit(1);
  } finally {
    server?.close();
  }
});
