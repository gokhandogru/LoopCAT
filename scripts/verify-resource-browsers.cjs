/* Firefox/WebKit exercise the production renderer with disposable browser contexts. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const playwright = require("playwright");
const fixtures = require("../tests/resources-workspace/fixtures.cjs");

const root = path.resolve(__dirname, "..");
const production = path.join(root, ".cache", "renderer", "production");
const artifacts = path.join(root, "test-artifacts", "resource-browsers");
const requested = process.argv.slice(2);
const engines = requested.length ? requested : ["firefox", "webkit"];
if (engines.some((engine) => !["firefox", "webkit"].includes(engine))) {
  throw new Error("Choose firefox and/or webkit.");
}
const report = { platform: process.platform, playwright: require("playwright/package.json").version, browsers: [] };
async function bounded(task, label, timeout = 60000) {
  let timer;
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), timeout);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2"
};

async function startServer() {
  const files = new Map();
  for (const relative of JSON.parse(fs.readFileSync(path.join(production, "assets.json"), "utf8"))) {
    files.set(relative, path.join(production, relative));
  }
  files.set("index.html", path.join(production, "index.html"));
  files.set("config/production-assets.js", path.join(production, "config/production-assets.js"));
  for (const relative of require(path.join(production, "config/production-assets.js")).runtimeAssets) {
    if (!files.has(relative)) files.set(relative, path.join(root, relative));
  }
  const server = http.createServer((request, response) => {
    try {
      const relative =
        decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
      if (relative === "favicon.ico") {
        response.writeHead(204).end();
        return;
      }
      const file = files.get(relative);
      if (!file) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
      response.end(fs.readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/index.html` };
}

async function verify(engine, url) {
  fs.rmSync(path.join(artifacts, `${engine}-failure.png`), { force: true });
  const result = {
    engine,
    checks: [],
    errors: [],
    accessibility: [],
    fixtureStages: [],
    startedAt: new Date().toISOString()
  };
  report.browsers.push(result);
  let browser;
  let context;
  let current;
  const check = (label) => {
    result.checks.push(label);
    console.log(`Passed [${engine}]: ${label}`);
  };
  const attach = (page) => {
    page.on("pageerror", (error) => result.errors.push({ type: "pageerror", message: error.message }));
    page.on("console", (message) => {
      if (message.type() === "error") result.errors.push({ type: "console", message: message.text() });
      if (message.text().startsWith("Resource fixture:")) {
        result.fixtureStages.push({ label: message.text(), elapsedMs: Date.now() - Date.parse(result.startedAt) });
        console.log(`[${engine}] ${message.text()}`);
      }
    });
    page.setDefaultTimeout(30000);
  };
  const waitEditor = (page) => page.waitForFunction(() => Boolean(window.CatHan?.resourceEditor));
  const waitSaved = (page) =>
    page.waitForFunction(() => {
      const fields = document.querySelector("#resourceEntryForm fieldset");
      return (
        !window.CatHan.resourceEditor.session.isSaving() &&
        window.CatHan.resourceEditor.session.size() === 0 &&
        fields &&
        !fields.disabled &&
        !document.querySelector(".resource-data-table")?.hasAttribute("aria-busy")
      );
    });
  const waitCount = (page, count) =>
    page.waitForFunction((expected) => document.querySelectorAll("tr[data-entry-id]").length === expected, count);
  async function accessibility(page, label) {
    await page.evaluate(require("axe-core").source);
    const violations = await page.evaluate(async () =>
      (
        await window.axe.run(document.querySelector("#resourceEditor"), {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }
        })
      ).violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary }))
      }))
    );
    result.accessibility.push({ label, violations });
    if (!violations.length) check(`${label}: WCAG A/AA scan`);
    else console.error(`[${engine}] ${label}: ${JSON.stringify(violations)}`);
  }
  try {
    console.log(`Starting Resources verification [${engine}]`);
    browser = await playwright[engine].launch({ headless: true });
    result.version = browser.version();
    context = await browser.newContext({ viewport: { width: 1380, height: 920 }, locale: "en-US" });
    context.on("page", attach);
    const library = await context.newPage();
    current = library;
    console.log(`Loading production renderer [${engine}]`);
    await library.goto(url);
    await library.waitForFunction(() =>
      Boolean(window.CatHan?.project?.createResource && window.CatHan?.tm?.importTmEntries)
    );
    console.log(`Seeding disposable Resources fixtures [${engine}]`);
    await library.evaluate(() => {
      window.resourceFixtureProgress = [];
      window.__resourceFixtureProgress = (label) => {
        window.resourceFixtureProgress.push(label);
        console.log(`Resource fixture: ${label}`);
      };
    });
    const resources = await bounded(library.evaluate(fixtures.seedResources), `${engine} fixture import`, 120000);
    await library.locator("#resourcesViewBtn").click();
    await library.waitForFunction(() => document.querySelectorAll(".resource-library-table tbody tr").length >= 2);
    check("compact Resources library loads");

    const opened = context.waitForEvent("page");
    await library.locator(`[data-library-id="${resources.tm}"] [data-resource-action="open"]`).first().click();
    const memory = await opened;
    current = memory;
    await waitEditor(memory);
    await waitCount(memory, 100);
    check("Open launches a dedicated resource tab");
    await memory.locator("#resourceSearch").fill("Beyond first hundred sentinel");
    await memory.locator("tr[data-entry-id=fixture-tm-239]").waitFor();
    await waitCount(memory, 1);
    check("search finds entries beyond page one");
    await memory.locator("#resourceSearch").fill("");
    await waitCount(memory, 100);
    await memory.locator("[data-entry-id=fixture-tm-0] .resource-entry-link").click();
    await memory.locator('#resourceEntryForm [name="target"]').fill(`Saved in ${engine}`);
    await memory.locator("#resourceEntryForm").getByRole("button", { name: "Save", exact: true }).click();
    await waitSaved(memory);
    assert.equal(
      await memory.evaluate(async () => (await window.CatHan.storage.get("tmEntries", "fixture-tm-0")).target),
      `Saved in ${engine}`
    );
    check("TM edit commits with the real IndexedDB repository");

    await memory.waitForFunction(() => !document.querySelector(".resource-data-table").hasAttribute("aria-busy"));
    const previousForm = await memory.locator("#resourceEntryForm").elementHandle();
    await memory.locator("[data-entry-id=fixture-tm-0] .resource-entry-link").click();
    await memory.waitForFunction((form) => !form.isConnected, previousForm);
    await previousForm.dispose();
    const draftTarget = memory.locator('#resourceEntryForm [name="target"]');
    await draftTarget.press("ControlOrMeta+A");
    await draftTarget.pressSequentially(`Recovered in ${engine}`);
    // Wait for the browser's input event to reach the session before flushing
    // its persistence queue; fill completion alone is not a durability signal.
    await memory.waitForFunction(() => window.CatHan.resourceEditor.session.size() === 1);
    await memory.evaluate(() => window.CatHan.resourceEditor.session.flush());
    assert.equal(await memory.evaluate(() => window.CatHan.resourceEditor.session.size()), 1, "Draft is staged");
    assert.equal(
      await memory.evaluate(
        async () =>
          (await window.CatHan.resourceEditor.repository.loadDrafts(window.CatHan.resourceEditor.getResource().id))
            .length
      ),
      1,
      "Draft is persisted"
    );
    assert.equal(
      await memory.evaluate(async () => (await window.CatHan.storage.get("tmEntries", "fixture-tm-0")).target),
      `Saved in ${engine}`
    );
    await memory.close({ runBeforeUnload: false });
    const recovered = await context.newPage();
    current = recovered;
    await recovered.goto(`${url}#resource/tm/${encodeURIComponent(resources.tm)}`);
    await waitEditor(recovered);
    await recovered.locator(".resource-recovery").getByRole("button", { name: "Review recovered drafts" }).click();
    await recovered.locator("dialog[open] input[type=checkbox]").first().check();
    await recovered.locator("dialog[open]").getByRole("button", { name: "Recover selected drafts" }).click();
    await recovered.waitForFunction(
      (value) => document.querySelector('#resourceEntryForm [name="target"]')?.value === value,
      `Recovered in ${engine}`
    );
    const recoveryForm = await recovered.locator("#resourceEntryForm").elementHandle();
    await recovered.locator("#resourceSaveAll").click();
    await waitSaved(recovered);
    await recovered.waitForFunction((form) => !form.isConnected, recoveryForm);
    await recoveryForm.dispose();
    check("draft survives tab closure and saves only after explicit recovery");
    await recovered.getByRole("button", { name: "Next", exact: true }).click();
    await recovered.locator("[data-entry-id=fixture-tm-100] .resource-entry-link").click();
    await recovered.locator('#resourceEntryForm [name="target"]').fill(`Page two saved in ${engine}`);
    await recovered.locator("#resourceEntryForm").getByRole("button", { name: "Save and next", exact: true }).click();
    await recovered.waitForFunction(
      () => document.querySelector('#resourceEntryForm [name="source"]')?.value === "Source 101"
    );
    await waitSaved(recovered);
    assert.equal(await recovered.locator("tr[data-entry-id]").first().getAttribute("data-entry-id"), "fixture-tm-100");
    assert.equal(
      await recovered.evaluate(async () => (await window.CatHan.storage.get("tmEntries", "fixture-tm-100")).target),
      `Page two saved in ${engine}`
    );
    check("Save and next preserves page two and advances to the next entry");
    await recovered.locator("#resourceAddEntry").click();
    await recovered.locator('#resourceEntryForm [name="source"]').fill("New browser translation unit");
    await recovered.locator('#resourceEntryForm [name="target"]').fill("Yeni çeviri birimi");
    await recovered.locator("#resourceSaveAll").click();
    await waitSaved(recovered);
    assert.equal(
      await recovered.evaluate(
        async () =>
          (
            await window.CatHan.storage.getAllByIndex(
              "tmEntries",
              "resourceId",
              window.CatHan.resourceEditor.getResource().id
            )
          ).length
      ),
      241
    );
    check("new TM entry saves");
    await accessibility(recovered, "TM editor");
    await recovered.screenshot({ path: path.join(artifacts, `${engine}-tm.png`), fullPage: true });

    await recovered.goto(`${url}#resource/tb/${encodeURIComponent(resources.tb)}`);
    await waitEditor(recovered);
    await waitCount(recovered, 4);
    await recovered.locator(".resource-editor-filters summary").click();
    await recovered.locator('.resource-editor-filters [aria-label="Term status"]').selectOption("forbidden");
    await waitCount(recovered, 1);
    assert.equal(await recovered.locator("tr[data-entry-id]").getAttribute("data-entry-id"), "fixture-term-2");
    await recovered.locator('.resource-editor-filters [aria-label="Term status"]').selectOption("");
    await waitCount(recovered, 4);
    await recovered.locator("[data-entry-id=fixture-term-0] .resource-entry-link").click();
    await recovered.locator('#resourceEntryForm [name="targetTerm"]').fill("arkadaşım");
    await recovered.locator('#resourceEntryForm [name="definition"]').fill("A trusted person");
    await recovered.locator('#resourceEntryForm [name="status"]').selectOption("admitted");
    await recovered.locator("#resourceSaveAll").click();
    await waitSaved(recovered);
    const term = await recovered.evaluate(() => window.CatHan.storage.get("terms", "fixture-term-0"));
    assert.equal(term.targetTerm, "arkadaşım");
    assert.equal(term.definition, "A trusted person");
    assert.equal(term.status, "admitted");
    check("TB filter, text, definition and status work");
    await recovered.locator("#resourceAddEntry").click();
    await recovered.locator('#resourceEntryForm [name="sourceTerm"]').fill("translator");
    await recovered.locator('#resourceEntryForm [name="targetTerm"]').fill("çevirmen");
    await recovered.locator("#resourceSaveAll").click();
    await waitSaved(recovered);
    await waitCount(recovered, 5);
    check("new TB entry saves");
    await recovered.getByRole("button", { name: "Import", exact: true }).click();
    const importDialog = recovered.locator("dialog[open]");
    await importDialog.getByLabel("Destination", { exact: true }).selectOption("");
    await importDialog.getByLabel("Resource name", { exact: true }).fill("Friendly language import");
    await importDialog.getByLabel("Source language", { exact: true }).fill("English (en)");
    await importDialog.getByLabel("Target language", { exact: true }).fill("Turkish (tr)");
    await importDialog.getByLabel("File", { exact: true }).waitFor({ state: "visible" });
    await importDialog
      .getByLabel("File", { exact: true })
      .setInputFiles({ name: "friendly.csv", mimeType: "text/csv", buffer: Buffer.from("source,target\ncat,kedi\n") });
    await importDialog.getByRole("button", { name: "Review import", exact: true }).click();
    await importDialog.getByRole("button", { name: "Import reviewed entries", exact: true }).click();
    await importDialog.getByRole("button", { name: "Download import report", exact: true }).waitFor();
    await importDialog.getByRole("button", { name: "Close", exact: true }).click();
    await importDialog.waitFor({ state: "hidden" });
    const imported = await recovered.evaluate(async () => {
      const resource = (await window.CatHan.storage.getAll("resources")).find(
        (item) => item.name === "Friendly language import"
      );
      return {
        resource,
        entries: resource ? await window.CatHan.storage.getAllByIndex("terms", "resourceId", resource.id) : []
      };
    });
    assert.equal(imported.resource?.sourceLang, "en");
    assert.equal(imported.resource?.targetLang, "tr");
    assert.equal(imported.entries.length, 1);
    assert.equal(imported.entries[0].targetTerm, "kedi");
    check("reviewed CSV import normalizes friendly language labels");
    await accessibility(recovered, "TB editor");
    await recovered.setViewportSize({ width: 520, height: 850 });
    await recovered.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    await recovered.waitForTimeout(100);
    assert.ok(
      await recovered.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
      "Narrow RTL editor overflows"
    );
    await recovered.screenshot({ path: path.join(artifacts, `${engine}-tb-narrow-rtl.png`), fullPage: true });
    check("narrow RTL layout has no horizontal overflow");
    assert.ok(
      result.accessibility.every(({ violations }) => violations.length === 0),
      "Editor accessibility violations"
    );
    assert.deepEqual(result.errors, [], "Unexpected browser errors");
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.failure = error.stack || String(error);
    if (current && !current.isClosed()) {
      result.fixtureProgress = await current.evaluate(() => window.resourceFixtureProgress).catch(() => []);
      result.storageDiagnostics = await bounded(
        current.evaluate(async () => {
          const counts = {};
          for (const name of ["resources", "tmEntries", "tmTokenIndex", "terms", "appMeta"]) {
            counts[name] = await Promise.race([
              window.CatHan.storage
                .getAll(name)
                .then((rows) =>
                  name === "appMeta" ? rows.filter((row) => ["committed-generation"].includes(row.key)) : rows.length
                ),
              new Promise((resolve) => setTimeout(() => resolve("timeout"), 1000))
            ]);
          }
          return counts;
        }),
        "storage diagnostics",
        7000
      ).catch((error) => ({ error: error.message }));
      result.visibleText = (
        await current
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(-4000);
      await current.screenshot({ path: path.join(artifacts, `${engine}-failure.png`), fullPage: true }).catch(() => {});
    }
    console.error(`[${engine}] ${result.failure}`);
  } finally {
    result.finishedAt = new Date().toISOString();
    if (context) await bounded(context.close(), "closing browser context", 5000).catch(() => {});
    if (browser) await bounded(browser.close(), "closing browser", 5000).catch(() => {});
  }
}

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const { server, url } = await startServer();
  try {
    for (const engine of engines) await verify(engine, url);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
    fs.writeFileSync(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2));
  }
  if (report.browsers.some((browser) => browser.status !== "passed")) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
