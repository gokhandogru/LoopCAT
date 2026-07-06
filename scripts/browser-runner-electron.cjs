const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const root = path.resolve(__dirname, "..");
const timeoutMs = Number(process.env.LOOPCAT_BROWSER_TEST_TIMEOUT_MS || 10 * 60 * 1000);
const runnerUserDataDir = path.join(os.tmpdir(), `loopcat-browser-runner-${process.pid}-${Date.now()}`);
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
const allowedFiles = new Set([
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "service-worker.js",
  "icons/loopcat-icon.svg",
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
  "project.js",
  "app.js",
  "LICENSE",
  "NOTICE",
  "test-runner.html",
  "security-policy-test.html",
  "offline-shell-test.html",
  "smoke-test.html",
  "regression-test.html",
  "workspace-storage-test.html",
  "package-roundtrip-test.html",
  "large-project-test.html"
]);

let server = null;
let windowRef = null;
let finished = false;
let lastTitle = "";

app.disableHardwareAcceleration();
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") {
  app.commandLine.appendSwitch("no-sandbox");
}
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-dev-shm-usage");
app.setPath("userData", runnerUserDataDir);
app.once("will-quit", () => {
  fs.rm(runnerUserDataDir, { recursive: true, force: true }).catch(() => {});
});

function send(message) {
  process.stdout.write(`${message}\n`);
}

function finish(code, message) {
  if (finished) return;
  finished = true;
  if (message) (code === 0 ? send : (line) => process.stderr.write(`${line}\n`))(message);
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
  const resolved = path.resolve(root, relativePath);
  const rootWithSeparator = `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSeparator)) return "";
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

function handleTitle(title) {
  lastTitle = String(title || "");
  send(lastTitle);
  if (lastTitle.includes("ALL TESTS PASS")) finish(0, "Browser runner verification passed.");
  if (lastTitle.includes("TEST RUN FAILED")) finish(1, "Browser runner verification failed.");
}

async function runnerDiagnostic() {
  if (!windowRef || windowRef.isDestroyed()) return "";
  try {
    return await Promise.race([
      windowRef.webContents.executeJavaScript(`(() => {
      const frameTexts = Array.from(document.querySelectorAll("iframe")).map((frame) => {
        try {
          return frame.contentDocument?.querySelector("#results")?.textContent ||
            frame.contentDocument?.querySelector("#appWorkflowTestResults")?.textContent ||
            "";
        } catch (error) {
          return "Could not read test frame: " + error.message;
        }
      }).filter(Boolean);
      const parts = [
        window.__loopcatBrowserRunnerStatus || "",
        ...frameTexts
      ].filter(Boolean);
      return parts.join("\\n--- active frame ---\\n").slice(-8000);
    })()`, true),
      new Promise((resolve) => setTimeout(() => resolve("Timed out collecting browser runner diagnostics."), 5000))
    ]);
  } catch (error) {
    return `Could not collect browser runner diagnostics: ${error.message || error}`;
  }
}

app.whenReady().then(async () => {
  const port = await startServer();
  const url = `http://127.0.0.1:${port}/test-runner.html`;
  windowRef = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  windowRef.webContents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    handleTitle(title);
  });
  windowRef.webContents.on("render-process-gone", (_event, details) => {
    finish(1, `Browser runner renderer exited unexpectedly: ${details.reason}`);
  });
  windowRef.webContents.on("unresponsive", () => {
    finish(1, "Browser runner window became unresponsive.");
  });
  await windowRef.loadURL(url);
  handleTitle(await windowRef.webContents.getTitle());
  setTimeout(async () => {
    const diagnostic = await runnerDiagnostic();
    finish(1, `Browser runner timed out after ${timeoutMs} ms. Last title: ${lastTitle || "(none)"}${diagnostic ? `\n${diagnostic}` : ""}`);
  }, timeoutMs).unref();
}).catch((error) => {
  finish(1, error.stack || error.message || String(error));
});
