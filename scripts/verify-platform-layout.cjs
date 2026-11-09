/* Renderer layout regression. Run on macOS too for native font/control coverage. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename, ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"))
  });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
const output = path.join(root, "test-artifacts", "platform-layout");
const profile = path.join(os.tmpdir(), `loopcat-platform-layout-${process.pid}-${Date.now()}`);
app.setPath("userData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("force-device-scale-factor", "1");
let server, win;
const results = [];
const watchdog = setTimeout(() => {
  console.error("Platform layout check exceeded five minutes.");
  app.exit(1);
}, 300000);
const run = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
async function wait(fn, ...args) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await run(fn, ...args)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Timed out: " + fn);
}
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 120));
}
function inspect() {
  const visible = (el) => el.checkVisibility({ checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0;
  const selectors = [".topbar", ".project-toolbar", ".segment-controls", "#editorInspector .inspector-tabs"];
  const containers = selectors.map((selector) => {
    const element = document.querySelector(selector);
    const rect = element.getBoundingClientRect();
    return { selector, overflow: element.scrollWidth - element.clientWidth, right: rect.right, left: rect.left };
  });
  const clipped = [
    ...document.querySelectorAll(
      ".topbar button, .project-toolbar button, .segment-controls button, .segment-controls summary, .inspector-tabs button"
    )
  ]
    .filter(visible)
    .filter((el) => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)
    .map((el) => ({
      id: el.id,
      text: el.textContent.trim(),
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
      height: el.clientHeight,
      scrollHeight: el.scrollHeight
    }));
  const selects = ["#documentFilter", "#segmentStatusFilter"].map((selector) => {
    const el = document.querySelector(selector);
    const style = getComputedStyle(el);
    const context = document.createElement("canvas").getContext("2d");
    context.font = style.font;
    const labelWidth = context.measureText(el.selectedOptions[0]?.textContent.trim() || "").width;
    return {
      selector,
      width: el.clientWidth,
      labelWidth,
      padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
      hasIndicator: style.appearance !== "none" || style.backgroundImage !== "none"
    };
  });
  return {
    viewport: [innerWidth, innerHeight],
    documentWidth: document.documentElement.scrollWidth,
    containers,
    clipped,
    selects
  };
}
app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    fs.mkdirSync(output, { recursive: true });
    const production = path.join(root, ".cache/renderer/production");
    server = http.createServer((req, res) => {
      const relative = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html";
      const resolved = path.resolve(root, relative);
      if (!resolved.startsWith(root + path.sep)) return res.writeHead(403).end();
      const generated = path.join(production, relative);
      try {
        res.setHeader(
          "Content-Type",
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".svg": "image/svg+xml",
            ".png": "image/png"
          }[path.extname(relative)] || "application/octet-stream"
        );
        res.end(fs.readFileSync(fs.existsSync(generated) ? generated : resolved));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    win = new BrowserWindow({
      show: false,
      frame: false,
      width: 1280,
      height: 720,
      useContentSize: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    });
    await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
    await wait(() => !!window.CatHan?.storage?.importAllData);
    const data = JSON.parse(
      fs.readFileSync(path.join(root, "tests/fixtures/modernization/baseline-backup.json"), "utf8")
    );
    await run((data) => window.CatHan.storage.importAllData(data), data);
    await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
    await wait(() => !!document.querySelector(".project-tile button.primary"));
    await run(() => document.querySelector(".project-tile button.primary").click());
    await wait(() => !!document.querySelector(".file-card .file-open"));
    await run(() => document.querySelector(".file-card .file-open").click());
    await wait(() => !!document.querySelector("#segmentBody .target-editor"));
    // Hidden windows may not paint every animation frame. Capture settled colors.
    await win.webContents.insertCSS(
      "*, *::before, *::after { transition: none !important; animation: none !important; }"
    );
    for (const locale of ["en-US", "tr-TR", "es-ES", "ca-ES", "ar"]) {
      await run((locale) => {
        const select = document.querySelector("#uiLocaleSelect");
        select.value = locale;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, locale);
      await wait((locale) => document.documentElement.lang === locale, locale);
      await settle();
      for (const font of ["system-ui", "Arial"]) {
        await run((font) => document.documentElement.style.setProperty("--font-sans", `${font}, sans-serif`), font);
        for (const [width, height] of [
          [1440, 820],
          [1280, 720],
          [1100, 680]
        ]) {
          win.setContentSize(width, height);
          await wait((width, height) => innerWidth === width && innerHeight === height, width, height);
          await settle();
          for (const theme of ["light", "dark"]) {
            await run((theme) => (document.documentElement.dataset.theme = theme), theme);
            await settle();
            const state = await run(inspect);
            const status = state.selects.find((item) => item.selector === "#segmentStatusFilter");
            const passed =
              state.documentWidth <= width + 1 &&
              state.containers.every((item) => item.overflow <= 2 && item.right <= width + 1 && item.left >= -1) &&
              !state.clipped.length &&
              state.selects.every((item) => item.hasIndicator) &&
              status.labelWidth + status.padding <= status.width + 1;
            results.push({ locale, font, theme, passed, ...state });
            if (font === "system-ui" && width === 1280) {
              fs.writeFileSync(
                path.join(output, `${locale}-${theme}.png`),
                (await win.webContents.capturePage()).toPNG()
              );
            }
          }
        }
      }
    }
    for (const controlState of ["focused", "disabled"]) {
      const indicatorVisible = await run((controlState) => {
        const select = document.querySelector("#segmentStatusFilter");
        if (controlState === "focused") select.focus();
        else select.disabled = true;
        const style = getComputedStyle(select);
        return style.appearance !== "none" || style.backgroundImage !== "none";
      }, controlState);
      if (!indicatorVisible) throw Error(`Select indicator disappeared when ${controlState} in dark mode.`);
    }
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(
        {
          host: process.platform,
          electron: process.versions.electron,
          nativeMacVerified: process.platform === "darwin",
          results
        },
        null,
        2
      )
    );
    const failed = results.filter((item) => !item.passed);
    if (failed.length)
      throw Error(
        `${failed.length}/${results.length} layout cases failed. See ${path.join(output, "report.json")}. First: ${JSON.stringify(failed[0])}`
      );
    console.log(
      `Platform layout passed (${results.length} locale/font/viewport/theme combinations on ${process.platform}).`
    );
  } catch (error) {
    console.error(error.stack || error);
    exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    if (win && !win.isDestroyed()) win.destroy();
    if (server) await new Promise((resolve) => server.close(resolve));
    app.exit(exitCode);
  }
});
