/* Shared Resources UI and real query worker, always in an isolated profile. */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
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
const fixture = require("../tests/resources-workspace/fixtures.cjs");
const profile = path.join(root, "tmp", `resources-workspace-profile-${process.pid}-${Date.now()}`);
const million = process.argv.includes("--million");
const uiOnly = process.argv.includes("--ui-only");
const performanceGate = process.argv.includes("--performance-gate");
if (performanceGate && (uiOnly || million)) {
  throw new Error("--performance-gate requires the default 100,000-entry workflow.");
}
const artifacts = path.join(
  root,
  "test-artifacts",
  million ? "resources-workspace-million" : uiOnly ? "resources-workspace-ui" : "resources-workspace"
);
const production = path.join(root, ".cache", "renderer", "production");
app.setPath("userData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
const timeout = setTimeout(
  () => {
    console.error("Resources workflow timed out");
    app.exit(1);
  },
  million ? 1200000 : 180000
);
timeout.unref();
let server;
let window;
const report = {
  checks: [],
  errors: [],
  environment: {
    platform: process.platform,
    architecture: process.arch,
    osRelease: os.release(),
    cpu: os.cpus()[0]?.model || "unknown",
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node
  }
};
const evaluate = (source) => window.webContents.executeJavaScript(source, true);
const run = (fn, ...args) => evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
async function wait(expression, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) {
      report.checks.push(label);
      console.log("Passed:", label);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${label}`);
}
async function startServer() {
  const files = new Map();
  for (const name of JSON.parse(fs.readFileSync(path.join(production, "assets.json"), "utf8")))
    files.set(name, path.join(production, name));
  files.set("index.html", path.join(production, "index.html"));
  files.set("config/production-assets.js", path.join(production, "config/production-assets.js"));
  const { runtimeAssets } = require(path.join(production, "config/production-assets.js"));
  for (const name of runtimeAssets) if (!files.has(name)) files.set(name, path.join(root, name));
  server = http.createServer((request, response) => {
    try {
      const relative =
        decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
      const file = files.get(relative);
      if (!file) {
        response.writeHead(403).end();
        return;
      }
      response.setHeader("cache-control", "no-store");
      response.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".webmanifest": "application/manifest+json"
        }[path.extname(file)] || "application/octet-stream"
      );
      response.end(fs.readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}/index.html`;
}

app.whenReady().then(async () => {
  let code = 0;
  try {
    const url = await startServer();
    window = new BrowserWindow({
      show: false,
      width: 1380,
      height: 920,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    captureConsole();
    // Browser fallback is tested deliberately; native registry coverage is in unit tests.
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    await window.loadURL(url);
    await wait(
      "!!window.CatHan?.project?.createResource && !!window.CatHan?.tm?.importTmEntries",
      "application initialized"
    );
    report.fixture = await run(fixture.seedResources);
    await evaluate("document.querySelector('#resourcesViewBtn').click()");
    await wait("document.querySelectorAll('.resource-library-table tbody tr').length >= 2", "compact resource library");
    await wait(
      "Array.from(document.querySelectorAll('.resource-library-table tbody td:nth-child(3)')).some(cell => cell.textContent.trim() === '240')",
      "library resource counts loaded"
    );
    await capture("library.png");
    if (million) {
      await window.loadURL(`${url}#resource/tm/${encodeURIComponent(report.fixture.tm)}`);
      await wait("!!window.CatHan?.resourceEditor", "resource-only stress fixture host");
    } else await verifyEditors(url, report.fixture);
    if (!uiOnly) {
      if (!million) {
        await window.loadURL(`${url}#resource/tm/${encodeURIComponent(report.fixture.tm)}`);
        await wait("!!window.CatHan?.resourceEditor", "resource-only benchmark host");
      }
      const count = million ? 1000000 : 100000;
      console.log(`Seeding ${count} isolated benchmark entries`);
      const largeId = await run(fixture.seedLargeResource, count);
      console.log("Measuring resource query worker");
      report.performance = await run(fixture.measureLargeResource, largeId, count);
      report.checks.push(`${count.toLocaleString("en-US")}-entry real worker query, paging and full-resource search`);
      console.log("Performance:", JSON.stringify(report.performance));
      if (!report.performance.coldTargetMet) {
        const message = `Cold-load release target missed: ${report.performance.coldMs} ms; required below ${report.performance.coldTargetMs} ms.`;
        if (performanceGate) throw new Error(message);
        console.warn(message);
      }
    }
    if (report.errors.length) throw new Error(`Renderer errors: ${JSON.stringify(report.errors)}`);
    console.log("Resources workspace verification passed.");
  } catch (error) {
    code = 1;
    report.failure = error.stack || `${error.name || "Error"}: ${error.message || String(error)}`;
    console.error(report.failure);
    if (window && !window.isDestroyed())
      console.error(await evaluate("document.body.innerText.slice(-2500)").catch(() => ""));
  } finally {
    fs.mkdirSync(artifacts, { recursive: true });
    if (window && !window.isDestroyed()) {
      fs.writeFileSync(path.join(artifacts, "workspace.png"), (await window.webContents.capturePage()).toPNG());
      window.destroy();
    }
    fs.writeFileSync(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2));
    server?.close();
    clearTimeout(timeout);
    app.exit(code);
  }
});

async function verifyEditors(url, resources) {
  await run(
    (id) => document.querySelector(`[data-library-id="${id}"] [data-resource-action="open"]`).click(),
    resources.tm
  );
  await wait(
    "!!window.CatHan?.resourceEditor && document.querySelectorAll('.resource-data-table tbody tr[data-entry-id]').length===100",
    "library Open uses dedicated TM route when popup is blocked"
  );
  await input("#resourceSearch", "Beyond first hundred sentinel");
  await wait(
    "document.querySelectorAll('tr[data-entry-id]').length===1 && !!document.querySelector('tr[data-entry-id=fixture-tm-239]')",
    "search covers entries beyond the first hundred"
  );
  await input("#resourceSearch", "");
  await wait("document.querySelectorAll('tr[data-entry-id]').length===100", "clearing search restores the first page");
  await evaluate("document.querySelector('[data-entry-id=fixture-tm-0] .resource-entry-link').click()");
  await input('#resourceEntryForm [name="target"]', "Saved revision");
  await clickText("#resourceEntryForm", "Save and next");
  await wait(
    "document.querySelector('#resourceEntryForm [name=source]')?.value==='Source 001'",
    "save and next advances the selected entry"
  );
  await wait(
    "window.CatHan.storage.get('tmEntries','fixture-tm-0').then(row=>row.target==='Saved revision')",
    "TM edit committed"
  );
  await input('#resourceEntryForm [name="target"]', "Recovered draft");
  await evaluate("window.CatHan.resourceEditor.session.flush()");
  await run(
    (resourceId) =>
      window.postMessage(
        { type: "loopcat-resource-select", resourceType: "tm", resourceId, entryId: "fixture-tm-2" },
        window.location.origin
      ),
    resources.tm
  );
  await wait(
    "document.querySelector('#resourceEntryForm [name=source]')?.value==='Source 002' && window.CatHan.resourceEditor.session.get('fixture-tm-1')?.values.target==='Recovered draft'",
    "entry selection notification preserves another entry's draft"
  );
  await run(
    (resourceId) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://untrusted.example",
          data: { type: "loopcat-resource-select", resourceType: "tm", resourceId, entryId: "fixture-tm-3" }
        })
      ),
    resources.tm
  );
  if (!(await evaluate("document.querySelector('#resourceEntryForm [name=source]').value==='Source 002'")))
    throw new Error("An untrusted origin selected an entry");
  if (await evaluate("window.CatHan.storage.get('tmEntries','fixture-tm-1').then(row=>row.target==='Recovered draft')"))
    throw new Error("Draft changed active TM data before Save");
  window.destroy();
  window = new BrowserWindow({
    show: false,
    width: 1380,
    height: 920,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  captureConsole();
  await window.loadURL(`${url}#resource/tm/${encodeURIComponent(resources.tm)}`);
  await wait(
    "!!window.CatHan?.resourceEditor && !document.querySelector('.resource-recovery').hidden",
    "draft recovery offered after renderer restart"
  );
  await clickText(".resource-recovery", "Review recovered drafts");
  await evaluate("document.querySelector('dialog[open] input[type=checkbox]').click()");
  await clickText("dialog[open]", "Recover selected drafts");
  await wait(
    "document.querySelector('#resourceEntryForm [name=target]')?.value==='Recovered draft'",
    "explicit draft recovery preserves typed text"
  );
  await evaluate("document.querySelector('#resourceSaveAll').click()");
  await wait(
    "window.CatHan.resourceEditor.session.size()===0 && window.CatHan.storage.get('tmEntries','fixture-tm-1').then(row=>row.target==='Recovered draft')",
    "recovered draft saves explicitly"
  );
  await input("#resourceSearch", "Saved revision");
  await wait(
    "document.querySelectorAll('tr[data-entry-id]').length===1 && !!document.querySelector('tr[data-entry-id=fixture-tm-0]')",
    "bulk scope narrowed to matching entry"
  );
  await clickText(".resource-editor-toolbar", "Find and replace");
  await wait("!!document.querySelector('dialog[open] [aria-label=\"Find text\"]')", "replacement dialog opened");
  await input('dialog[open] [aria-label="Find text"]', "Saved");
  await input('dialog[open] [aria-label="Replacement text"]', "Updated");
  await clickText("dialog[open]", "Preview changes");
  await wait(
    "document.querySelector('dialog[open]').textContent.includes('1 entries will change')",
    "replacement preview reports its exact scope"
  );
  await clickText("dialog[open]", "Cancel");
  if (
    !(await evaluate("window.CatHan.storage.get('tmEntries','fixture-tm-0').then(row=>row.target==='Saved revision')"))
  )
    throw new Error("Cancelling preview changed the TM");
  report.checks.push("cancelled preview leaves committed entries unchanged");
  await clickText(".resource-editor-toolbar", "Find and replace");
  await wait("!!document.querySelector('dialog[open] [aria-label=\"Find text\"]')", "replacement dialog reopened");
  await input('dialog[open] [aria-label="Find text"]', "Saved");
  await input('dialog[open] [aria-label="Replacement text"]', "Updated");
  await clickText("dialog[open]", "Preview changes");
  await clickText("dialog[open]", "Apply reviewed changes");
  await wait(
    "!document.querySelector('dialog[open]') && !document.querySelector('.resource-results-pane table[aria-busy]') && window.CatHan.storage.get('tmEntries','fixture-tm-0').then(row=>row.target==='Updated revision')",
    "reviewed replacement commits"
  );
  await clickText(".resource-editor-toolbar", "Undo last operation");
  await wait(
    "window.CatHan.storage.get('tmEntries','fixture-tm-0').then(row=>row.target==='Saved revision')",
    "undo restores the reviewed entry"
  );
  await input("#resourceSearch", "");
  await wait("document.querySelectorAll('tr[data-entry-id]').length===100", "TM results restored after maintenance");
  await clickText(".resource-pagination", "Next");
  await wait(
    "!!document.querySelector('[data-entry-id=fixture-tm-150]') && !document.querySelector('.resource-data-table[aria-busy]')",
    "second TM result page"
  );
  await evaluate("document.querySelector('[data-entry-id=fixture-tm-150] .resource-entry-link').click()");
  await wait(
    "document.querySelector('#resourceEntryForm [name=source]')?.value==='Source 150' && !document.querySelector('#resourceEntryForm fieldset[disabled]')",
    "second-page entry ready for editing"
  );
  await input('#resourceEntryForm [name="target"]', "Saved on page two");
  await clickText("#resourceEntryForm", "Save and next");
  await wait(
    "document.querySelector('#resourceEntryForm [name=source]')?.value==='Source 151' && !!document.querySelector('[data-entry-id=fixture-tm-151]') && !document.querySelector('[data-entry-id=fixture-tm-0]')",
    "Save and next preserves second-page position after committing"
  );
  await evaluate("document.querySelector('[data-entry-id=fixture-tm-199] .resource-entry-link').click()");
  await wait(
    "document.querySelector('#resourceEntryForm [name=source]')?.value==='Source 199' && !document.querySelector('#resourceEntryForm fieldset[disabled]')",
    "page-boundary entry ready for editing"
  );
  await input('#resourceEntryForm [name="target"]', "Saved at page boundary");
  await clickText("#resourceEntryForm", "Save and next");
  await wait(
    "document.querySelector('#resourceEntryForm [name=source]')?.value==='Source 200' && !!document.querySelector('[data-entry-id=fixture-tm-200]')",
    "Save and next crosses a result-page boundary"
  );
  await capture("tm-editor.png");
  await accessibility("TM editor");

  await window.loadURL(`${url}#resource/tb/${encodeURIComponent(resources.tb)}`);
  await wait(
    "!!window.CatHan?.resourceEditor && document.querySelectorAll('tr[data-entry-id]').length===4",
    "dedicated termbase route"
  );
  await input('.resource-editor-filters [aria-label="Term status"]', "forbidden", "change");
  await wait(
    "document.querySelectorAll('tr[data-entry-id]').length===1 && !!document.querySelector('tr[data-entry-id=fixture-term-2]')",
    "forbidden-term filter"
  );
  await input('.resource-editor-filters [aria-label="Term status"]', "", "change");
  await wait("document.querySelectorAll('tr[data-entry-id]').length===4", "term filter clearing");
  await evaluate("document.querySelector('[data-entry-id=fixture-term-0] .resource-entry-link').click()");
  await input('#resourceEntryForm [name="targetTerm"]', "arkadaşım");
  await input('#resourceEntryForm [name="definition"]', "A trusted person");
  await input('#resourceEntryForm [name="status"]', "admitted", "change");
  await evaluate("document.querySelector('#resourceEntryForm').requestSubmit()");
  await wait(
    "window.CatHan.resourceEditor.session.size()===0 && window.CatHan.storage.get('terms','fixture-term-0').then(row=>row.targetTerm==='arkadaşım' && row.definition==='A trusted person' && row.status==='admitted')",
    "term text, definition and status save"
  );
  await evaluate("document.querySelector('#resourceAddEntry').click()");
  await input('#resourceEntryForm [name="sourceTerm"]', "translator");
  await input('#resourceEntryForm [name="targetTerm"]', "çevirmen");
  await evaluate("document.querySelector('#resourceSaveAll').click()");
  await wait(
    "window.CatHan.resourceEditor.session.size()===0 && document.querySelectorAll('tr[data-entry-id]').length===5",
    "new term saved"
  );
  await capture("tb-editor.png");
  await accessibility("Termbase editor");
  window.setSize(520, 850);
  await evaluate(
    "document.documentElement.dir='rtl'; new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))"
  );
  if (await evaluate("document.documentElement.scrollWidth>innerWidth+2"))
    throw new Error("Resource editor overflows a narrow RTL viewport");
  await capture("tb-narrow-rtl.png");
  report.checks.push("narrow RTL layout fits the viewport");
  window.setSize(1380, 920);
  await evaluate("document.documentElement.dir='ltr'");
  await clickText(".resource-editor-heading", "Back to Resources");
  await wait(
    "!!document.querySelector('.resources-upgraded') && !document.querySelector('#resourcesView').classList.contains('hidden') && !!document.querySelector('.resource-library-table')",
    "Back to Resources restores the library in the same-tab fallback"
  );
}

async function input(selector, value, event = "input") {
  await run(
    (selector, value, event) => {
      const input = document.querySelector(selector);
      if (!input) throw new Error(`Missing input: ${selector}`);
      input.value = value;
      input.dispatchEvent(new Event(event, { bubbles: true }));
    },
    selector,
    value,
    event
  );
}
async function clickText(scope, label) {
  await run(
    (scope, label) => {
      const button = [...document.querySelectorAll(`${scope} button`)].find(
        (button) => button.textContent.trim() === label
      );
      if (!button || button.disabled) throw new Error(`Missing or disabled button: ${label}`);
      button.click();
    },
    scope,
    label
  );
}
async function capture(name) {
  await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  await new Promise((resolve) => setTimeout(resolve, 100));
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(
    path.join(artifacts, name),
    (await window.webContents.capturePage(undefined, { stayHidden: true })).toPNG()
  );
}
async function accessibility(label) {
  await evaluate(require("axe-core").source);
  const result = await evaluate(
    "axe.run(document.querySelector('#resourceEditor'), {runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})"
  );
  if (result.violations.length)
    throw new Error(
      `${label} accessibility: ${JSON.stringify(result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target }) => target) })))}`
    );
  report.checks.push(`${label} accessibility scan`);
}

function captureConsole() {
  window.webContents.on("console-message", (details) => {
    if (details.level === "error")
      report.errors.push({ message: details.message, source: details.sourceId, line: details.lineNumber });
  });
}
