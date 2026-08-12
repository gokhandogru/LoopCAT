const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const rawArgs = process.argv.slice(2);
function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

if (!process.versions.electron) {
  for (const script of ["scripts/build-renderer.cjs", "scripts/verify-renderer-build.cjs"]) {
    const buildResult = spawnSync(process.execPath, [path.join(root, script)], { cwd: root, stdio: "inherit" });
    if (buildResult.status !== 0) process.exit(buildResult.status ?? 1);
  }
  const verify = rawArgs.includes("--verify");
  const requestedOutput = optionValue(rawArgs, "--output");
  const outputDir = requestedOutput
    ? path.resolve(process.cwd(), requestedOutput)
    : verify
      ? path.join(os.tmpdir(), `loopcat-modernization-baseline-${process.pid}`)
      : path.join(root, "test-artifacts", "modernization-baseline-current");
  let electronBinary;
  try {
    electronBinary = require("electron");
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
  const childArgs = [
    __filename,
    ...rawArgs.filter((arg, index) => arg !== "--output" && rawArgs[index - 1] !== "--output"),
    "--output",
    outputDir
  ];
  const result = spawnSync(electronBinary, childArgs, {
    cwd: root,
    env: {
      ...process.env,
      LOOPCAT_BASELINE_HOST_NODE: process.version,
      LOOPCAT_BASELINE_NO_SANDBOX: process.env.LOOPCAT_BASELINE_NO_SANDBOX || "1"
    },
    stdio: "inherit"
  });
  if (result.error) console.error(result.error.message);
  if (verify) fs.rmSync(outputDir, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = require("electron");
const rendererProductionRoot = path.join(root, ".cache", "renderer", "production");
const { offlineAssets } = require(path.join(rendererProductionRoot, "config", "production-assets.js"));
const outputDir = path.resolve(optionValue(rawArgs, "--output"));
const verify = rawArgs.includes("--verify");
const userDataDir = path.join(os.tmpdir(), `loopcat-modernization-profile-${process.pid}`);
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, "tests", "fixtures", "modernization", "baseline-backup.json"), "utf8")
);
const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 }
];
const productionFiles = [...offlineAssets];
const allowedFiles = new Set(productionFiles);
const generatedFiles = new Map([
  ["index.html", path.join(rendererProductionRoot, "index.html")],
  ["config/production-assets.js", path.join(rendererProductionRoot, "config", "production-assets.js")]
]);
for (const asset of JSON.parse(fs.readFileSync(path.join(rendererProductionRoot, "assets.json"), "utf8"))) {
  generatedFiles.set(asset, path.join(rendererProductionRoot, asset));
}
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"]
]);

let server;
let windowRef;
let failed = false;
const pageErrors = [];
const screenshots = [];

app.disableHardwareAcceleration();
if (process.env.LOOPCAT_BASELINE_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-dev-shm-usage");
app.setPath("userData", userDataDir);

function requestFilePath(requestUrl) {
  const url = new URL(requestUrl || "/", "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const relativePath = path.posix.normalize(pathname.replace(/^\/+/, "").replaceAll("\\", "/"));
  if (!allowedFiles.has(relativePath)) return "";
  if (generatedFiles.has(relativePath)) return generatedFiles.get(relativePath);
  const resolved = path.resolve(root, relativePath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : "";
}

function startServer() {
  server = http.createServer(async (request, response) => {
    try {
      const filePath = requestFilePath(request.url);
      if (!filePath) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const data = await fsPromises.readFile(filePath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream"
      });
      response.end(data);
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
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await windowRef.webContents.executeJavaScript(`Boolean(${expression})`, true)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function settle() {
  await windowRef.webContents.executeJavaScript(
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    true
  );
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function captureState(number, slug) {
  for (const viewport of viewports) {
    windowRef.setContentSize(viewport.width, viewport.height);
    await settle();
    const fileName = `${number}-${slug}-${viewport.name}.png`;
    const image = await windowRef.webContents.capturePage();
    await fsPromises.writeFile(path.join(outputDir, fileName), image.toPNG());
    screenshots.push(fileName);
  }
}

function fileMetrics() {
  const files = {};
  let totalBytes = 0;
  for (const relativePath of productionFiles) {
    const bytes = fs.statSync(generatedFiles.get(relativePath) || path.join(root, relativePath)).size;
    files[relativePath] = bytes;
    totalBytes += bytes;
  }
  const indexText = fs.readFileSync(generatedFiles.get("index.html"), "utf8");
  return {
    files,
    totalBytes,
    synchronousScriptCount: (indexText.match(/<script\b[^>]*\bsrc=/gi) || []).length,
    stylesheetCount: (indexText.match(/<link\b[^>]*\brel=["']stylesheet["']/gi) || []).length
  };
}

function gitCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

async function finish(code) {
  if (windowRef && !windowRef.isDestroyed()) windowRef.destroy();
  if (server) await new Promise((resolve) => server.close(resolve));
  await fsPromises.rm(userDataDir, { recursive: true, force: true });
  app.exit(code);
}

app
  .whenReady()
  .then(async () => {
    await fsPromises.rm(outputDir, { recursive: true, force: true });
    await fsPromises.mkdir(outputDir, { recursive: true });
    const port = await startServer();
    const url = `http://127.0.0.1:${port}/index.html`;
    windowRef = new BrowserWindow({
      width: 1440,
      height: 900,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    windowRef.webContents.on("console-message", (details) => {
      if (details.level === "error" && !/DevTools listening/i.test(details.message)) {
        pageErrors.push(String(details.message));
      }
    });
    windowRef.webContents.on("render-process-gone", (_event, details) => {
      pageErrors.push(`Renderer exited: ${details.reason}`);
      failed = true;
    });

    const loadStarted = performance.now();
    await windowRef.loadURL(url);
    await waitFor(
      "window.CatHan?.storage?.importAllData && document.querySelector('#projectDashboard')",
      "empty workspace"
    );
    const startupMs = performance.now() - loadStarted;
    await captureState("01", "projects-empty");

    await windowRef.webContents.executeJavaScript(
      `window.CatHan.storage.importAllData(${JSON.stringify(fixture)})`,
      true
    );
    await windowRef.reload();
    await waitFor("document.querySelector('.project-tile button.primary')", "populated projects");
    await captureState("01", "projects-populated");

    await windowRef.webContents.executeJavaScript("document.querySelector('#resourcesViewBtn').click()", true);
    await waitFor("document.querySelector('#tmResourceDashboard .resource-card')", "TM resources dashboard");
    await captureState("02", "resources-translation-memories");
    await windowRef.webContents.executeJavaScript(
      "document.querySelector('#tmResourceDashboard [data-resource-action=\"open\"]').click()",
      true
    );
    await waitFor("!document.querySelector('#tmResourceDetail').classList.contains('hidden')", "TM resource detail");
    await captureState("02", "resource-translation-memory-detail");
    await windowRef.webContents.executeJavaScript(
      "document.querySelector('#tmResourceDetail [data-resource-action=\"delete-entry\"]').click()",
      true
    );
    await waitFor("document.querySelector('#trashBtn').textContent.includes('Trash (1)')", "Resource in Trash");
    await windowRef.webContents.executeJavaScript("document.querySelector('#trashBtn').click()", true);
    await waitFor("document.querySelector('#trashDialog').open", "resource Trash dialog");
    await waitFor("document.querySelector('#trashList .trash-item')", "resource Trash item");
    await captureState("03", "resource-trash-populated");
    await windowRef.webContents.executeJavaScript(
      "document.querySelector('#trashList .trash-item-actions button').click()",
      true
    );
    await waitFor("document.querySelector('#trashList .muted')", "empty Trash after resource restore");
    await captureState("03", "resource-trash-empty-after-restore");
    await windowRef.webContents.executeJavaScript("document.querySelector('#closeTrashBtn').click()", true);
    await waitFor("!document.querySelector('#trashDialog').open", "closed resource Trash dialog");
    await windowRef.webContents.executeJavaScript("document.querySelector('#tbResourceTab').click()", true);
    await waitFor("document.querySelector('#tbResourceTab').getAttribute('aria-selected') === 'true'", "Termbase tab");
    await waitFor("document.querySelector('#tbResourceDashboard .resource-card')", "Termbase resources dashboard");
    await captureState("02", "resources-termbases");
    await windowRef.webContents.executeJavaScript("document.querySelector('#projectsViewBtn').click()", true);
    await waitFor("document.querySelector('.project-tile button.primary')", "populated projects return");

    await windowRef.webContents.executeJavaScript(
      "document.querySelector('.project-tile button.primary').click()",
      true
    );
    await waitFor(
      "!document.querySelector('#projectHomeView').classList.contains('hidden') && document.querySelector('.file-card button.primary')",
      "project dashboard"
    );
    await captureState("02", "project-dashboard");

    await windowRef.webContents.executeJavaScript("document.querySelector('#newProjectBtn').click()", true);
    await waitFor("document.querySelector('#projectDialog').open", "new-project dialog");
    await captureState("04", "new-project-dialog");
    await windowRef.webContents.executeJavaScript("document.querySelector('#projectDialog').close()", true);

    await windowRef.webContents.executeJavaScript(
      `(() => {
        const dialog = document.querySelector("#tmPretranslateDialog");
        dialog.showModal();
        document.querySelector("#tmPretranslateThresholdInput").focus();
      })()`,
      true
    );
    await waitFor("document.querySelector('#tmPretranslateDialog').open", "TM threshold dialog");
    await captureState("05", "tm-pretranslation-threshold-dialog");
    await windowRef.webContents.executeJavaScript(
      "document.querySelector('#tmPretranslateDialog').close('cancel')",
      true
    );

    await windowRef.webContents.executeJavaScript(
      `(() => {
        const dialog = document.querySelector("#opusCatHelpDialog");
        dialog.showModal();
        document.querySelector("#closeOpusCatHelpBtn").focus();
      })()`,
      true
    );
    await waitFor("document.querySelector('#opusCatHelpDialog').open", "OPUS-CAT help dialog");
    await captureState("06", "opus-cat-help-dialog");
    await windowRef.webContents.executeJavaScript("document.querySelector('#opusCatHelpDialog').close()", true);

    await windowRef.webContents.executeJavaScript("document.querySelector('.file-card button.primary').click()", true);
    await waitFor(
      "!document.querySelector('#editorView').classList.contains('hidden') && document.querySelector('#segmentBody textarea')",
      "translation editor"
    );
    await captureState("03", "translation-editor");

    await windowRef.webContents.executeJavaScript("document.querySelector('#inspectorToggleBtn').click()", true);
    await waitFor(
      "document.querySelector('#inspectorToggleBtn').getAttribute('aria-expanded') === 'false'",
      "closed inspector"
    );
    await captureState("04", "editor-inspector-closed");
    await windowRef.webContents.executeJavaScript("document.querySelector('#inspectorToggleBtn').click()", true);
    await waitFor(
      "document.querySelector('#inspectorToggleBtn').getAttribute('aria-expanded') === 'true'",
      "open inspector"
    );

    const typingDispatchMs = await windowRef.webContents.executeJavaScript(
      `(() => {
    const textarea = document.querySelector('#segmentBody textarea');
    textarea.focus();
    const started = performance.now();
    textarea.value = textarea.value + ' ';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return performance.now() - started;
  })()`,
      true
    );
    const scrollSampleMs = await windowRef.webContents.executeJavaScript(
      `new Promise((resolve) => {
    const scroller = document.querySelector('.segment-grid-wrap');
    const started = performance.now();
    let frame = 0;
    const step = () => {
      scroller.scrollTop = (frame % 2) * Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      frame += 1;
      if (frame >= 12) resolve(performance.now() - started);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })`,
      true
    );

    const aiTabState = await windowRef.webContents.executeJavaScript(
      `(() => {
        document.querySelector('#inspectorTabAi').click();
        return {
          selected: document.querySelector('#inspectorTabAi').getAttribute('aria-selected'),
          activeTab: document.querySelector('#editorInspector').dataset.inspectorTab || '',
          inspectorHidden: document.querySelector('#editorInspector').classList.contains('hidden')
        };
      })()`,
      true
    );
    if (aiTabState.selected !== "true" || aiTabState.activeTab !== "ai") {
      throw new Error(`Contextual AI inspector did not activate: ${JSON.stringify(aiTabState)}`);
    }
    await captureState("05", "contextual-ai-inspector");
    await windowRef.webContents.executeJavaScript(
      "document.querySelector('[data-inspector-tab=\"matches\"]').click()",
      true
    );

    await captureState("06", "editor-responsive");
    await windowRef.webContents.executeJavaScript(
      "document.querySelector('#densitySelect').value = 'compact'; document.querySelector('#densitySelect').dispatchEvent(new Event('change', { bubbles: true }))",
      true
    );
    await waitFor("document.documentElement.dataset.density === 'compact'", "Compact editor density");
    await captureState("07", "editor-compact");

    await windowRef.webContents.executeJavaScript("document.querySelector('#focusModeBtn').click()", true);
    await waitFor("document.body.classList.contains('focus-mode')", "Focus mode");
    await captureState("08", "focus-mode");
    await windowRef.webContents.executeJavaScript("document.querySelector('#exitFocusModeBtn').click()", true);

    await windowRef.webContents.executeJavaScript("document.querySelector('#commandPaletteBtn').click()", true);
    await waitFor("!document.querySelector('#commandPaletteOverlay').classList.contains('hidden')", "command palette");
    await captureState("09", "command-palette");
    await windowRef.webContents.executeJavaScript("document.querySelector('#closeCommandPaletteBtn').click()", true);

    await windowRef.webContents.executeJavaScript(
      "document.querySelector('#themeSelect').value = 'dark'; document.querySelector('#themeSelect').dispatchEvent(new Event('change', { bubbles: true }))",
      true
    );
    await waitFor("document.documentElement.dataset.theme === 'dark'", "dark theme");
    await captureState("10", "dark-editor-inspector-open");
    await windowRef.webContents.executeJavaScript("document.querySelector('#inspectorToggleBtn').click()", true);
    await waitFor(
      "document.querySelector('#inspectorToggleBtn').getAttribute('aria-expanded') === 'false'",
      "dark closed inspector"
    );
    await captureState("11", "dark-editor-inspector-closed");
    await windowRef.webContents.executeJavaScript("document.querySelector('#focusModeBtn').click()", true);
    await waitFor("document.body.classList.contains('focus-mode')", "dark Focus mode");
    await captureState("12", "dark-focus-mode");

    const metadata = {
      capturedAt: new Date().toISOString(),
      commit: gitCommit(),
      syntheticFixture: "tests/fixtures/modernization/baseline-backup.json",
      runtime: {
        hostNode: process.env.LOOPCAT_BASELINE_HOST_NODE || "unknown",
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        embeddedNode: process.versions.node,
        platform: process.platform,
        arch: process.arch
      },
      viewports,
      screenshots,
      measurements: {
        startupMs: Number(startupMs.toFixed(2)),
        typingDispatchMs: Number(typingDispatchMs.toFixed(2)),
        twelveScrollFramesMs: Number(scrollSampleMs.toFixed(2)),
        bundle: fileMetrics()
      },
      keyboardPaths: [
        "Projects -> Open project -> Open file -> target editor",
        "Alt+Arrow segment navigation",
        "Ctrl/Cmd+Shift+F Focus mode",
        "Ctrl/Cmd+K command palette",
        "Ctrl/Cmd/Alt+K concordance"
      ],
      knownAccessibilityExceptions: [
        "Automated checks do not replace the manual keyboard, 200% zoom, forced-colors, NVDA, and VoiceOver matrix."
      ],
      pageErrors
    };
    await fsPromises.writeFile(path.join(outputDir, "baseline.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    const expectedScreenshotCount = 63;
    if (screenshots.length !== expectedScreenshotCount) {
      throw new Error(`Expected ${expectedScreenshotCount} screenshots, captured ${screenshots.length}.`);
    }
    if (pageErrors.length) throw new Error(`Page errors during capture: ${pageErrors.join(" | ")}`);
    console.log(
      `Modernization baseline ${verify ? "verification" : "capture"} passed: ${screenshots.length} screenshots in ${outputDir}.`
    );
    await finish(0);
  })
  .catch(async (error) => {
    failed = true;
    console.error(error.stack || error.message || String(error));
    await finish(1);
  });

process.on("exit", () => {
  if (failed) process.exitCode = 1;
});
