const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (!process.versions.electron) {
  const result = spawnSync(require("electron"), [__filename], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = require("electron");
const root = path.resolve(__dirname, "..");
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("no-sandbox");
app.setPath("userData", path.join(app.getPath("temp"), `loopcat-consent-test-${process.pid}`));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  const evaluate = (script) => window.webContents.executeJavaScript(script, true);
  try {
    await window.loadURL("about:blank");
    window.webContents.debugger.attach("1.3");
    await evaluate(fs.readFileSync(path.join(root, "src/ui/focus-controller.js"), "utf8"));
    const source = fs.readFileSync(path.join(root, "src/ui/ai-consent-dialog.js"), "utf8");
    await evaluate(`
      document.body.innerHTML = '<textarea id="segment"></textarea><input id="term">';
      ${source.replace("export function", "function")}
      window.confirmAi = createAiConsentDialog({ document, focusController: window.CatHan.focusController.createFocusController() });
      void 0;
    `);
    for (const outcome of ["accept", "cancel", "escape"]) {
      await evaluate(`
        document.querySelector('#segment').focus();
        window.consentResult = null;
        window.confirmAi('Send selected text?').then(value => window.consentResult = value);
        void 0;
      `);
      const responsive = await evaluate(
        `new Promise(resolve => setTimeout(() => resolve(Boolean(document.querySelector('#aiConsentDialog')?.open)), 0))`
      );
      if (!responsive) throw new Error("Consent blocked the event loop or did not open.");
      if ((await evaluate("window.confirmAi('duplicate')")) !== false)
        throw new Error("Duplicate consent was allowed.");
      if (outcome === "escape") {
        await window.webContents.debugger.sendCommand("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27
        });
        await window.webContents.debugger.sendCommand("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27
        });
      } else {
        await evaluate(`document.querySelectorAll('#aiConsentDialog button')[${outcome === "accept" ? 1 : 0}].click()`);
      }
      await evaluate(`new Promise((resolve, reject) => {
        const started = performance.now();
        const check = () => {
          if (window.consentResult !== null) return resolve();
          if (performance.now() - started > 1000) return reject(new Error('Consent did not settle'));
          setTimeout(check, 10);
        }; check();
      })`);
      const settled = await evaluate(
        `({ result: window.consentResult, removed: !document.querySelector('#aiConsentDialog'), focus: document.activeElement.id })`
      );
      if (settled.result !== (outcome === "accept") || !settled.removed || settled.focus !== "segment") {
        throw new Error(`Consent cleanup/focus failed: ${JSON.stringify(settled)}`);
      }
      for (const field of ["segment", "term"]) {
        await evaluate(`document.querySelector('#${field}').value = ''; document.querySelector('#${field}').focus()`);
        await window.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "char", text: "x" });
        const value = await evaluate(`document.querySelector('#${field}').value`);
        if (value !== "x") throw new Error(`Typing failed in ${field} after ${outcome}`);
      }
    }
    console.log(
      "AI consent: responsive dialog, duplicate prevention, accept/cancel/Escape, focus restoration, and immediate segment/term typing passed."
    );
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    window.destroy();
    app.exit(1);
  }
});
