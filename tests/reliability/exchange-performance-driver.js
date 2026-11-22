// Bundled only by verify-exchange-perf. Like the existing reliability benchmark,
// seed real records, open the production editor, dispatch input, wait for paint
// and independently read back the acknowledged IndexedDB value.
import "../../storage.js";
import { createPackRepository } from "../../src/features/exchange/repository.js";
import { encodePack } from "../../src/features/exchange/pack-format.js";
import { EXAMPLE_TERM_PACK, EXAMPLE_QA_PACK } from "../../src/features/exchange/examples.js";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, label, timeout = 60000) {
  const end = performance.now() + timeout;
  do {
    const v = await read();
    if (v) return v;
    await pause(10);
  } while (performance.now() < end);
  throw new Error("Timed out waiting for " + label);
}
const p95 = (a) => [...a].sort((a, b) => a - b)[Math.ceil(a.length * 0.95) - 1];
async function measureLocalizationScope(win) {
  const d = win.document,
    api = win.CatHan.i18n,
    originalLocale = api.getLocale(),
    originalWalker = d.createTreeWalker,
    editor = d.querySelector("#segmentBody tr[data-index='0'] .target-editor"),
    originalTarget = editor?.value;
  const host = d.createElement("div"),
    status = d.createElement("span"),
    authored = d.createElement("div");
  let wholeShellPasses = 0,
    scopedPasses = 0;
  authored.dataset.i18nSkip = "";
  authored.textContent = "Synthetic hello";
  host.append(status, authored);
  d.body.append(host);
  const settle = () => new Promise((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
  try {
    api.registerSource({ "bench.hello": "Synthetic hello", "bench.save": "Synthetic save" });
    api.registerLocale({ locale: "ar-x-exchange-bench", messages: { "bench.hello": "مرحبا", "bench.save": "حفظ" } });
    api.setLocale("ar-x-exchange-bench");
    await settle();
    d.createTreeWalker = function (root, ...args) {
      if (root === d.body || root === d) wholeShellPasses++;
      else scopedPasses++;
      return Reflect.apply(originalWalker, this, [root, ...args]);
    };
    const button = d.createElement("button");
    button.dataset.i18n = "bench.hello";
    button.dataset.i18nTitle = "bench.save";
    host.append(button);
    status.textContent = "Synthetic save";
    await settle();
    await settle();
    if (button.textContent !== "مرحبا" || button.title !== "حفظ" || status.textContent !== "حفظ")
      throw Error("Scoped dynamic localization did not translate inserted keys, attributes, or status text.");
    button.firstChild.nodeValue = "Synthetic save";
    await settle();
    if (button.textContent !== "مرحبا") throw Error("A text mutation bypassed an existing explicit localization key.");
    if (authored.textContent !== "Synthetic hello" || wholeShellPasses !== 0)
      throw Error("Dynamic localization changed authored content or rescanned the complete app shell.");
    const scopedMutationWholeShellPasses = wholeShellPasses;
    // A translator can replace an imported catalog without changing locale.
    api.registerLocale({
      locale: "ar-x-exchange-bench",
      messages: { "bench.hello": "أهلا", "bench.save": "حفظ جديد" }
    });
    api.setLocale("ar-x-exchange-bench");
    await settle();
    if (button.textContent !== "أهلا" || button.title !== "حفظ جديد" || status.textContent !== "حفظ جديد")
      throw Error("Replacement custom locale left stale translations.");
    if (
      d.querySelector("#segmentBody tr[data-index='0'] .target-editor")?.value !== originalTarget ||
      win.CatHan.appRuntime.editorSession.getSegments()[0]?.target !== originalTarget
    )
      throw Error("Changing UI locale modified the real translator draft.");
    return {
      scopedMutationWholeShellPasses,
      scopedPasses,
      authoredContentPreserved: true,
      catalogReplacementVerified: true
    };
  } finally {
    d.createTreeWalker = originalWalker;
    host.remove();
    api.setLocale(originalLocale);
    await settle();
  }
}
async function measureRemovalCycles(win, repo, heap, workers) {
  const result = [],
    d = win.document,
    original = win.confirm,
    dialog = d.querySelector("#exchangeDialog");
  const button = (root, label) =>
    Array.from(root.querySelectorAll("button")).find((b) => !b.disabled && b.textContent.trim() === label);
  const card = () =>
    Array.from(dialog.querySelectorAll(".exchange-card")).find(
      (c) => c.querySelector("h4")?.textContent === EXAMPLE_QA_PACK.name
    );
  const click = async (fn, label) => {
    (await until(fn, label, 20000)).click();
  };
  win.confirm = (msg) =>
    String(msg).startsWith("Uninstall " + EXAMPLE_QA_PACK.name + "?") ? true : original.call(win, msg);
  try {
    for (let cycle = 1; cycle <= 3; cycle++) {
      const before = { heap: heap(), workers: { ...workers } };
      d.querySelector("#exchangeBtn").click();
      await click(() => button(dialog, "Examples"), "Examples tab");
      await click(() => button(dialog, EXAMPLE_QA_PACK.name), "example QA pack");
      await click(() => button(dialog, "Try on examples"), "try QA fixtures");
      await until(
        () => workers.exchangeCreated > before.workers.exchangeCreated && workers.exchangeLive === 0,
        "fixture worker completion",
        20000
      );
      await click(() => button(dialog, "Install on this device"), "install example");
      await click(() => card() && button(card(), "Activate for this project"), "activate example");
      await until(() => card() && button(card(), "Disable for this project"), "activation visible");
      await click(() => card() && button(card(), "Uninstall from this device"), "uninstall example");
      await until(
        async () => !card() && !(await repo.getPack(EXAMPLE_QA_PACK.id, EXAMPLE_QA_PACK.version)),
        "uninstall committed"
      );
      d.querySelector("#exchangeClose").click();
      await pause(25);
      const after = { heap: heap(), workers: { ...workers } };
      if (after.workers.exchangeLive !== 0) throw Error("Exchange worker retained after removal.");
      result.push({ cycle, before, after });
    }
  } finally {
    win.confirm = original;
  }
  return result;
}
export async function runExchangePerformance(config) {
  const { segments, order, samples } = config;
  const storage = window.CatHan.storage,
    repo = createPackRepository(),
    id = "exchange-bench",
    binding = "fixture";
  const base = {
    id,
    name: "Exchange synthetic benchmark",
    sourceLang: "en",
    targetLang: "tr",
    documents: [{ id: "d", name: "reference.txt", type: "txt" }],
    tmName: "Test memory",
    termBaseName: "Test terms"
  };
  console.info(
    "EXCHANGE_BENCH " +
      segments +
      " rows: " +
      (config.reuseSeed ? "verifying retained synthetic fixture" : "seeding synthetic fixture")
  );
  if (!config.reuseSeed) {
    await storage.put("projects", base);
    const fixtureDb = await storage.openDatabase();
    // Load inert fixture rows by transaction rather than synthesizing 100,000
    // independent user edits and their journal entries. All measured saves
    // below go through the production editor, writer lease and autosave path.
    for (let start = 0; start < segments; start += 1000) {
      const txn = fixtureDb.transaction("segments", "readwrite"),
        rows = txn.objectStore("segments");
      const done = new Promise((resolve, reject) => {
        txn.oncomplete = resolve;
        txn.onabort = () => reject(txn.error);
      });
      for (let i = 0; i < Math.min(1000, segments - start); i++)
        rows.put({
          id: `row-${start + i}`,
          projectId: id,
          documentId: "d",
          documentName: "reference.txt",
          documentType: "txt",
          index: start + i,
          documentIndex: start + i,
          source: `Server reference ${start + i}`,
          target: `Sunucu referansı ${start + i}`,
          status: "draft",
          revision: 1,
          tags: [],
          comments: [],
          targetHistory: []
        });
      await done;
      if ((start + 1000) % 20000 === 0) console.info("EXCHANGE_BENCH seeded " + (start + 1000) + " / " + segments);
    }
    await storage.rebuildCatalog();
  } else {
    const existing = await storage.get("segments", "row-0");
    if (!existing || !(await storage.get("segments", "row-" + (segments - 1))))
      throw Error("Synthetic corpus missing after profile reuse.");
    await storage.put("segments", { ...existing, target: "Sunucu referansı 0", revision: existing.revision + 1 });
  }
  const bytes = [];
  for (let i = 0; i < 20; i++)
    bytes.push(
      await encodePack({
        ...(i === 3 || i === 4 ? EXAMPLE_QA_PACK : EXAMPLE_TERM_PACK),
        id: "perf.pack-" + i,
        name: "Synthetic pack " + i
      })
    );
  const results = [];
  for (const mode of order) {
    console.info("EXCHANGE_BENCH " + segments + " rows: preparing " + mode);
    if (mode === "empty") {
      for (const p of await repo.list()) await repo.uninstall(p.id);
    } else {
      for (let i = 0; i < 20; i++) await repo.install(bytes[i]);
    }
    await repo.clearActivations(id + "@" + binding);
    const n = mode === "one" ? 1 : mode === "five" ? 5 : 0;
    for (let i = 0; i < n; i++) await repo.enable(id + "@" + binding, "perf.pack-" + i, "1.0.0");
    if ((await repo.active(id + "@" + binding)).length !== n)
      throw new Error("Benchmark could not activate requested pack set.");
    const project = await storage.get("projects", id);
    await storage.put("projects", {
      ...project,
      exchangeRequirements: await repo.requirements(id + "@" + binding),
      exchangeLocalBinding: binding
    });
    await storage.releaseProject(id);
    const frame = document.createElement("iframe");
    frame.src = "/index.html";
    frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0";
    document.body.append(frame);
    try {
      const doc = () => frame.contentDocument,
        fw = () => frame.contentWindow;
      // One Open per fresh profile. Repeating it while project rows are still
      // loading can start a second, overlapping hydration.
      const visible = (node) => node && node.getClientRects().length > 0 && node;
      const editor = () =>
        visible(doc()?.querySelector("#segmentBody tr[data-index='0'] .target-editor[contenteditable=true]"));
      const file = () => visible(doc()?.querySelector(".file-card .file-open:not(:disabled)"));
      const projectOpen = () => visible(doc()?.querySelector(".project-tile button.primary:not(:disabled)"));
      const waitUi = async (fn, label) => {
        try {
          return await until(fn, label, 180000);
        } catch (e) {
          const session = fw()?.CatHan?.appRuntime?.editorSession;
          throw Error(
            `${e.message}; ready=${doc()?.readyState}, openDisabled=${doc()?.querySelector(".project-tile button.primary")?.disabled}, project=${session?.getProject()?.id}, loaded=${session?.getSegments()?.length}, files=${doc()?.querySelectorAll(".file-card").length}, editor=${Boolean(editor())}, notice=${doc()?.getElementById("saveStatus")?.textContent || ""}`
          );
        }
      };
      await waitUi(
        () => doc()?.readyState === "complete" && fw()?.CatHan?.appRuntime && (editor() || file() || projectOpen()),
        "verified enabled project Open"
      );
      if (!editor() && !file()) {
        console.info("EXCHANGE_BENCH " + segments + " rows: verified project Open " + mode);
        projectOpen().click();
        await waitUi(() => editor() || file(), "project file (" + mode + ")");
      }
      if (!editor()) file().click();
      const findEditor = () =>
        doc()?.querySelector("#segmentBody tr[data-index='0'] .target-editor[contenteditable=true]");
      await until(findEditor, "editable segment");
      if (n)
        await until(
          () => doc()?.querySelectorAll("[data-term-id^='exchange:']").length >= Math.min(n, 3),
          "active Exchange terms"
        );
      const input = [],
        save = [],
        dispatch = [];
      const heap = () => fw().performance.memory?.usedJSHeapSize ?? null;
      const heapBefore = heap();
      for (let i = 0; i <= samples; i++) {
        if (i % 10 === 0)
          console.info(
            "EXCHANGE_BENCH " + segments + " rows, " + mode + ": acknowledged edit loop " + i + " of " + samples
          );
        // The real grid can replace a visible row following a save; drive the
        // current editor element, never dispatch into a detached older node.
        let field = await until(findEditor, "row 0 editor");
        field.focus();
        field = findEditor() || field;
        const value = `Örnek çeviri ${mode}-${i} 🎯`,
          start = performance.now();
        field.value = value;
        field.dispatchEvent(
          new frame.contentWindow.InputEvent("input", { bubbles: true, inputType: "insertText", data: value })
        );
        const dt = performance.now() - start;
        await new Promise((resolve) => fw().requestAnimationFrame(() => fw().requestAnimationFrame(resolve)));
        const paint = performance.now() - start;
        try {
          await until(
            async () => {
              const stored = await storage.get("segments", "row-0");
              if (stored?.target !== value) return false;
              // An independent DB reader may observe a commit before the editor
              // receives its IDB completion event. Only issue the next measured
              // edit after the editor acknowledges the same durable generation.
              const current = fw().CatHan.appRuntime.editorSession.getSegments()[0];
              return current?.id === "row-0" && current.storageVersion === stored.storageVersion;
            },
            "durable editor acknowledgement",
            30000
          );
        } catch (err) {
          const stored = await storage.get("segments", "row-0");
          throw new Error(
            `${err.message}; mode=${mode}, edit=${i}, connected=${field.isConnected}, readOnly=${field.readOnly}, stored=${stored?.target}, visible=${findEditor()?.value}, status=${doc()?.getElementById("saveStatus")?.textContent || ""}`
          );
        }
        // The first change warms the exact command and persistence route.
        if (i) {
          dispatch.push(dt);
          input.push(paint);
          save.push(performance.now() - start);
        }
      }
      const workers = fw().__exchangeWorkerProbe;
      if (!workers) throw new Error("Missing benchmark worker probe.");
      const heapAfter = heap();
      let manualQa = null;
      if (n === 5) {
        console.info("EXCHANGE_BENCH " + segments + " rows: manual mixed QA scan");
        const started = performance.now();
        doc().querySelector("#runQaBtn").click();
        await until(
          () =>
            fw()
              .CatHan.appRuntime.editorSession.getQaChecks()
              .filter((c) => c.packId?.startsWith("perf.pack-")).length === 2,
          "two mixed pack manual QA findings",
          300000
        );
        manualQa = { durationMs: performance.now() - started, expectedFindings: 2 };
        if (workers.exchangeLive !== 0 || workers.exchangeCreated < 1)
          throw new Error("Manual QA worker was absent or retained after completion.");
      }
      const localizationProbe = config.lifecycleProbe ? await measureLocalizationScope(fw()) : undefined;
      const removalCycles = config.lifecycleProbe ? await measureRemovalCycles(fw(), repo, heap, workers) : undefined;
      results.push({
        mode,
        segments,
        active: n,
        installed: (await repo.list()).length,
        edits: samples,
        inputP95Ms: p95(input),
        saveP95Ms: p95(save),
        dispatchP95Ms: p95(dispatch),
        heapBefore,
        heapAfter,
        removalCycles,
        localizationProbe,
        exchangeDbOpens: fw().__exchangeDbOpens,
        packMix: { terminology: Math.min(n, 3), qa: n === 5 ? 2 : 0 },
        manualQa,
        workers: { ...workers },
        timings: { input, save, dispatch }
      });
      console.info("EXCHANGE_SAMPLE " + JSON.stringify(results.at(-1)));
    } finally {
      frame.remove();
      await pause(100);
    }
  }
  repo.close();
  return results;
}
