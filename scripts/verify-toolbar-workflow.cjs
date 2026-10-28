/* Production UI regression: isolated profile, actual imports, workers and IDB. */
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
const profile = path.join(root, "tmp", `file-management-profile-${process.pid}`);
app.setPath("userData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
let server, win;
const evaluate = (source) => win.webContents.executeJavaScript(source, true);
async function wait(expression, label, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Timed out: " + label);
}
async function clickText(selector, text) {
  return evaluate(
    `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Button unavailable: '+${JSON.stringify(text)});b.click();})()`
  );
}
app.on("window-all-closed", () => {});
app
  .whenReady()
  .then(async () => {
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
        const file = fs.existsSync(generated) ? generated : resolved;
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
            }[path.extname(file)] || "application/octet-stream"
          );
          res.end(fs.readFileSync(file));
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
      const errors = [];
      win.webContents.on("console-message", (_event, _level, message) => {
        if (/Uncaught|startup failed/i.test(message)) errors.push(message);
      });
      await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
      await wait("!!document.querySelector('#statisticsBtn')", "application initialized");
      await evaluate("document.querySelector('#newProjectBtn').click()");
      await wait("document.querySelector('#projectDialog').open", "new project");
      await evaluate(
        "document.querySelector('#projectNameInput').value='Statistics verification';document.querySelector('#sourceLangInput').value='en';document.querySelector('#targetLangInput').value='tr';document.querySelector('#projectForm').requestSubmit()"
      );
      await wait(
        "!document.querySelector('#projectDialog').open && !document.querySelector('#projectHomeView').classList.contains('hidden')",
        "project created"
      );

      await evaluate(
        "(()=>{const dt=new DataTransfer();dt.items.add(new File(['Hello world.\\nSave changes'],'From Tool Use to Technological Agency_ LoopCAT as a Local-First, Open-Source Platform for Translation Technology Education.txt'));dt.items.add(new File(['Second file'],'two.txt'));const input=document.querySelector('#projectFileImportInput');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()"
      );
      await wait(
        "document.querySelector('#batchImportDialog').open && !document.querySelector('#batchImportDialog button').disabled",
        "import review"
      );
      await clickText("#batchImportDialog button", "Import ready files");
      await wait(
        "document.querySelector('#batchImportDialog [role=status]').textContent.includes('2 imported')",
        "files imported"
      );
      await clickText("#batchImportDialog button", "Close");
      await evaluate(
        "(async()=>{const s=window.CatHan.storage;const p=(await s.getAll('projects'))[0];window.testFileId=p.documents[0].id;window.testProjectId=p.id;const row=(await s.getAll('segments')).find(s=>s.documentId===testFileId);await s.put('segments',{...row,target:'Merhaba dünya',status:'confirmed'});})()"
      );

      const out = path.join(root, "output/toolbar-verification");
      fs.mkdirSync(out, { recursive: true });
      await evaluate(
        "document.querySelector('[data-collection-scope=files] [data-view-mode=list]')?.click();document.documentElement.dataset.filesView='list';document.querySelector('#projectHomeView [aria-controls=projectAnalysisContent]')?.click()"
      );
      async function capture(name) {
        await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
        fs.writeFileSync(path.join(out, name + ".png"), (await win.webContents.capturePage()).toPNG());
      }
      await capture("files");
      const height = await evaluate("document.querySelector('.file-card').getBoundingClientRect().height");
      if (height < 72 || height > 88) throw Error("File row height " + height);
      await evaluate("document.querySelector('.file-card .file-action-menu summary').click()");
      await new Promise((r) => setTimeout(r, 100));
      await capture("file-menu");
      if ((await evaluate("document.querySelector('.file-card').getBoundingClientRect().height")) !== height)
        throw Error("Menu changes row height");
      await evaluate("document.body.click()");
      await evaluate("document.querySelector('.file-card-actions button').click()");
      await wait("!document.querySelector('#editorView').classList.contains('hidden')", "editor");
      await evaluate(require("axe-core").source);
      const results = [];
      for (const [name, width, height, zoom] of [
        ["desktop", 1920, 1080, 1],
        ["laptop", 1366, 768, 1],
        ["zoom", 1366, 768, 2],
        ["narrow", 820, 900, 1]
      ]) {
        win.setSize(width, height);
        win.webContents.setZoomFactor(zoom);
        await new Promise((r) => setTimeout(r, 150));
        await capture(name);
        const layout = await evaluate(
          "(()=>{const editor=document.querySelector('#editorView').getBoundingClientRect(),grid=document.querySelector('.segment-grid').getBoundingClientRect();return {editorWidth:editor.width,headerHeight:grid.top-editor.top,overflow:document.documentElement.scrollWidth>innerWidth};})()"
        );
        results.push({ name, ...layout });
        if (layout.overflow) throw Error(name + " page overflow");
        if (layout.editorWidth >= 1100 && layout.headerHeight > 150)
          throw Error(name + " header too tall: " + layout.headerHeight);
      }
      win.setSize(1920, 1080);
      win.webContents.setZoomFactor(1);
      await evaluate("document.querySelector('#editorStatisticsMenu').open=true");
      await new Promise((r) => setTimeout(r, 100));
      await capture("statistics-menu");
      const a11y = await evaluate(
        "axe.run(document.querySelector('#editorView'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})"
      );
      if (a11y.violations.some((v) => ["serious", "critical"].includes(v.impact)))
        throw Error(JSON.stringify(a11y.violations));
      await evaluate(
        "document.querySelector('#editorStatisticsMenu').open=false;document.querySelector('#selectFilteredSegments').click()"
      );
      await capture("selection");
      if (!(await evaluate("!document.querySelector('#editorSelectionActions').hidden")))
        throw Error("Selection bar absent");
      await evaluate("document.querySelector('#editorStatisticsMenu summary').focus()");
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Down" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Down" });
      await new Promise((r) => setTimeout(r, 50));
      if (!(await evaluate("document.activeElement.matches('#editorStatisticsMenu button')")))
        throw Error("Arrow navigation failed: " + (await evaluate("document.activeElement.outerHTML")));
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
      await new Promise((r) => setTimeout(r, 50));
      if (
        !(await evaluate(
          "!document.querySelector('#editorStatisticsMenu').open && document.activeElement.matches('#editorStatisticsMenu summary')"
        ))
      )
        throw Error("Escape focus restoration failed");
      await evaluate("document.querySelector('#editorProjectMenu').open=true");
      await new Promise((r) => setTimeout(r, 50));
      await evaluate("document.querySelector('#editorImportMenu').open=true");
      await new Promise((r) => setTimeout(r, 50));
      if (
        !(await evaluate(
          "document.querySelector('#editorProjectMenu').open && document.querySelector('#editorImportMenu').open"
        ))
      )
        throw Error("Nested menu closed its parent");
      await evaluate("document.body.click();document.querySelector('#inspectorToggleBtn').click()");
      await capture("inspector-closed");
      for (const locale of ["tr-TR", "ca-ES", "es-ES", "ar"]) {
        await evaluate(
          "document.querySelector('#uiLocaleSelect').value=" +
            JSON.stringify(locale) +
            ";document.querySelector('#uiLocaleSelect').dispatchEvent(new Event('change',{bubbles:true}))"
        );
        await wait("document.documentElement.lang===" + JSON.stringify(locale), "locale loaded");
        await new Promise((r) => setTimeout(r, 450));
        await capture(locale);
        const layout = await evaluate(
          "({overflow:document.documentElement.scrollWidth>innerWidth,height:document.querySelector('.segment-grid').getBoundingClientRect().top-document.querySelector('#editorView').getBoundingClientRect().top})"
        );
        if (layout.overflow || layout.height > 150) throw Error(locale + " bad layout " + JSON.stringify(layout));
      }
      await evaluate(
        "document.querySelector('#themeSelect').value='dark';document.querySelector('#themeSelect').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#editorStatisticsMenu').open=true"
      );
      await new Promise((r) => setTimeout(r, 450));
      await evaluate(
        "(()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{transition:none !important;animation:none !important}';document.head.append(style)})()"
      );
      await capture("arabic-dark");
      console.log(
        "Dark control",
        await evaluate(
          "(()=>{const el=document.querySelector('#segmentSearchInput'),s=getComputedStyle(el);return {background:s.backgroundColor,token:s.getPropertyValue('--color-surface-subtle'),theme:document.documentElement.dataset.theme};})()"
        )
      );
      const localizedAxe = await evaluate(
        "axe.run(document.querySelector('#editorView'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})"
      );
      if (localizedAxe.violations.some((v) => ["serious", "critical"].includes(v.impact)))
        throw Error(JSON.stringify(localizedAxe.violations));
      await capture("arabic-dark");
      if (errors.length) throw Error(errors.join("\n"));
      console.log("Toolbar verification passed", JSON.stringify(results));
      app.exit(0);
    } catch (error) {
      console.error(error.stack);
      if (win) {
        console.error(await evaluate("document.body.innerText.slice(-6500)").catch(() => ""));
        fs.mkdirSync(path.join(root, "output/statistics-verification"), { recursive: true });
        fs.writeFileSync(
          path.join(root, "output/statistics-verification/failure.png"),
          (await win.webContents.capturePage()).toPNG()
        );
      }
      app.exit(1);
    }
  })
  .finally(() => server?.close());
