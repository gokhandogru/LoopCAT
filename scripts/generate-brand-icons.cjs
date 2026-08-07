"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { app, BrowserWindow, nativeImage } = require("electron");

const root = path.resolve(__dirname, "..");
const sourceSvg = path.join(root, "icons", "loopcat-icon.svg");
const outputPng = path.join(root, "icons", "loopcat-icon.png");
const outputIco = path.join(root, "icons", "loopcat-icon.ico");
const outputIcns = path.join(root, "icons", "loopcat-icon.icns");

function findAppBuilder() {
  const pnpmStore = path.join(root, "node_modules", ".pnpm");
  const packageDirectory = fs.readdirSync(pnpmStore)
    .filter((name) => name.startsWith("app-builder-bin@"))
    .sort()
    .at(-1);
  if (!packageDirectory) throw new Error("app-builder-bin is not installed. Run pnpm install first.");
  const packageRoot = path.join(
    pnpmStore,
    packageDirectory,
    "node_modules",
    "app-builder-bin"
  );
  return require(packageRoot).appBuilderPath;
}

function convertPlatformIcon(builder, format, outputFile, temporaryDirectory) {
  const conversionDirectory = path.join(temporaryDirectory, `.icon-${format}`);
  execFileSync(builder, [
    "icon",
    "--format", format,
    "--root", root,
    "--out", conversionDirectory,
    "--input", path.relative(root, outputPng).replaceAll(path.sep, "/")
  ], { stdio: "pipe" });
  fs.copyFileSync(path.join(conversionDirectory, `icon.${format}`), outputFile);
}

async function generate() {
  if (!fs.existsSync(sourceSvg)) throw new Error(`Missing brand source: ${sourceSvg}`);

  const window = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const svgMarkup = fs.readFileSync(sourceSvg, "utf8").replace(/^<\?xml[^?]*\?>\s*/u, "");
  const renderDocument = `<!doctype html>
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
      svg { display: block; width: 100%; height: 100%; }
    </style>
    ${svgMarkup}`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderDocument)}`);
  const captured = await window.webContents.capturePage();
  window.destroy();

  const png = captured.resize({ width: 512, height: 512, quality: "best" });
  if (png.isEmpty()) throw new Error("Electron could not render the Loopbird SVG.");
  fs.writeFileSync(outputPng, png.toPNG());

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-brand-icons-"));
  try {
    const builder = findAppBuilder();
    convertPlatformIcon(builder, "ico", outputIco, temporaryDirectory);
    convertPlatformIcon(builder, "icns", outputIcns, temporaryDirectory);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  const rendered = nativeImage.createFromPath(outputPng);
  const size = rendered.getSize();
  if (size.width !== 512 || size.height !== 512) {
    throw new Error(`Expected a 512x512 PNG, received ${size.width}x${size.height}.`);
  }

  console.log("Generated LoopCAT PNG, ICO, and ICNS assets from icons/loopcat-icon.svg.");
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("disable-dev-shm-usage");
app.whenReady()
  .then(generate)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    app.exit(1);
  });
