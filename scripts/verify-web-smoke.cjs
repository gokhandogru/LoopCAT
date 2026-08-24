const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);

function optionValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

const distDir = optionValue("--dist")
  ? path.resolve(process.cwd(), optionValue("--dist"))
  : path.join(root, "dist-web");
const screenshotDir = optionValue("--screenshot-dir")
  ? path.resolve(process.cwd(), optionValue("--screenshot-dir"))
  : "";
const packageJson = JSON.parse(fsSync.readFileSync(path.join(root, "package.json"), "utf8"));
const productName = packageJson.build?.productName || "LoopCAT";
const artifactName = `${productName} Web ${packageJson.version}.zip`;
const artifactPath = optionValue("--artifact")
  ? path.resolve(process.cwd(), optionValue("--artifact"))
  : path.join(distDir, artifactName);

if (!process.versions.electron) {
  let electronBinary = "";
  try {
    electronBinary = require("electron");
  } catch (error) {
    const installer = path.join(root, "node_modules", "electron", "install.js");
    if (fsSync.existsSync(installer)) {
      spawnSync(process.execPath, [installer], {
        cwd: root,
        env: {
          ...process.env,
          ELECTRON_CACHE: process.env.ELECTRON_CACHE || path.join(root, ".cache", "electron")
        },
        stdio: "inherit"
      });
      delete require.cache[require.resolve("electron")];
      electronBinary = require("electron");
    } else {
      console.error(error.message || error);
      process.exit(1);
    }
  }
  if (typeof electronBinary !== "string" || !electronBinary) {
    console.error(
      "Electron is not installed correctly. Run pnpm install --frozen-lockfile with install scripts enabled."
    );
    process.exit(1);
  }
  const noSandbox =
    process.env.LOOPCAT_WEB_SMOKE_NO_SANDBOX === "1" ||
    (process.env.LOOPCAT_WEB_SMOKE_NO_SANDBOX === undefined && process.platform === "linux");
  const result = spawnSync(electronBinary, [...(noSandbox ? ["--no-sandbox"] : []), __filename, ...args], {
    cwd: root,
    env: {
      ...process.env,
      LOOPCAT_WEB_SMOKE_NO_SANDBOX: noSandbox ? "1" : "0"
    },
    stdio: "inherit"
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = require("electron");
const tempRoot = path.join(os.tmpdir(), `loopcat-web-smoke-${process.pid}-${Date.now()}`);
const extractedRoot = path.join(tempRoot, "web");
const runnerUserDataDir = path.join(tempRoot, "profile");
const servedFiles = new Set();
const failures = [];
const serverRequests = [];
let server = null;

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

app.disableHardwareAcceleration();
if (process.env.LOOPCAT_WEB_SMOKE_NO_SANDBOX === "1") {
  app.commandLine.appendSwitch("no-sandbox");
}
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-dev-shm-usage");
app.setPath("userData", runnerUserDataDir);
app.on("window-all-closed", () => {
  // Keep the verifier alive long enough to report renderer load failures.
});
app.once("will-quit", () => {
  fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
});

function fail(message) {
  failures.push(message);
}

function writeLine(stream, message) {
  fsSync.writeSync(stream === "stderr" ? 2 : 1, `${message}\n`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readUInt16(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function parseZipEntries(buffer) {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 0xffff - 22); offset -= 1) {
    if (readUInt32(buffer, offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("ZIP end-of-central-directory record is missing.");
  const entryCount = readUInt16(buffer, eocdOffset + 10);
  const centralSize = readUInt32(buffer, eocdOffset + 12);
  const centralOffset = readUInt32(buffer, eocdOffset + 16);
  if (centralOffset + centralSize > buffer.length) throw new Error("ZIP central directory points outside the file.");

  const entries = new Map();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) throw new Error("ZIP central directory entry is malformed.");
    const method = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const uncompressedSize = readUInt32(buffer, offset + 24);
    const nameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localOffset = readUInt32(buffer, offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (method !== 0) throw new Error(`${name} uses unsupported ZIP compression method ${method}.`);
    if (!name || name.startsWith("/") || name.includes("\\") || name.includes(":") || name.split("/").includes("..")) {
      throw new Error(`ZIP entry has unsafe path: ${name}`);
    }
    if (entries.has(name)) throw new Error(`ZIP entry is duplicated: ${name}`);
    if (readUInt32(buffer, localOffset) !== 0x04034b50) throw new Error(`${name} local header is malformed.`);
    const localNameLength = readUInt16(buffer, localOffset + 26);
    const localExtraLength = readUInt16(buffer, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error(`${name} content points outside the file.`);
    const data = buffer.slice(dataStart, dataEnd);
    if (data.length !== uncompressedSize) throw new Error(`${name} stored size is inconsistent.`);
    entries.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function safeExtractPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const resolved = path.resolve(extractedRoot, normalized);
  const rootWithSeparator = `${extractedRoot}${path.sep}`;
  if (resolved !== extractedRoot && !resolved.startsWith(rootWithSeparator)) {
    throw new Error(`ZIP entry escapes extraction root: ${relativePath}`);
  }
  return { normalized, resolved };
}

async function extractWebArtifact() {
  if (!fsSync.existsSync(artifactPath)) {
    throw new Error(`Missing static web artifact: ${path.relative(root, artifactPath) || artifactPath}`);
  }
  const entries = parseZipEntries(await fs.readFile(artifactPath));
  await fs.rm(extractedRoot, { recursive: true, force: true });
  await fs.mkdir(extractedRoot, { recursive: true });
  for (const [name, data] of entries) {
    const { normalized, resolved } = safeExtractPath(name);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, data);
    servedFiles.add(normalized);
  }
  if (!servedFiles.has("index.html")) throw new Error("Static web artifact is missing index.html.");
}

function safePathname(requestUrl) {
  const url = new URL(requestUrl || "/", "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const relativePath = path.posix.normalize(pathname.replace(/^\/+/, "").replaceAll("\\", "/"));
  if (!servedFiles.has(relativePath)) return "";
  const resolved = path.resolve(extractedRoot, relativePath);
  const rootWithSeparator = `${extractedRoot}${path.sep}`;
  if (resolved !== extractedRoot && !resolved.startsWith(rootWithSeparator)) return "";
  return resolved;
}

function startServer() {
  server = http.createServer(async (request, response) => {
    try {
      const filePath = safePathname(request.url);
      if (!filePath) {
        serverRequests.push(`${request.method || "GET"} ${request.url || "/"} -> 403`);
        response.writeHead(403).end("Forbidden");
        return;
      }
      const data = await fs.readFile(filePath);
      serverRequests.push(`${request.method || "GET"} ${request.url || "/"} -> 200`);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream"
      });
      response.end(data);
    } catch (error) {
      serverRequests.push(
        `${request.method || "GET"} ${request.url || "/"} -> ${error?.code === "ENOENT" ? 404 : 500}`
      );
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end(error?.message || "Server error");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function probeUrl(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Static web smoke server returned HTTP ${response.statusCode} for ${url}.`));
          return;
        }
        if (!body.includes("<title>LoopCAT</title>")) {
          reject(new Error("Static web smoke server did not return the LoopCAT app shell."));
          return;
        }
        resolve();
      });
    });
    request.on("error", reject);
  });
}

function layoutScript() {
  return `(() => {
    const text = (element) => element?.textContent?.replace(/\\s+/g, " ").trim() || "";
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      const started = Date.now();
      while (Date.now() - started < 15000) {
        if (predicate()) return true;
        await sleep(50);
      }
      throw new Error("Timed out waiting for " + label);
    };
    const elementLabel = (element) => {
      if (element.id) return "#" + element.id;
      if (element.className && typeof element.className === "string") return element.tagName.toLowerCase() + "." + element.className.trim().split(/\\s+/).slice(0, 2).join(".");
      return element.tagName.toLowerCase();
    };
    const layoutState = () => {
      const viewportOverflow = [];
      const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
      if (documentWidth > window.innerWidth + 2) {
        viewportOverflow.push({ viewport: window.innerWidth, documentWidth });
      }
      const controlOverflow = Array.from(document.querySelectorAll("button, summary, .topbar, .toolbar-actions, .dialog-card, .dialog-actions, .project-storage-row, .two-col, .project-filters"))
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) return false;
          return element.scrollWidth > element.clientWidth + 2;
        })
        .map((element) => ({
          selector: elementLabel(element),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          text: text(element).slice(0, 120)
        }));
      const bodyText = text(document.body).slice(0, 5000);
      const frameworkOverlay = Boolean(document.querySelector("vite-error-overlay, #webpack-dev-server-client-overlay, nextjs-portal")) ||
        /(?:Unhandled Runtime Error|webpack compiled with|Vite Error|Next\\.js)/i.test(bodyText);
      return {
        title: document.title,
        url: location.href,
        meaningfulText: bodyText.slice(0, 300),
        saveStatusText: text(document.querySelector("#saveStatus")),
        updateReadyVisible: visible("#updateReadyBanner"),
        frameworkOverlay,
        viewportOverflow,
        controlOverflow,
        hasShell: visible(".app-shell"),
        newProjectVisible: visible("#newProjectBtn"),
        mobileProjectRailHidden: window.innerWidth > 760 || !visible(".workspace.projects-mode .project-rail"),
        projectsModeSidebarHidden: !visible(".workspace.projects-mode .sidebar")
      };
    };
    const run = async () => {
      await waitFor(() => visible("#newProjectBtn") && text(document.body).includes("LoopCAT"), "LoopCAT app shell");
      return layoutState();
    };
    return run();
  })()`;
}

function dialogScript() {
  return `(() => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const text = (element) => element?.textContent?.replace(/\\s+/g, " ").trim() || "";
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const waitFor = async (predicate, label) => {
      const started = Date.now();
      while (Date.now() - started < 15000) {
        if (predicate()) return true;
        await sleep(50);
      }
      throw new Error("Timed out waiting for " + label);
    };
    const elementLabel = (element) => {
      if (element.id) return "#" + element.id;
      if (element.className && typeof element.className === "string") return element.tagName.toLowerCase() + "." + element.className.trim().split(/\\s+/).slice(0, 2).join(".");
      return element.tagName.toLowerCase();
    };
    const collectControlOverflow = () => Array.from(document.querySelectorAll("button, summary, .topbar, .toolbar-actions, .dialog-card, .dialog-actions, .project-storage-row, .two-col, .project-filters"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) return false;
        return element.scrollWidth > element.clientWidth + 2;
      })
      .map((element) => ({
        selector: elementLabel(element),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        text: text(element).slice(0, 120)
      }));
    const run = async () => {
      document.querySelector("#newProjectBtn").click();
      await waitFor(() => document.querySelector("#projectDialog")?.open, "new project dialog");
      await waitFor(() => visible("#projectNameInput"), "project name field");
      const input = document.querySelector("#projectNameInput");
      input.value = "Static web smoke";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const dialog = document.querySelector("#projectDialog");
      const rect = dialog.getBoundingClientRect();
      const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
      return {
        dialogOpen: dialog.open === true,
        activeId: document.activeElement?.id || "",
        projectNameValue: input.value,
        dialogRect: {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height
        },
        dialogFitsWidth: rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.width <= window.innerWidth + 2,
        viewportOverflow: documentWidth > window.innerWidth + 2 ? [{ viewport: window.innerWidth, documentWidth }] : [],
        controlOverflow: collectControlOverflow()
      };
    };
    return run();
  })()`;
}

function aboutDialogScript() {
  return `(() => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const text = (element) => element?.textContent?.replace(/\\s+/g, " ").trim() || "";
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const waitFor = async (predicate, label) => {
      const started = Date.now();
      while (Date.now() - started < 15000) {
        if (predicate()) return true;
        await sleep(50);
      }
      throw new Error("Timed out waiting for " + label);
    };
    const elementLabel = (element) => {
      if (element.id) return "#" + element.id;
      if (element.className && typeof element.className === "string") return element.tagName.toLowerCase() + "." + element.className.trim().split(/\\s+/).slice(0, 2).join(".");
      return element.tagName.toLowerCase();
    };
    const collectControlOverflow = () => Array.from(document.querySelectorAll("button, summary, .topbar, .toolbar-actions, .dialog-card, .dialog-actions, .project-storage-row, .two-col, .project-filters, .about-meta"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) return false;
        return element.scrollWidth > element.clientWidth + 2;
      })
      .map((element) => ({
        selector: elementLabel(element),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        text: text(element).slice(0, 120)
      }));
    const run = async () => {
      document.querySelector("#aboutBtn").click();
      await waitFor(() => document.querySelector("#aboutDialog")?.open, "about dialog");
      await waitFor(() => visible("#closeAboutBtn"), "about close button");
      const dialog = document.querySelector("#aboutDialog");
      const link = dialog.querySelector("a[href='https://www.linkedin.com/in/gokhan-dogru-localization/']");
      const rect = dialog.getBoundingClientRect();
      const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
      return {
        dialogOpen: dialog.open === true,
        bodyText: text(dialog),
        linkTarget: link?.href || "",
        dialogRect: {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height
        },
        dialogFitsWidth: rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.width <= window.innerWidth + 2,
        viewportOverflow: documentWidth > window.innerWidth + 2 ? [{ viewport: window.innerWidth, documentWidth }] : [],
        controlOverflow: collectControlOverflow()
      };
    };
    return run();
  })()`;
}

async function capture(windowRef, fileName) {
  if (!screenshotDir) return "";
  await fs.mkdir(screenshotDir, { recursive: true });
  const image = await windowRef.webContents.capturePage();
  const outputPath = path.join(screenshotDir, fileName);
  await fs.writeFile(outputPath, image.toPNG());
  return outputPath;
}

async function settlePaint(windowRef) {
  if (windowRef.isDestroyed() || windowRef.webContents.isDestroyed()) return false;
  try {
    await windowRef.webContents.executeJavaScript("new Promise((resolve) => setTimeout(resolve, 100))", true);
    return true;
  } catch (error) {
    if (windowRef.isDestroyed() || windowRef.webContents.isDestroyed()) return false;
    throw error;
  }
}

function createSmokeWindow(pageMessages) {
  const windowRef = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: `loopcat-web-smoke-${process.pid}`,
      sandbox: true
    }
  });
  windowRef.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      pageMessages.push(`${message}${sourceId ? ` (${sourceId}:${line})` : ""}`);
    }
  });
  windowRef.webContents.on("render-process-gone", (_event, details) => {
    pageMessages.push(`Renderer exited unexpectedly: ${details.reason}`);
  });
  windowRef.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    pageMessages.push(`Failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
  });
  return windowRef;
}

async function inspectViewport(windowRef, url, viewport, pageMessages, loadError = "") {
  if (!windowRef.isDestroyed()) {
    windowRef.setContentSize(viewport.width, viewport.height);
    await settlePaint(windowRef);
  }
  if (windowRef.isDestroyed() || windowRef.webContents.isDestroyed()) {
    throw new Error(
      `${viewport.name} window was destroyed before inspection.${loadError ? ` loadURL reported: ${loadError}.` : ""} Page messages: ${pageMessages.join(" | ") || "(none)"}. Server requests: ${serverRequests.slice(-20).join(" | ") || "(none)"}`
    );
  }
  await windowRef.webContents.executeJavaScript(
    `(() => {
    for (const selector of ["#projectDialog", "#aboutDialog"]) {
      const dialog = document.querySelector(selector);
      if (dialog?.open) dialog.close();
    }
    return true;
  })()`,
    true
  );
  await settlePaint(windowRef);
  const shell = await windowRef.webContents.executeJavaScript(layoutScript(), true);
  await settlePaint(windowRef);
  const shellScreenshot = await capture(windowRef, `web-smoke-${viewport.name}-shell.png`);
  const dialog = await windowRef.webContents.executeJavaScript(dialogScript(), true);
  await settlePaint(windowRef);
  const dialogScreenshot = await capture(windowRef, `web-smoke-${viewport.name}-dialog.png`);
  await windowRef.webContents.executeJavaScript(
    `(() => {
    const dialog = document.querySelector("#projectDialog");
    if (dialog?.open) dialog.close();
    return true;
  })()`,
    true
  );
  await settlePaint(windowRef);
  const aboutDialog = await windowRef.webContents.executeJavaScript(aboutDialogScript(), true);
  await settlePaint(windowRef);
  const aboutScreenshot = await capture(windowRef, `web-smoke-${viewport.name}-about.png`);

  assert(shell.title === "LoopCAT", `${viewport.name} page title should be LoopCAT, got "${shell.title}".`);
  assert(
    shell.url === url,
    `${viewport.name} page URL should stay on ${url}, got "${shell.url}".${loadError ? ` loadURL reported: ${loadError}.` : ""}`
  );
  assert(shell.hasShell, `${viewport.name} app shell is not visible.`);
  assert(shell.newProjectVisible, `${viewport.name} New project button is not visible.`);
  assert(
    shell.mobileProjectRailHidden,
    `${viewport.name} first screen shows the duplicate project rail above the dashboard controls.`
  );
  assert(shell.projectsModeSidebarHidden, `${viewport.name} first screen shows the editor sidebar in Projects mode.`);
  assert(!shell.updateReadyVisible, `${viewport.name} first fresh web load should not show an update-ready notice.`);
  assert(!shell.frameworkOverlay, `${viewport.name} shows a framework/runtime error overlay.`);
  assert(
    shell.viewportOverflow.length === 0,
    `${viewport.name} first screen has horizontal viewport overflow: ${JSON.stringify(shell.viewportOverflow)}.`
  );
  assert(
    shell.controlOverflow.length === 0,
    `${viewport.name} first screen has overflowing controls: ${JSON.stringify(shell.controlOverflow)}.`
  );
  assert(dialog.dialogOpen, `${viewport.name} New project dialog did not open.`);
  assert(
    dialog.activeId === "projectNameInput",
    `${viewport.name} New project dialog should focus projectNameInput, got "${dialog.activeId}".`
  );
  assert(
    dialog.projectNameValue === "Static web smoke",
    `${viewport.name} project name field did not accept typed text.`
  );
  assert(
    dialog.dialogFitsWidth,
    `${viewport.name} New project dialog exceeds viewport width: ${JSON.stringify(dialog.dialogRect)}.`
  );
  assert(
    dialog.viewportOverflow.length === 0,
    `${viewport.name} dialog has horizontal viewport overflow: ${JSON.stringify(dialog.viewportOverflow)}.`
  );
  assert(
    dialog.controlOverflow.length === 0,
    `${viewport.name} dialog has overflowing controls: ${JSON.stringify(dialog.controlOverflow)}.`
  );
  assert(aboutDialog.dialogOpen, `${viewport.name} About dialog did not open.`);
  assert(
    aboutDialog.bodyText.includes("Co-created by Dr. Gokhan Dogru and Codex"),
    `${viewport.name} About dialog is missing co-creation credit.`
  );
  assert(
    aboutDialog.linkTarget === "https://www.linkedin.com/in/gokhan-dogru-localization/",
    `${viewport.name} About dialog LinkedIn link is incorrect: "${aboutDialog.linkTarget}".`
  );
  assert(
    aboutDialog.dialogFitsWidth,
    `${viewport.name} About dialog exceeds viewport width: ${JSON.stringify(aboutDialog.dialogRect)}.`
  );
  assert(
    aboutDialog.viewportOverflow.length === 0,
    `${viewport.name} About dialog has horizontal viewport overflow: ${JSON.stringify(aboutDialog.viewportOverflow)}.`
  );
  assert(
    aboutDialog.controlOverflow.length === 0,
    `${viewport.name} About dialog has overflowing controls: ${JSON.stringify(aboutDialog.controlOverflow)}.`
  );
  const relevantPageMessages = pageMessages.filter((message) => {
    if (loadError && message.includes(url) && message.includes("-2")) return false;
    return true;
  });
  assert(
    relevantPageMessages.length === 0,
    `${viewport.name} console/load issues: ${relevantPageMessages.join(" | ")}`
  );

  return {
    viewport: viewport.name,
    shellScreenshot,
    dialogScreenshot,
    aboutScreenshot
  };
}

async function inspectViewports(url) {
  const pageMessages = [];
  const windowRef = createSmokeWindow(pageMessages);
  try {
    let loadError = "";
    try {
      await windowRef.loadURL(url);
    } catch (error) {
      loadError = `${error.message || error}`;
    }
    const screenshots = [];
    for (const viewport of [
      { name: "desktop", width: 1280, height: 720 },
      { name: "mobile", width: 375, height: 844 }
    ]) {
      screenshots.push(await inspectViewport(windowRef, url, viewport, pageMessages, loadError));
    }
    return screenshots;
  } finally {
    if (!windowRef.isDestroyed()) windowRef.destroy();
  }
}

async function inspectDirectFile() {
  const pageMessages = [];
  const windowRef = createSmokeWindow(pageMessages);
  const url = pathToFileURL(path.join(extractedRoot, "index.html")).href;
  try {
    let loadError = "";
    try {
      await windowRef.loadFile(path.join(extractedRoot, "index.html"));
    } catch (error) {
      loadError = `${error.message || error}`;
    }
    return await inspectViewport(
      windowRef,
      url,
      { name: "direct-file", width: 1280, height: 720 },
      pageMessages,
      loadError
    );
  } finally {
    if (!windowRef.isDestroyed()) windowRef.destroy();
  }
}

async function closeServer() {
  if (!server) return;
  const closingServer = server;
  server = null;
  await new Promise((resolve) => closingServer.close(resolve));
}

app.whenReady().then(async () => {
  try {
    await extractWebArtifact();
    const screenshots = [await inspectDirectFile()];
    const port = await startServer();
    const url = `http://127.0.0.1:${port}/index.html`;
    await probeUrl(url);
    screenshots.push(...(await inspectViewports(url)));

    if (failures.length) {
      writeLine("stderr", "Static web smoke verification failed:");
      for (const failure of failures) writeLine("stderr", `- ${failure}`);
      process.exitCode = 1;
    } else {
      const screenshotLines = screenshots
        .flatMap((item) => [item.shellScreenshot, item.dialogScreenshot, item.aboutScreenshot])
        .filter(Boolean)
        .map((item) => `\n- ${item}`);
      writeLine(
        "stdout",
        `Static web smoke verification passed for ${artifactName}.${screenshotLines.length ? ` Screenshots:${screenshotLines.join("")}` : ""}`
      );
      process.exitCode = 0;
    }
  } catch (error) {
    writeLine("stderr", error.stack || error.message || String(error));
    process.exitCode = 1;
  } finally {
    await closeServer();
    const code = process.exitCode || 0;
    process.exit(code);
  }
});
