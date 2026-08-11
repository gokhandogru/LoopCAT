const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

if (!process.versions.electron) {
  const buildResult = spawnSync(process.execPath, [path.join(root, "scripts", "build-renderer.cjs")], {
    cwd: root,
    stdio: "inherit"
  });
  if (buildResult.error) {
    console.error(buildResult.error.message);
    process.exit(1);
  }
  if (buildResult.status !== 0) process.exit(buildResult.status ?? 1);
  let electronBinary = "";
  try {
    electronBinary = require("electron");
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
  if (typeof electronBinary !== "string" || !electronBinary) {
    console.error(
      "Electron is not installed correctly. Run pnpm install --frozen-lockfile with install scripts enabled."
    );
    process.exit(1);
  }
  const result = spawnSync(electronBinary, [__filename], {
    cwd: root,
    env: {
      ...process.env,
      LOOPCAT_BROWSER_RUNNER_NO_SANDBOX: process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX || "1"
    },
    stdio: "inherit"
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow, ipcMain } = require("electron");
const runnerUserDataDir = path.join(os.tmpdir(), `loopcat-ai-sidebar-ux-${process.pid}-${Date.now()}`);
const rendererRoot = path.join(root, ".cache", "renderer", "production");
const generatedAssets = JSON.parse(require("node:fs").readFileSync(path.join(rendererRoot, "assets.json"), "utf8"));
const generatedFiles = new Map([
  ["index.html", path.join(rendererRoot, "index.html")],
  ["config/production-assets.js", path.join(rendererRoot, "config", "production-assets.js")],
  ...generatedAssets.map((asset) => [asset, path.join(rendererRoot, asset)])
]);
const { runtimeAssets } = require(path.join(rendererRoot, "config", "production-assets.js"));
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"]
]);
const allowedFiles = new Set(runtimeAssets);

let server = null;
let windowRef = null;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-dev-shm-usage");
app.setPath("userData", runnerUserDataDir);
app.once("will-quit", () => {
  fs.rm(runnerUserDataDir, { recursive: true, force: true }).catch(() => {});
});

function finish(code, message) {
  if (message) (code === 0 ? process.stdout : process.stderr).write(`${message}\n`);
  process.exitCode = code;
  const exit = () => {
    if (windowRef && !windowRef.isDestroyed()) windowRef.destroy();
    app.exit(code);
  };
  if (server) {
    const closingServer = server;
    server = null;
    closingServer.close(exit);
  } else {
    exit();
  }
}

function safePathname(requestUrl) {
  const url = new URL(requestUrl || "/", "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const relativePath = path.posix.normalize(pathname.replace(/^\/+/, "").replaceAll("\\", "/"));
  if (!allowedFiles.has(relativePath)) return "";
  const resolved = generatedFiles.get(relativePath) || path.resolve(root, relativePath);
  const allowedRoot = generatedFiles.has(relativePath) ? rendererRoot : root;
  const rootWithSeparator = `${allowedRoot}${path.sep}`;
  if (resolved !== allowedRoot && !resolved.startsWith(rootWithSeparator)) return "";
  return resolved;
}

function startServer() {
  server = http.createServer(async (request, response) => {
    try {
      const filePath = safePathname(request.url);
      if (!filePath) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const data = await fs.readFile(filePath);
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sidebarInspectionScript() {
  return `(() => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      const started = Date.now();
      while (Date.now() - started < 15000) {
        if (predicate()) return true;
        await sleep(50);
      }
      throw new Error("Timed out waiting for " + label + ": " + JSON.stringify({
        bridge: typeof window.LoopCATDesktop?.startLmStudioServer,
        provider: document.querySelector("#localAiProviderSelect")?.value || "",
        baseUrl: document.querySelector("#localAiBaseUrlInput")?.value || "",
        startButtonClass: document.querySelector("#localAiStartLmStudioBtn")?.className || "",
        startButtonDisplay: document.querySelector("#localAiStartLmStudioBtn") ? getComputedStyle(document.querySelector("#localAiStartLmStudioBtn")).display : ""
      }));
    };
    const setValue = (selector, value) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("Missing " + selector);
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const click = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("Missing " + selector);
      element.click();
    };
      const visible = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const notHidden = (selector) => {
        const element = document.querySelector(selector);
        return Boolean(element && !element.classList.contains("hidden") && getComputedStyle(element).display !== "none");
      };
    const text = (element) => element?.textContent?.replace(/\\s+/g, " ").trim() || "";
    const run = async () => {
      await waitFor(() => document.querySelector("#newProjectBtn"), "project button");
      click("#newProjectBtn");
      await waitFor(() => document.querySelector("#projectDialog")?.open, "project dialog");
      setValue("#projectNameInput", "AI sidebar UX check");
      setValue("#sourceLangInput", "en");
      setValue("#targetLangInput", "tr");
      const folder = document.querySelector("#saveProjectToFolderInput");
      if (folder) {
        folder.checked = false;
        folder.dispatchEvent(new Event("change", { bubbles: true }));
      }
      click("#saveProjectBtn");
      await waitFor(() => !document.querySelector("#projectDialog")?.open, "created project");
      click("#openProjectAiSettingsBtn");
      await waitFor(() => document.querySelector("#projectDialog")?.open, "AI provider settings");
      await waitFor(() => document.querySelector('#localAiPresetSelect option[value="lm-studio"]'), "LM Studio preset option");
      setValue("#localAiPresetSelect", "lm-studio");
      await waitFor(() => document.querySelector("#localAiBaseUrlInput")?.value === "http://localhost:1234/v1", "LM Studio preset");
      await waitFor(() => notHidden("#localAiStartLmStudioBtn"), "desktop LM Studio start button");
      const groups = Array.from(document.querySelectorAll(".local-ai-centre > .local-ai-group, .local-ai-centre > details.local-ai-group")).map((element) => ({
        tag: element.tagName.toLowerCase(),
        open: element.open === true,
        title: text(element.querySelector("h3, summary"))
      }));
      const overflowItems = Array.from(document.querySelectorAll(".local-ai-language-grid, .local-ai-language-grid label, .local-ai-language-grid input"))
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({
          selector: element.id ? "#" + element.id : element.tagName.toLowerCase(),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          text: text(element).slice(0, 80)
        }));
      return {
        groups,
        adminParent: document.querySelector("#aiSettingsForm")?.parentElement?.id || "",
        suggestionParent: document.querySelector("#aiSuggestionList")?.parentElement?.id || "",
        contextualActions: Array.from(document.querySelectorAll(".ai-contextual-actions button")).map(text),
        overflowItems,
        startButtonVisibleWithBridge: notHidden("#localAiStartLmStudioBtn"),
        keyControlsVisible: visible("#localAiHostedKeyControls"),
        pullVisible: visible("#localAiPullModelWrap"),
        providerDetailsOpen: document.querySelector("#localAiProviderDetails")?.open === true,
        advancedSettingsOpen: document.querySelector("#localAiAdvancedSettings")?.open === true,
        cloudOpen: document.querySelector(".cloud-ai-settings")?.open === true,
        baseUrl: document.querySelector("#localAiBaseUrlInput")?.value,
        provider: document.querySelector("#localAiProviderSelect")?.value,
        model: document.querySelector("#localAiModelInput")?.value,
        contextualCopy: text(document.querySelector(".ai-contextual-workflow")).slice(0, 1200)
      };
    };
    return run();
  })()`;
}

app
  .whenReady()
  .then(async () => {
    const port = await startServer();
    const url = `http://127.0.0.1:${port}/index.html`;
    const pageErrors = [];
    ipcMain.handle("loopcat:start-lm-studio-server", async () => ({
      ok: true,
      message: "Fake LM Studio server started."
    }));
    ipcMain.handle("loopcat:get-creator-identity", async () => ({ displayName: "LoopCAT UX test" }));
    ipcMain.handle("loopcat:set-spellchecker-languages", async (_event, languages = []) => ({
      ok: true,
      requestedLanguages: Array.isArray(languages) ? languages : [],
      activeLanguages: Array.isArray(languages) ? languages : [],
      reason: "test"
    }));
    ipcMain.handle("loopcat:get-spellchecker-info", async () => ({
      supported: true,
      enabled: true,
      languages: [],
      availableLanguages: []
    }));
    windowRef = new BrowserWindow({
      width: 1440,
      height: 1000,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(root, "desktop", "preload.cjs"),
        sandbox: true
      }
    });
    windowRef.webContents.on("console-message", (details) => {
      if (details.level === "error") pageErrors.push(details.message);
    });
    windowRef.webContents.on("render-process-gone", (_event, details) => {
      finish(1, `AI sidebar UX renderer exited unexpectedly: ${details.reason}`);
    });
    await windowRef.loadURL(url);
    const info = await windowRef.webContents.executeJavaScript(sidebarInspectionScript(), true);
    const titles = info.groups.map((group) => group.title);
    assert(titles[0]?.includes("Connect provider"), "AI sidebar should start with provider connection.");
    assert(titles[1]?.includes("Choose model"), "AI sidebar should put model selection second.");
    assert(info.adminParent === "projectAiSettingsMount", "Provider administration should live in Project settings.");
    assert(
      info.suggestionParent === "contextualAiSuggestionMount",
      "AI suggestions should live in the contextual inspector."
    );
    for (const action of [
      "Translate selected",
      "Review",
      "Suggest tag repair",
      "Polish draft",
      "Suggest alternatives",
      "Apply terminology",
      "Cloud suggestion",
      "Cancel"
    ]) {
      assert(info.contextualActions.includes(action), `Contextual AI should expose ${action}.`);
    }
    assert(
      info.contextualCopy.includes("inspectable"),
      "Contextual AI should explain that suggestions remain inspectable."
    );
    assert(
      titles.some((title) => title.includes("Prompt test")),
      "Prompt testing should be available as a secondary drawer."
    );
    assert(
      titles.some((title) => title.includes("Review and repair")),
      "Review tools should be available as a secondary drawer."
    );
    assert(
      titles.some((title) => title.includes("Draft editing")),
      "Draft editing tools should be available as a secondary drawer."
    );
    assert(
      titles.some((title) => title.includes("Terminology")),
      "Terminology tools should be available as a secondary drawer."
    );
    assert(
      titles.some((title) => title.includes("Project context")),
      "Project context tools should be available as a secondary drawer."
    );
    assert(info.provider === "openai-compatible", "LM Studio preset should select the OpenAI-compatible provider.");
    assert(
      info.baseUrl === "http://localhost:1234/v1",
      "LM Studio preset should use the local OpenAI-compatible base URL."
    );
    assert(info.model === "translategemma", "LM Studio preset should keep the configured translation model.");
    assert(
      info.startButtonVisibleWithBridge === true,
      "LM Studio start button should appear when the desktop bridge is available."
    );
    assert(info.keyControlsVisible === false, "LM Studio local setup should hide hosted key controls.");
    assert(info.pullVisible === false, "LM Studio local setup should hide Ollama pull controls.");
    assert(
      info.overflowItems.length === 0,
      `AI sidebar language fields should not overflow their card: ${JSON.stringify(info.overflowItems)}`
    );
    assert(info.providerDetailsOpen === false, "Advanced provider options should stay collapsed by default.");
    assert(info.advancedSettingsOpen === false, "Advanced batch settings should stay collapsed by default.");
    assert(info.cloudOpen === false, "Cloud suggestion settings should stay collapsed by default.");
    finish(
      0,
      `Contextual AI UX verification passed. Provider settings order: ${titles.join(" | ")}${pageErrors.length ? `\\nConsole notes: ${pageErrors.join("\\n")}` : ""}`
    );
  })
  .catch((error) => {
    finish(1, error.stack || error.message || String(error));
  });
