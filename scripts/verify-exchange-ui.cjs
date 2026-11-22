/* Inspect the real renderer in a disposable profile. No packs or projects from the user's profile. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require("node:child_process").spawnSync(require("electron"), [__filename], {
    env,
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow, protocol, session } = require("electron");
const root = path.resolve(__dirname, "..");
const production = path.join(root, ".cache", "renderer", "production");
const output = path.join(root, "test-artifacts", "exchange-ui");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-exchange-ui-"));
const origin = "loopcat://app";
protocol.registerSchemesAsPrivileged([
  { scheme: "loopcat", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);
app.setPath("userData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("in-process-gpu");

let window;
async function verify() {
  const allowed = new Set([
    ...require(path.join(production, "config", "production-assets.js")).runtimeAssets,
    ...JSON.parse(fs.readFileSync(path.join(production, "assets.json"), "utf8")),
    "index.html"
  ]);
  const isolated = session.fromPartition("exchange-ui");
  isolated.protocol.handle("loopcat", (request) => {
    const name = new URL(request.url).pathname.slice(1);
    if (!allowed.has(name)) return new Response(null, { status: 404 });
    const built = path.join(production, name === "index.html" ? "desktop-index.html" : name);
    const file = fs.existsSync(built) ? built : path.join(root, name);
    const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
    if (!fs.existsSync(file)) return new Response(null, { status: 404 });
    return new Response(fs.readFileSync(file), {
      headers: { "Content-Type": types[path.extname(file)] || "application/octet-stream" }
    });
  });
  isolated.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (_request, reply) =>
    reply({ cancel: true })
  );
  window = new BrowserWindow({
    width: 1240,
    height: 880,
    show: false,
    webPreferences: {
      session: isolated,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      backgroundThrottling: false
    }
  });
  const run = (fn, ...args) =>
    window.webContents.executeJavaScript("(" + fn.toString() + ")(..." + JSON.stringify(args) + ")", true);
  const wait = async (fn, arg, label) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (await run(fn, arg)) return;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    throw Error("Exchange UI timed out waiting for " + label);
  };
  async function click(label) {
    await wait(
      (value) =>
        [...document.querySelectorAll("#exchangeDialog button")].some((b) => b.textContent === value && !b.disabled),
      label,
      label
    );
    await run(
      (value) => [...document.querySelectorAll("#exchangeDialog button")].find((b) => b.textContent === value).click(),
      label
    );
  }
  async function capture(label) {
    const layout = await run(() => {
      const d = document.querySelector("#exchangeDialog");
      const page = d.querySelector(".exchange-page");
      return {
        available: d.clientWidth,
        content: d.scrollWidth,
        pageAvailable: page.clientWidth,
        pageContent: page.scrollWidth
      };
    });
    assert(
      layout.available > 200 &&
        layout.content <= layout.available + 1 &&
        layout.pageContent <= layout.pageAvailable + 1,
      label + " horizontal overflow: " + JSON.stringify(layout)
    );
    await run(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const image = await new Promise((resolve, reject) => {
      const onPaint = (_event, _dirty, frame) => {
        clearTimeout(timeout);
        resolve(frame);
      };
      const timeout = setTimeout(() => {
        window.webContents.off("paint", onPaint);
        reject(Error("No screenshot frame for " + label));
      }, 5000);
      window.webContents.once("paint", onPaint);
      window.webContents.invalidate();
    });
    assert(!image.isEmpty());
    fs.writeFileSync(path.join(output, label + ".png"), image.toPNG());
  }
  async function audit() {
    await run(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.allSettled(
        document
          .querySelector("#exchangeDialog")
          .getAnimations({ subtree: true })
          .filter((animation) => animation instanceof CSSTransition)
          .map((animation) => animation.finished)
      );
    });
    if (!(await run(() => Boolean(window.axe))))
      await window.webContents.executeJavaScript(require("axe-core").source, true);
    const violations = await run(async () => {
      const result = await window.axe.run("#exchangeDialog", {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }
      });
      return result.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary }))
      }));
    });
    assert.deepEqual(
      violations.filter((v) => ["serious", "critical"].includes(v.impact)),
      []
    );
  }
  fs.mkdirSync(output, { recursive: true });
  await window.loadURL(origin + "/index.html");
  await wait(() => Boolean(window.CatHan?.appRuntime), null, "application startup");
  await run(() => document.querySelector("#exchangeBtn").click());
  await wait(() => document.querySelectorAll(".exchange-card-grid article").length === 3, null, "example cards");
  assert(
    await run(() => document.querySelector('#exchangeRoot input[type="file"]').getBoundingClientRect().height > 0)
  );
  await audit();
  await capture("examples-light");
  await click("Turkish infrastructure QA");
  await wait(
    () => document.querySelector(".exchange-page h3")?.textContent === "Turkish infrastructure QA",
    null,
    "QA preview"
  );
  assert.equal(await run(() => document.activeElement?.tagName), "H3");
  await run(() => document.querySelector(".exchange-page details.exchange-panel summary").click());
  await capture("qa-preview-light");
  await click("Install on this device");
  await wait(() => Boolean(document.querySelector('.exchange-grid input[type="search"]')), null, "installed filters");
  await run(() => {
    const search = document.querySelector('.exchange-grid input[type="search"]');
    search.value = "does-not-exist";
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await run(() => document.querySelectorAll(".exchange-card-grid article:not([hidden])").length), 0);
  await run(() => {
    const search = document.querySelector('.exchange-grid input[type="search"]');
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    document.documentElement.dataset.theme = "dark";
  });
  await capture("installed-dark");
  await audit();
  const [{ encodePack }, { EXAMPLE_QA_PACK }] = await Promise.all([
    import("../src/features/exchange/pack-format.js"),
    import("../src/features/exchange/examples.js")
  ]);
  const update = await encodePack({ ...EXAMPLE_QA_PACK, version: "1.1.0" });
  await click("Examples");
  await run(
    (base64) => {
      const input = document.querySelector('#exchangeRoot input[type="file"]');
      const data = new DataTransfer();
      data.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], "update.loopcat-pack.zip"));
      input.files = data.files;
      input.dispatchEvent(new Event("change"));
    },
    Buffer.from(await update.arrayBuffer()).toString("base64")
  );
  await click("Compare update");
  await wait(
    () => document.querySelector("#exchangeStatus").textContent.includes("Compared on pack examples."),
    null,
    "offline update comparison"
  );
  await run(() => {
    const version = [...document.querySelectorAll("#exchangeRoot select")].find((el) => el.value === "1.0.0");
    if (!version) throw Error("The installed predecessor was not selected for comparison.");
  });
  await click("Adapt a copy");
  await wait(() => Boolean(document.querySelector(".exchange-author-entries fieldset")), null, "author form");
  await run(() => {
    const name = [...document.querySelectorAll("#exchangeRoot label")].find((l) => l.firstChild.textContent === "Name");
    name.querySelector("input").value = "Reviewed terminology rules";
  });
  await click("Validate and preview");
  await click("Back to Create");
  await wait(
    () => [...document.querySelectorAll("#exchangeRoot input")].some((i) => i.value === "Reviewed terminology rules"),
    null,
    "draft retained when returning from preview"
  );
  await capture("author-dark");
  await run(() => {
    const locale = document.querySelector("#uiLocaleSelect");
    locale.value = "ar";
    locale.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(
    () =>
      document.documentElement.dir === "rtl" &&
      document.querySelector("#exchangeClose").textContent === window.CatHan.i18n.source("Close") &&
      window.CatHan.i18n.source("Close") !== "Close" &&
      window.CatHan.i18n.source("Pack details") !== "Pack details" &&
      [...document.querySelectorAll(".exchange-author h4")].some(
        (heading) => heading.textContent === window.CatHan.i18n.source("Pack details")
      ),
    null,
    "Arabic direction and translated controls"
  );
  window.setContentSize(850, 920);
  await wait(() => innerWidth <= 860, null, "narrow window");
  window.webContents.setZoomFactor(2);
  await wait(() => innerWidth <= 460, null, "200% zoom");
  await audit();
  await capture("author-arabic-200percent");
  console.log("Exchange layouts, search, preview focus and accessibility passed. Screenshots: " + output);
}

app
  .whenReady()
  .then(verify)
  .then(
    () => {
      window?.destroy();
      app.exit(0);
    },
    (error) => {
      console.error(error);
      window?.destroy();
      app.exit(1);
    }
  );
