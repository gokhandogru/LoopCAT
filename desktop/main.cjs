const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { fileURLToPath, pathToFileURL } = require("node:url");

let electron = {};
try {
  electron = require("electron");
} catch {
  electron = {};
}

const electronRuntime = electron && typeof electron === "object" ? electron : {};
const { app, BrowserWindow, Menu, ipcMain, net, protocol, session, shell } = electronRuntime;

const APP_SCHEME = "loopcat";
const APP_HOST = "app";
const APP_ROOT = path.resolve(__dirname, "..");
const DESKTOP_PRELOAD = path.join(__dirname, "preload.cjs");
const SPELLCHECKER_DICTIONARY_DOWNLOAD_URL = `${APP_SCHEME}://${APP_HOST}/spellcheck-dictionaries/`;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const ALLOWED_EXTERNAL_HOSTS = new Set();
const LOCAL_AI_RUNTIME_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOCAL_AI_RUNTIME_PORTS = new Set(["11434", "1234"]);
const LOCAL_AI_RUNTIME_PATHS = new Set([
  "/api/version",
  "/api/tags",
  "/api/pull",
  "/api/chat",
  "/v1/models",
  "/v1/chat/completions"
]);
const OLLAMA_CLOUD_HOST = "ollama.com";
const OLLAMA_CLOUD_API_PATHS = new Set([
  "/api/tags",
  "/api/chat"
]);
const GEMINI_HOST = "generativelanguage.googleapis.com";
const GEMINI_API_PATHS = new Set([
  "/v1beta/models",
  "/v1beta/interactions"
]);
const ANTHROPIC_HOST = "api.anthropic.com";
const ANTHROPIC_API_PATHS = new Set([
  "/v1/models",
  "/v1/messages"
]);
const COHERE_HOST = "api.cohere.com";
const COHERE_API_PATHS = new Set([
  "/v1/models",
  "/v2/chat"
]);
const AZURE_OPENAI_HOST_SUFFIXES = [".openai.azure.com", ".services.ai.azure.com"];
const AZURE_OPENAI_API_PATHS = new Set([
  "/openai/v1/models",
  "/openai/v1/responses",
  "/openai/v1/chat/completions"
]);
const HOSTED_OPENAI_COMPATIBLE_API_PATHS = new Map([
  ["api.deepseek.com", new Set(["/models", "/chat/completions"])],
  ["api.mistral.ai", new Set(["/v1/models", "/v1/chat/completions"])],
  ["api.x.ai", new Set(["/v1/models", "/v1/responses", "/v1/chat/completions"])],
  ["api.perplexity.ai", new Set(["/v1/models", "/v1/sonar", "/chat/completions"])],
  ["api.groq.com", new Set(["/openai/v1/models", "/openai/v1/chat/completions"])],
  ["api.together.ai", new Set(["/v1/models", "/v1/chat/completions"])],
  ["openrouter.ai", new Set(["/api/v1/models", "/api/v1/chat/completions"])],
  ["router.huggingface.co", new Set(["/v1/models", "/v1/chat/completions"])],
  ["api.deepinfra.com", new Set(["/v1/openai/models", "/v1/openai/chat/completions"])],
  ["api.fireworks.ai", new Set(["/inference/v1/models", "/inference/v1/chat/completions"])]
]);
const SPELLCHECKER_LANGUAGE_FALLBACKS = new Map([
  ["en", ["en-US", "en-GB"]],
  ["pt", ["pt-BR", "pt-PT"]],
  ["zh", ["zh-CN", "zh-TW"]]
]);
const DESKTOP_SMOKE_MODE = process.env.LOOPCAT_DESKTOP_SMOKE === "1";
const DESKTOP_SMOKE_TIMEOUT_MS = Number(process.env.LOOPCAT_DESKTOP_SMOKE_TIMEOUT_MS || 30000);
const DESKTOP_SMOKE_RESULT_FILE = process.env.LOOPCAT_DESKTOP_SMOKE_RESULT_FILE || "";
const DESKTOP_SMOKE_USER_DATA_DIR = process.env.LOOPCAT_DESKTOP_SMOKE_USER_DATA_DIR || "";
const DESKTOP_SMOKE_NO_SANDBOX = DESKTOP_SMOKE_MODE && process.env.LOOPCAT_DESKTOP_SMOKE_NO_SANDBOX === "1";
const DESKTOP_CHROMIUM_NO_SANDBOX = process.env.LOOPCAT_DESKTOP_NO_SANDBOX
  ? process.env.LOOPCAT_DESKTOP_NO_SANDBOX === "1"
  : process.platform === "win32";
const DESKTOP_SANDBOX_FALLBACK_DISABLED = process.env.LOOPCAT_DISABLE_DESKTOP_SANDBOX_FALLBACK === "1";
const DESKTOP_RENDERER_SANDBOX_DEFAULT = process.env.LOOPCAT_DESKTOP_RENDERER_SANDBOX
  ? process.env.LOOPCAT_DESKTOP_RENDERER_SANDBOX === "1"
  : !DESKTOP_CHROMIUM_NO_SANDBOX && process.platform !== "win32";
let desktopSandboxFallbackUsed = false;
const ALLOWED_APP_FILES = new Set([
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "service-worker.js",
  "icons/loopcat-icon.svg",
  "app.js",
  "storage.js",
  "workspace-storage.js",
  "docx.js",
  "tm.js",
  "termbase.js",
  "tmx.js",
  "tbx.js",
  "encoding.js",
  "xliff.js",
  "localization.js",
  "qa.js",
  "validation.js",
  "analysis.js",
  "quality.js",
  "ai.js",
  "worker-client.js",
  "cat-worker.js",
  "project.js"
]);

function registerPrivilegedSchemes() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        allowServiceWorkers: false,
        corsEnabled: false
      }
    }
  ]);
}

function normalizeAppRelativePath(relativePath) {
  const raw = String(relativePath || "index.html").replaceAll("\\", "/");
  if (raw.includes(":")) return "";
  if (raw.split("/").some((part) => part === "..")) return "";
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized === ".." || path.posix.isAbsolute(normalized)) return "";
  return normalized;
}

function canonicalSpellCheckerLanguageCode(value) {
  const clean = String(value || "").trim().replaceAll("_", "-");
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(clean)) return "";
  try {
    if (typeof Intl.getCanonicalLocales === "function") return Intl.getCanonicalLocales(clean)[0] || clean;
  } catch {}
  return clean
    .split("-")
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (part.length === 2 || /^\d{3}$/.test(part)) return part.toUpperCase();
      if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase();
      return part;
    })
    .join("-");
}

function spellCheckerLanguageCandidates(languageCode) {
  const canonical = canonicalSpellCheckerLanguageCode(languageCode);
  if (!canonical) return [];
  const primary = canonical.split("-")[0];
  return Array.from(new Set([
    canonical,
    primary,
    ...(SPELLCHECKER_LANGUAGE_FALLBACKS.get(primary) || [])
  ]));
}

function selectSpellCheckerLanguages(preferredLanguages = [], availableLanguages = []) {
  const available = Array.isArray(availableLanguages) ? availableLanguages.filter(Boolean) : [];
  const availableSet = new Set(available);
  const candidates = Array.from(new Set(
    (Array.isArray(preferredLanguages) ? preferredLanguages : [preferredLanguages])
      .flatMap((language) => spellCheckerLanguageCandidates(language))
  ));
  if (!available.length) return candidates.slice(0, 1);
  for (const candidate of candidates) {
    if (availableSet.has(candidate)) return [candidate];
  }
  for (const candidate of candidates) {
    const primary = candidate.split("-")[0];
    const localeMatch = available.find((language) => language === primary || language.startsWith(`${primary}-`));
    if (localeMatch) return [localeMatch];
  }
  return [];
}

function isAllowedAppPath(relativePath) {
  if (!relativePath) return false;
  const normalized = normalizeAppRelativePath(relativePath);
  return Boolean(normalized && ALLOWED_APP_FILES.has(normalized));
}

function resolveAppFile(requestUrl) {
  try {
    if (/%(?:2e|2f|5c)/i.test(String(requestUrl))) return null;
    const url = new URL(requestUrl);
    if (url.protocol !== `${APP_SCHEME}:`) return null;
    const rawPath = url.hostname === APP_HOST ? url.pathname : `/${url.hostname}${url.pathname}`;
    const relativePath = normalizeAppRelativePath(decodeURIComponent(rawPath).replace(/^\/+/, "") || "index.html");
    if (!relativePath || !isAllowedAppPath(relativePath)) return null;
    const resolved = path.resolve(APP_ROOT, relativePath);
    const rootWithSeparator = `${APP_ROOT}${path.sep}`;
    if (resolved !== APP_ROOT && !resolved.startsWith(rootWithSeparator)) return null;
    return resolved;
  } catch {
    return null;
  }
}

function isAllowedLocalFileUrl(url) {
  try {
    const filePath = fileURLToPath(url);
    const resolved = path.resolve(filePath);
    const relativePath = normalizeAppRelativePath(path.relative(APP_ROOT, resolved).replaceAll(path.sep, "/"));
    return Boolean(relativePath && isAllowedAppPath(relativePath) && path.resolve(APP_ROOT, relativePath) === resolved);
  } catch {
    return false;
  }
}

function isAllowedOpenAiResponsesUrl(requestUrl) {
  try {
    const href = new URL(requestUrl).href;
    return href === OPENAI_RESPONSES_URL || href === OPENAI_MODELS_URL;
  } catch {
    return false;
  }
}

function isAllowedLocalAiRuntimeUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "http:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      LOCAL_AI_RUNTIME_HOSTS.has(url.hostname.toLowerCase()) &&
      LOCAL_AI_RUNTIME_PORTS.has(url.port) &&
      LOCAL_AI_RUNTIME_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

function isAllowedOllamaCloudUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.hostname.toLowerCase() === OLLAMA_CLOUD_HOST &&
      OLLAMA_CLOUD_API_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

function isAllowedGeminiUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.port &&
      url.hostname.toLowerCase() === GEMINI_HOST &&
      GEMINI_API_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

function isAllowedAnthropicUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.port &&
      url.hostname.toLowerCase() === ANTHROPIC_HOST &&
      ANTHROPIC_API_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

function isAllowedCohereUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.port &&
      url.hostname.toLowerCase() === COHERE_HOST &&
      COHERE_API_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

function isAllowedAzureOpenAiHost(hostname) {
  const clean = String(hostname || "").toLowerCase();
  return AZURE_OPENAI_HOST_SUFFIXES.some((suffix) => clean.endsWith(suffix) && clean.length > suffix.length);
}

function isAllowedAzureOpenAiUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.port &&
      isAllowedAzureOpenAiHost(url.hostname) &&
      AZURE_OPENAI_API_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

function isAllowedHostedOpenAiCompatibleUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const allowedPaths = HOSTED_OPENAI_COMPATIBLE_API_PATHS.get(url.hostname.toLowerCase());
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.port &&
      Boolean(allowedPaths?.has(url.pathname));
  } catch {
    return false;
  }
}

function isAllowedNetworkRequest(requestUrl) {
  try {
    const url = new URL(requestUrl);
    if (url.protocol === `${APP_SCHEME}:`) return Boolean(resolveAppFile(requestUrl));
    if (url.protocol === "file:") return isAllowedLocalFileUrl(url);
    if (url.protocol === "data:" || url.protocol === "blob:") return true;
    if (url.href === "about:blank") return true;
    if (isAllowedOpenAiResponsesUrl(requestUrl)) return true;
    if (isAllowedLocalAiRuntimeUrl(requestUrl)) return true;
    if (isAllowedOllamaCloudUrl(requestUrl)) return true;
    if (isAllowedGeminiUrl(requestUrl)) return true;
    if (isAllowedAnthropicUrl(requestUrl)) return true;
    if (isAllowedCohereUrl(requestUrl)) return true;
    if (isAllowedAzureOpenAiUrl(requestUrl)) return true;
    if (isAllowedHostedOpenAiCompatibleUrl(requestUrl)) return true;
    return false;
  } catch {
    return false;
  }
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    const filePath = resolveAppFile(request.url);
    if (!filePath) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createApplicationMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { role: "close" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function isLoopcatUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === `${APP_SCHEME}:` && parsed.hostname === APP_HOST;
  } catch {
    return false;
  }
}

function isLoopcatOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === `${APP_SCHEME}:` && parsed.hostname === APP_HOST;
  } catch {
    return false;
  }
}

function isAllowedAppNavigationUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${APP_SCHEME}:` || parsed.hostname !== APP_HOST) return false;
    const filePath = resolveAppFile(url);
    if (!filePath) return false;
    const relativePath = normalizeAppRelativePath(path.relative(APP_ROOT, filePath).replaceAll(path.sep, "/"));
    return relativePath === "index.html";
  } catch {
    return false;
  }
}

function isExternalHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    const searchKeys = [...parsed.searchParams.keys()];
    const hasNoSearch = !parsed.search;
    const hasSinglePromptSearch = searchKeys.length === 1 &&
      parsed.searchParams.has("q") &&
      parsed.searchParams.getAll("q").length === 1 &&
      Boolean(String(parsed.searchParams.get("q") || "").trim());
    return parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      parsed.pathname === "/" &&
      !parsed.hash &&
      (hasNoSearch || hasSinglePromptSearch) &&
      ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function lmStudioCliCandidates(platform = process.platform, env = process.env, homeDir = os.homedir()) {
  const candidates = [];
  if (env.LOOPCAT_LMS_CLI) candidates.push(env.LOOPCAT_LMS_CLI);
  if (platform === "win32") {
    candidates.push(path.join(homeDir, ".lmstudio", "bin", "lms.exe"));
    if (env.LOCALAPPDATA) candidates.push(path.join(env.LOCALAPPDATA, "Programs", "LM Studio", "resources", "app", ".webpack", "main", "lms.exe"));
    candidates.push("lms.exe");
  } else {
    candidates.push(path.join(homeDir, ".lmstudio", "bin", "lms"));
    candidates.push("lms");
  }
  return [...new Set(candidates.filter(Boolean))];
}

function runLmStudioStartCommand(command, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 20000);
  const args = ["server", "start", "--port", "1234", "--bind", "127.0.0.1", "--cors"];
  return new Promise((resolve) => {
    let settled = false;
    let output = "";
    let child = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ...result,
        command,
        output: output.trim()
      });
    };
    const timeout = setTimeout(() => {
      try {
        child?.kill?.();
      } catch {}
      finish({ ok: false, code: null, error: "Timed out while starting the LM Studio server." });
    }, timeoutMs);
    try {
      child = spawn(command, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      finish({ ok: false, code: null, error: error?.message || String(error) });
      return;
    }
    child.stdout?.on("data", (chunk) => {
      output += String(chunk || "");
    });
    child.stderr?.on("data", (chunk) => {
      output += String(chunk || "");
    });
    child.on("error", (error) => {
      finish({ ok: false, code: null, error: error?.message || String(error) });
    });
    child.on("close", (code) => {
      const normalized = output.toLowerCase();
      finish({
        ok: code === 0 || normalized.includes("server is now running") || normalized.includes("server is running"),
        code,
        error: code === 0 ? "" : output.trim() || `LM Studio CLI exited with code ${code}.`
      });
    });
  });
}

async function startLmStudioServerFromDesktop(options = {}) {
  const candidates = lmStudioCliCandidates(options.platform, options.env, options.homeDir);
  const attempted = [];
  for (const command of candidates) {
    if (path.isAbsolute(command) && !fs.existsSync(command)) {
      attempted.push({ command, ok: false, error: "Not found" });
      continue;
    }
    const result = await runLmStudioStartCommand(command, options);
    attempted.push(result);
    if (result.ok) {
      return {
        ok: true,
        command: path.basename(command),
        message: "LM Studio server is running on http://127.0.0.1:1234/v1.",
        output: result.output,
        attempted
      };
    }
  }
  return {
    ok: false,
    message: "Could not start the LM Studio server. Open LM Studio and enable the local server, or install the LM Studio CLI.",
    attempted
  };
}

function desktopBridgeRequestUrl(event) {
  return event?.senderFrame?.url || event?.sender?.getURL?.() || "";
}

function isAllowedDesktopBridgeRequest(event) {
  return isLoopcatOrigin(desktopBridgeRequestUrl(event));
}

function desktopCreatorIdentity() {
  const hostName = String(os.hostname?.() || "").trim();
  return {
    displayName: hostName || "This computer",
    hostName,
    origin: hostName ? "desktop-hostname" : "fallback"
  };
}

function configureDesktopBridge() {
  if (!ipcMain?.handle) return;
  ipcMain.handle("loopcat:start-lm-studio-server", async (event) => {
    if (!isAllowedDesktopBridgeRequest(event)) {
      return { ok: false, message: "LoopCAT desktop helper rejected a non-LoopCAT request." };
    }
    return startLmStudioServerFromDesktop();
  });
  ipcMain.handle("loopcat:get-creator-identity", (event) => (
    isAllowedDesktopBridgeRequest(event)
      ? desktopCreatorIdentity()
      : { displayName: "This computer", hostName: "", origin: "rejected-origin" }
  ));
}

function openExternalUrl(url) {
  if (!isExternalHttpsUrl(url)) return false;
  shell?.openExternal?.(url);
  return true;
}

if (DESKTOP_SMOKE_MODE && DESKTOP_SMOKE_USER_DATA_DIR && app?.setPath) {
  app.setPath("userData", DESKTOP_SMOKE_USER_DATA_DIR);
}

if (app?.disableHardwareAcceleration) {
  app.disableHardwareAcceleration();
}

if ((DESKTOP_CHROMIUM_NO_SANDBOX || DESKTOP_SMOKE_NO_SANDBOX) && app?.commandLine?.appendSwitch) {
  app.commandLine.appendSwitch("no-sandbox");
}

function writeDesktopSmokeResult(payload) {
  const result = {
    ok: false,
    timestamp: new Date().toISOString(),
    ...payload
  };
  const text = JSON.stringify(result, null, 2);
  if (DESKTOP_SMOKE_RESULT_FILE) fs.writeFileSync(DESKTOP_SMOKE_RESULT_FILE, text, "utf8");
  else process.stdout.write(`${text}\n`);
}

function finishDesktopSmoke(code, payload) {
  writeDesktopSmokeResult(payload);
  app.exit(code);
}

function attachDesktopSmokeProbe(mainWindow, options = {}) {
  if (!DESKTOP_SMOKE_MODE) return;
  const rendererSandbox = options.rendererSandbox !== false;
  const sandboxFallbackUsed = Boolean(options.sandboxFallbackUsed);
  const onSandboxLaunchFailed = typeof options.onSandboxLaunchFailed === "function" ? options.onSandboxLaunchFailed : null;
  let finished = false;
  const desktopRuntime = () => ({
    rendererSandbox,
    sandboxFallbackUsed,
    chromiumNoSandbox: Boolean(DESKTOP_CHROMIUM_NO_SANDBOX || DESKTOP_SMOKE_NO_SANDBOX)
  });
  const finishOnce = (code, payload) => {
    if (finished) return;
    finished = true;
    finishDesktopSmoke(code, payload);
  };
  const timeout = setTimeout(() => {
    finishOnce(1, {
      ok: false,
      reason: "timeout",
      url: mainWindow.webContents.getURL(),
      title: mainWindow.webContents.getTitle(),
      desktopRuntime: desktopRuntime()
    });
  }, DESKTOP_SMOKE_TIMEOUT_MS);

  mainWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    clearTimeout(timeout);
    finishOnce(1, {
      ok: false,
      reason: "load-failed",
      errorCode,
      errorDescription,
      url: validatedURL,
      desktopRuntime: desktopRuntime()
    });
  });

  mainWindow.webContents.once("did-finish-load", async () => {
    try {
      const result = await mainWindow.webContents.executeJavaScript(`(async () => {
        const waitFor = async (predicate, label, timeoutMs = 10000) => {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            if (predicate()) return true;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          throw new Error("Timed out waiting for " + label);
        };
        const selectorPresent = (selector) => Boolean(document.querySelector(selector));
        const fetchAppShellAsset = async (request, expectedText = "") => {
          const probe = {
            request,
            fetchOk: false,
            fetchStatus: 0,
            fetchType: "",
            fetchUrl: "",
            includesExpectedText: !expectedText,
            error: ""
          };
          try {
            const response = await fetch(request);
            probe.fetchOk = Boolean(response?.ok);
            probe.fetchStatus = response?.status || 0;
            probe.fetchType = response?.type || "";
            probe.fetchUrl = response?.url || "";
            const text = await response.clone().text();
            probe.includesExpectedText = expectedText ? text.includes(expectedText) : true;
          } catch (error) {
            probe.error = error?.message || String(error);
          }
          return probe;
        };
        await waitFor(() => window.CatHan?.storage?.openDatabase, "LoopCAT storage API");
        await waitFor(() => window.CatHan?.project?.createProject, "LoopCAT project API");
        await waitFor(() => window.CatHan?.localization?.parseLocalizationFile, "LoopCAT localization API");
        await waitFor(() => window.CatHan?.xliff?.buildTargetXliff, "LoopCAT XLIFF API");
        await waitFor(() => window.CatHan?.docx?.buildBilingualDocx, "LoopCAT DOCX API");
        const storage = window.CatHan.storage;
        const projectApi = window.CatHan.project;
        const localizationApi = window.CatHan.localization;
        const xliffApi = window.CatHan.xliff;
        const docxApi = window.CatHan.docx;
        const probeKey = "desktop-smoke-" + Date.now();
        const probeValue = "loopcat packaged persistence probe";
        await storage.put("appMeta", {
          key: probeKey,
          value: probeValue,
          createdAt: new Date().toISOString()
        });
        const loadedProbe = await storage.get("appMeta", probeKey);
        await storage.deleteByKey("appMeta", probeKey);
        const deletedProbe = await storage.get("appMeta", probeKey);
        const projectProbe = {
          createdProject: false,
          appendedSegment: false,
          savedTarget: false,
          readBackTarget: false,
          cleanedUp: false,
          projectId: ""
        };
        let project = await projectApi.createProject({
          name: "LoopCAT Desktop Smoke Project",
          domain: "release-smoke",
          sourceLang: "en",
          targetLang: "tr",
          tmName: "Desktop Smoke TM",
          termBaseName: "Desktop Smoke TB"
        });
        projectProbe.createdProject = Boolean(project?.id);
        projectProbe.projectId = project?.id || "";
        const [segment] = await projectApi.appendProjectSegments(project.id, [{
          text: "Packaged desktop smoke source.",
          target: ""
        }], {
          documentId: "desktop-smoke-document",
          documentName: "desktop-smoke.txt",
          documentType: "text"
        });
        projectProbe.appendedSegment = Boolean(segment?.id && segment.projectId === project.id);
        const savedSegment = await projectApi.saveSegment({
          ...segment,
          target: "Paketlenmis masaustu duman testi hedefi.",
          status: "draft"
        });
        projectProbe.savedTarget = savedSegment?.target === "Paketlenmis masaustu duman testi hedefi.";
        const savedSegments = await projectApi.getProjectSegments(project.id);
        projectProbe.readBackTarget = savedSegments.length === 1 && savedSegments[0]?.target === "Paketlenmis masaustu duman testi hedefi.";
        const workflowProbe = {
          htmlImported: false,
          htmlSavedTarget: false,
          htmlTargetExported: false,
          xliffImported: false,
          xliffTargetExported: false,
          docxImported: false,
          docxTargetExported: false,
          bilingualDocxGenerated: false,
          backupIncludesSavedTargets: false
        };
        const htmlDocumentId = "desktop-smoke-html";
        const htmlParsed = await localizationApi.parseLocalizationFile(new File([
          "<!doctype html><html><body><p>Desktop HTML source.</p></body></html>"
        ], "desktop-smoke.html", { type: "text/html" }));
        project = (await projectApi.appendProjectSegmentsAndUpdateProject({
          ...project,
          documents: [...(project.documents || []), { id: htmlDocumentId, name: "desktop-smoke.html", type: "html" }],
          localizationStructures: {
            ...(project.localizationStructures || {}),
            [htmlDocumentId]: htmlParsed.structure
          }
        }, htmlParsed.segments, {
          documentId: htmlDocumentId,
          documentName: "desktop-smoke.html",
          documentType: "html"
        })).project;
        workflowProbe.htmlImported = Boolean(project.localizationStructures?.[htmlDocumentId]?.source);
        const importedHtmlSegment = (await projectApi.getProjectSegments(project.id)).find((item) => item.documentId === htmlDocumentId);
        await projectApi.saveSegment({
          ...importedHtmlSegment,
          target: "Paketlenmis HTML hedefi.",
          status: "confirmed"
        });
        const htmlSegments = (await projectApi.getProjectSegments(project.id)).filter((item) => item.documentId === htmlDocumentId);
        workflowProbe.htmlSavedTarget = htmlSegments.length === 1 && htmlSegments[0].target === "Paketlenmis HTML hedefi.";
        const htmlTarget = localizationApi.buildLocalizationFile("html", htmlSegments, project.localizationStructures[htmlDocumentId]);
        workflowProbe.htmlTargetExported = htmlTarget.includes("<p>Paketlenmis HTML hedefi.</p>") && !htmlTarget.includes("Desktop HTML source.");

        const xliffText = \`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="desktop-smoke.html" source-language="en" target-language="tr" datatype="html">
    <body>
      <trans-unit id="u1">
        <source>Desktop <g id="b" ctype="x-bold">XLIFF</g> source.</source>
        <target></target>
      </trans-unit>
    </body>
  </file>
</xliff>\`;
        const xliffParsed = xliffApi.parseXliffText(xliffText, "desktop-smoke.xlf");
        workflowProbe.xliffImported = xliffParsed.segments.length === 1 && xliffParsed.segments[0].text.includes("<b>XLIFF</b>");
        xliffParsed.segments[0].target = "Paket <b>XLIFF</b> hedefi.";
        xliffParsed.segments[0].status = "confirmed";
        const xliffTarget = xliffApi.buildTargetXliff(project, xliffParsed.segments, xliffParsed.structure);
        const xliffRoundTrip = xliffApi.parseXliffText(xliffTarget, "desktop-smoke-target.xlf");
        workflowProbe.xliffTargetExported = xliffTarget.includes('original="desktop-smoke.html"') &&
          xliffRoundTrip.segments[0]?.target.includes("<b>XLIFF</b>");

        const docxBase64 = "UEsDBBQAAAAIANGDnVyKqQaC/AAAAL0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QTU7DMBSE95G4g+UtShxYIITidMHPEliUAzzZL4mF/+TnlvZsLDgSV8BpoUiIdmnNfDPP8/n+0S02zrI1JjLBS37RtJyhV0EbP0r+snyorzmjDF6DDR4l3yLxRV91y21EYgX2JPmUc7wRgtSEDqgJEX1RhpAc5PJMo4igXmFEcdm2V0IFn9HnOs8ZvK8Y6+5wgJXN7H5TlP0tCS1xdrv3znWSQ4zWKMhFF2uv/xTV3yVNIXcemkyk82Lg4ljJLB7v+EWfykTJaGTPkPIjuGIUbyFpoYNauQI3p5P+uTYMg1F44Oe0mIJCorK9s81BcWD8zy86sRu+P6u+AFBLAwQUAAAACADRg51cEzBxk+UAAABZAQAAEQAAAHdvcmRcZG9jdW1lbnQueG1sbU9LTsMwEN1X4g4j7xsHFghVSbpAQhygHMDE0yaq7bFmpoSejQVH4grYFWUD0uhpvu+9+fr47LbvMcAbssyUenPbtAYwjeTndOjNy+5p/WBA1CXvAiXszRnFbIdVt2w8jaeISaEwJNksvZlU88ZaGSeMThrKmMpsTxydlpIPdiH2mWlEkSIQg71r23sb3ZzMUChfyZ8v3LlWXEGHZwyBoFwG38BumgVKOFAUhauHprN1tSJfMP+heaSYT4q8dkVbFD0ouyTBafkclCgITBjyb5tYquoR9q6s878S9sdzTa5ehpvVN1BLAwQUAAAACADRg51c/g3tSbwAAAAzAQAACwAAAF9yZWxzXC5yZWxzjc85DsIwEAXQPhJ3sKYnTigQQnHSIKS0KBzAsieLiBfZZsnZKDgSV8AFBUEUlLO90X/eH0V1UyO5oPOD0QzyNAOCWhg56I7BsdkvN0B84Fry0WhkMKGHqkyKA448xBvfD9aTiGjPoA/Bbin1okfFfWos6jhpjVM8xNJ11HJx4h3SVZatqfs0oEwImbGklgxcLXMgzWTxH9607SBwZ8RZoQ4/vnxtRJm7DgODq3GSync7jSzQmJLOYpaL5AVQSwECFAAUAAAACADRg51ciqkGgvwAAAC9AQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIANGDnVwTMHGT5QAAAFkBAAARAAAAAAAAAAAAAAAAAC0BAAB3b3JkXGRvY3VtZW50LnhtbFBLAQIUABQAAAAIANGDnVz+De1JvAAAADMBAAALAAAAAAAAAAAAAAAAAEECAABfcmVsc1wucmVsc1BLBQYAAAAAAwADALkAAAAmAwAAAAA=";
        const docxBytes = Uint8Array.from(atob(docxBase64), (char) => char.charCodeAt(0));
        const docxImport = await docxApi.extractDocxSegments(new File([docxBytes], "desktop-smoke.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }));
        workflowProbe.docxImported = docxImport.segments.length >= 1 && Boolean(docxImport.structure?.docxPackageBase64);
        const docxTargets = docxImport.segments.map((segment, index) => ({
          ...segment,
          target: index === 0 ? "Paket DOCX hedefi." : "Paket DOCX hedefi " + (index + 1) + ".",
          status: "confirmed"
        }));
        const rebuiltDocx = await docxApi.buildTargetDocx({
          name: "Desktop DOCX smoke",
          docxStructure: docxImport.structure
        }, docxTargets);
        const rebuiltDocxImport = await docxApi.extractDocxSegments(new File([rebuiltDocx], "desktop-smoke-target.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }));
        workflowProbe.docxTargetExported = rebuiltDocxImport.segments.some((segment) => segment.text.includes("Paket DOCX hedefi.")) &&
          !rebuiltDocxImport.segments.some((segment) => segment.text.includes(docxImport.segments[0]?.text || "Desktop DOCX smoke source"));

        const translatedSegments = await projectApi.getProjectSegments(project.id);
        const bilingualBytes = docxApi.buildBilingualDocx(project, translatedSegments, {
          qaChecks: [{ id: "desktop-smoke-qa", segmentId: translatedSegments[0]?.id, severity: "info", type: "smoke", message: "Packaged smoke QA note." }]
        });
        workflowProbe.bilingualDocxGenerated = bilingualBytes instanceof Uint8Array &&
          bilingualBytes.length > 500 &&
          bilingualBytes[0] === 0x50 &&
          bilingualBytes[1] === 0x4b;
        const backup = await storage.exportAllData();
        workflowProbe.backupIncludesSavedTargets = backup.projects.some((item) => item.id === project.id) &&
          backup.segments.some((item) => item.projectId === project.id && item.target === "Paketlenmis masaustu duman testi hedefi.") &&
          backup.segments.some((item) => item.projectId === project.id && item.target === "Paketlenmis HTML hedefi.");
        await projectApi.deleteProject(project.id);
        projectProbe.cleanedUp = (await projectApi.getProjectSegments(project.id)).length === 0 &&
          !(await storage.get("projects", project.id));
        const appShellAssetProbe = {
          index: await fetchAppShellAsset("./index.html", "LoopCAT"),
          app: await fetchAppShellAsset("./app.js", "registerOfflineAppShell"),
          serviceWorker: await fetchAppShellAsset("./service-worker.js", "loopcat-offline-"),
          testRunnerBlocked: false
        };
        try {
          const testRunnerResponse = await fetch("./test-runner.html");
          appShellAssetProbe.testRunnerBlocked = !testRunnerResponse.ok;
        } catch {
          appShellAssetProbe.testRunnerBlocked = true;
        }
        const db = await storage.openDatabase();
        return {
          readyState: document.readyState,
          title: document.title,
          url: window.location.href,
          hasAppShell: selectorPresent(".app-shell"),
          hasWorkspace: selectorPresent("#workspace"),
          hasProjectsView: selectorPresent("#projectsView"),
          hasProjectList: selectorPresent("#projectList"),
          hasSaveStatus: selectorPresent("#saveStatus"),
          hasNewProjectButton: selectorPresent("#newProjectBtn"),
          storageProbe: {
            databaseName: db?.name || "",
            objectStores: Array.from(db?.objectStoreNames || []),
            wroteAndRead: loadedProbe?.value === probeValue,
            cleanedUp: !deletedProbe
          },
          projectProbe,
          workflowProbe,
          appShellAssetProbe,
          bodyText: document.body ? document.body.innerText.slice(0, 400) : ""
        };
      })()`, true);
      const missing = [];
      for (const [key, label] of [
        ["hasAppShell", ".app-shell"],
        ["hasWorkspace", "#workspace"],
        ["hasProjectsView", "#projectsView"],
        ["hasProjectList", "#projectList"],
        ["hasSaveStatus", "#saveStatus"],
        ["hasNewProjectButton", "#newProjectBtn"]
      ]) {
        if (!result?.[key]) missing.push(label);
      }
      if (!result?.storageProbe?.wroteAndRead) missing.push("IndexedDB write/read");
      if (!result?.storageProbe?.cleanedUp) missing.push("IndexedDB cleanup");
      if (!result?.projectProbe?.createdProject) missing.push("project creation");
      if (!result?.projectProbe?.appendedSegment) missing.push("segment creation");
      if (!result?.projectProbe?.savedTarget) missing.push("segment target save");
      if (!result?.projectProbe?.readBackTarget) missing.push("segment target readback");
      if (!result?.projectProbe?.cleanedUp) missing.push("project cleanup");
      if (!result?.workflowProbe?.htmlImported) missing.push("HTML localization import");
      if (!result?.workflowProbe?.htmlSavedTarget) missing.push("HTML target save");
      if (!result?.workflowProbe?.htmlTargetExported) missing.push("HTML target export");
      if (!result?.workflowProbe?.xliffImported) missing.push("XLIFF import");
      if (!result?.workflowProbe?.xliffTargetExported) missing.push("XLIFF target export");
      if (!result?.workflowProbe?.docxImported) missing.push("DOCX source import");
      if (!result?.workflowProbe?.docxTargetExported) missing.push("DOCX target export");
      if (!result?.workflowProbe?.bilingualDocxGenerated) missing.push("bilingual DOCX generation");
      if (!result?.workflowProbe?.backupIncludesSavedTargets) missing.push("backup includes saved targets");
      if (!result?.appShellAssetProbe?.index?.fetchOk) missing.push("packaged index.html fetch");
      if (!result?.appShellAssetProbe?.index?.includesExpectedText) missing.push("packaged index.html content");
      if (!result?.appShellAssetProbe?.app?.fetchOk) missing.push("packaged app.js fetch");
      if (!result?.appShellAssetProbe?.app?.includesExpectedText) missing.push("packaged app.js content");
      if (!result?.appShellAssetProbe?.serviceWorker?.fetchOk) missing.push("packaged service-worker.js fetch");
      if (!result?.appShellAssetProbe?.serviceWorker?.includesExpectedText) missing.push("packaged service-worker.js content");
      if (!result?.appShellAssetProbe?.testRunnerBlocked) missing.push("test runner excluded from desktop protocol");
      for (const storeName of ["projects", "segments", "appMeta"]) {
        if (!result?.storageProbe?.objectStores?.includes(storeName)) missing.push(`IndexedDB store ${storeName}`);
      }
      if (result?.title !== "LoopCAT") missing.push("document title LoopCAT");
      if (result?.url !== `${APP_SCHEME}://${APP_HOST}/index.html`) missing.push("loopcat app-shell URL");
      if (!String(result?.bodyText || "").includes("Local translation editor")) missing.push("brand text");
      clearTimeout(timeout);
      finishOnce(missing.length ? 1 : 0, {
        ok: missing.length === 0,
        reason: missing.length ? "missing-runtime-ui" : "desktop-smoke-pass",
        missing,
        desktopRuntime: desktopRuntime(),
        result
      });
    } catch (error) {
      clearTimeout(timeout);
      finishOnce(1, {
        ok: false,
        reason: "probe-failed",
        error: error?.stack || error?.message || String(error),
        desktopRuntime: desktopRuntime()
      });
    }
  });

  mainWindow.webContents.once("render-process-gone", (_event, details) => {
    clearTimeout(timeout);
    if (details?.reason === "launch-failed" && rendererSandbox && onSandboxLaunchFailed?.()) {
      return;
    }
    finishOnce(1, {
      ok: false,
      reason: "render-process-gone",
      details,
      desktopRuntime: desktopRuntime()
    });
  });
}

function configureNetworkBoundaries() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedNetworkRequest(details.url) });
  });
}

function configurePermissions() {
  const allowedPermissions = new Set(["fileSystem"]);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    callback(Boolean(isLoopcatOrigin(details.requestingUrl || webContents.getURL()) && allowedPermissions.has(permission)));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return Boolean(isLoopcatOrigin(requestingOrigin || webContents.getURL()) && allowedPermissions.has(permission));
  });
}

function setProjectSpellCheckerLanguages(preferredLanguages = [], ses = session?.defaultSession) {
  const requested = Array.isArray(preferredLanguages) ? preferredLanguages : [preferredLanguages];
  const normalizedRequested = requested.map(canonicalSpellCheckerLanguageCode).filter(Boolean);
  if (!ses) {
    return { ok: false, requestedLanguages: normalizedRequested, activeLanguages: [], reason: "session-unavailable" };
  }
  if (typeof ses.setSpellCheckerEnabled === "function") ses.setSpellCheckerEnabled(true);
  if (process.platform === "darwin") {
    return { ok: true, requestedLanguages: normalizedRequested, activeLanguages: [], reason: "macos-native-auto" };
  }
  const available = Array.isArray(ses.availableSpellCheckerLanguages) ? ses.availableSpellCheckerLanguages : [];
  const selected = selectSpellCheckerLanguages(normalizedRequested, available);
  if (!selected.length) {
    if (typeof ses.setSpellCheckerEnabled === "function") ses.setSpellCheckerEnabled(false);
    return { ok: false, requestedLanguages: normalizedRequested, activeLanguages: [], reason: "unsupported-language" };
  }
  try {
    ses.setSpellCheckerLanguages?.(selected);
    return { ok: true, requestedLanguages: normalizedRequested, activeLanguages: selected, reason: "set" };
  } catch (error) {
    return {
      ok: false,
      requestedLanguages: normalizedRequested,
      activeLanguages: [],
      reason: error?.message || "set-failed"
    };
  }
}

function spellCheckerInfo(ses = session?.defaultSession) {
  if (!ses) return { supported: false, enabled: false, languages: [], availableLanguages: [] };
  return {
    supported: true,
    enabled: typeof ses.isSpellCheckerEnabled === "function" ? ses.isSpellCheckerEnabled() : Boolean(ses.spellCheckerEnabled),
    languages: typeof ses.getSpellCheckerLanguages === "function" ? ses.getSpellCheckerLanguages() : [],
    availableLanguages: Array.isArray(ses.availableSpellCheckerLanguages) ? ses.availableSpellCheckerLanguages : []
  };
}

function configureSpellChecker() {
  const ses = session?.defaultSession;
  if (!ses) return;
  if (typeof ses.setSpellCheckerEnabled === "function") ses.setSpellCheckerEnabled(true);
  if (typeof ses.setSpellCheckerDictionaryDownloadURL === "function") {
    try {
      ses.setSpellCheckerDictionaryDownloadURL(SPELLCHECKER_DICTIONARY_DOWNLOAD_URL);
    } catch (error) {
      console.warn("LoopCAT could not pin the spellchecker dictionary download URL.", error);
    }
  }
}

function configureSpellCheckerBridge() {
  if (!ipcMain?.handle) return;
  ipcMain.handle("loopcat:set-spellchecker-languages", (event, languages) => {
    if (!isAllowedDesktopBridgeRequest(event)) return { ok: false, activeLanguages: [], reason: "rejected-origin" };
    return setProjectSpellCheckerLanguages(languages);
  });
  ipcMain.handle("loopcat:get-spellchecker-info", (event) => (
    isAllowedDesktopBridgeRequest(event)
      ? spellCheckerInfo()
      : { supported: false, enabled: false, languages: [], availableLanguages: [] }
  ));
}

function buildSpellCheckerContextMenuTemplate(params = {}) {
  if (!params.isEditable) return [];
  const suggestions = Array.from(new Set(params.dictionarySuggestions || []))
    .map((suggestion) => String(suggestion || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const template = [];
  if (params.misspelledWord) {
    if (suggestions.length) {
      suggestions.forEach((suggestion) => {
        template.push({ label: suggestion, spellcheckReplacement: suggestion });
      });
    } else {
      template.push({ label: "No spelling suggestions", enabled: false });
    }
    template.push({ type: "separator" });
    template.push({ label: `Add "${String(params.misspelledWord).slice(0, 40)}" to dictionary`, spellcheckAddWord: String(params.misspelledWord) });
    template.push({ type: "separator" });
  }
  template.push(
    { role: "undo" },
    { role: "redo" },
    { type: "separator" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { role: "selectAll" }
  );
  return template;
}

function attachSpellCheckerContextMenu(mainWindow) {
  if (!mainWindow?.webContents?.on || !Menu?.buildFromTemplate) return;
  mainWindow.webContents.on("context-menu", (_event, params) => {
    const template = buildSpellCheckerContextMenuTemplate(params).map((item) => {
      if (item.spellcheckReplacement) {
        return {
          label: item.label,
          click: () => mainWindow.webContents.replaceMisspelling(item.spellcheckReplacement)
        };
      }
      if (item.spellcheckAddWord) {
        return {
          label: item.label,
          click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(item.spellcheckAddWord)
        };
      }
      return item;
    });
    if (!template.length) return;
    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}

function createRendererWebPreferences(options = {}) {
  const rendererSandbox = options.rendererSandbox !== false;
  const isPackaged = Boolean(options.isPackaged);
  return {
    contextIsolation: true,
    preload: DESKTOP_PRELOAD,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: rendererSandbox,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    enableWebSQL: false,
    spellcheck: true,
    navigateOnDragDrop: false,
    devTools: !isPackaged
  };
}

function createWindow(options = {}) {
  const rendererSandbox = Object.hasOwn(options, "rendererSandbox")
    ? options.rendererSandbox !== false
    : DESKTOP_RENDERER_SANDBOX_DEFAULT;
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: !DESKTOP_SMOKE_MODE,
    backgroundColor: "#f7f9fb",
    title: "LoopCAT",
    webPreferences: createRendererWebPreferences({ rendererSandbox, isPackaged: Boolean(app?.isPackaged) })
  });

  const retryWithoutRendererSandbox = () => {
    if (!rendererSandbox || DESKTOP_SANDBOX_FALLBACK_DISABLED) return false;
    desktopSandboxFallbackUsed = true;
    createWindow({ rendererSandbox: false });
    setTimeout(() => {
      if (!mainWindow.isDestroyed()) mainWindow.destroy();
    }, 1000).unref?.();
    return true;
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppNavigationUrl(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });
  attachSpellCheckerContextMenu(mainWindow);

  if (DESKTOP_SMOKE_MODE) {
    attachDesktopSmokeProbe(mainWindow, {
      rendererSandbox,
      sandboxFallbackUsed: desktopSandboxFallbackUsed,
      onSandboxLaunchFailed: retryWithoutRendererSandbox
    });
  } else {
    mainWindow.webContents.once("render-process-gone", (_event, details) => {
      if (details?.reason === "launch-failed" && retryWithoutRendererSandbox()) return;
      console.error("LoopCAT renderer exited unexpectedly.", details);
    });
  }
  mainWindow.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
}

function boot() {
  registerPrivilegedSchemes();
  app.whenReady().then(() => {
    registerAppProtocol();
    configureNetworkBoundaries();
    configurePermissions();
    configureSpellChecker();
    configureSpellCheckerBridge();
    configureDesktopBridge();
    createApplicationMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

if (app?.whenReady && protocol?.registerSchemesAsPrivileged) boot();

module.exports = {
  APP_SCHEME,
  APP_HOST,
  APP_ROOT,
  SPELLCHECKER_DICTIONARY_DOWNLOAD_URL,
  OPENAI_RESPONSES_URL,
  OPENAI_MODELS_URL,
  ALLOWED_EXTERNAL_HOSTS,
  LOCAL_AI_RUNTIME_HOSTS,
  LOCAL_AI_RUNTIME_PORTS,
  LOCAL_AI_RUNTIME_PATHS,
  OLLAMA_CLOUD_HOST,
  OLLAMA_CLOUD_API_PATHS,
  GEMINI_HOST,
  GEMINI_API_PATHS,
  ANTHROPIC_HOST,
  ANTHROPIC_API_PATHS,
  COHERE_HOST,
  COHERE_API_PATHS,
  AZURE_OPENAI_HOST_SUFFIXES,
  AZURE_OPENAI_API_PATHS,
  HOSTED_OPENAI_COMPATIBLE_API_PATHS,
  SPELLCHECKER_LANGUAGE_FALLBACKS,
  ALLOWED_APP_FILES,
  normalizeAppRelativePath,
  canonicalSpellCheckerLanguageCode,
  spellCheckerLanguageCandidates,
  selectSpellCheckerLanguages,
  setProjectSpellCheckerLanguages,
  spellCheckerInfo,
  buildSpellCheckerContextMenuTemplate,
  isAllowedAppPath,
  resolveAppFile,
  isAllowedOpenAiResponsesUrl,
  isAllowedLocalAiRuntimeUrl,
  isAllowedOllamaCloudUrl,
  isAllowedGeminiUrl,
  isAllowedAnthropicUrl,
  isAllowedCohereUrl,
  isAllowedAzureOpenAiHost,
  isAllowedAzureOpenAiUrl,
  isAllowedHostedOpenAiCompatibleUrl,
  isAllowedNetworkRequest,
  isLoopcatUrl,
  isLoopcatOrigin,
  isAllowedAppNavigationUrl,
  isExternalHttpsUrl,
  lmStudioCliCandidates,
  runLmStudioStartCommand,
  startLmStudioServerFromDesktop,
  desktopCreatorIdentity,
  createRendererWebPreferences
};
