// Opt-in packaged smoke only. It uses the actual preload, protocol, session,
// editor composition and native close handshake with an isolated test profile.
function attachResourceEditorSmoke(mainWindow, { BrowserWindow, timeoutMs, runtimeStatus, finish }) {
  const checks = [];
  let completed = false;
  let timer;
  const complete = (code, extra = {}) => {
    if (completed) return;
    completed = true;
    clearTimeout(timer);
    finish(code, { ok: code === 0, checks, desktopRuntime: runtimeStatus(), ...extra });
  };
  timer = setTimeout(() => complete(1, { reason: "resource-window-smoke-timeout" }), timeoutMs);
  const evaluate = (window, code) => window.webContents.executeJavaScript(code, true);
  const wait = async (predicate, label) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await predicate()) {
        checks.push(label);
        return;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 40);
      });
    }
    throw new Error(`Timed out: ${label}`);
  };
  const editorWindow = (type) =>
    BrowserWindow.getAllWindows().find(
      (window) => !window.isDestroyed() && window.webContents.getURL().includes(`#resource/${type}/`)
    );
  const pressDialog = (window, label) =>
    evaluate(
      window,
      `Array.from(document.querySelectorAll('dialog[open] button')).find(button => button.textContent === ${JSON.stringify(label)})?.click()`
    );
  mainWindow.webContents.once("did-finish-load", async () => {
    try {
      await wait(
        () =>
          evaluate(
            mainWindow,
            "!!window.CatHan?.project?.createResource && !!window.LoopCATDesktop?.openResourceEditor"
          ),
        "native library initialized"
      );
      const ids = await evaluate(
        mainWindow,
        `(async () => {
        const {project, tm, termbase, storage} = window.CatHan;
        const memory = await project.createResource({name:'Native smoke TM',type:'tm',sourceLang:'en',targetLang:'tr'});
        const glossary = await project.createResource({name:'Native smoke TB',type:'termbase',sourceLang:'en',targetLang:'tr'});
        await tm.importTmEntries([{id:'native-tm-1',resourceId:memory.id,tmName:memory.name,sourceLang:'en',targetLang:'tr',source:'First native entry',target:'İlk kayıt'},
          {id:'native-tm-2',resourceId:memory.id,tmName:memory.name,sourceLang:'en',targetLang:'tr',source:'Second native entry',target:'İkinci kayıt'}]);
        await termbase.importTerms([{id:'native-term-1',resourceId:glossary.id,termBaseName:glossary.name,sourceLang:'en',targetLang:'tr',sourceTerm:'friend',targetTerm:'arkadaş'}]);
        await storage.flushMutations();
        return {tm:memory.id,tb:glossary.id};
      })()`
      );
      const open = (type, entryId) =>
        evaluate(
          mainWindow,
          `window.LoopCATDesktop.openResourceEditor(${JSON.stringify({ type, resourceId: ids[type], entryId })})`
        );
      await open("tm", "native-tm-1");
      await wait(() => Boolean(editorWindow("tm")), "native editor window created");
      const memory = editorWindow("tm");
      await wait(
        () =>
          evaluate(memory, "document.querySelector('#resourceEntryForm textarea[name=target]')?.value === 'İlk kayıt'"),
        "deep link selects entry in standalone editor"
      );
      const surfacesReady = await evaluate(
        memory,
        `(() => {
          const heading = document.querySelector(".resource-editor-heading");
          const target = document.querySelector("#resourceEntryForm textarea[name=target]");
          const hasToolsSheet = [...document.styleSheets].some(sheet =>
            sheet.href && new URL(sheet.href).pathname.endsWith("/src/ui/workspace-tools.css")
          );
          return hasToolsSheet && getComputedStyle(heading).borderBlockStartStyle === "solid" &&
            parseFloat(getComputedStyle(heading).borderBlockStartWidth) > 0 &&
            target.getBoundingClientRect().width > 0 && document.documentElement.scrollWidth <= innerWidth;
        })()`
      );
      if (!surfacesReady) throw new Error("The independent resource window did not load its workspace surfaces");
      checks.push("standalone resource window loads the workspace stylesheet and visible entry form");
      if (memory.getParentWindow() || memory.webContents.session !== mainWindow.webContents.session)
        throw new Error("Resource window must be independent and share the library session");
      const prefs = memory.webContents.getLastWebPreferences();
      if (!prefs.sandbox || !prefs.contextIsolation || prefs.nodeIntegration)
        throw new Error("Unsafe resource window preferences");
      checks.push("independent sandboxed same-session native window");
      await evaluate(
        memory,
        `(() => {const field=document.querySelector('#resourceEntryForm textarea[name=target]');field.value='Unsaved native draft';field.dispatchEvent(new Event('input',{bubbles:true}));})()`
      );
      const count = BrowserWindow.getAllWindows().length;
      await open("tm", "native-tm-2");
      await wait(
        () =>
          evaluate(
            memory,
            "document.querySelector('#resourceEntryForm textarea[name=target]')?.value === 'İkinci kayıt'"
          ),
        "repeat Open selects requested entry without navigation"
      );
      if (
        BrowserWindow.getAllWindows().length !== count ||
        !(await evaluate(
          memory,
          "window.CatHan.resourceEditor.session.get('native-tm-1')?.values.target === 'Unsaved native draft'"
        ))
      )
        throw new Error("Repeat Open lost a draft or created a duplicate window");
      checks.push("repeat Open preserves other entry draft");
      memory.close();
      await wait(
        () => evaluate(memory, "!!document.querySelector('dialog[open]')"),
        "native close asks Save Discard Cancel"
      );
      await pressDialog(memory, "Cancel");
      await wait(
        () => !memory.isDestroyed() && evaluate(memory, "!document.querySelector('dialog[open]')"),
        "native close cancellation keeps editor"
      );
      mainWindow.close();
      await wait(() => mainWindow.isDestroyed(), "library closes independently");
      if (memory.isDestroyed()) throw new Error("Closing library destroyed independent resource editor");
      await evaluate(memory, "document.querySelector('#resourceSaveAll').click()");
      await wait(
        () => evaluate(memory, "window.CatHan.resourceEditor.session.size() === 0"),
        "resource edits save after library closes"
      );
      await evaluate(
        memory,
        "Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Back to Resources').click()"
      );
      await wait(() => memory.isDestroyed(), "Back to Resources closes native editor");
      const library = BrowserWindow.getAllWindows().find(
        (window) => !window.isDestroyed() && !window.webContents.getURL().includes("#resource/")
      );
      if (!library) throw new Error("Back did not recreate library");
      await wait(
        () => evaluate(library, "!!window.CatHan?.storage && !!document.querySelector('.resource-library-table')"),
        "Back recreates Resources library"
      );
      if (
        !(await evaluate(
          library,
          "window.CatHan.storage.get('tmEntries','native-tm-1').then(entry => entry.target === 'Unsaved native draft')"
        ))
      )
        throw new Error("Recreated library does not see committed editor mutation");
      checks.push("shared session commit visible to recreated library");
      await evaluate(
        library,
        `window.LoopCATDesktop.openResourceEditor(${JSON.stringify({ type: "tb", resourceId: ids.tb, entryId: "native-term-1" })})`
      );
      await wait(() => Boolean(editorWindow("tb")), "native termbase window created");
      const glossary = editorWindow("tb");
      await wait(
        () =>
          evaluate(
            glossary,
            "document.querySelector('#resourceEntryForm textarea[name=targetTerm]')?.value === 'arkadaş'"
          ),
        "native TB editor initialized"
      );
      await evaluate(
        glossary,
        `(() => {const field=document.querySelector('#resourceEntryForm textarea[name=targetTerm]');field.value='Discard native draft';field.dispatchEvent(new Event('input',{bubbles:true}));})()`
      );
      glossary.close();
      await wait(() => evaluate(glossary, "!!document.querySelector('dialog[open]')"), "native TB dirty close guarded");
      await pressDialog(glossary, "Discard changes");
      await wait(() => glossary.isDestroyed(), "native discard closes editor");
      if (
        !(await evaluate(
          library,
          "window.CatHan.storage.get('terms','native-term-1').then(entry => entry.targetTerm === 'arkadaş')"
        ))
      )
        throw new Error("Discard changed active terminology");
      checks.push("discard leaves committed terminology unchanged");
      complete(0);
    } catch (error) {
      complete(1, { reason: "resource-window-smoke-failed", error: error.stack || String(error) });
    }
  });
}

module.exports = { attachResourceEditorSmoke };
