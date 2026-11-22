/* Runs the shipped renderer in independent author/recipient profiles; no site access or real data. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process"),
  root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(require("electron"), [__filename], { cwd: root, env, windowsHide: true, stdio: "inherit" });
  if (r.error) console.error(r.error);
  process.exit(r.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-exchange-"));
app.setPath("userData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
const production = path.join(root, ".cache", "renderer", "production");
const run = (win, fn, ...args) =>
  win.webContents.executeJavaScript("(" + fn + ")(..." + JSON.stringify(args) + ")", true);
const pause = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
async function wait(win, fn, arg, label) {
  const end = Date.now() + 14000;
  do {
    if (await run(win, fn, arg)) return;
    await pause(80);
  } while (Date.now() < end);
  const reason = await run(win, () => [
    document.querySelector("#exchangeStatus")?.textContent,
    document.querySelector("#exchangeRoot")?.textContent?.slice(0, 300),
    document.querySelector("#saveStatus")?.textContent,
    document.querySelector("#qaResults")?.textContent?.slice(0, 900),
    document.querySelector("#exchangeRoot")?.textContent?.slice(-480)
  ]);
  throw Error((label || String(arg) || "page state") + " timed out: " + reason);
}
async function button(win, label) {
  await wait(
    win,
    (l) =>
      [...document.querySelectorAll("#exchangeDialog button")].some(
        (e) => e.textContent === l && !e.disabled && !document.querySelector("#exchangeRoot").inert
      ),
    label
  );
  await run(
    win,
    (l) =>
      [...document.querySelectorAll("#exchangeDialog button")].find((e) => e.textContent === l && !e.disabled).click(),
    label
  );
  await wait(win, () => !document.querySelector("#exchangeRoot").inert, null, "Exchange idle");
}
const click = (win, selector) => run(win, (s) => document.querySelector(s).click(), selector);
async function openEditor(w) {
  for (let n = 0; n < 15; n++) {
    if (await run(w, () => !!document.querySelector("#segmentBody .target-editor"))) return;
    await run(w, () => {
      const visible = (s) =>
        [...document.querySelectorAll(s)].find((e) => e.offsetWidth > 0 || e.getClientRects().length > 0);
      (visible(".file-card .file-open") || visible(".project-tile button.primary"))?.click();
    });
    await pause(450);
  }
  throw Error(
    "Cannot open restored project: " +
      (await run(w, () =>
        [...document.querySelectorAll(".project-tile,.file-card,#saveStatusMessage")]
          .map((e) => e.textContent.slice(0, 160))
          .join("|")
      ))
  );
}
async function open(win) {
  await click(win, "#exchangeBtn");
  await wait(win, () => document.querySelector("#exchangeDialog").open);
}
async function importPack(win, bytes) {
  await button(win, "Examples");
  await wait(win, () => !!document.querySelector("#exchangeRoot input[type=file]"));
  await run(
    win,
    (b64) => {
      const t = new DataTransfer(),
        u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      t.items.add(new File([u], "shared.loopcat-pack.zip"));
      const f = document.querySelector("#exchangeRoot input[type=file]");
      f.files = t.files;
      f.dispatchEvent(new Event("change", { bubbles: true }));
    },
    bytes.toString("base64")
  );
}
async function verifyAiScopeControls(win) {
  const { encodePack } = await import("../src/features/exchange/pack-format.js");
  const workflow = {
    format: "loopcat-pack",
    schemaVersion: 1,
    id: "test.scope",
    version: "1.0.0",
    kind: "ai",
    name: "Scope smoke",
    publisher: "QA fixture",
    license: "CC0-1.0",
    languages: { source: "en", target: "tr" },
    entries: ["generate", "terminology-critique"].map((operation) => ({
      operation,
      providerIds: ["ollama"],
      maxRequests: 1
    }))
  };
  await importPack(win, Buffer.from(await (await encodePack(workflow)).arrayBuffer()));
  await button(win, "Install on this device");
  await button(win, "Activate for this project");
  await button(win, "Open pack: Scope smoke");
  await wait(
    win,
    () => document.querySelectorAll("#exchangeRoot input[type=checkbox]").length === 6,
    null,
    "AI context controls"
  );
  const toggles = await run(win, () => {
    const [g, c] = [...document.querySelectorAll("#exchangeRoot h4")].map((h) => h.nextElementSibling);
    const [src, near, terms] = g.querySelectorAll("input"),
      [, , ct] = c.querySelectorAll("input");
    const submit = (box) => [...box.querySelectorAll("button")].find((b) => b.textContent === "Run workflow");
    const initial = [src.checked, near.checked, terms.checked],
      critiqueOff = submit(c).disabled;
    src.click();
    const sourceOff = submit(g).disabled;
    src.click();
    near.click();
    const nearDisclosure = g.querySelector("[aria-live]").textContent;
    terms.click();
    const combined = g.querySelector("[aria-live]").textContent;
    ct.click();
    const critiqueReady = !submit(c).disabled && c.querySelector("[aria-live]").textContent.includes("target draft");
    terms.click();
    submit(g).click();
    return { initial, critiqueOff, sourceOff, nearDisclosure, combined, critiqueReady };
  });
  assert.deepEqual(toggles.initial, [true, false, false]);
  assert(toggles.sourceOff && toggles.critiqueOff && toggles.critiqueReady);
  assert(toggles.nearDisclosure.includes("previous and next") && !toggles.nearDisclosure.includes("native"));
  assert(toggles.combined.includes("previous and next") && toggles.combined.includes("native"));
  await wait(win, () => document.querySelector("#aiConsentDialog")?.open, null, "adjacent-source consent");
  const consent = await run(win, () => document.querySelector("#aiConsentDialog").textContent);
  assert(consent.includes("previous and next") && !consent.includes("native") && !consent.includes("target draft"));
  await click(win, "#aiConsentDialog button");
  await wait(
    win,
    () => document.querySelector("#exchangeRoot").textContent.includes("canceled before sending"),
    null,
    "declined workflow"
  );
  await run(win, () => {
    const critique = [...document.querySelectorAll("#exchangeRoot h4")].find(
      (h) => h.textContent === "Review terminology"
    ).nextElementSibling;
    [...critique.querySelectorAll("button")].find((b) => b.textContent === "Run workflow").click();
  });
  await wait(win, () => document.querySelector("#aiConsentDialog")?.open, null, "native term/draft critique consent");
  const critiqueConsent = await run(win, () => document.querySelector("#aiConsentDialog").textContent);
  assert(
    critiqueConsent.includes("native") &&
      critiqueConsent.includes("target draft") &&
      !critiqueConsent.includes("previous and next")
  );
  await click(win, "#aiConsentDialog button");
  await button(win, "Installed");
  await run(win, () => {
    window.confirm = () => true;
  });
  await button(win, "Uninstall from this device");
  await wait(win, () => document.querySelector("#exchangeRoot").textContent.includes("No packs installed."));
}
async function download(win, label) {
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("download timeout")), 8000);
    win.webContents.session.once("will-download", (_event, item) => {
      const p = path.join(profile, path.basename(item.getFilename()));
      item.setSavePath(p);
      item.once("done", (_event, state) => {
        clearTimeout(timer);
        if (state === "completed") resolve(fs.readFileSync(p));
        else reject(Error(state));
      });
    });
  });
  if (label.startsWith("#")) await click(win, label);
  else await button(win, label);
  return promise;
}
function win(partition) {
  return new BrowserWindow({
    show: false,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
}
let server,
  windows = [];
app
  .whenReady()
  .then(async () => {
    server = http.createServer((req, res) => {
      try {
        const rel =
          decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
        if (rel.split("/").some((v) => v === "..") || rel.includes("\\")) return res.writeHead(403).end();
        const f = [production, root]
          .map((d) => path.join(d, rel))
          .find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
        if (!f) return res.writeHead(404).end();
        res.setHeader(
          "Content-Type",
          {
            ".js": "text/javascript",
            ".html": "text/html",
            ".css": "text/css",
            ".json": "application/json",
            ".svg": "image/svg+xml"
          }[path.extname(f)] || "application/octet-stream"
        );
        res.end(fs.readFileSync(f));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port + "/index.html";
    const author = win("persist:author-" + Date.now()),
      recipient = win("persist:recipient-" + Date.now());
    windows.push(author, recipient);
    for (const w of windows) {
      w.webContents.session.webRequest.onBeforeRequest((details, done) => {
        const remote = /^https?:/.test(details.url) && new URL(details.url).origin !== new URL(url).origin;
        done({ cancel: remote });
      });
      await w.loadURL(url);
      await wait(w, () => !!window.CatHan?.storage?.importAllData);
    }
    // Real form, archive download, and a second process-isolated profile with no author DB.
    await open(author);
    await button(author, "Create");
    await wait(author, () => [...document.querySelectorAll("label")].some((l) => l.textContent === "Source term"));
    await run(author, () => {
      const set = (name, value) => {
        const l = [...document.querySelectorAll("#exchangeRoot label")].find((l) => l.firstChild.textContent === name);
        l.querySelector("input").value = value;
      };
      set("Name", "Pilot glossary");
      set("Source term", "server");
      set("Target term", "sunucu");
      [...document.querySelectorAll("#exchangeRoot label")]
        .find((l) => l.firstChild.textContent === "Allow copying individual terms")
        .querySelector("input").checked = true;
    });
    // The private editing file keeps excluded rows and supports unfinished work;
    // only selected rows may cross the translator-facing pack boundary.
    await button(author, "Add entry");
    await run(author, () => {
      const row = [...document.querySelectorAll("#exchangeRoot fieldset")].at(-1);
      const control = (label) =>
        [...row.querySelectorAll("label")].find((l) => l.firstChild.textContent === label).querySelector("input");
      control("Source term").value = "never-share-client-entry";
      control("Include in shared pack").checked = false;
    });
    const privateDraft = await download(author, "Export private author draft");
    const own = JSON.parse(privateDraft.toString("utf8"));
    assert.deepEqual(own.draft.exchangeAuthorSelection, [true, false]);
    assert.equal(own.draft.entries[1].sourceTerm, "never-share-client-entry");
    await button(author, "Create");
    await wait(author, () => !!document.querySelector('#exchangeRoot input[accept=".loopcat-draft.json"]'));
    await run(
      author,
      (contents) => {
        const input = document.querySelector('#exchangeRoot input[accept=".loopcat-draft.json"]'),
          transfer = new DataTransfer();
        transfer.items.add(new File([contents], "example.loopcat-draft.json"));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      privateDraft.toString("utf8")
    );
    await wait(author, () =>
      [...document.querySelectorAll("#exchangeRoot input")].some((e) => e.value === "never-share-client-entry")
    );
    await button(author, "Validate and preview");
    await wait(author, () => document.querySelector("#exchangeRoot h3")?.textContent === "Pilot glossary");
    assert(
      !(await run(author, () =>
        document.querySelector("#exchangeRoot").textContent.includes("never-share-client-entry")
      ))
    );
    const glossary = await download(author, "Export pack file");
    await button(author, "Examples");
    await button(author, "Turkish infrastructure QA");
    await button(author, "Try on examples");
    await wait(
      author,
      () => /findings in/.test(document.querySelector("#exchangeStatus").textContent),
      null,
      "worker QA rehearsal"
    );
    await button(author, "Adapt a copy");
    await button(author, "Validate and preview");
    const qa = await download(author, "Export pack file");
    const data = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/modernization/baseline-backup.json")));
    data.projects[0].resourceLinks.find((r) => r.type === "termbase").contribute = true;
    data.segments[0].source = "Check the server address.";
    data.segments[0].target = "Adresi kontrol edin.";
    data.segments[0].status = "draft";
    const acceptedTarget = "Lütfen adresi kontrol edin.";
    // Exercise the independent AI pack in the author profile. The recipient
    // and its portable project requirements remain a clean two-pack handoff.
    const authorData = structuredClone(data);
    Object.assign(authorData.terms[0], {
      source: "server",
      target: "sunucu",
      sourceTerm: "server",
      targetTerm: "sunucu"
    });
    await run(author, (backup) => window.CatHan.storage.importAllData(backup), authorData);
    await author.loadURL(url);
    await openEditor(author);
    await click(author, "#segmentBody .target-editor");
    await open(author);
    await verifyAiScopeControls(author);
    await run(
      recipient,
      async (data) => {
        await window.CatHan.storage.importAllData(data);
      },
      data
    );
    await recipient.loadURL(url);
    await wait(recipient, () => !!document.querySelector(".project-tile button.primary"));
    await click(recipient, ".project-tile button.primary");
    await wait(recipient, () => !!document.querySelector(".file-card .file-open"));
    await click(recipient, ".file-card .file-open");
    await wait(recipient, () => !!document.querySelector("#segmentBody .target-editor"));
    await open(recipient);
    await importPack(recipient, glossary);
    await button(recipient, "Install on this device");
    await button(recipient, "Activate for this project");
    await button(recipient, "Disable for this project");
    await button(recipient, "Activate for this project");
    await importPack(recipient, qa);
    await button(recipient, "Install on this device");
    await wait(recipient, () => !!document.querySelector("#exchangeRoot .exchange-card input[type=checkbox]"));
    await click(recipient, "#exchangeRoot .exchange-card input[type=checkbox]");
    await button(recipient, "Activate for this project");
    await wait(
      recipient,
      () =>
        [...document.querySelectorAll("#exchangeRoot .exchange-card")].filter((c) =>
          c.textContent.includes("Active in this project")
        ).length === 2,
      null,
      "both packs active"
    );
    await button(recipient, "Close");
    await wait(
      recipient,
      () => document.querySelector("#termSuggestions")?.textContent.includes("Pilot glossary"),
      null,
      "read-only term in Matches"
    );
    await run(recipient, () =>
      document
        .querySelector('#termSuggestions [data-term-id^="exchange:"]')
        .dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }))
    );
    await wait(
      recipient,
      () =>
        [...document.querySelectorAll("[role=menuitem]")].some(
          (e) => e.textContent === "Copy to my termbase" && !e.disabled
        ),
      null,
      "copy action"
    );
    await run(recipient, () =>
      [...document.querySelectorAll("[role=menuitem]")].find((e) => e.textContent === "Copy to my termbase").click()
    );
    await wait(recipient, () => document.querySelector("#quickTermCaptureDialog")?.open, null, "term capture");
    await click(recipient, "#quickTermCaptureForm button[type=submit]");
    await wait(recipient, () => !document.querySelector("#quickTermCaptureDialog")?.open, null, "term saved");
    await run(
      recipient,
      (value) => {
        const editor = document.querySelector("#segmentBody tr[data-index='0'] .target-editor");
        editor.focus();
        if (editor.isContentEditable) editor.textContent = value;
        else editor.value = value;
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      },
      acceptedTarget
    );
    const persisted = async ([id, text, confirmed]) => {
      const row = await window.CatHan.storage.get("segments", id);
      return row?.target === text && (!confirmed || row.status === "confirmed");
    };
    await wait(recipient, persisted, [data.segments[0].id, acceptedTarget, false], "edited target saved");
    await click(recipient, "#confirmBtn");
    await wait(recipient, persisted, [data.segments[0].id, acceptedTarget, true], "human confirmation saved");
    await click(recipient, "#runQaBtn");
    await wait(recipient, () => document.body.textContent.includes("approved Turkish form"), null, "project QA");
    const saved = await run(recipient, () => window.CatHan.storage.exportAllData());
    assert.equal(saved.schemaVersion, 9);
    assert.equal(saved.projects[0].exchangeRequirements.length, 2);
    assert(!JSON.stringify(saved).includes("exchangeLocalBinding"));
    assert(!saved.terms.some((t) => t.termBaseName === "Pilot glossary"));
    assert(saved.terms.some((t) => t.sourceTerm === "server" && t.targetTerm === "sunucu"));
    const clean = win("persist:handoff-" + Date.now());
    windows.push(clean);
    await clean.loadURL(url);
    await wait(clean, () => !!window.CatHan?.storage?.importAllData);
    await run(
      clean,
      async (backup) => {
        await window.CatHan.storage.importAllData(backup);
      },
      saved
    );
    await clean.loadURL(url);
    await openEditor(clean);
    await click(clean, "#runQaBtn");
    await wait(
      clean,
      () => /not evaluated/i.test(document.querySelector("#saveStatus").textContent),
      null,
      "missing required check in fresh profile"
    );
    const passport = await download(clean, "#exportQualityPassportMenuBtn");
    assert.match(passport.toString("utf8"), /Incomplete/);
    assert.match(passport.toString("utf8"), /Not evaluated/);
    await run(clean, () => {
      window.exchangeConfirmations = [];
      window.confirm = (message) => {
        window.exchangeConfirmations.push(message);
        return true;
      };
    });
    const target = await download(clean, "#exportTargetBtn");
    assert(target.length > 0);
    assert(target.toString("utf8").includes(acceptedTarget));
    assert((await run(clean, () => window.exchangeConfirmations)).some((m) => /Not evaluated.*Export anyway/i.test(m)));

    // Hold a real worker's completed answer at the renderer message boundary.
    // The recipient can uninstall while QA is in flight even on a fast CI machine.
    await run(recipient, () => {
      const Original = window.Worker;
      window.Worker = class extends Original {
        constructor(url, options) {
          super(url, options);
          if (String(url).includes("exchange-worker"))
            this.addEventListener(
              "message",
              (event) => {
                event.stopImmediatePropagation();
                const pending = this.onmessage;
                window.deliverOldPackResult = () => pending?.call(this, event);
              },
              true
            );
        }
      };
    });
    await click(recipient, "#runQaBtn");
    await wait(recipient, () => typeof window.deliverOldPackResult === "function", null, "QA answer in flight");
    await open(recipient);
    await button(recipient, "Installed");
    await run(recipient, () => {
      window.confirm = () => true;
    });
    await wait(recipient, () => document.querySelectorAll("#exchangeRoot .exchange-card").length === 2);
    await run(recipient, () => {
      const card = [...document.querySelectorAll("#exchangeRoot .exchange-card")].find((c) =>
        c.textContent.includes("Turkish infrastructure QA")
      );
      [...card.querySelectorAll("button")].find((b) => b.textContent === "Uninstall from this device").click();
    });
    await wait(recipient, () => document.querySelectorAll("#exchangeRoot .exchange-card").length === 1);
    await run(recipient, () => window.deliverOldPackResult());
    await button(recipient, "Uninstall from this device");
    await wait(recipient, () => document.querySelector("#exchangeRoot").textContent.includes("No packs installed."));
    await button(recipient, "Close");
    const afterRemoval = await run(recipient, () => window.CatHan.storage.exportAllData());
    assert.equal(afterRemoval.segments.find((s) => s.id === data.segments[0].id).target, acceptedTarget);
    assert.equal(afterRemoval.segments.find((s) => s.id === data.segments[0].id).status, "confirmed");
    assert(!(await run(recipient, () => window.CatHan.appRuntime.editorSession.getQaChecks().some((q) => q.packId))));
    assert(afterRemoval.terms.some((t) => t.sourceTerm === "server" && t.targetTerm === "sunucu"));
    // Reopen the already-built direct-file edition with its whitelisted embedded worker.
    const staging = path.join(profile, "offline-build");
    fs.cpSync(production, staging, { recursive: true });
    const manifest = require(path.join(root, "config", "production-assets.js"));
    for (const rel of manifest.runtimeAssets || []) {
      const src = path.join(root, rel),
        dest = path.join(staging, rel);
      if (!fs.existsSync(dest) && fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }
    const file = win("persist:file-" + Date.now());
    windows.push(file);
    await file.loadFile(path.join(staging, "index.html"));
    await wait(file, () => !!window.CatHan?.storage);
    await open(file);
    await importPack(file, qa);
    await button(file, "Try on examples");
    await wait(
      file,
      () => /findings in/.test(document.querySelector("#exchangeStatus").textContent),
      null,
      "offline file worker"
    );
    await button(file, "Install on this device");
    await wait(file, () =>
      document.querySelector("#exchangeRoot .exchange-card")?.textContent.includes("Turkish infrastructure QA")
    );
    await file.loadFile(path.join(staging, "index.html"));
    await wait(file, () => !!window.CatHan?.storage);
    await open(file);
    await button(file, "Installed");
    await wait(
      file,
      () =>
        document.querySelector("#exchangeRoot .exchange-card") ||
        document.querySelector("#exchangeRoot").textContent.includes("No packs installed.")
    );
    const retained = await run(file, () =>
      document.querySelector("#exchangeRoot").textContent.includes("Turkish infrastructure QA")
    );
    if (!retained) {
      assert.match(
        await run(file, () => document.querySelector("#exchangeDialog").textContent),
        /session.only|keep exported pack files/i
      );
      await importPack(file, qa);
      await button(file, "Install on this device");
      console.log("Direct-file profile required local reimport after restart.");
    } else console.log("Direct-file profile retained the pack after reload.");
    console.log(
      "Exchange lifecycle passed: author, AI scope selection and refusal, two offline pack transfers, project activation and removal, scoped QA, clean-profile handoff and direct-file restart."
    );
    app.exit(0);
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  })
  .finally(() => {
    for (const w of windows) if (!w.isDestroyed()) w.destroy();
    server?.close();
  });
