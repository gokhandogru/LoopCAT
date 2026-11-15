/* Compare four configurations in a counterbalanced block on the same dataset.
   Each dataset/block/condition has its own nonpersistent Chromium partition and editor. */
const fs = require("node:fs"),
  fsp = require("node:fs/promises"),
  http = require("node:http"),
  os = require("node:os"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
const inactiveProbe = process.argv.includes("--inactive-probe");
const smoke = process.argv.includes("--smoke") || inactiveProbe;
const earlyFail = process.argv.includes("--early-fail");
const largeFirst = process.argv.includes("--large-first");
const smallOnly = process.argv.includes("--10k-only");
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const cp = require("node:child_process").spawnSync(require("electron"), [__filename, ...process.argv.slice(2)], {
    env,
    cwd: root,
    stdio: "inherit",
    windowsHide: true
  });
  if (cp.error) console.error(cp.error.message);
  process.exit(cp.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-exchange-perf-"));
app.setPath("userData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("enable-precise-memory-info");
app.commandLine.appendSwitch("disable-dev-shm-usage");
app.on("window-all-closed", () => {});
const out = path.join(
  root,
  "output",
  smoke
    ? inactiveProbe
      ? "exchange-inactive-probe.json"
      : "exchange-performance-smoke.json"
    : smallOnly
      ? "exchange-performance-mixed-10k.json"
      : largeFirst
        ? "exchange-performance-mixed-large-first.json"
        : "exchange-performance.json"
);
const cases = inactiveProbe ? ["empty", "inactive", "one"] : ["empty", "inactive", "one", "five"];
if (fs.existsSync(out)) {
  const prior = JSON.parse(fs.readFileSync(out, "utf8"));
  if (prior.date) {
    const stamp = new Date(prior.date).toISOString().replace(/[:.]/g, "-");
    const archived = out.replace(/\.json$/, "-" + stamp + ".json");
    if (!fs.existsSync(archived)) fs.copyFileSync(out, archived, fs.constants.COPYFILE_EXCL);
  }
}
const median = (values) => {
  const a = [...values].sort((a, b) => a - b);
  return a.length % 2 ? a[a.length >> 1] : (a[(a.length >> 1) - 1] + a[a.length >> 1]) / 2;
};
const report = {
  mode: smoke ? "smoke" : "matched",
  date: new Date().toISOString(),
  device: {
    os: process.platform,
    release: os.release(),
    cpu: os.cpus()[0]?.model,
    memoryBytes: os.totalmem(),
    electron: process.versions.electron,
    chrome: process.versions.chrome
  },
  notes:
    "Worker counts are live/created JS workers by editor frame. Heap is observed (no forced GC). Paint uses two animation frames; save waits for committed target readback.",
  blocks: [],
  comparisons: []
};
const wallBudget = Math.min(
  2 * 60 * 60 * 1000,
  Math.max(60_000, Number(process.env.LOOPCAT_EXCHANGE_BENCH_LIMIT_MS) || 60 * 60 * 1000)
);
const deadline = Date.now() + wallBudget;
report.wallBudgetMs = wallBudget;
report.complete = false;
function record() {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
}
const workerProbe = `
const OriginalWorker=globalThis.Worker;
const p=globalThis.__exchangeWorkerProbe={live:0,peak:0,created:0,exchangeLive:0,exchangeCreated:0};
const opens=IDBFactory.prototype.open;
globalThis.__exchangeDbOpens=0;
IDBFactory.prototype.open=function(name,...rest){if(String(name).startsWith("loopcat-exchange"))globalThis.__exchangeDbOpens++;return Reflect.apply(opens,this,[name,...rest]);};
globalThis.Worker=class extends OriginalWorker{
  constructor(url,options){super(url,options);this._exchange=String(url).includes("exchange-worker");if(this._exchange){p.exchangeLive++;p.exchangeCreated++;}p.peak=Math.max(p.peak,++p.live);p.created++;}
  terminate(){if(!this._closed){this._closed=true;p.live--;if(this._exchange)p.exchangeLive--;}return super.terminate();}
};
`;
let server, win;
async function main() {
  const prod = path.join(root, ".cache", "renderer", "production");
  if (!fs.existsSync(path.join(prod, "index.html"))) throw Error("Build the renderer before running this benchmark.");
  const entry = fs.readFileSync(path.join(prod, "index.html"), "utf8");
  if (!entry.includes("exchangeDialog"))
    throw Error("The built production renderer has no Exchange surface. Rebuild before measuring.");
  const driver = (
    await require("esbuild").build({
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      globalName: "bench",
      entryPoints: [path.join(root, "tests/reliability/exchange-performance-driver.js")]
    })
  ).outputFiles[0].text;
  const index = entry.replace(/<script\b/i, '<script src="/__worker-probe.js"></script><script');
  const productionAssets = require(path.join(prod, "config", "production-assets.js")).runtimeAssets;
  const allowed = new Set([
    ...productionAssets,
    ...JSON.parse(fs.readFileSync(path.join(prod, "assets.json"), "utf8"))
  ]);
  // Fix the software under test for the entire long-running matrix even when a
  // developer rebuilds another revision in .cache while it runs.
  const files = new Map();
  const hash = require("node:crypto").createHash("sha256");
  hash.update(entry);
  for (const name of [...allowed].sort()) {
    const built = path.join(prod, name),
      asset = fs.existsSync(built) ? built : path.join(root, name);
    const contents = await fsp.readFile(asset);
    hash.update(name).update(contents);
    files.set(name, contents);
  }
  report.productionAssetsSha256 = hash.digest("hex");
  server = http.createServer((req, res) => {
    try {
      const name = new URL(req.url, "http://localhost").pathname.slice(1);
      const special = {
        "__bench.html": '<!doctype html><script src="/__bench.js"></script>',
        "__bench.js": driver,
        "__worker-probe.js": workerProbe,
        "index.html": index
      };
      if (Object.hasOwn(special, name)) {
        res
          .writeHead(200, {
            "content-type": name.endsWith(".js") ? "text/javascript" : "text/html",
            "Cache-Control": "no-store"
          })
          .end(special[name]);
        return;
      }
      if (!allowed.has(name)) {
        res.writeHead(404).end();
        return;
      }
      res
        .writeHead(200, {
          "content-type":
            {
              ".js": "text/javascript",
              ".css": "text/css",
              ".json": "application/json",
              ".svg": "image/svg+xml",
              ".png": "image/png",
              ".html": "text/html",
              ".webmanifest": "application/manifest+json"
            }[path.extname(name)] || "application/octet-stream",
          "Cache-Control": "no-store"
        })
        .end(files.get(name));
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  for (const segments of smoke || smallOnly ? [10000] : largeFirst ? [100000, 10000] : [10000, 100000]) {
    const retainedSessions = new Set();
    for (let pair = 0; pair < (smoke ? 1 : 5); pair++) {
      const order = Array.from({ length: cases.length }, (_, i) => cases[(i + pair) % cases.length]);
      const rows = [];
      for (const mode of order) {
        // Distinct Chromium storage/session per condition prevents a previous
        // scenario's remembered project/selection/lease from affecting startup.
        // Match the native disk-backed IndexedDB backend of the reliability
        // harness. The entire userData directory is a new disposable temp tree.
        const partition = "persist:exchange-bench-" + segments + "-" + mode;
        win = new BrowserWindow({
          width: 1280,
          height: 900,
          show: false,
          webPreferences: {
            partition,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false,
            offscreen: true
          }
        });
        win.webContents.on("paint", () => {});
        const origin = "http://127.0.0.1:" + server.address().port;
        const transport = { externalAttempts: 0, catalogOrPackRequests: 0 };
        win.webContents.session.webRequest.onBeforeRequest((details, respond) => {
          const u = new URL(details.url);
          const outside = /^(https?|wss?):$/.test(u.protocol) && u.origin !== origin;
          if (outside) transport.externalAttempts++;
          // Ignore shipped JS chunks in the offline shell; detect actual package/metadata fetches.
          if (
            /\.loopcat-pack\.zip$/i.test(u.pathname) ||
            /(?:^|\/)(?:catalog|exchange)(?:\/[^?#]*)?\.json$/i.test(u.pathname) ||
            /\/(?:catalog|exchange)\/.*\.json$/i.test(u.pathname)
          )
            transport.catalogOrPackRequests++;
          respond({ cancel: outside });
        });
        win.webContents.on("console-message", (event) => {
          if (event.message?.startsWith("EXCHANGE_BENCH ")) {
            report.progress = { segments, pair, mode, stage: event.message, at: new Date().toISOString() };
            record();
            console.log(event.message);
          }
          if (event.message?.startsWith("EXCHANGE_SAMPLE ")) {
            report.currentBlock ||= { segments, pair, rows: [] };
            report.currentBlock.rows.push(JSON.parse(event.message.slice(16)));
            record();
          }
        });
        win.webContents.setFrameRate(60);
        win.webContents.startPainting();
        await win.loadURL(`http://127.0.0.1:${server.address().port}/__bench.html`);
        const config = {
          segments,
          order: [mode],
          samples: smoke ? 4 : 30,
          reuseSeed: pair > 0,
          lifecycleProbe: inactiveProbe && mode === "one"
        };
        let timer;
        const modeRows = await Promise.race([
          win.webContents.executeJavaScript("bench.runExchangePerformance(" + JSON.stringify(config) + ")", true),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error("Benchmark limit reached; partial raw samples and last synthetic stage were preserved.")
                ),
              Math.max(1, Math.min(15 * 60 * 1000, deadline - Date.now()))
            );
          })
        ]).finally(() => clearTimeout(timer));
        for (const row of modeRows) {
          row.transport = { ...transport };
          if (row.active > 0 && !(row.exchangeDbOpens > 0))
            throw new Error("Exchange DB probe did not detect its active positive control.");
          if (
            row.active === 0 &&
            (row.exchangeDbOpens !== 0 ||
              row.workers.exchangeCreated !== 0 ||
              transport.externalAttempts !== 0 ||
              transport.catalogOrPackRequests !== 0)
          )
            throw new Error(
              "Inactive Exchange opened its database, started its worker, or requested catalog/external data."
            );
        }
        rows.push(...modeRows);
        retainedSessions.add(win.webContents.session);
        win.destroy();
        win = null;
      }
      report.blocks.push({ segments, pair, rows });
      delete report.currentBlock;
      record();
      console.log(`${segments} rows, matched block ${pair + 1} complete.`);
      if (
        earlyFail &&
        segments === 10000 &&
        report.blocks.filter(
          (b) =>
            b.segments === 10000 &&
            b.rows.some((r) => r.mode === "empty" && (r.inputP95Ms >= 100 || r.saveP95Ms >= 2000))
        ).length >= 2
      ) {
        report.complete = false;
        report.passed = false;
        throw Error(
          "Engineering diagnostic stopped: two independent empty-library 10k baselines exceed original reliability targets. Run the full matrix without --early-fail on a controlled device."
        );
      }
    }
    for (const session of retainedSessions) await session.clearStorageData();
    const blocks = report.blocks.filter((b) => b.segments === segments);
    for (const mode of cases.slice(1)) {
      const paired = blocks.map((b) => [b.rows.find((r) => r.mode === mode), b.rows.find((r) => r.mode === "empty")]);
      const inputRatio = median(paired.map(([a, b]) => a.inputP95Ms / b.inputP95Ms)),
        saveRatio = median(paired.map(([a, b]) => a.saveP95Ms / b.saveP95Ms));
      const absolute =
        segments !== 10000 || paired.every((pair) => pair.every((r) => r.inputP95Ms < 100 && r.saveP95Ms < 2000));
      const workersReleased = paired.every((pair) => pair.every((r) => r.workers.exchangeLive === 0));
      report.comparisons.push({
        segments,
        mode,
        inputRatio,
        saveRatio,
        absolute10kTargets: absolute,
        workersReleased,
        maxObservedHeapDeltaBytes: Math.max(...paired.map(([a, b]) => a.heapAfter - b.heapAfter)),
        passed: inputRatio <= 1.1 && saveRatio <= 1.1 && absolute && workersReleased
      });
    }
  }
  report.complete = true;
  report.passed = report.comparisons.every((x) => x.passed);
  record();
  console.log(
    `${smoke ? "Smoke observation (not certification)" : "Paired gate: " + (report.passed ? "PASS" : "FAIL")} — ${out}`
  );
  if (!smoke && !report.passed)
    throw Error("Exchange performance gate exceeded; see measured ratios and limits in report.");
}
app
  .whenReady()
  .then(main)
  .then(
    () => finish(0),
    (err) => {
      report.error = String(err.message);
      record();
      console.error(err);
      finish(1);
    }
  );
function finish(code) {
  if (win && !win.isDestroyed()) win.destroy();
  server?.close();
  app.exit(code);
}
// The sole recursive target is a process-created, validated private temporary profile.
process.on("exit", () => {
  if (
    path.dirname(profile) === path.resolve(os.tmpdir()) &&
    path.basename(profile).startsWith("loopcat-exchange-perf-")
  )
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 2 });
});
