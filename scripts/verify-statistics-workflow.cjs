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
const profile = path.join(root, "tmp", `statistics-profile-${process.pid}`);
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
        `(()=>{const transfer=new DataTransfer();for(let i=0;i<20;i++){const ext=i%3===0?'html':i%3===1?'json':'txt';const text=ext==='html'?'<p>This is a sentence.</p>':ext==='json'?'{"message":"This is a sentence."}':'This is a sentence.';transfer.items.add(new File([text],'sample-'+i+'.'+ext,{type:'text/plain'}));}const input=document.querySelector('#projectFileImportInput');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`
      );
      await wait("document.querySelector('#batchImportDialog').open", "batch review");
      await wait("!document.querySelector('#batchImportDialog button').disabled", "content review");
      await evaluate(
        "document.querySelectorAll('#batchImportDialog input[type=checkbox]:not(:disabled)').forEach(input=>{input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));})"
      );
      await clickText("#batchImportDialog button", "Import ready files");
      await wait(
        "document.querySelector('#batchImportDialog [role=status]').textContent.includes('20 imported')",
        "20 mixed files",
        60000
      );
      await clickText("#batchImportDialog button", "View statistics");
      await wait(
        "document.querySelector('#statisticsDialog').open && document.querySelector('#statisticsDialog [role=status]').textContent.includes('Complete')",
        "statistics complete",
        60000
      );
      const simple = await evaluate("document.querySelector('#statisticsDialog').innerText");
      if (!simple.includes("80") || !simple.includes("76"))
        throw Error("Expected 80 words and 76 repeated words: " + simple);
      await clickText("#statisticsDialog button", "Save snapshot");
      await wait(
        "document.querySelector('#statisticsDialog [role=status]').textContent.includes('Snapshot saved')",
        "snapshot saved"
      );
      await clickText("#statisticsDialog button", "Advanced");
      await evaluate(require("axe-core").source);
      const axe = await evaluate(
        "axe.run(document.querySelector('#statisticsDialog'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})"
      );
      const serious = axe.violations.filter((v) => ["serious", "critical"].includes(v.impact));
      if (serious.length)
        throw Error(JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))));
      fs.mkdirSync(path.join(root, "output/statistics-verification"), { recursive: true });
      await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      fs.writeFileSync(
        path.join(root, "output/statistics-verification/advanced.png"),
        (await win.webContents.capturePage()).toPNG()
      );
      const stored = await evaluate(
        "window.CatHan.storage.getAll('projects').then(projects=>({files:projects[0].documents.length,reports:projects[0].statisticsSnapshots.length,receipts:projects[0].importReceipts.length,total:projects[0].statisticsSnapshots[0].totals.words}))"
      );
      if (stored.files !== 20 || stored.receipts !== 20 || stored.reports !== 1 || stored.total !== 80)
        throw Error(JSON.stringify(stored));
      const roundtrip = await evaluate(`(async()=>{
        const data=await window.CatHan.storage.exportAllData();
        const report=window.CatHan.validation.validateBackupFile(data);
        if(!report.ok)throw Error(JSON.stringify(report.errors));
        const encoded=JSON.stringify(data);
        const prepared=await window.CatHan.storage.importAllData(JSON.parse(encoded),{prepareOnly:true});
        if(prepared.projects[0].statisticsSnapshots[0].totals.words!==80 || prepared.projects[0].importReceipts.length!==20)throw Error('Backup lost analysis metadata');
        const invalid=JSON.parse(encoded);invalid.projects[0].statisticsSnapshots[0].totals.words=-1;
        if(window.CatHan.validation.validateBackupFile(invalid).ok)throw Error('Invalid snapshot accepted');
        return {bytes:encoded.length,receipts:prepared.projects[0].importReceipts.length};
      })()`);
      await clickText("#statisticsDialog button", "Close");
      await evaluate(
        `(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['{bad'],'broken.json'));transfer.items.add(new File(['Additional unique words'],'after-error.txt'));const input=document.querySelector('#projectFileImportInput');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`
      );
      await wait(
        "document.querySelector('#batchImportDialog').open && !document.querySelector('#batchImportDialog button').disabled",
        "second batch review"
      );
      await clickText("#batchImportDialog button", "Import ready files");
      await wait(
        "document.querySelector('#batchImportDialog [role=status]').textContent.includes('1 imported') && document.querySelector('#batchImportDialog [role=status]').textContent.includes('1 failed')",
        "corrupt file isolation"
      );
      await clickText("#batchImportDialog button", "View statistics");
      await wait(
        "document.querySelector('#statisticsDialog [role=status]').textContent.includes('Complete')",
        "updated statistics"
      );
      const unchanged = await evaluate(
        "window.CatHan.storage.getAll('projects').then(p=>p[0].statisticsSnapshots[0].totals.words)"
      );
      if (unchanged !== 80) throw Error("Saved baseline changed after import");
      win.setSize(520, 850);
      await evaluate("document.documentElement.dir='rtl'");
      await clickText("#statisticsDialog button", "Simple");
      await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      const overflow = await evaluate(
        "document.querySelector('#statisticsDialog').getBoundingClientRect().width > innerWidth + 1"
      );
      if (overflow) throw Error("Narrow Statistics dialog overflows viewport");
      fs.writeFileSync(
        path.join(root, "output/statistics-verification/narrow-rtl.png"),
        (await win.webContents.capturePage()).toPNG()
      );
      if (errors.length) throw Error(errors.join("\n"));
      console.log(
        "Statistics workflow passed:",
        JSON.stringify({ stored, roundtrip, corruptFileIsolation: true, immutableBaseline: true, narrowRtl: true })
      );
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
