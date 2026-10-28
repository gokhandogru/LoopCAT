/* Isolated production-renderer regression; synthetic data only. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const fromApp = createRequire(path.join(root, "package.json"));
const output = path.join(root, "test-artifacts", "matches-sidebar");
if (!process.versions.electron) {
  const result = spawnSync(fromApp("electron"), [__filename], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE"))
  });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require("electron");
const profile = path.join(os.tmpdir(), `loopcat-matches-qa-${process.pid}-${Date.now()}`);
app.setPath("userData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("force-device-scale-factor", "1");
let server, win;
const errors = [];
const results = [];
const evaluate = (source) => win.webContents.executeJavaScript(source, true);
const run = (fn, ...args) => evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
async function wait(expression, label) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Timed out: " + label);
}
async function clickPoint(selector, button = "left", count = 1) {
  const point = await run((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw Error("Missing " + selector);
    element.scrollIntoView({ block: "nearest" });
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.x + Math.min(rect.width / 2, 55)), y: Math.round(rect.y + rect.height / 2) };
  }, selector);
  win.webContents.sendInputEvent({ type: "mouseMove", ...point });
  for (let current = 1; current <= count; current++) {
    win.webContents.sendInputEvent({ type: "mouseDown", button, clickCount: current, ...point });
    win.webContents.sendInputEvent({ type: "mouseUp", button, clickCount: current, ...point });
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
async function menuAction(pattern) {
  await wait("!!document.querySelector('[role=menu] [role=menuitem]')", "context menu");
  await run((pattern) => {
    const item = [...document.querySelectorAll("[role=menu] [role=menuitem]")].find((element) =>
      new RegExp(pattern, "i").test(element.textContent)
    );
    if (!item) throw Error("Missing menu item: " + pattern);
    item.click();
  }, pattern);
}
async function capture(name) {
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await new Promise((resolve) => setTimeout(resolve, 150));
  fs.writeFileSync(path.join(output, name + ".png"), (await win.webContents.capturePage()).toPNG());
}
function fixture() {
  const data = JSON.parse(
    fs.readFileSync(path.join(root, "tests/fixtures/modernization/baseline-backup.json"), "utf8")
  );
  const project = data.projects[0];
  project.name = "Matches sidebar verification";
  project.createdAt = new Date().toISOString();
  project.domain = "";
  project.tmName = project.mainTmName = "My Project TM";
  project.termBaseName = "My Project terminology";
  project.resourceLinks = [
    { type: "tm", name: project.tmName, role: "main" },
    { type: "termbase", name: project.termBaseName }
  ];
  const pairs = [
    ["I have a friend.", "Bir arkadaşım var."],
    ["I have many friends.", "Birçok arkadaşım var."],
    ["I have some friends.", "Bazı arkadaşlarım var."],
    ["I have a good friend.", "İyi bir arkadaşım var."],
    ["I have a close friend.", "Yakın bir arkadaşım var."],
    ["I have an old friend.", "Eski bir arkadaşım var."]
  ];
  data.segments.forEach((segment, index) => {
    segment.source = pairs[index % pairs.length][0];
    segment.target = "";
    segment.status = "empty";
    segment.reviewState = "";
    segment.revision = 0;
    delete segment.comments;
  });
  data.segments[5].source = "First <b>bold</b> then <b>again</b>.";
  data.tmEntries = pairs.map(([source, target], index) => ({
    ...data.tmEntries[0],
    id: `qa-tm-${index}`,
    tmName: project.tmName,
    source,
    target
  }));
  const baseTerm = data.terms[0];
  data.terms = [
    ["friend", "arkadaş", false],
    ["have", "sahip olmak", false],
    ["a friend", "bir arkadaş", false],
    ["I", "ben", false],
    ["friend", "dostum", true]
  ].map(([source, target, forbidden], index) => ({
    ...baseTerm,
    id: `qa-term-${index}`,
    termBaseName: project.termBaseName,
    source,
    sourceTerm: source,
    target,
    targetTerm: target,
    forbidden,
    isForbidden: forbidden,
    notes: "Hidden detail for right-click editing",
    status: forbidden ? "forbidden" : "preferred"
  }));
  return data;
}
async function inspectLayout(label) {
  const state = await run(() => {
    const sidebar = document.querySelector("#editorInspector");
    const cards = [...sidebar.querySelectorAll(".match-card, .term-card")];
    const rect = sidebar.getBoundingClientRect();
    const visible = (element) => {
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(element).visibility !== "hidden";
    };
    const forbiddenControls = [
      ...sidebar.querySelectorAll("[data-inspector-section=matches] button, [data-inspector-section=matches] summary")
    ]
      .filter(visible)
      .map((el) => el.textContent.trim())
      .filter((text) => /^(Insert|Delete|Files)$/i.test(text));
    return {
      width: innerWidth,
      height: innerHeight,
      forbiddenControls,
      inlineFormVisible: visible(document.querySelector("#termForm")),
      sidebarOverflow: sidebar.scrollWidth - sidebar.clientWidth,
      cards: cards.map((card) => ({
        type: card.className,
        height: card.getBoundingClientRect().height,
        horizontalOverflow: card.scrollWidth - card.clientWidth,
        fullyVisible:
          card.getBoundingClientRect().top >=
            Math.max(rect.top, card.closest(".panel-content").getBoundingClientRect().top) &&
          card.getBoundingClientRect().bottom <=
            Math.min(rect.bottom, card.closest(".panel-content").getBoundingClientRect().bottom),
        text: card.textContent.trim()
      })),
      tmPanelVisible: visible(document.querySelector("#inspectorTmPanel")),
      tbPanelVisible: visible(document.querySelector("#inspectorTbPanel"))
    };
  });
  if (state.forbiddenControls.length || state.inlineFormVisible)
    throw Error("Redundant sidebar controls: " + JSON.stringify(state));
  if (state.sidebarOverflow > 1 || state.cards.some((card) => card.horizontalOverflow > 1))
    throw Error("Sidebar horizontal overflow: " + JSON.stringify(state));
  if (!state.tmPanelVisible || !state.tbPanelVisible) throw Error("Both match panels must stay visible");
  results.push({ check: label, ...state });
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
      width: 1911,
      height: 1007,
      useContentSize: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    win.webContents.on("console-message", (details) => {
      if (details.level === "error") errors.push(details.message);
    });
    await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
    await wait("!!window.CatHan?.storage?.importAllData", "startup storage");
    await run((data) => window.CatHan.storage.importAllData(data), fixture());
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        win.webContents.removeListener("did-finish-load", loaded);
        reject(new Error("Timed out: fixture reload"));
      }, 15000);
      const loaded = () => {
        clearTimeout(timeout);
        resolve();
      };
      win.webContents.once("did-finish-load", loaded);
      win.reload();
    });
    await wait("!!document.querySelector('.project-tile button.primary')", "project");
    await evaluate("document.querySelector('.project-tile button.primary').click()");
    await wait("!!document.querySelector('.file-card .file-open')", "file");
    await evaluate("document.querySelector('.file-card .file-open').click()");
    await wait("!!document.querySelector('#segmentBody .target-editor')", "editor");
    await clickPoint("#segmentBody .target-editor");
    await wait(
      "document.querySelectorAll('#tmMatches .match-card').length >= 3 && document.querySelectorAll('#termSuggestions .term-card').length >= 3",
      "TM and TB results"
    );
    for (const [locale, label, direction] of [
      ["ca-ES", "Coincidències", "ltr"],
      ["es-ES", "Coincidencias", "ltr"],
      ["tr-TR", "Eşleşmeler", "ltr"],
      ["ar", "التطابقات", "rtl"]
    ]) {
      await run((value) => {
        const select = document.querySelector("#uiLocaleSelect");
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, locale);
      await wait(
        `document.documentElement.lang === ${JSON.stringify(locale)} && document.querySelector('#inspectorTabMatches').textContent.trim() === ${JSON.stringify(label)}`,
        "locale " + locale
      );
      for (const width of [1911, 1280]) {
        win.setContentSize(width, 1007);
        await new Promise((resolve) => setTimeout(resolve, 150));
        const state = await run(() => {
          const visible = (element) => {
            const r = element.getBoundingClientRect();
            return (
              element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && r.width > 0 && r.height > 0
            );
          };
          const selector =
            "#editorInspector button, #editorInspector h2, #editorInspector .match-diff-legend, #editorInspector [role=tab], #segmentSearchInput";
          return {
            direction: document.documentElement.dir,
            width: document.documentElement.scrollWidth,
            viewport: innerWidth,
            clipped: [...document.querySelectorAll(selector)]
              .filter(
                (element) =>
                  visible(element) && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2
              )
              .map((element) => ({
                text: element.textContent.trim(),
                id: element.id,
                width: element.clientWidth,
                scroll: element.scrollWidth
              })),
            wrappedTabs: [...document.querySelectorAll("#editorInspector [role=tab]")]
              .filter((element) => {
                const range = document.createRange();
                range.selectNodeContents(element);
                return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).length > 1;
              })
              .map((element) => element.textContent.trim()),
            sourceDirection: getComputedStyle(document.querySelector("#tmMatches .match-source")).direction,
            targetDirection: getComputedStyle(document.querySelector("#tmMatches .match-target")).direction,
            statusTextFits: (() => {
              const select = document.querySelector("#segmentStatusFilter");
              const style = getComputedStyle(select);
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");
              context.font = style.font;
              const textWidth = context.measureText(select.selectedOptions[0].textContent.trim()).width;
              return textWidth + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 16 <= select.clientWidth;
            })(),
            search: document.querySelector("#segmentSearchInput").getAttribute("placeholder")
          };
        });
        if (
          state.direction !== direction ||
          state.width > state.viewport + 1 ||
          state.clipped.length ||
          (locale !== "ar" && state.wrappedTabs.length) ||
          state.sourceDirection !== "ltr" ||
          state.targetDirection !== "ltr" ||
          (locale === "es-ES" && !state.statusTextFits) ||
          !state.search ||
          state.search === "Find in source or target"
        )
          throw Error(locale + " UI layout issue: " + JSON.stringify(state));
        await capture("locale-" + locale + "-" + width);
      }
      results.push({ check: "Localized editor layout " + locale, passed: true });
    }
    await run(() => {
      const select = document.querySelector("#uiLocaleSelect");
      select.value = "en-US";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await wait(
      "document.documentElement.lang === 'en-US' && document.querySelector('#inspectorTabMatches').textContent.trim() === 'Matches'",
      "restore English"
    );
    win.setContentSize(1911, 1007);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const fuzzyDiff = await run(() => {
      const matches = [...document.querySelectorAll("#tmMatches .match-card")];
      const exact = matches.find((row) => row.querySelector(".match-score")?.textContent === "100%");
      const fuzzy = matches.find((row) => row.textContent.includes("I have a good friend."));
      const source = fuzzy?.querySelector(".match-source");
      return {
        exactHasDiff: !!exact?.querySelector(".match-diff-added, .match-diff-removed"),
        removed: source?.querySelector("del")?.textContent,
        added: source?.querySelector("ins")?.textContent,
        before:
          source &&
          [...source.childNodes]
            .filter((node) => node.nodeName !== "INS")
            .map((node) => node.textContent)
            .join(""),
        after:
          source &&
          [...source.childNodes]
            .filter((node) => node.nodeName !== "DEL")
            .map((node) => node.textContent)
            .join(""),
        legend: getComputedStyle(document.querySelector(".match-diff-legend")).display,
        removedLabel: source?.querySelector("del")?.getAttribute("title"),
        addedLabel: source?.querySelector("ins")?.getAttribute("title")
      };
    });
    if (
      fuzzyDiff.exactHasDiff ||
      fuzzyDiff.before !== "I have a good friend." ||
      fuzzyDiff.after !== "I have a friend." ||
      !fuzzyDiff.removed?.includes("good") ||
      fuzzyDiff.legend === "none" ||
      !fuzzyDiff.removedLabel
    )
      throw Error("Incorrect fuzzy source diff: " + JSON.stringify(fuzzyDiff));
    results.push({
      check: "TM fuzzy source differences show removals and additions with accessible labels",
      passed: true
    });
    const replacement = await run(() => {
      const source = [...document.querySelectorAll("#tmMatches .match-card .match-source")].find((el) =>
        el.textContent.includes("manya")
      );
      return (
        source && {
          removed: [...source.querySelectorAll("del")].map((el) => el.textContent).join(" "),
          added: [...source.querySelectorAll("ins")].map((el) => el.textContent).join(" "),
          before: [...source.childNodes]
            .filter((node) => node.nodeName !== "INS")
            .map((node) => node.textContent)
            .join(""),
          after: [...source.childNodes]
            .filter((node) => node.nodeName !== "DEL")
            .map((node) => node.textContent)
            .join("")
        }
      );
    });
    if (
      !replacement ||
      replacement.before !== "I have many friends." ||
      replacement.after !== "I have a friend." ||
      !replacement.removed.includes("many") ||
      !replacement.added.includes("friend")
    )
      throw Error("Incorrect replacement: " + JSON.stringify(replacement));
    await evaluate("document.documentElement.dataset.theme = 'dark'");
    const darkDiff = await run(() => {
      const removed = document.querySelector(".match-source .match-diff-removed");
      const added = document.querySelector(".match-source .match-diff-added");
      const a = getComputedStyle(removed),
        b = getComputedStyle(added);
      return {
        removed: a.color,
        added: b.color,
        removedDecoration: a.textDecorationLine,
        addedDecoration: b.textDecorationLine
      };
    });
    if (
      darkDiff.removed === darkDiff.added ||
      !darkDiff.removedDecoration.includes("line-through") ||
      !darkDiff.addedDecoration.includes("underline")
    )
      throw Error("Dark theme diff indistinguishable: " + JSON.stringify(darkDiff));
    await capture("matches-dark");
    await evaluate("document.documentElement.removeAttribute('data-theme')");
    results.push({
      check: "Replacement retains both versions and dark theme preserves visual distinctions",
      passed: true
    });
    await inspectLayout("wide layout");
    await capture("matches-wide");

    await clickPoint("#tmMatches .match-card", "left", 2);
    await wait(
      "document.querySelector('#segmentBody .target-editor').value === 'Bir arkadaşım var.'",
      "double-click TM replacement"
    );
    results.push({ check: "Double-click TM replaces active target", passed: true });

    await clickPoint("#termSuggestions .forbidden-term-card", "left", 2);
    if (await evaluate("document.querySelector('#segmentBody .target-editor').value !== 'Bir arkadaşım var.'"))
      throw Error("Forbidden term was inserted");
    results.push({ check: "Forbidden target cannot be inserted", passed: true });

    await run(() => {
      const editor = document.querySelector("#segmentBody .target-editor");
      editor.focus();
      editor.setSelectionRange(4, 13);
      editor.dispatchEvent(new Event("select", { bubbles: true }));
      const term = document.querySelector('#termSuggestions [data-term-id="qa-term-0"]');
      term.dataset.qaTerm = "editable";
    });
    await clickPoint("[data-qa-term=editable]", "left", 2);
    await wait(
      "document.querySelector('#segmentBody .target-editor').value === 'Bir arkadaş var.'",
      "term insertion at selected caret range"
    );
    results.push({ check: "Double-click term replaces selected target range", passed: true });

    const beforeTerm = await run(async () =>
      (await window.CatHan.storage.getAll("terms")).find((term) => term.id === "qa-term-0")
    );
    await clickPoint("[data-qa-term=editable]", "right");
    await menuAction("Edit");
    await wait("document.querySelector('#termEditDialog').open", "edit term dialog");
    await capture("term-edit-dialog");
    await run(() => {
      if (document.querySelector("#sourceTermInput").value !== "friend") throw Error("Wrong term opened for editing");
      document.querySelector("#targetTermInput").value = "arkadaşlık";
      document.querySelector("#termNotesInput").value = "Edited through sidebar context menu";
      document.querySelector("#termForm").requestSubmit();
    });
    await wait("!document.querySelector('#termEditDialog').open", "term saved");
    const afterTerm = await run(async () =>
      (await window.CatHan.storage.getAll("terms")).find((term) => term.id === "qa-term-0")
    );
    if (
      !beforeTerm ||
      !afterTerm ||
      (afterTerm.targetTerm || afterTerm.target) !== "arkadaşlık" ||
      beforeTerm.resourceId !== afterTerm.resourceId
    )
      throw Error("Editing failed to preserve identity/resource: " + JSON.stringify({ beforeTerm, afterTerm }));
    results.push({
      check: "Edit preserves term ID and termbase; updates translation/notes",
      passed: true,
      termId: afterTerm.id
    });
    await wait("document.querySelector('#termSuggestions').textContent.includes('arkadaşlık')", "edited match refresh");
    for (const forbidden of [true, false]) {
      await clickPoint('#termSuggestions [data-term-id="qa-term-0"]', "right");
      await menuAction("Edit");
      await wait("document.querySelector('#termEditDialog').open", "forbidden status dialog");
      await run((forbidden) => {
        document.querySelector("#termForbiddenInput").checked = forbidden;
        document.querySelector("#termForm").requestSubmit();
      }, forbidden);
      await wait("!document.querySelector('#termEditDialog').open", "forbidden status saved");
      await wait(
        `document.querySelector('#termSuggestions [data-term-id="qa-term-0"]').classList.contains('forbidden-term-card') === ${forbidden}`,
        "forbidden row presentation"
      );
      const updated = await run(async () =>
        (await window.CatHan.storage.getAll("terms")).find((term) => term.id === "qa-term-0")
      );
      if (updated.isForbidden !== forbidden || updated.status !== (forbidden ? "forbidden" : "preferred"))
        throw Error("Forbidden state not synchronized: " + JSON.stringify(updated));
      if (forbidden) {
        const previousTarget = await evaluate("document.querySelector('#segmentBody .target-editor').value");
        await clickPoint('#termSuggestions [data-term-id="qa-term-0"]', "left", 2);
        if ((await evaluate("document.querySelector('#segmentBody .target-editor').value")) !== previousTarget)
          throw Error("Edited forbidden term remains insertable");
      }
    }
    results.push({ check: "Forbidden flag and status round-trip through editor, blocking insertion", passed: true });
    await run(() => {
      [...document.querySelectorAll("#termSuggestions .term-card")].find((card) =>
        card.textContent.includes("arkadaşlık")
      ).dataset.qaTerm = "delete";
    });
    await clickPoint("[data-qa-term=delete]", "right");
    await capture("term-context-menu");
    await menuAction("Delete");
    await wait(
      "!document.querySelector('#termSuggestions').textContent.includes('arkadaşlık')",
      "deleted term removed"
    );
    const deletedTerm = await run(async () =>
      (await window.CatHan.storage.getAll("terms")).find((term) => term.id === "qa-term-0")
    );
    const trashState = await evaluate("document.querySelector('#trashBtn').textContent");
    if (deletedTerm && !deletedTerm.deletedAt && !deletedTerm.isDeleted)
      throw Error("Term still active after delete: " + JSON.stringify(deletedTerm));
    if (!/Trash\s*\([1-9]/.test(trashState)) throw Error("Term delete missing Trash: " + trashState);
    results.push({ check: "Delete removes match and retains recovery in Trash", passed: true });

    const sourcePoint = await run(() => {
      const cell = document.querySelector('#segmentBody tr[data-index="1"] .source-cell');
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const start = node.textContent.indexOf("many");
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + 4);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const rect = range.getBoundingClientRect();
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
      }
      throw Error("Selected source fixture not found");
    });
    win.webContents.sendInputEvent({ type: "mouseDown", button: "right", ...sourcePoint });
    win.webContents.sendInputEvent({ type: "mouseUp", button: "right", ...sourcePoint });
    await menuAction("Add to active termbase");
    await wait("document.querySelector('#quickTermCaptureDialog').open", "source term capture");
    const captured = await run(() => ({
      source: document.querySelector("#quickTermSourceInput").value,
      target: document.querySelector("#quickTermTargetInput").value,
      active: document.querySelector("#segmentBody tr.active")?.dataset.index,
      destination: document.querySelector("#quickTermCaptureMessage").textContent
    }));
    if (
      captured.source !== "many" ||
      captured.target !== "" ||
      captured.active !== "1" ||
      !captured.destination.includes("My Project terminology")
    )
      throw Error("Incorrect source capture: " + JSON.stringify(captured));
    await run(() => {
      document.querySelector("#quickTermTargetInput").value = "çok";
      document.querySelector("#quickTermCaptureForm").requestSubmit();
    });
    await wait("!document.querySelector('#quickTermCaptureDialog').open", "source term saved");
    const savedSource = await run(async () =>
      (await window.CatHan.storage.getAll("terms")).find(
        (term) => term.sourceTerm === "many" && term.targetTerm === "çok"
      )
    );
    if (!savedSource || savedSource.termBaseName !== "My Project terminology")
      throw Error("Term missing from active termbase: " + JSON.stringify(savedSource));
    results.push({ check: "Selected source right-click saves to active termbase from another segment", passed: true });

    win.setContentSize(1280, 800);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await inspectLayout("compact layout");
    await capture("matches-1280");
    await run(() => {
      document.querySelector("#tmMatches .match-card header span").textContent = "VeryLongTranslationMemoryName".repeat(
        12
      );
      document.querySelector("#termSuggestions .term-card .term-target").textContent = "LongUnbrokenTerm".repeat(30);
    });
    await inspectLayout("long unbroken content layout");
    await capture("matches-long-content");
    await evaluate(fromApp("axe-core").source);
    const axe = await evaluate(
      "axe.run(document.querySelector('#editorInspector'), {runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})"
    );
    const severe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
    if (severe.length) throw Error("Accessibility violations: " + JSON.stringify(severe));
    results.push({
      check: "Sidebar accessibility scan",
      passed: true,
      violations: axe.violations.map((v) => ({ id: v.id, impact: v.impact }))
    });
    await clickPoint('#segmentBody tr[data-index="5"] .target-editor');
    const tagCount = () => "document.querySelectorAll('#segmentBody tr[data-index=\"5\"] .tag-tray button').length";
    await wait(tagCount() + " === 4", "four repeated tag suggestions");
    for (const remaining of [3, 2, 1, 0]) {
      await clickPoint('#segmentBody tr[data-index="5"] .tag-tray button');
      await wait(tagCount() + " === " + remaining, "remaining tag suggestions " + remaining);
      if (remaining === 3) {
        const checkTagStyles = async (theme) => {
          await run((selectedTheme) => {
            if (selectedTheme === "dark") document.documentElement.dataset.theme = "dark";
            else document.documentElement.removeAttribute("data-theme");
          }, theme);
          win.webContents.sendInputEvent({ type: "mouseMove", x: 5, y: 5 });
          await new Promise((resolve) => setTimeout(resolve, 250));
          const styles = await run(() => {
            const row = document.querySelector('#segmentBody tr[data-index="5"]');
            const nodes = [
              row.querySelector(".source-cell button.tag-chip-action"),
              row.querySelector(".target-editor .target-protected-tag"),
              row.querySelector(".tag-tray button.tag-chip-action")
            ];
            if (nodes.some((node) => !node)) throw Error("Missing tag in one of the three locations");
            return nodes.map((node) => {
              const css = getComputedStyle(node);
              return {
                color: css.color,
                background: css.backgroundColor,
                border: css.borderTopColor,
                radius: css.borderTopLeftRadius,
                themebg: css.getPropertyValue("--color-tag-background"),
                themeborder: css.getPropertyValue("--color-tag-border"),
                size: css.fontSize,
                family: css.fontFamily,
                weight: css.fontWeight,
                height: node.getBoundingClientRect().height
              };
            });
          });
          if (
            styles.some((style) => {
              const { height, ...rest } = style;
              const { height: firstHeight, ...first } = styles[0];
              return JSON.stringify(rest) !== JSON.stringify(first) || Math.abs(height - firstHeight) > 1;
            })
          )
            throw Error(theme + " tag styles differ: " + JSON.stringify(styles));
        };
        await checkTagStyles("light");
        await capture("tag-design-light");
        await checkTagStyles("dark");
        await capture("tag-design-dark");
        await evaluate("document.documentElement.removeAttribute('data-theme')");
        results.push({
          check: "Source, target and suggestion tags share appearance in light and dark themes",
          passed: true
        });
      }
    }
    if (await evaluate("!!document.querySelector('#segmentBody tr[data-index=\"5\"] .tag-tray')"))
      throw Error("Empty tag tray remains");
    const tagTarget = await evaluate(
      "document.querySelector('#segmentBody tr[data-index=\"5\"] .target-editor').value"
    );
    if ((tagTarget.match(/<b>/g) || []).length !== 2 || (tagTarget.match(/<\/b>/g) || []).length !== 2)
      throw Error("Repeated tags not inserted: " + tagTarget);
    await clickPoint('#segmentBody tr[data-index="5"] .target-editor');
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Z", modifiers: ["control"] });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Z", modifiers: ["control"] });
    await wait(tagCount() + " === 1", "undo restores missing tag suggestion");
    results.push({
      check: "Tag suggestions disappear per insertion, respect repeated tags and return on undo",
      passed: true
    });

    if (errors.length) throw Error("Renderer console errors: " + JSON.stringify(errors));
    console.log(JSON.stringify({ passed: true, output, results }, null, 2));
  } catch (error) {
    exitCode = 1;
    console.error(error.stack || error);
    if (win && !win.isDestroyed()) {
      await capture("failure").catch(() => {});
      console.error(
        await evaluate(
          "JSON.stringify({status:document.querySelector('#saveStatus')?.textContent, dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),tm:document.querySelector('#tmMatches')?.textContent,tb:document.querySelector('#termSuggestions')?.textContent, target:document.querySelector('#segmentBody .target-editor')?.value})"
        ).catch(() => "")
      );
    }
  } finally {
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify({ passed: exitCode === 0, results, errors }, null, 2)
    );
    if (win && !win.isDestroyed()) win.destroy();
    if (server) await new Promise((resolve) => server.close(resolve));
    // The isolated profile is retained for diagnostic reproducibility in OS temp.
    app.exit(exitCode);
  }
});
