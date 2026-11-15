/* Round-trip native Office fixtures through the same browser filters used by LoopCAT. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } = require("@zip.js/zip.js");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "test-artifacts", "office-formatting", "native");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename, ...process.argv.slice(2)], { cwd: root, stdio: "inherit", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE")) });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, "tmp", `office-native-roundtrip-${process.pid}`));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
if (process.env.LOOPCAT_BROWSER_RUNNER_NO_SANDBOX === "1") app.commandLine.appendSwitch("no-sandbox");
app.on("window-all-closed", () => {});
async function unpack(bytes) {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  try {
    const result = new Map();
    for (const entry of await reader.getEntries()) if (!entry.directory) result.set(entry.filename, await entry.getData(new Uint8ArrayWriter()));
    return result;
  } finally { await reader.close(); }
}
app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("about:blank");
    await win.webContents.executeJavaScript("window.CatHan = {};");
    for (const file of ["protected-tags.js", "docx.js", "localization.js"]) await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, file), "utf8"));
    const run = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const evidence = [];
    const selected = process.argv.find((arg) => arg.startsWith("--formats="))?.split("=")[1].split(",") || ["docx", "xlsx", "pptx"];
    for (const extension of selected) {
      const name = `formatting.${extension}`;
      const input = fs.readFileSync(path.join(artifacts, "source", name));
      const originalEntries = await unpack(input);
      for (const variant of ["copy", "translated"]) {
        const result = await run(async (bytes, filename, mode) => {
          const api = window.CatHan;
          const file = new File([new Uint8Array(bytes)], filename);
          const extension = filename.split(".").pop();
          const parsed = await (extension === "docx" ? api.docx.extractDocxSegments(file) : api.localization.parseLocalizationFile(file));
          const mappings = { "Hello": "Merhaba", "bold": "kalın", "red": "kırmızı", "world": "dünya", "Reference link": "Başvuru bağlantısı", "Header identity": "Üstbilgi kimliği", "Table cell": "Tablo hücresi", "Second line": "İkinci satır", "First bullet": "Birinci madde", "Second bullet": "İkinci madde", "Merged banner": "Birleşik başlık" };
          const translate = (value) => value.split(/(<[^>]+>)/g).map((part) => part.startsWith("<") ? part : Object.entries(mappings).reduce((text, [a, b]) => text.replaceAll(a, b), part)).join("");
          const segments = JSON.parse(JSON.stringify(parsed.segments)).map((segment) => ({ ...segment, source: segment.text, target: mode === "copy" ? segment.text : translate(segment.text), status: "confirmed" }));
          const structure = JSON.parse(JSON.stringify(parsed.structure));
          const output = await (extension === "docx" ? api.docx.buildTargetDocx({ targetLang: "tr", docxStructure: structure }, segments) : api.localization.buildLocalizationFile(extension, segments, structure));
          const againFile = new File([output], filename);
          const again = await (extension === "docx" ? api.docx.extractDocxSegments(againFile) : api.localization.parseLocalizationFile(againFile));
          if (again.segments.length !== segments.length) throw new Error(`${filename} ${mode}: segment count changed`);
          if (mode === "translated" && !again.segments.some((segment) => segment.text.includes("Merhaba"))) throw new Error(`${filename}: translated content missing`);
          return { bytes: Array.from(output), segments: segments.length, sourceSegments: parsed.segments.map((s) => s.text), translatedSegments: again.segments.map((s) => s.text) };
        }, Array.from(input), name, variant);
        const bytes = new Uint8Array(result.bytes);
        const entries = await unpack(bytes);
        assert.deepEqual([...entries.keys()].sort(), [...originalEntries.keys()].sort(), `${name}: package inventory`);
        const changedParts = [];
        for (const [name, content] of originalEntries) {
          if (Buffer.compare(content, entries.get(name)) === 0) continue;
          changedParts.push(name);
          assert.match(name, /^(?:word\/(?:document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml|xl\/(?:sharedStrings\.xml|worksheets\/[^/]+\.xml)|ppt\/(?:slides|notesSlides)\/[^/]+\.xml)$/, `Unexpectedly changed package part: ${name}`);
        }
        if (variant === "copy") assert.equal(changedParts.length, 0, `${name}: source-copy XML and binary parts must be unchanged`);
        const directory = path.join(artifacts, variant);
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, name), bytes);
        evidence.push({ extension, variant, segments: result.segments, unchangedPackageParts: entries.size - changedParts.length, changedParts, identicalBytes: Buffer.compare(input, bytes) === 0 });
        console.log(`PASS ${extension} ${variant}: ${result.segments} segments; ${entries.size - changedParts.length}/${entries.size} package parts unchanged`);
      }
    }
    fs.writeFileSync(path.join(artifacts, "roundtrip-results.json"), JSON.stringify(evidence, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1); }
});
