const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"))
  });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
app.setPath("userData", path.join(root, ".cache", `subtitle-test-${Date.now()}`));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
let win;
let server;
const run = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`, true);
async function wait(fn, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await run(fn)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
app.whenReady().then(async () => {
  try {
    server = http.createServer((req, res) => {
      const relative = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html";
      const source = path.resolve(root, relative);
      if (!source.startsWith(root + path.sep)) return res.writeHead(403).end();
      const generated = path.join(root, ".cache/renderer/production", relative);
      try {
        res.setHeader(
          "Content-Type",
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".mjs": "text/javascript",
            ".css": "text/css",
            ".json": "application/json"
          }[path.extname(relative)] || "application/octet-stream"
        );
        res.end(fs.readFileSync(fs.existsSync(generated) ? generated : source));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    win = new BrowserWindow({
      show: false,
      width: 1700,
      height: 1100,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        offscreen: true
      }
    });
    win.webContents.on("console-message", (details) => {
      if (details.level === "error") console.error(details.message);
    });
    const url = `http://127.0.0.1:${server.address().port}/`;
    await win.loadURL(url);
    await wait(() => !!window.CatHan?.storage?.importAllData, "storage");
    const fixture = JSON.parse(
      fs.readFileSync(path.join(root, "tests/fixtures/modernization/baseline-backup.json"), "utf8")
    );
    const project = fixture.projects[0];
    project.name = "Subtitle workflow";
    project.createdAt = new Date().toISOString();
    project.documents = [{ id: "subtitle-document", name: "harbour.srt", type: "srt" }];
    project.localizationStructures = {
      "subtitle-document": { format: "srt", source: "1\n00:00:00,000 --> 00:00:04,000\nThe harbour is quiet.\n" }
    };
    fixture.segments = fixture.segments.slice(0, 2).map((segment, index) => ({
      ...segment,
      id: `subtitle-${index}`,
      documentId: "subtitle-document",
      documentName: "harbour.srt",
      documentType: "srt",
      source: index ? "The ferry leaves." : "The harbour is quiet.",
      target: index ? "Vapur kalkıyor." : "Liman çok sessiz.",
      structure: {
        format: "srt",
        cueIndex: String(index + 1),
        timing: index ? "00:00:04,000 --> 00:00:06,000" : "00:00:00,000 --> 00:00:04,000"
      },
      status: "draft",
      index,
      documentIndex: index
    }));
    project.documents.push({ id: "text-document", name: "notes.txt", type: "txt" });
    fixture.segments.push({
      ...fixture.segments[0],
      id: "text-segment",
      documentId: "text-document",
      documentName: "notes.txt",
      documentType: "txt",
      structure: null,
      source: "Project notes",
      target: "Proje notları",
      index: 2,
      documentIndex: 0
    });
    await run((data) => window.CatHan.storage.importAllData(data), fixture);
    await win.loadURL(url);
    await wait(() => !!document.querySelector(".project-tile button.primary:not(:disabled)"), "project");
    await run(() => document.querySelector(".project-tile button.primary:not(:disabled)").click());
    await wait(() => !!document.querySelector(".file-card .file-open"), "document");
    await run(() => document.querySelector(".file-card .file-open").click());
    await wait(() => !!document.querySelector(".subtitle-panel:not([hidden])"), "subtitle panel");
    await run(() => {
      const input = [...document.querySelectorAll(".subtitle-controls label")]
        .find((label) => label.firstChild.textContent === "End")
        .querySelector("input");
      input.value = "00:00:03.500";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await wait(
      async () => (await window.CatHan.storage.get("segments", "subtitle-0"))?.subtitle?.cues?.[0]?.endMs === 3500,
      "saved timing"
    );
    console.log("PASS timing edits persist through the normal editor");
    await run(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext("2d");
      const stream = canvas.captureStream(25);
      const audio = new AudioContext();
      await audio.resume();
      const oscillator = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      stream.addTrack(destination.stream.getAudioTracks()[0]);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
      const chunks = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });
      const timer = setInterval(() => {
        context.fillStyle = "#16594e";
        context.fillRect(0, 0, 640, 360);
        context.fillStyle = "white";
        context.font = "32px sans-serif";
        context.fillText("LoopCAT subtitle verification", 70, 180);
      }, 40);
      recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 4500));
      recorder.stop();
      await stopped;
      clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      await audio.close();
      const transfer = new DataTransfer();
      transfer.items.add(new File(chunks, "verification.webm", { type: "video/webm" }));
      const input = document.querySelector(".subtitle-panel input[type=file]");
      input.files = transfer.files;
      input.dispatchEvent(new Event("change"));
    });
    await wait(() => document.querySelector(".subtitle-panel video").readyState >= 2, "video playback");
    await run(() => {
      document.querySelector(".subtitle-panel video").currentTime = 1;
    });
    await wait(() => document.querySelector(".subtitle-captions").textContent.includes("Liman"), "caption preview");
    await run(() => {
      const editor = document.querySelector("#segmentBody .target-editor");
      editor.focus();
      editor.value = "Liman bugün sessiz.";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(
      () => document.querySelector(".subtitle-captions").textContent.includes("bugün"),
      "live paused translation"
    );
    await wait(() => document.querySelector(".subtitle-waveform").dataset.loaded === "true", "decoded audio waveform");
    console.log("PASS local video and live Turkish draft captions");
    await run(() => {
      const editor = document.querySelector("#segmentBody .target-editor");
      editor.focus();
      editor.setSelectionRange(6, 6);
      document.dispatchEvent(new Event("selectionchange"));
      document.querySelector(".subtitle-panel video").currentTime = 2;
    });
    await run(() =>
      [...document.querySelectorAll(".subtitle-panel button")]
        .find((button) => button.textContent === "Split at playhead")
        .click()
    );
    await wait(
      async () => (await window.CatHan.storage.get("segments", "subtitle-0"))?.subtitle?.cues?.length === 2,
      "split cue save"
    );
    await run(() => window.CatHan.appRuntime.commands.bus.undo("modernization-project"));
    await wait(
      async () => (await window.CatHan.storage.get("segments", "subtitle-0"))?.subtitle?.cues?.length === 1,
      "split undo"
    );
    await run(() => window.CatHan.appRuntime.commands.bus.redo("modernization-project"));
    await wait(
      async () => (await window.CatHan.storage.get("segments", "subtitle-0"))?.subtitle?.cues?.length === 2,
      "split redo"
    );
    await run(() =>
      [...document.querySelectorAll(".subtitle-panel button")]
        .find((button) => button.textContent === "Merge next cue")
        .click()
    );
    await wait(
      async () => (await window.CatHan.storage.get("segments", "subtitle-0"))?.subtitle?.cues?.length === 1,
      "merge within source group"
    );
    await run(() =>
      [...document.querySelectorAll(".subtitle-panel button")]
        .find((button) => button.textContent === "Merge next cue")
        .click()
    );
    await wait(
      async () => !(await window.CatHan.storage.get("segments", "subtitle-1")),
      "merge adjacent source groups"
    );
    await run(() => window.CatHan.appRuntime.commands.bus.undo("modernization-project"));
    await wait(
      async () => !!(await window.CatHan.storage.get("segments", "subtitle-1")),
      "restore merged source group"
    );
    console.log("PASS split, merge, undo and redo through persisted project records");
    await new Promise((resolve) => setTimeout(resolve, 500));
    fs.mkdirSync(path.join(root, "test-artifacts/subtitles"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "test-artifacts/subtitles/editor.png"),
      (await win.webContents.capturePage()).toPNG()
    );
    await run(async () => {
      const { Output, BufferTarget, WebMOutputFormat, VideoSampleSource, VideoSample } =
        await import("/node_modules/mediabunny/dist/bundles/mediabunny.mjs");
      const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
      const source = new VideoSampleSource({ codec: "vp9", bitrate: 500000 });
      output.addVideoTrack(source, { frameRate: 25 });
      await output.start();
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d");
      for (let index = 0; index < 100; index++) {
        context.fillStyle = index % 2 ? "#155b50" : "#308d7c";
        context.fillRect(0, 0, 320, 180);
        const sample = new VideoSample(canvas, { timestamp: index / 25, duration: 1 / 25 });
        await source.add(sample);
        sample.close();
      }
      source.close();
      await output.finalize();
      const transfer = new DataTransfer();
      transfer.items.add(new File([output.target.buffer], "constant-rate.webm", { type: "video/webm" }));
      const input = document.querySelector(".subtitle-panel input[type=file]");
      input.files = transfer.files;
      input.dispatchEvent(new Event("change"));
    });
    await wait(
      () =>
        ![...document.querySelectorAll(".subtitle-panel button")].find((button) => button.textContent === "Next frame")
          .disabled,
      "verified constant frame rate"
    );
    await run(() =>
      [...document.querySelectorAll(".subtitle-panel button")]
        .find((button) => button.textContent === "Next frame")
        .click()
    );
    await wait(() => !document.querySelector(".subtitle-still").hidden, "decoded frame inspection");
    console.log("PASS verified CFR stepping with decoded frame preview and no-audio fallback");
    const backup = await run(() => window.CatHan.storage.exportAllData());
    if (!backup.segments.find((row) => row.id === "subtitle-0")?.subtitle)
      throw new Error("Backup lost subtitle timing");
    if (JSON.stringify(backup).includes("blob:http")) throw new Error("Backup contains a transient video URL");
    await run(() => {
      const select = document.getElementById("documentFilter");
      select.value = "text-document";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await wait(() => document.querySelector(".subtitle-panel").hidden, "ordinary text workflow");
    if (await run(() => !!document.querySelector(".subtitle-panel video").getAttribute("src")))
      throw new Error("Video was retained after switching documents");
    await win.loadURL(url);
    await wait(() => !!document.querySelector(".project-tile button.primary:not(:disabled)"), "reopened project");
    await run(() => document.querySelector(".project-tile button.primary:not(:disabled)").click());
    await wait(() => !!document.querySelector(".file-card .file-open"), "reopened files");
    await run(() => document.querySelector(".file-card .file-open").click());
    await wait(() => !!document.querySelector(".subtitle-panel:not([hidden])"), "reopened subtitle editor");
    const restored = await run(() => window.CatHan.storage.get("segments", "subtitle-0"));
    if (restored.subtitle.cues[0].endMs !== 3500 || !restored.target.includes("bugün"))
      throw new Error("Reopening lost text or timing");
    console.log("PASS backup, local media relinking, reopening, and ordinary text workflow");
    win.destroy();
    server.close();
    app.exit(0);
  } catch (error) {
    if (win && !win.isDestroyed())
      console.error(
        await run(() => ({
            panel: document.body.innerText.slice(0, 6500),
          video: document.querySelector("video")?.currentTime
        }))
      );
    console.error(error.stack);
    win?.destroy();
    server?.close();
    app.exit(1);
  }
});
