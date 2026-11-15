// Verify the release renderer, not a test entry or injected app modules.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = require("node:child_process").spawnSync(require("electron"), [__filename], {
    stdio: "inherit",
    windowsHide: true,
    env
  });
  if (r.error) throw r.error;
  process.exit(r.status ?? 1);
}
const { app, BrowserWindow, session, protocol } = require("electron");
protocol.registerSchemesAsPrivileged([
  { scheme: "loopcat", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);
const root = path.resolve(__dirname, ".."),
  prod = path.join(root, ".cache", "renderer", "production");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-learner-"));
app.setPath("userData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("enable-features", "NetworkServiceInProcess2");
let win;
async function main() {
  const assetNames = new Set([
    ...require(path.join(prod, "config", "production-assets.js")).runtimeAssets,
    ...JSON.parse(fs.readFileSync(path.join(prod, "assets.json"), "utf8")),
    "index.html"
  ]);
  const s = session.fromPartition("loopcat-lab-test");
  s.protocol.handle("loopcat", (req) => {
    const name = new URL(req.url).pathname.slice(1) || "index.html";
    if (!assetNames.has(name)) return new Response(null, { status: 404 });
    const built = path.join(prod, name === "index.html" ? "desktop-index.html" : name),
      file = fs.existsSync(built) ? built : path.join(root, name);
    if (!fs.existsSync(file)) return new Response(null, { status: 404 });
    const mime = {
      ".js": "text/javascript",
      ".css": "text/css",
      ".html": "text/html",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".webmanifest": "application/manifest+json"
    };
    return new Response(fs.readFileSync(file), {
      headers: { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }
    });
  });
  const base = "loopcat://app",
    requests = [],
    downloads = [];
  s.webRequest.onBeforeRequest((info, cb) => {
    const url = new URL(info.url),
      external = ["http:", "https:"].includes(url.protocol) && url.origin !== base;
    if (external) requests.push(url.origin);
    cb({ cancel: external });
  });
  s.on("will-download", (event, item) => {
    event.preventDefault();
    downloads.push(item.getFilename());
  });
  win = new BrowserWindow({
    show: false,
    webPreferences: { session: s, sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  if (process.platform === "darwin") {
    win.show();
    win.focus();
  }
  const js = (code) => win.webContents.executeJavaScript(code, true);
  async function wait(code, label) {
    for (let i = 0; i < 150; i++) {
      if (await js(code)) return;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw Error(
      "Missing " + label + "; view=" + (await js("document.querySelector('#exchangeDialog')?.innerText.slice(-1000)"))
    );
  }
  const button = (name) =>
    `[...document.querySelectorAll('#exchangeDialog button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
  async function click(name) {
    await wait(`Boolean(${button(name)})`, name);
    await js(`(${button(name)}).click()`);
  }
  async function open() {
    await wait("!!document.getElementById('exchangeBtn')", "Exchange");
    await js("document.getElementById('exchangeBtn').click()");
    await wait("document.getElementById('exchangeDialog')?.open", "open dialog");
  }
  const body = "document.querySelector('#exchangeRoot').textContent";
  async function audit(label) {
    if (!(await js("!!window.axe"))) await js(require("axe-core").source);
    const issues = await js(
      `axe.run(document.querySelector('#exchangeDialog'),{resultTypes:['violations'],runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}).then(r=>r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>v.id+' '+v.nodes.map(n=>n.target.join(' ')).join(', ')))`
    );
    if (issues.length) throw Error(label + " accessibility: " + issues.join("; "));
  }
  const noLabels = () =>
    js(
      `!JSON.stringify([...document.querySelectorAll('#exchangeRoot *')].map(e=>[e.textContent,e.getAttribute('aria-label'),e.title])).includes('Editorial sample')`
    );
  const candidateOrder = () =>
    js("Array.from(document.querySelectorAll('#exchangeRoot h4 + p[lang=ca]'),p=>p.textContent)");
  async function setLanguage(locale, direction) {
    await wait(`!!document.querySelector('#uiLocaleSelect option[value="${locale}"]')`, "locale selector");
    await js(
      `{const s=document.querySelector('#uiLocaleSelect');s.value=${JSON.stringify(locale)};s.dispatchEvent(new Event('change',{bubbles:true}));}`
    );
    await wait(
      `document.documentElement.dir===${JSON.stringify(direction)} && document.documentElement.lang===${JSON.stringify(locale)}`,
      "active language " + locale
    );
  }
  const localized = (name, values = {}) =>
    js(`window.CatHan.i18n.source(${JSON.stringify(name)},${JSON.stringify(values)})`);
  async function key(keyCode) {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode });
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  async function tabTo(target, label) {
    await wait(`Boolean(${target})`, label);
    for (let i = 0; i < 40; i++) {
      if (await js(`document.activeElement===(${target})`)) return;
      await key("Tab");
    }
    throw Error(
      "Keyboard could not reach " + label + "; focused " + (await js("document.activeElement.outerHTML.slice(0,230)"))
    );
  }
  async function keyboardButton(label) {
    await tabTo(button(label), label);
    await key("Space");
  }
  await win.loadURL(base + "/index.html");
  await open();
  await click("Blind Translation Lab");
  await click("Install on this device");
  await click("Open pack: Blind Translation Lab");
  await click("Open exercise");
  await wait(`${body}.includes('Candidate D')`, "four candidates");
  await audit("Blind trial");
  if (!(await noLabels())) throw Error("Revealed identity before judgement.");
  const before = await candidateOrder();
  assert.equal(new Set(before).size, 4, "Expected four distinct candidate texts in the unopened trial.");
  await win.loadURL(base + "/index.html");
  await setLanguage("ar", "rtl");
  await open();
  await wait("!document.querySelector('#exchangeRoot').inert", "interactive library");
  await keyboardButton(await localized("Installed"));
  await keyboardButton(await localized("Open pack: {pack}", { pack: "Blind Translation Lab" }));
  await keyboardButton(await localized("Open exercise"));
  await wait("!!document.querySelector('#exchangeRoot textarea')", "reopened unanswered trial");
  assert.deepEqual(await candidateOrder(), before, "Blind order changed on reload before submission.");
  assert.ok(await noLabels(), "Candidate identity leaked after pre-submission reload.");
  const panel = "document.querySelector('#exchangeRoot textarea').closest('label').parentElement";
  const controls = await js(`${panel}.querySelectorAll('select').length`);
  assert.equal(controls, 5, "Expected a preference and four rubric scores.");
  for (let i = 0; i < controls; i++) {
    const control = `${panel}.querySelectorAll('select')[${i}]`;
    await tabTo(control, "blind assessment field " + i);
    // macOS opens a native popup; commit its choice before inspecting the select.
    if (process.platform === "darwin") {
      await key("Space");
      await key("Home");
    }
    await key("Down");
    await key("Down");
    if (process.platform === "darwin") await key("Return");
    await wait(`(${control}).selectedIndex===2`, "keyboard choice for field " + i);
  }
  await tabTo("document.querySelector('#exchangeRoot textarea')", "rationale");
  const rationale = "better terminology";
  for (const ch of rationale) {
    const keyCode = ch === " " ? "Space" : ch;
    win.webContents.sendInputEvent({ type: "keyDown", keyCode });
    win.webContents.sendInputEvent({ type: "char", keyCode: ch });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode });
  }
  await wait(`document.activeElement.value===${JSON.stringify(rationale)}`, "native typed rationale");
  await keyboardButton(await localized("Record my decision"));
  await wait(
    `${body}.includes(${JSON.stringify(rationale)}) && !document.querySelector('#exchangeRoot textarea')`,
    "Arabic keyboard submission"
  );
  assert.ok(await noLabels(), "Candidate identity leaked after Arabic keyboard submission.");
  await setLanguage("en-US", "ltr");
  await wait(`${body}.includes('Recorded: candidate B')`, "saved choice");
  if (!(await noLabels())) throw Error("Identity leaked before explicit reveal.");
  await win.loadURL(base + "/index.html");
  await open();
  await click("Installed");
  await click("Open pack: Blind Translation Lab");
  await click("Open exercise");
  await wait(`${body}.includes('Recorded: candidate B')`, "resumed blind choice");
  if (!(await noLabels())) throw Error("Reload revealed identity.");
  await click("Reveal candidate identities");
  await wait(`${body}.includes('Editorial sample 4')`, "reveal");
  await click("Compare with live engines");
  await wait(
    `[...document.querySelectorAll('#exchangeRoot label')].some(l=>l.textContent.includes('Second provider'))`,
    "separate live comparison setup"
  );
  await js(
    `{const labels=[...document.querySelectorAll('#exchangeRoot label')];const left=labels.find(l=>l.textContent.includes('First provider')).querySelector('select'),right=labels.find(l=>l.textContent.includes('Second provider')).querySelector('select');left.value='ollama';right.value='openai-compatible';right.dispatchEvent(new Event('change'));}`
  );
  await click("Run separate comparison");
  await wait("document.querySelector('#aiConsentDialog')?.open", "first-party consent");
  if (!(await js("document.querySelector('#aiConsentDialog').textContent.includes('one lesson example')")))
    throw Error("Consent did not disclose lesson-only scope.");
  await js("document.querySelector('#aiConsentDialog button').click()");
  await wait(`${body}.includes('canceled before sending')`, "declined live comparison");
  await click("Installed");
  await js("window.confirm=()=>true; void 0");
  await click("Uninstall from this device");
  await wait(`${body}.includes('No packs installed')`, "uninstall");
  await click("Lab responses");
  await wait(`${body}.includes('loopcat.blind-lab')`, "retained learner response");
  await audit("Saved responses and consent");
  if (await js(`${body}.includes(${JSON.stringify(rationale)})`))
    throw Error("Free-text reason leaked into default research preview.");
  await click("Download response");
  await wait(`${body}.includes('Review the fields and agree')`, "export consent guard");
  if (downloads.length) throw Error("Unexpected unconsented download.");
  await js(
    `[...document.querySelectorAll('#exchangeRoot label')].find(l=>l.textContent.includes('I agree')).querySelector('input').click()`
  );
  await click("Download response");
  for (let i = 0; i < 60 && !downloads.length; i++) await new Promise((resolve) => setTimeout(resolve, 40));
  if (downloads.join(",") !== "loopcat-study-response.json") throw Error("Explicit response download did not fire.");
  await js(
    `[...document.querySelectorAll('#exchangeRoot label')].find(l=>l.textContent.includes('Confirm deletion')).querySelector('input').click()`
  );
  await click("Delete response");
  await wait(`${body}.includes('No saved responses')`, "explicit learner deletion");
  if (requests.length) throw Error("Offline lesson attempted network egress.");
  console.log(
    "Exchange Lab production smoke passed: projectless install, stable four-way order before submission, Arabic RTL keyboard-only judgement, restored decision, reveal, uninstall, retained response, consent/export and deletion; zero external requests."
  );
}
app
  .whenReady()
  .then(main)
  .then(
    () => {
      win?.destroy();
      app.exit(0);
    },
    (error) => {
      console.error(error);
      win?.destroy();
      app.exit(1);
    }
  );
