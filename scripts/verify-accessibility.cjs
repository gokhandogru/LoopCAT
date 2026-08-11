const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

if (!process.versions.electron) {
  const electronBinary = require("electron");
  const result = spawnSync(electronBinary, [__filename], {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = require("electron");
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

async function audit(name) {
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
          .map((node) => node.target.join(" "))
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

async function finish() {
  if (windowRef && !windowRef.isDestroyed()) windowRef.destroy();
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
  await fs.rm(userDataDir, { recursive: true, force: true });
}

app.setPath("userData", userDataDir);
app.enableSandbox();

app
  .whenReady()
  .then(async () => {
    try {
      const port = await startServer();
      windowRef = new BrowserWindow({
        width: 1440,
        height: 900,
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
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
      await windowRef.webContents.executeJavaScript("document.querySelector('#projectsViewBtn').click()", true);
      await waitFor("!document.querySelector('#projectsView').classList.contains('hidden')", "Projects return");

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
