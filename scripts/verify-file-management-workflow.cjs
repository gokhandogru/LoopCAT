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
        if (/Uncaught|startup failed/i.test(message)) { errors.push(message); console.error(message); }
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
        "(()=>{const dt=new DataTransfer();dt.items.add(new File(['Hello world.\\nSave changes'],'one.txt'));dt.items.add(new File(['Second file'],'two.txt'));const input=document.querySelector('#projectFileImportInput');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()"
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
      const action = async (name) =>
        evaluate(
          "window.dispatchEvent(new CustomEvent('loopcat:file-action',{detail:{action:" +
            JSON.stringify(name) +
            ",documentId:window.testFileId}}))"
        );
      await action("rename");
      await wait("document.querySelector('#fileManagementDialog').open", "rename dialog");
      await evaluate("document.querySelector('#fileManagementDialog input').value='renamed.txt'");
      await clickText("#fileManagementDialog button", "Save name");
      await wait("!document.querySelector('#fileManagementDialog').open", "renamed");
      await action("update");
      await wait("!!document.querySelector('#fileManagementDialog input[type=file]')", "replacement picker");
      await evaluate(
        "(()=>{const dt=new DataTransfer();dt.items.add(new File(['Hello world.\\nSave all changes'],'replacement.txt'));const input=document.querySelector('#fileManagementDialog input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()"
      );
      await wait(
        "document.querySelector('#fileManagementTitle').textContent==='Review source update'",
        "source review"
      );
      await evaluate(require("axe-core").source);
      const axe = await evaluate(
        "axe.run(document.querySelector('#fileManagementDialog'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})"
      );
      if (axe.violations.some((v) => ["serious", "critical"].includes(v.impact)))
        throw Error(JSON.stringify(axe.violations));
      fs.mkdirSync(path.join(root, "output/file-management-verification"), { recursive: true });
      await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      fs.writeFileSync(
        path.join(root, "output/file-management-verification/review.png"),
        (await win.webContents.capturePage()).toPNG()
      );
      await clickText("#fileManagementDialog button", "Apply source update");
      await wait("!document.querySelector('#fileManagementDialog').open", "source applied");
      const result = await evaluate(
        "(async()=>{const s=window.CatHan.storage;return {project:await s.get('projects',testProjectId),segments:await s.getAll('segments'),versions:await s.getAll('documentVersions'),archive:await s.getAll('versionSegments')};})()"
      );
      if (
        result.project.documents[0].sourceRevision !== 2 ||
        result.versions.length !== 1 ||
        !result.archive.some((s) => s.target === "Merhaba dünya")
      )
        throw Error("Source history lost: " + JSON.stringify(result));
      if (!result.segments.some((s) => s.source.includes("Save all changes") && !s.target))
        throw Error("Changed source received translation");
      await action("history");
      await wait(
        "[...document.querySelectorAll('#fileManagementDialog button')].some(b=>b.textContent==='Inspect version')",
        "history"
      );
      await clickText("#fileManagementDialog button", "Inspect version");
      await wait(
        "document.querySelector('#fileManagementDialog').innerText.includes('Merhaba dünya')",
        "archived translation"
      );
      await clickText("#fileManagementDialog button", "Back to versions");
      await clickText("#fileManagementDialog button", "Restore this version…");
      await wait(
        "document.querySelector('#fileManagementTitle').textContent==='Review source update'",
        "restore review"
      );
      if (
        await evaluate(
          "[...document.querySelectorAll('#fileManagementDialog button')].some(b=>b.textContent==='Use incoming for all conflicts')"
        )
      )
        await clickText("#fileManagementDialog button", "Use incoming for all conflicts");
      await clickText("#fileManagementDialog button", "Apply source update");
      await wait("!document.querySelector('#fileManagementDialog').open", "version restored");
      await action("trash");
      await clickText("#fileManagementDialog button", "Move to Trash");
      await wait("!document.querySelector('#fileManagementDialog').open", "file trashed");
      await action("project-trash");
      await wait("document.querySelector('#fileManagementDialog').innerText.includes('renamed.txt')", "project trash");
      await clickText("#fileManagementDialog button", "Restore");
      await wait(
        "document.querySelector('#fileManagementDialog').innerText.includes('No deleted files')",
        "file restored"
      );
      await clickText("#fileManagementDialog button", "Close");
      const roundtrip = await evaluate(
        "(async()=>{const s=window.CatHan.storage;const data=await s.exportAllData();const restored=await s.importAllData(data,{prepareOnly:true});const p=restored.projects[0];if(p.documents[0].id!==testFileId||p.documents[0].sourceRevision!==3||restored.documentVersions.length!==2)throw Error('History roundtrip failed');return {files:p.documents.length,versions:restored.documentVersions.length,archivedSegments:restored.versionSegments.length};})()"
      );
      if (errors.length) throw Error(errors.join("\n"));
      console.log("File management workflow passed:", JSON.stringify(roundtrip));
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
