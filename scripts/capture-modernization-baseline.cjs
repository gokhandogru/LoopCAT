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
  const noSandbox =
    process.env.LOOPCAT_BASELINE_NO_SANDBOX === "1" ||
    (process.env.LOOPCAT_BASELINE_NO_SANDBOX === undefined && process.platform === "linux");
  const childArgs = [
    ...(noSandbox ? ["--no-sandbox"] : []),
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
      LOOPCAT_BASELINE_NO_SANDBOX: noSandbox ? "1" : "0"
    },
    stdio: "inherit"
  });
  if (result.error) console.error(result.error.message);
  if (verify && !requestedOutput) fs.rmSync(outputDir, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = require("electron");
const rendererProductionRoot = path.join(root, ".cache", "renderer", "production");
const { offlineAssets } = require(path.join(rendererProductionRoot, "config", "production-assets.js"));
const outputDir = path.resolve(optionValue(rawArgs, "--output"));
const verify = rawArgs.includes("--verify");
const recordReferenceIssues = rawArgs.includes("--record-reference-issues");
if (recordReferenceIssues && verify) throw new Error("Reference issues cannot be accepted by the verification gate.");
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
const editorSpaceMeasurements = {};
const workspaceLayoutMeasurements = [];
const referenceIssues = [];

app.disableHardwareAcceleration();
if (process.platform === "win32") app.commandLine.appendSwitch("in-process-gpu");
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

async function revealControl(selector) {
  const parents = await windowRef.webContents.executeJavaScript(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw new Error("Missing capture control: " + ${JSON.stringify(selector)});
    const list = [];
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches("details") && parent.querySelector(":scope > summary") !== node) list.unshift(parent);
    }
    return list.length;
  })()`, true);
  for (let index = 0; index < parents; index++) {
    await windowRef.webContents.executeJavaScript(`(() => {
      const chain = [];
      const node = document.querySelector(${JSON.stringify(selector)});
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (parent.matches("details") && parent.querySelector(":scope > summary") !== node) chain.unshift(parent);
      }
      const menu = chain[${index}];
      if (!menu.open) {
        const summary = menu.querySelector(":scope > summary");
        if (!summary.checkVisibility()) throw new Error("Hidden parent disclosure: " + summary.textContent);
        summary.click();
      }
    })()`, true);
    await settle();
  }
  const visible = await windowRef.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).checkVisibility()`, true);
  if (!visible) {
    const ancestry = await windowRef.webContents.executeJavaScript(`(() => {
      const trace = [];
      for (let p = document.querySelector(${JSON.stringify(selector)}); p; p = p.parentElement) {
        trace.push([p.tagName, p.id, p.className, p.open, getComputedStyle(p).display]);
      }
      return trace;
    })()`, true);
    throw new Error(`Capture control ${selector} is hidden: ${JSON.stringify(ancestry)}`);
  }
}

async function clickControl(selector) {
  await revealControl(selector);
  await windowRef.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`, true);
  await settle();
}

async function setExactViewport(viewport) {
  if (!windowRef.webContents.debugger.isAttached()) windowRef.webContents.debugger.attach("1.3");
  await windowRef.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: viewport.width,
    screenHeight: viewport.height
  });
  await settle();
  const actual = await windowRef.webContents.executeJavaScript(
    `({ width: window.innerWidth, height: window.innerHeight })`,
    true
  );
  if (actual.width !== viewport.width || actual.height !== viewport.height) {
    throw new Error(`Could not set ${viewport.name} renderer viewport; received ${actual.width}x${actual.height}.`);
  }
}

async function captureState(number, slug, beforeCapture = null) {
  for (const viewport of viewports) {
    await setExactViewport(viewport);
    if (beforeCapture) await beforeCapture();
    const fileName = `${number}-${slug}-${viewport.name}.png`;
    const image = await windowRef.webContents.capturePage();
    await fsPromises.writeFile(path.join(outputDir, fileName), image.toPNG());
    screenshots.push(fileName);
  }
}

async function captureCollectionMode(number, slug, scope, mode, restoreMode) {
  await windowRef.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-collection-scope="' + ${JSON.stringify(scope)} + '"] [data-view-mode="' + ${JSON.stringify(mode)} + '"]');
    const containers = button.getAttribute("aria-controls").split(" ").map((id) => document.getElementById(id));
    const nodes = containers.flatMap((container) => Array.from(container.children));
    const inputs = containers.flatMap((container) => Array.from(container.querySelectorAll("input, textarea, select")));
    const values = inputs.map((input) => [input, input.value, input.checked]);
    button.click();
    if (button.getAttribute("aria-pressed") !== "true" || nodes.some((node) => !node.isConnected) ||
      values.some(([input, value, checked]) => input.value !== value || input.checked !== checked)) {
      throw new Error("Collection layout switch changed its data or failed to select the requested mode");
    }
  })()`, true);
  const itemSelector = scope === "files" ? "#projectFileList .file-card" :
    scope === "resource-entries" ? "#tmResourceDetail .resource-row" : "";
  await captureState(number, slug, itemSelector ? async () => {
    await windowRef.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(itemSelector)}).scrollIntoView({ block: "center" })`, true);
    await settle();
  } : null);
  await windowRef.webContents.executeJavaScript(
    `document.querySelector('[data-collection-scope="' + ${JSON.stringify(scope)} + '"] [data-view-mode="' + ${JSON.stringify(restoreMode)} + '"]').click()`, true);
  if (itemSelector) await windowRef.webContents.executeJavaScript(`(() => {
    for (let item = document.querySelector(${JSON.stringify(itemSelector)}); item; item = item.parentElement) item.scrollTop = 0;
  })()`, true);
}

async function captureResourceDensity(slug) {
  async function setDensity(value) {
    await windowRef.webContents.executeJavaScript(`(() => {
      const control = document.querySelector('#resourcesView select[aria-label="Row density"]');
      control.value = ${JSON.stringify(value)};
      control.dispatchEvent(new Event("change", { bubbles: true }));
    })()`, true);
    await waitFor(`document.querySelector('#resourcesView').dataset.density === ${JSON.stringify(value)}`, `resource library density ${value}`);
  }
  await setDensity("comfortable");
  await captureState("02", slug);
  await setDensity("compact");
}

async function verifyWorkspaceLayout() {
  const longNotice = "Save could not be completed. Your latest edits are still available in this window. Open Workspace to retry local saving or export a recovery copy. ".repeat(3);
  for (const viewport of [...viewports, { name: "768x768", width: 768, height: 768 }]) {
    await setExactViewport(viewport);
    const measurement = await windowRef.webContents.executeJavaScript(
      `(() => {
        const status = document.querySelector("#saveStatus");
        const header = document.querySelector(".topbar");
        const message = status.querySelector("#saveStatusMessage") || status;
        const original = { text: message.textContent, className: status.className, hidden: status.hidden };
        message.textContent = "";
        const headerHeight = header.getBoundingClientRect().height;
        const workspaceBefore = document.querySelector("#workspace").getBoundingClientRect().toJSON();
        status.className = "save-status error";
        status.hidden = false;
        message.textContent = ${JSON.stringify(longNotice)};
        const noticeRect = status.getBoundingClientRect();
        const navItems = [...document.querySelector(".topbar-actions").children].map((element) => element.getBoundingClientRect());
        const workspace = document.querySelector("#workspace").getBoundingClientRect();
        const inspector = document.querySelector("#editorInspector").getBoundingClientRect();
        const scroller = document.querySelector(".segment-grid-wrap").getBoundingClientRect();
        const result = {
          viewport: { width: innerWidth, height: innerHeight },
          headerHeight,
          headerHeightWithNotice: header.getBoundingClientRect().height,
          navInsideViewport: navItems.every((rect) => rect.left >= 0 && rect.right <= innerWidth + 1),
          navRows: new Set(navItems.map((rect) => Math.round(rect.top))).size,
          noticeOutsideFlow: getComputedStyle(status).position === "fixed",
          workspaceStable: JSON.stringify(workspaceBefore) === JSON.stringify(workspace.toJSON()),
          noticeInsideViewport: noticeRect.left >= 0 && noticeRect.right <= innerWidth + 1,
          guideInWorkspace: Boolean(document.querySelector(".workspace-menu .workspace-guide-link")),
          hiddenControlsVisible: [...document.querySelectorAll("[hidden]")].some((element) => getComputedStyle(element).display !== "none"),
          workspaceLabel: document.querySelector("#workspaceMenuSummary").textContent,
          workspaceBottom: workspace.bottom,
          inspectorVisible: inspector.height > 0 && inspector.width > 0,
          inspectorTop: inspector.top,
          workspaceTop: workspace.top,
          segmentViewportHeight: scroller.height,
          documentWidth: document.documentElement.scrollWidth
        };
        message.textContent = original.text;
        status.className = original.className;
        status.hidden = original.hidden;
        return result;
      })()`,
      true
    );
    if (
      measurement.headerHeight !== measurement.headerHeightWithNotice ||
      !measurement.navInsideViewport ||
      (viewport.width >= 800 && measurement.navRows !== 1) ||
      !measurement.noticeOutsideFlow ||
      !measurement.workspaceStable ||
      !measurement.noticeInsideViewport ||
      !measurement.guideInWorkspace ||
      measurement.hiddenControlsVisible ||
      measurement.workspaceLabel !== "Workspace" ||
      measurement.workspaceBottom > viewport.height + 1 ||
      (measurement.inspectorVisible && measurement.inspectorTop < measurement.workspaceTop - 1) ||
      measurement.segmentViewportHeight < 100 ||
      measurement.documentWidth > viewport.width + 1
    ) {
      throw new Error(`Workspace layout is clipped or displaced at ${viewport.name}: ${JSON.stringify(measurement)}`);
    }
    workspaceLayoutMeasurements.push(measurement);
  }
  console.log("Workspace navigation, long save errors, and editor/inspector sizing passed at 1440, 1366, 1024, and 768 pixels.");
}

async function measureEditorWorkspace(state, minimumRatio) {
  const viewport = viewports.find((item) => item.name === "1366x768");
  await setExactViewport(viewport);
  const measurement = await windowRef.webContents.executeJavaScript(
    `(() => {
      const workspace = document.querySelector("#workspace");
      const inspector = document.querySelector("#editorInspector");
      const toggle = document.querySelector("#inspectorToggleBtn");
      const headers = document.querySelectorAll(".segment-grid thead th");
      const workspaceWidth = workspace.getBoundingClientRect().width;
      const sourceWidth = headers[1].getBoundingClientRect().width;
      const targetWidth = headers[2].getBoundingClientRect().width;
      const sourceAndTargetWidth = sourceWidth + targetWidth;
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        inspectorExpanded: toggle.getAttribute("aria-expanded") === "true",
        inspectorDisplayed: getComputedStyle(inspector).display !== "none",
        workspaceInspectorClosed: workspace.classList.contains("inspector-closed"),
        workspaceWidth: Number(workspaceWidth.toFixed(2)),
        sourceAndTargetViewportRatio: Number((sourceAndTargetWidth / window.innerWidth).toFixed(4)),
        navigationWidth: Number((window.innerWidth - workspaceWidth).toFixed(2)),
        sourceWidth: Number(sourceWidth.toFixed(2)),
        targetWidth: Number(targetWidth.toFixed(2)),
        sourceAndTargetWidth: Number(sourceAndTargetWidth.toFixed(2)),
        sourceAndTargetRatio: Number((sourceAndTargetWidth / workspaceWidth).toFixed(4))
      };
    })()`,
    true
  );
  const expectedOpen = state === "open";
  if (
    measurement.viewport.width !== viewport.width ||
    measurement.viewport.height !== viewport.height ||
    measurement.inspectorExpanded !== expectedOpen ||
    measurement.inspectorDisplayed !== expectedOpen ||
    measurement.workspaceInspectorClosed === expectedOpen
  ) {
    throw new Error(`Editor workspace ${state} state was not measurable: ${JSON.stringify(measurement)}.`);
  }
  if (measurement.sourceAndTargetRatio < minimumRatio) {
    throw new Error(
      `Editor source/target width ratio ${measurement.sourceAndTargetRatio} is below ${minimumRatio} with the inspector ${state}.`
    );
  }
  editorSpaceMeasurements[state] = { minimumRatio, ...measurement };
  console.log(
    `Editor source/target width uses ${(measurement.sourceAndTargetRatio * 100).toFixed(2)}% of the 1366x768 workspace with the inspector ${state}.`
  );
}

async function verifyEditorOptionMenus() {
  for (const viewport of [viewports[1], { name: "768x768", width: 768, height: 768 }]) {
    await setExactViewport(viewport);
    for (const [menuId, selectId, activeValue] of [
      ["segmentSearchOptionsMenu", "segmentSearchScope", "source"],
      ["segmentFiltersMenu", "reviewStateFilter", "needs-review"]
    ]) {
      await revealControl("#" + menuId + " > summary");
      const result = await windowRef.webContents.executeJavaScript(
        `(async () => {
          const menu = document.getElementById(${JSON.stringify(menuId)});
          const select = document.getElementById(${JSON.stringify(selectId)});
          const originalValue = select.value;
          select.value = ${JSON.stringify(activeValue)};
          if (!menu.open) menu.querySelector(":scope > summary").click();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const panel = menu.querySelector(".menu-panel").getBoundingClientRect();
          const editor = document.querySelector(".editor-area").getBoundingClientRect();
          const activeIndicatorVisible = getComputedStyle(menu.querySelector(".control-active-indicator")).display !== "none";
          select.focus();
          select.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
          await new Promise(resolve => requestAnimationFrame(resolve));
          const result = {
            activeIndicatorVisible,
            closedWithEscape: !menu.open,
            focusReturned: document.activeElement === menu.querySelector("summary"),
            insideEditor: panel.width > 0 && panel.left >= editor.left - 1 && panel.right <= editor.right + 1,
            visibleCoreControls: ["documentFilter", "segmentSearchInput", "segmentStatusFilter", "nextOpenBtn"].every((id) => document.getElementById(id).getClientRects().length > 0)
          };
          select.value = originalValue;
          return { checks: result, bounds: { panel: { left: panel.left, right: panel.right }, editor: { left: editor.left, right: editor.right } } };
        })()`,
        true
      );
      const failures = Object.keys(result.checks).filter((key) => !result.checks[key]);
      if (failures.length) {
        const context = await windowRef.webContents.executeJavaScript(`({ focus: document.activeElement.id || document.activeElement.tagName,
          menus: Array.from(document.querySelectorAll(".menu[open]"), item => item.id) })`);
        const detail = { viewport: viewport.name, menu: menuId, failures, ...result, context };
        if (!recordReferenceIssues || menuId !== "segmentFiltersMenu" || failures.length !== 1 || failures[0] !== "insideEditor")
          throw new Error(`Editor options failed: ${JSON.stringify(detail)}`);
        referenceIssues.push(detail);
        console.log("Pre-change popup bounds:", JSON.stringify(detail));
      }
      await windowRef.webContents.executeJavaScript("document.body.click()", true);
      await settle();
    }
  }
  console.log(referenceIssues.length ? "Advanced search/filter checks finished with recorded reference issues." : "Advanced search/filter menus preserve active indicators, core controls, viewport bounds, and Escape focus return.");
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
    await captureCollectionMode("01", "projects-list", "projects", "list", "card");

    const recoveryProjectId = fixture.projects?.[0]?.id;
    if (!recoveryProjectId) throw new Error("Modernization fixture has no project for workspace recovery capture.");
    await windowRef.webContents.executeJavaScript(
      `localStorage.setItem("loopcat.workspace.dirtyProjectIds", ${JSON.stringify(JSON.stringify([recoveryProjectId]))})`,
      true
    );
    await windowRef.reload();
    await waitFor("document.querySelector('.project-tile button.primary')", "workspace recovery project");
    await waitFor(
      "!document.querySelector('#workspaceRecoveryPanel').classList.contains('hidden')",
      "local workspace recovery panel"
    );
    await captureState("01", "workspace-recovery-local");
    await windowRef.webContents.executeJavaScript("document.querySelector('#workspaceMenuSummary').click()", true);
    await waitFor("document.querySelector('.workspace-menu').open", "local workspace status menu");
    await captureState("01", "workspace-local-status-menu");
    await windowRef.webContents.executeJavaScript(
      `(() => {
        const dismiss = document.querySelector("#workspaceRecoveryDismissBtn");
        dismiss.focus();
        dismiss.click();
      })()`,
      true
    );
    await waitFor(
      "document.querySelector('#workspaceRecoveryPanel').classList.contains('hidden')",
      "dismissed workspace recovery panel"
    );

    await windowRef.webContents.executeJavaScript("document.querySelector('#resourcesViewBtn').click()", true);
    await waitFor("document.querySelector('#tmResourceDashboard [data-library-id]')", "TM resources dashboard");
    await captureState("02", "resources-translation-memories");
    await captureResourceDensity("resources-translation-memories-comfortable");
    windowRef.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    await windowRef.webContents.executeJavaScript(
      "document.querySelector('#tmResourceDashboard [data-resource-action=\"open\"]').click()",
      true
    );
    await waitFor("document.querySelector('#resourceEditor .resource-entry-link')", "Dedicated TM editor");
    await captureState("02", "resource-translation-memory-detail");
    await windowRef.webContents.executeJavaScript("document.querySelector('#resourceEditor .resource-entry-link').click()", true);
    await waitFor("document.querySelector('#resourceEntryForm [name=target]')?.value", "Populated TM entry");
    await captureState("02", "resource-translation-memory-entry");
    await windowRef.loadURL(url);
    await waitFor("document.querySelector('#projectDashboard .project-tile button.primary')", "Main workspace ready after closing the resource editor");
    await windowRef.webContents.executeJavaScript("document.querySelector('#resourcesViewBtn').click()", true);
    await waitFor("document.querySelector('#tmResourceDashboard [data-library-id]')?.checkVisibility()", "Visible TM library return");
    await settle();
    await clickControl('#tmResourceDashboard [data-resource-action="delete-resource"]');
    await waitFor("document.querySelector('#trashBtn').textContent.includes('Trash (1)')", "Resource in Trash");
    await clickControl("#trashBtn");
    await waitFor("document.querySelector('#trashDialog').open", "resource Trash dialog");
    await waitFor("document.querySelector('#trashList .trash-item')", "resource Trash item");
    await captureState("03", "resource-trash-populated");
    await captureCollectionMode("03", "resource-trash-cards", "trash", "card", "list");
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
    await waitFor("document.querySelector('#tbResourceDashboard [data-library-id]')", "Termbase resources dashboard");
    await captureState("02", "resources-termbases");
    await captureResourceDensity("resources-termbases-comfortable");
    await windowRef.webContents.executeJavaScript("document.querySelector('#projectsViewBtn').click()", true);
    await waitFor("document.querySelector('.project-tile button.primary')", "populated projects return");

    await windowRef.webContents.executeJavaScript(
      "document.querySelector('.project-tile button.primary').click()",
      true
    );
    await waitFor(
      "!document.querySelector('#projectHomeView').classList.contains('hidden') && document.querySelector('.file-card .file-open')",
      "project dashboard"
    );
    await captureState("02", "project-dashboard");
    await captureCollectionMode("02", "project-files-list", "files", "list", "card");
    await clickControl("#projectSettingsBtn");
    await waitFor("document.querySelector('#projectDialog').open", "project settings");
    await clickControl("#optionalResourceSettingsBtn");
    await waitFor("document.querySelector('#resourceSettingsDialog').open && document.querySelector('#projectTmResourceList .resource-policy-row')", "project resource choices");
    await captureState("02", "project-resource-selection-list");
    await captureCollectionMode("02", "project-resource-selection-cards", "resource-selection", "card", "list");
    await clickControl("#cancelResourceSettingsBtn");
    await waitFor("document.querySelector('#projectDialog').open && !document.querySelector('#resourceSettingsDialog').open", "returned project settings dialog");
    await clickControl("#cancelProjectBtn");
    await waitFor("!document.querySelector('#projectDialog').open", "dismissed project settings");

    await clickControl("#projectsViewBtn");
    await clickControl("#newProjectBtn");
    await waitFor("document.querySelector('#projectDialog').open && document.querySelector('#projectDialogTitle').textContent === 'New project' && !document.querySelector('#projectNameInput').value", "blank new-project dialog");
    await captureState("04", "new-project-dialog");
    await windowRef.webContents.executeJavaScript("document.querySelector('#projectDialog').close()", true);
    await clickControl(".project-tile button.primary");
    await waitFor("!document.getElementById('projectHomeView').classList.contains('hidden')", "return to the project files");

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

    await windowRef.webContents.executeJavaScript("document.querySelector('.file-card .file-open').click()", true);
    await waitFor(
      "!document.querySelector('#editorView').classList.contains('hidden') && document.querySelector('#segmentBody .target-editor')",
      "translation editor"
    );
    await measureEditorWorkspace("open", 0.55);
    await windowRef.webContents.executeJavaScript(`for (const id of ["workspaceRecoveryDismissBtn","backupReminderDismissBtn"]) {
      const button = document.getElementById(id);
      if (button?.getClientRects().length) button.click();
    }`, true);
    await captureState("03", "translation-editor");
    await verifyWorkspaceLayout();
    await verifyEditorOptionMenus();

    await windowRef.webContents.executeJavaScript(
      `(() => {
        const returnTarget = document.querySelector("#segmentSearchInput");
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
      "editor import validation error"
    );
    await captureState("05", "editor-import-validation-error");
    await windowRef.webContents.executeJavaScript(
      `(() => {
        const dismiss = document.querySelector("#validationReportMeta .validation-dismiss");
        dismiss.focus();
        dismiss.click();
      })()`,
      true
    );
    await waitFor(
      "document.querySelector('#validationReportPanel').classList.contains('hidden') && document.activeElement === document.querySelector('#segmentSearchInput')",
      "editor import validation dismissal"
    );

    await clickControl("#inspectorToggleBtn");
    await waitFor(
      "document.querySelector('#inspectorToggleBtn').getAttribute('aria-expanded') === 'false'",
      "closed inspector"
    );
    await measureEditorWorkspace("closed", 0.7);
    await captureState("04", "editor-inspector-closed");
    await clickControl("#inspectorToggleBtn");
    await waitFor(
      "document.querySelector('#inspectorToggleBtn').getAttribute('aria-expanded') === 'true'",
      "open inspector"
    );

    const typingDispatchMs = await windowRef.webContents.executeJavaScript(
      `(() => {
    const textarea = document.querySelector('#segmentBody .target-editor');
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

    await windowRef.webContents.executeJavaScript("document.querySelector('#inspectorTabReview').click()", true);
    await waitFor(
      "document.querySelector('#inspectorTabReview').getAttribute('aria-selected') === 'true'",
      "review inspector tab"
    );
    await captureState("05", "review-comments-inspector");
    await windowRef.webContents.executeJavaScript("document.querySelector('#inspectorTabQuality').click()", true);
    await waitFor(
      "document.querySelector('#inspectorTabQuality').getAttribute('aria-selected') === 'true'",
      "quality inspector tab"
    );
    await captureState("05", "quality-workbench-inspector");

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
      `(() => {
        const opener = document.querySelector("#openProjectAiSettingsBtn");
        opener.focus();
        opener.click();
      })()`,
      true
    );
    await waitFor(
      "document.querySelector('#aiProviderDialog').open",
      "AI provider administration dialog"
    );
    await captureState("05", "ai-provider-administration");
    await windowRef.webContents.executeJavaScript("document.querySelector('#closeAiProviderDialogBtn').click()", true);
    await waitFor("!document.querySelector('#aiProviderDialog').open", "AI provider administration dialog close");
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

    await clickControl("#focusModeBtn");
    await waitFor("document.body.classList.contains('focus-mode')", "Focus mode");
    await captureState("08", "focus-mode");
    await windowRef.webContents.executeJavaScript("document.querySelector('#exitFocusModeBtn').click()", true);

    await clickControl("#commandPaletteBtn");
    await waitFor("!document.querySelector('#commandPaletteOverlay').classList.contains('hidden')", "command palette");
    await captureState("09", "command-palette");
    await windowRef.webContents.executeJavaScript("document.querySelector('#closeCommandPaletteBtn').click()", true);

    await windowRef.webContents.executeJavaScript(
      "document.querySelector('#themeSelect').value = 'dark'; document.querySelector('#themeSelect').dispatchEvent(new Event('change', { bubbles: true }))",
      true
    );
    await waitFor("document.documentElement.dataset.theme === 'dark'", "dark theme");
    await captureState("10", "dark-editor-inspector-open");
    await windowRef.webContents.executeJavaScript("document.querySelector('#inspectorTabAi').click()", true);
    await captureState("10", "dark-ai-sidebar");
    await windowRef.webContents.executeJavaScript("document.querySelector('#openProjectAiSettingsBtn').click()", true);
    await waitFor("document.querySelector('#aiProviderDialog').open", "dark AI settings dialog");
    await captureState("10", "dark-ai-settings");
    await windowRef.webContents.executeJavaScript("document.querySelector('#closeAiProviderDialogBtn').click()", true);
    await windowRef.webContents.executeJavaScript("document.querySelector('#inspectorTabMatches').click()", true);
    await clickControl("#inspectorToggleBtn");
    await waitFor(
      "document.querySelector('#inspectorToggleBtn').getAttribute('aria-expanded') === 'false'",
      "dark closed inspector"
    );
    await captureState("11", "dark-editor-inspector-closed");
    await clickControl("#focusModeBtn");
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
      referenceIssues,
      workspaceLayoutMeasurements,
      measurements: {
        startupMs: Number(startupMs.toFixed(2)),
        typingDispatchMs: Number(typingDispatchMs.toFixed(2)),
        twelveScrollFramesMs: Number(scrollSampleMs.toFixed(2)),
        editorSpace: editorSpaceMeasurements,
        bundle: fileMetrics()
      },
      keyboardPaths: [
        "Projects -> Open project -> Open file -> target editor",
        "Alt+Arrow segment navigation",
        "Ctrl/Cmd+Shift+F Focus mode",
        "F2 / Ctrl/Cmd+Shift+P command palette",
        "Ctrl/Cmd+Shift+K concordance"
      ],
      knownAccessibilityExceptions: [
        "Automated checks do not replace the manual keyboard, 200% zoom, forced-colors, NVDA, and VoiceOver matrix."
      ],
      pageErrors
    };
    await fsPromises.writeFile(path.join(outputDir, "baseline.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    const expectedScreenshotCount = 111;
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
