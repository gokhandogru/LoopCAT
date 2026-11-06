/* Issue #10 regression in a hidden, isolated production renderer. */
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
setTimeout(() => {
  console.error("TM bulk workflow timed out");
  app.exit(1);
}, 90000).unref();
app.setPath("userData", path.join(root, "tmp", `tm-bulk-profile-${process.pid}`));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
let server, win;
const evaluate = (source) => win.webContents.executeJavaScript(source, true);
const run = (fn, ...args) => evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
async function wait(expression, label) {
  console.log("Checking:", label);
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Timed out: " + label);
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
    console.log("Loading isolated renderer");
    await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
    await wait("!!document.querySelector('#statisticsBtn')", "startup");

    await evaluate("document.querySelector('#newProjectBtn').click()");
    await wait("document.querySelector('#projectDialog').open", "project dialog");
    await evaluate(
      "document.querySelector('#projectNameInput').value='Issue 10'; document.querySelector('#sourceLangInput').value='en'; document.querySelector('#targetLangInput').value='de'; document.querySelector('#projectForm').requestSubmit()"
    );
    await wait(
      "!document.querySelector('#projectDialog').open && !document.querySelector('#projectHomeView').classList.contains('hidden')",
      "project created"
    );
    const fixture = fs.readFileSync(path.join(root, "tests/fixtures/issue-10.xlf"), "utf8");
    await run((text) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], "issue-10.xlf"));
      transfer.items.add(
        new File(
          [
            text.replace(
              /<body>[\s\S]*<\/body>/,
              '<body><trans-unit id="other"><source>Other document</source><target state="translated">Anderes Dokument</target></trans-unit></body>'
            )
          ],
          "other.xlf"
        )
      );
      const input = document.querySelector("#projectFileImportInput");
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, fixture);
    await wait(
      "document.querySelector('#batchImportDialog')?.open && ![...document.querySelectorAll('#batchImportDialog button')].find(b=>b.textContent==='Import ready files')?.disabled",
      "import review"
    );
    await evaluate(
      "[...document.querySelectorAll('#batchImportDialog button')].find(b=>b.textContent==='Import ready files').click()"
    );
    await wait("window.CatHan.storage.getAll('segments').then(rows=>rows.length===10)", "XLIFF imported");
    await wait(
      "document.querySelector('#batchImportDialog [role=status]').textContent.includes('2 imported')",
      "import results"
    );
    await evaluate(
      "[...document.querySelectorAll('#batchImportDialog button')].find(b=>b.textContent==='Close').click()"
    );
    await wait("!document.querySelector('#batchImportDialog').open", "import complete");
    await evaluate("document.querySelector('.file-open').click()");
    await wait("!document.querySelector('#editorView').classList.contains('hidden')", "editor opened");
    await evaluate("document.querySelector('#tmBulkUpdateBtn').click()");
    await wait("document.querySelector('#tmBulkUpdateDialog').open", "TM dialog");
    await wait("!document.querySelector('#tmBulkUpdateApply').disabled", "eligible segments");
    await evaluate(require("axe-core").source);
    const accessibility = await evaluate(
      "axe.run(document.querySelector('#tmBulkUpdateDialog'), {runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})"
    );
    if (accessibility.violations.length) throw Error(JSON.stringify(accessibility.violations));
    await evaluate("document.querySelector('#tmBulkUpdateApply').click()");
    await wait(
      "document.querySelector('#tmBulkUpdateReport').textContent.includes('Added: 5.')",
      "five translations saved"
    );
    await wait("document.querySelector('#tmBulkUpdateDialog').getAttribute('aria-busy')==='false'", "finished");
    await evaluate("document.querySelector('#tmBulkUpdateApply').click()");
    await wait(
      "document.querySelector('#tmBulkUpdateReport').textContent.includes('Already present: 5.')",
      "idempotent rerun"
    );
    await wait("document.querySelector('#tmBulkUpdateDialog').getAttribute('aria-busy')==='false'", "rerun finished");
    const result = await run(async () => {
      const api = window.CatHan;
      const entries = await api.storage.getAll("tmEntries");
      const rows = await api.storage.getAll("segments");
      const contributions = await api.storage.getAll("tmContributions");
      if (
        entries.length !== 5 ||
        contributions.length !== 5 ||
        rows.filter((s) => s.status === "empty" && !s.target).length !== 4
      )
        throw Error("Incorrect TM or segment counts");
      return {
        entries: entries.length,
        contributions: contributions.length,
        empty: 4,
        report: document.querySelector("#tmBulkUpdateReport").textContent
      };
    });
    console.log("Issue 10 workflow passed:", JSON.stringify(result));
    await evaluate(
      "document.querySelector('#tmBulkUpdateScope').value='project'; document.querySelector('#tmBulkUpdateScope').dispatchEvent(new Event('change')); document.querySelector('#tmBulkUpdateApply').click()"
    );
    await wait(
      "document.querySelector('#tmBulkUpdateReport').textContent.includes('Added: 1.')",
      "entire project scope"
    );
    await wait(
      "document.querySelector('#tmBulkUpdateDialog').getAttribute('aria-busy')==='false'",
      "project update finished"
    );
    const total = await evaluate("window.CatHan.storage.getAll('tmEntries').then(rows=>rows.length)");
    if (total !== 6) throw Error("Project scope did not include the second document");
    fs.mkdirSync(path.join(root, "output/tm-bulk-verification"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "output/tm-bulk-verification/dialog.png"),
      (await win.webContents.capturePage()).toPNG()
    );
    win.setSize(520, 850);
    await evaluate("document.documentElement.dir='rtl'; new Promise(resolve=>requestAnimationFrame(resolve))");
    if (await evaluate("document.querySelector('#tmBulkUpdateDialog').getBoundingClientRect().width > innerWidth + 1"))
      throw Error("TM update dialog overflows a narrow viewport");
    console.log("Project scope, accessibility, and narrow RTL layout passed.");
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    if (win) console.error(await evaluate("document.body.innerText.slice(-1800)").catch(() => ""));
    app.exit(1);
  } finally {
    server?.close();
  }
});
