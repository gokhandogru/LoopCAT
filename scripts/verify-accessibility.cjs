const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

if (!process.versions.electron) {
  const electronBinary = require("electron");
  const noSandbox =
    process.env.LOOPCAT_ACCESSIBILITY_NO_SANDBOX === "1" ||
    (process.env.LOOPCAT_ACCESSIBILITY_NO_SANDBOX === undefined && process.platform === "linux");
  const result = spawnSync(electronBinary, [...(noSandbox ? ["--no-sandbox"] : []), __filename], {
    cwd: root,
    env: {
      ...process.env,
      LOOPCAT_ACCESSIBILITY_NO_SANDBOX: noSandbox ? "1" : "0"
    },
    stdio: "inherit"
  });
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = require("electron");
if (process.env.LOOPCAT_ACCESSIBILITY_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
const rendererProductionRoot = path.join(root, ".cache", "renderer", "production");
const { runtimeAssets } = require(path.join(rendererProductionRoot, "config", "production-assets.js"));
const axeSource = require("axe-core").source;
const generatedFiles = new Map([
  ["index.html", path.join(rendererProductionRoot, "index.html")],
  ["config/production-assets.js", path.join(rendererProductionRoot, "config", "production-assets.js")]
]);
for (const asset of JSON.parse(
  require("node:fs").readFileSync(path.join(rendererProductionRoot, "assets.json"), "utf8")
)) {
  generatedFiles.set(asset, path.join(rendererProductionRoot, asset));
}
const allowedFiles = new Set(runtimeAssets);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"]
]);
const userDataDir = path.join(os.tmpdir(), `loopcat-a11y-${process.pid}-${Date.now()}`);
let server;
let windowRef;

function resolveRequest(requestUrl) {
  const url = new URL(requestUrl || "/", "http://127.0.0.1");
  const relativePath = path.posix.normalize(decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html");
  if (!allowedFiles.has(relativePath)) return "";
  if (generatedFiles.has(relativePath)) return generatedFiles.get(relativePath);
  const resolved = path.resolve(root, relativePath);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : "";
}

function startServer() {
  server = http.createServer(async (request, response) => {
    try {
      const filePath = resolveRequest(request.url);
      if (!filePath) return response.writeHead(403).end("Forbidden");
      const body = await fs.readFile(filePath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream"
      });
      response.end(body);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end(error?.message || "Server error");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function waitFor(expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await windowRef.webContents.executeJavaScript(`Boolean(${expression})`, true)) return;
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function auditCurrentTheme(name) {
  await windowRef.webContents.executeJavaScript(axeSource, true);
  const results = await windowRef.webContents.executeJavaScript(
    `axe.run(document, {
    resultTypes: ["violations"],
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }
  })`,
    true
  );
  const blocking = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  if (blocking.length) {
    const detail = blocking
      .map((violation) => {
        const targets = violation.nodes
          .slice(0, 5)
          .map((node) => `${node.target.join(" ")}: ${node.failureSummary || ""}`)
          .join(", ");
        return `${violation.id} (${violation.impact}): ${targets}`;
      })
      .join("\n- ");
    throw new Error(`${name} has serious automated accessibility violations:\n- ${detail}`);
  }
  console.log(
    `Accessibility audit passed: ${name} (${results.violations.length} non-blocking finding${results.violations.length === 1 ? "" : "s"}).`
  );
}

async function audit(name) {
  for (const theme of ["light", "dark"]) {
    await windowRef.webContents.executeJavaScript(
      `(() => {
        const select = document.querySelector("#themeSelect");
        select.value = ${JSON.stringify(theme)};
        select.dispatchEvent(new Event("change", { bubbles: true }));
      })()`,
      true
    );
    await waitFor(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`, `${theme} theme`);
    // Let control background transitions finish before measuring contrast.
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    await windowRef.webContents.executeJavaScript(
      "document.getAnimations().forEach((animation) => animation.finish())",
      true
    );
    await auditCurrentTheme(`${name} (${theme})`);
  }
}

async function finish() {
  if (windowRef && !windowRef.isDestroyed()) windowRef.destroy();
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
  await fs.rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }).catch((error) => {
    console.warn(`Temporary accessibility profile cleanup: ${error.message}`);
  });
}

app.setPath("userData", userDataDir);
app.enableSandbox();
// Keep Electron alive until asynchronous cleanup and error reporting finish.
app.on("window-all-closed", () => {});

app
  .whenReady()
  .then(async () => {
    try {
      const port = await startServer();
      windowRef = new BrowserWindow({
        width: 1440,
        height: 900,
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
      });
      await windowRef.loadURL(`http://127.0.0.1:${port}/index.html`);
      await waitFor("document.querySelector('#projectsView') && window.CatHan?.storage", "Projects view");
      const safeDomProbe = await windowRef.webContents.executeJavaScript(
        `(() => {
          const probe = document.createElement("div");
          window.CatHan.appRuntime.safeHtml.replace(
            probe,
            '<img src="x" onerror="window.__loopcatUnsafeHtml = true"><script>window.__loopcatUnsafeHtml = true<\/script><a href="javascript:alert(1)">link</a><strong data-safe="yes">safe</strong>'
          );
          return {
            scriptCount: probe.querySelectorAll("script").length,
            eventAttributeCount: probe.querySelectorAll("[onerror]").length,
            unsafeHref: probe.querySelector("a")?.getAttribute("href") || "",
            safeText: probe.querySelector("strong")?.textContent || "",
            executed: Boolean(window.__loopcatUnsafeHtml)
          };
        })()`,
        true
      );
      if (
        safeDomProbe.scriptCount ||
        safeDomProbe.eventAttributeCount ||
        safeDomProbe.unsafeHref ||
        safeDomProbe.safeText !== "safe" ||
        safeDomProbe.executed
      ) {
        throw new Error(`Central safe-DOM boundary accepted executable markup: ${JSON.stringify(safeDomProbe)}`);
      }
      await audit("Projects empty");

      await windowRef.webContents.executeJavaScript("document.querySelector('#resourcesViewBtn').click()", true);
      await waitFor("!document.querySelector('#resourcesView').classList.contains('hidden')", "Resources view");
      await audit("Resources translation memories empty");
      await windowRef.webContents.executeJavaScript(
        `(() => {
          const tab = document.querySelector("#tmResourceTab");
          tab.focus();
          tab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        })()`,
        true
      );
      await waitFor(
        "document.querySelector('#tbResourceTab').getAttribute('aria-selected') === 'true'",
        "Resources keyboard tab navigation"
      );
      await audit("Resources termbases empty");
      await windowRef.webContents.executeJavaScript(
        `window.CatHan.storage.put("trashEntries", {
          id: "a11y-resource-trash",
          entityType: "term",
          entityId: "a11y-term",
          projectId: "",
          resourceType: "tb",
          resourceName: "Accessibility terms",
          sourceLang: "en",
          targetLang: "tr",
          languagePair: "en::tr",
          label: "Termbase entry · Accessibility terms",
          deletedAt: new Date().toISOString(),
          payload: { records: [{
            id: "a11y-term",
            termBaseName: "Accessibility terms",
            sourceLang: "en",
            targetLang: "tr",
            languagePair: "en::tr",
            sourceTerm: "source",
            targetTerm: "target"
          }] }
        })`,
        true
      );
      await windowRef.webContents.executeJavaScript("document.querySelector('#trashBtn').click()", true);
      await waitFor("document.querySelector('#trashDialog').open", "Resource Trash dialog");
      await waitFor("document.querySelector('#trashList .trash-item')", "Resource Trash item");
      await audit("Resource Trash populated");
      await windowRef.webContents.executeJavaScript("document.querySelector('#closeTrashBtn').click()", true);
      await waitFor("!document.querySelector('#trashDialog').open", "Resource Trash dialog close");
      await windowRef.webContents.executeJavaScript(
        "window.CatHan.storage.deleteByKey('trashEntries', 'a11y-resource-trash')",
        true
      );
      await windowRef.webContents.executeJavaScript("document.querySelector('#projectsViewBtn').click()", true);
      await waitFor("!document.querySelector('#projectsView').classList.contains('hidden')", "Projects return");

      const fixture = JSON.parse(
        await fs.readFile(path.join(root, "tests", "fixtures", "modernization", "baseline-backup.json"), "utf8")
      );
      const recoveryProjectId = fixture.projects?.[0]?.id;
      if (!recoveryProjectId) throw new Error("Accessibility fixture has no project for workspace recovery.");
      await windowRef.webContents.executeJavaScript(
        `(async () => {
          await window.CatHan.storage.importAllData(${JSON.stringify(fixture)});
          localStorage.setItem("loopcat.workspace.dirtyProjectIds", ${JSON.stringify(JSON.stringify([recoveryProjectId]))});
        })()`,
        true
      );
      await windowRef.reload();
      await waitFor("document.querySelector('.project-tile button.primary')", "populated accessibility project");
      await waitFor(
        "!document.querySelector('#workspaceRecoveryPanel').classList.contains('hidden')",
        "accessible workspace recovery panel"
      );
      await audit("Workspace recovery visible");
      await windowRef.webContents.executeJavaScript(
        `(() => {
          const opener = document.querySelector("#workspaceRecoveryOpenBtn");
          opener.focus();
          opener.click();
        })()`,
        true
      );
      await waitFor(
        "document.querySelector('.workspace-menu').open && document.activeElement === document.querySelector('#workspaceMenuSummary')",
        "accessible workspace local status menu"
      );
      await audit("Workspace local status menu");
      await windowRef.webContents.executeJavaScript(
        `(() => {
          const dismiss = document.querySelector("#workspaceRecoveryDismissBtn");
          dismiss.focus();
          dismiss.click();
        })()`,
        true
      );
      await waitFor(
        "document.querySelector('#workspaceRecoveryPanel').classList.contains('hidden') && document.activeElement === document.querySelector('#workspaceMenuSummary')",
        "accessible workspace recovery dismissal"
      );
      await windowRef.webContents.executeJavaScript(
        "document.querySelector('.workspace-menu').removeAttribute('open')",
        true
      );
      await windowRef.webContents.executeJavaScript(
        "document.querySelector('.project-tile button.primary').click()",
        true
      );
      await waitFor("document.querySelector('.file-card button.primary')", "accessibility project dashboard");
      await audit("Project dashboard populated");
      await windowRef.webContents.executeJavaScript(
        "document.querySelector('.file-card button.primary').click()",
        true
      );
      await waitFor("document.querySelector('#segmentBody textarea')", "accessibility translation editor");
      await audit("Editor with segments, status badges, and matches");
      await windowRef.webContents.executeJavaScript(
        `(() => {
          const returnTarget = document.querySelector("#focusModeBtn");
          const input = document.querySelector("#projectPackageImportInput");
          returnTarget.focus();
          Object.defineProperty(input, "files", {
            configurable: true,
            value: [new File(["{"], "invalid-project.loopcat.json", { type: "application/json" })]
          });
          input.dispatchEvent(new Event("change", { bubbles: true }));
        })()`,
        true
      );
      await waitFor(
        "!document.querySelector('#validationReportPanel').classList.contains('hidden') && document.querySelector('#validationReportList').textContent.includes('not valid JSON')",
        "accessible import validation error"
      );
      await audit("Import validation error");
      await windowRef.webContents.executeJavaScript(
        `(() => {
          const dismiss = document.querySelector("#validationReportMeta .validation-dismiss");
          dismiss.focus();
          dismiss.click();
        })()`,
        true
      );
      await waitFor(
        "document.querySelector('#validationReportPanel').classList.contains('hidden') && document.activeElement === document.querySelector('#focusModeBtn')",
        "accessible import validation focus return"
      );
      await windowRef.webContents.executeJavaScript("document.querySelector('#inspectorTabReview').click()", true);
      await waitFor(
        "document.querySelector('#inspectorTabReview').getAttribute('aria-selected') === 'true'",
        "populated review inspector"
      );
      await audit("Review comments populated");
      await windowRef.webContents.executeJavaScript("document.querySelector('#inspectorTabQuality').click()", true);
      await waitFor(
        "document.querySelector('#inspectorTabQuality').getAttribute('aria-selected') === 'true'",
        "populated Quality Workbench"
      );
      await windowRef.webContents.executeJavaScript(
        `(() => {
          const toggle = document.querySelector("#inspectorQualityPanel [data-panel-toggle]");
          if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
          document.querySelector("#runQaBtn").click();
          document.querySelector("#refreshQualityRiskBtn").click();
        })()`,
        true
      );
      await waitFor("document.querySelector('#qualitySummary .quality-summary-grid')", "expanded quality summary");
      await audit("Quality Workbench populated");
      await windowRef.webContents.executeJavaScript(
        `(() => {
          document.querySelector("#inspectorTabAi").click();
        })()`,
        true
      );
      await audit("AI sidebar with scope selection");
      await windowRef.webContents.executeJavaScript(
        `(() => {
          const opener = document.querySelector("#openProjectAiSettingsBtn");
          opener.focus();
          opener.click();
        })()`,
        true
      );
      await waitFor("document.querySelector('#aiProviderDialog').open", "AI provider administration dialog");
      await audit("AI provider administration and command centre");
      await windowRef.webContents.executeJavaScript(
        "document.querySelector('#closeAiProviderDialogBtn').click()",
        true
      );
      await waitFor("!document.querySelector('#aiProviderDialog').open", "AI provider administration dialog close");
      await waitFor(
        "document.activeElement === document.querySelector('#openProjectAiSettingsBtn')",
        "AI provider administration focus return"
      );
      await windowRef.webContents.executeJavaScript("document.querySelector('#projectsViewBtn').click()", true);
      await waitFor(
        "!document.querySelector('#projectsView').classList.contains('hidden')",
        "Projects return after quality audit"
      );

      await windowRef.webContents.executeJavaScript(
        `(() => {
          const opener = document.querySelector("#newProjectBtn");
          opener.focus();
          opener.click();
        })()`,
        true
      );
      await waitFor("document.querySelector('#projectDialog').open", "New project dialog");
      await waitFor(
        "document.activeElement === document.querySelector('#projectNameInput')",
        "New project dialog initial focus"
      );
      await audit("New project dialog");
      windowRef.webContents.sendInputEvent({ type: "keyDown", keyCode: "ESC" });
      windowRef.webContents.sendInputEvent({ type: "keyUp", keyCode: "ESC" });
      await waitFor("!document.querySelector('#projectDialog').open", "New project dialog Escape close");
      await waitFor(
        "document.activeElement === document.querySelector('#newProjectBtn')",
        "New project dialog focus return"
      );

      await windowRef.webContents.executeJavaScript("document.querySelector('#aboutBtn').click()", true);
      await waitFor("document.querySelector('#aboutDialog').open", "About dialog");
      await waitFor(
        "document.activeElement === document.querySelector('#closeAboutBtn')",
        "About dialog initial focus"
      );
      await audit("About dialog");
      await windowRef.webContents.executeJavaScript("document.querySelector('#closeAboutBtn').click()", true);
      await waitFor("!document.querySelector('#aboutDialog').open", "About dialog close");
      await waitFor("document.activeElement === document.querySelector('#aboutBtn')", "About dialog focus return");

      await windowRef.webContents.executeJavaScript(
        `(() => {
          const dialog = document.querySelector("#tmPretranslateDialog");
          dialog.showModal();
          document.querySelector("#tmPretranslateThresholdInput").focus();
        })()`,
        true
      );
      await waitFor("document.querySelector('#tmPretranslateDialog').open", "TM threshold dialog");
      await audit("TM pretranslation threshold dialog");
      windowRef.webContents.sendInputEvent({ type: "keyDown", keyCode: "ESC" });
      windowRef.webContents.sendInputEvent({ type: "keyUp", keyCode: "ESC" });
      await waitFor("!document.querySelector('#tmPretranslateDialog').open", "TM threshold dialog Escape close");

      await windowRef.webContents.executeJavaScript(
        `(() => {
          const dialog = document.querySelector("#opusCatHelpDialog");
          dialog.showModal();
          document.querySelector("#closeOpusCatHelpBtn").focus();
        })()`,
        true
      );
      await waitFor("document.querySelector('#opusCatHelpDialog').open", "OPUS-CAT help dialog");
      await audit("OPUS-CAT connection help dialog");
      windowRef.webContents.sendInputEvent({ type: "keyDown", keyCode: "ESC" });
      windowRef.webContents.sendInputEvent({ type: "keyUp", keyCode: "ESC" });
      await waitFor("!document.querySelector('#opusCatHelpDialog').open", "OPUS-CAT help dialog Escape close");

      await windowRef.webContents.executeJavaScript(
        `(() => {
        const overlay = document.querySelector("#commandPaletteOverlay");
        overlay.classList.remove("hidden");
        overlay.setAttribute("aria-hidden", "false");
      })()`,
        true
      );
      await waitFor(
        "document.querySelector('#commandPaletteOverlay').getAttribute('aria-hidden') === 'false'",
        "command palette"
      );
      await audit("Command palette");
      console.log(
        "Automated accessibility verification passed. Manual keyboard, zoom, focus, forced-colors, and screen-reader checks remain required."
      );
    } finally {
      await finish();
    }
    app.exit(0);
  })
  .catch(async (error) => {
    console.error(error?.stack || error?.message || String(error));
    await finish();
    app.exit(1);
  });
