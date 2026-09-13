const fs = require("node:fs/promises");
const { randomUUID, createHash } = require("node:crypto");

function attachPersistenceClose(window, { ipcMain, dialog, isAllowedRequest, timeoutMs = 15000 }) {
  let permitted = false;
  let pending = null;
  let showingFailure = false;
  async function failed() {
    if (window.isDestroyed() || showingFailure) return;
    showingFailure = true;
    const choice = await dialog.showMessageBox(window, {
      type: "warning",
      title: "Output is not fully saved",
      message: "LoopCAT could not confirm that local saving finished.",
      detail: "Retry saving, export the current targets, or explicitly exit. Cancel keeps the editor open.",
      buttons: ["Retry", "Emergency Export", "Exit without saving", "Cancel"],
      defaultId: 0,
      cancelId: 3
    });
    showingFailure = false;
    if (choice.response === 0) request("flush");
    else if (choice.response === 1) request("emergency");
    else if (choice.response === 2) {
      permitted = true;
      window.close();
    } else window.webContents.send("loopcat:prepare-close", { id: randomUUID(), mode: "resume" });
  }
  function request(mode) {
    if (pending || window.isDestroyed()) return;
    const id = randomUUID();
    const timer = setTimeout(() => {
      pending = null;
      void failed();
    }, timeoutMs);
    pending = { id, timer, mode };
    window.webContents.send("loopcat:prepare-close", { id, mode });
  }
  const complete = async (event, message) => {
    if (!pending || event.sender !== window.webContents || !isAllowedRequest(event) || message?.id !== pending.id)
      return;
    const mode = pending.mode;
    clearTimeout(pending.timer);
    pending = null;
    if (!message.ok) {
      await failed();
      return;
    }
    if (mode === "emergency") {
      try {
        if (typeof message.text !== "string") throw new Error("Emergency output is unavailable.");
        const picked = await dialog.showSaveDialog(window, {
          title: "Save emergency bilingual output",
          defaultPath: "loopcat-emergency.txt"
        });
        if (picked.canceled || !picked.filePath) {
          window.webContents.send("loopcat:prepare-close", { id: randomUUID(), mode: "resume" });
          return;
        }
        const bytes = Buffer.from(message.text, "utf8");
        const suffix = randomUUID();
        const temporary = `${picked.filePath}.${suffix}.pending`;
        const file = await fs.open(temporary, "wx", 0o600);
        try {
          await file.writeFile(bytes);
          await file.sync();
        } finally {
          await file.close();
        }
        const readback = await fs.readFile(temporary);
        if (createHash("sha256").update(bytes).digest("hex") !== createHash("sha256").update(readback).digest("hex"))
          throw new Error("Emergency export verification failed.");
        try {
          await fs.copyFile(picked.filePath, `${picked.filePath}.${suffix}.previous`);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        await fs.rename(temporary, picked.filePath);
        await dialog.showMessageBox(window, {
          type: "info",
          message: "Emergency export verified. The editor remains open."
        });
        window.webContents.send("loopcat:prepare-close", { id: randomUUID(), mode: "resume" });
      } catch {
        await failed();
      }
      return;
    }
    permitted = true;
    window.close();
  };
  ipcMain.on("loopcat:close-ready", complete);
  window.on("close", (event) => {
    if (permitted) return;
    event.preventDefault();
    request("flush");
  });
  window.on("closed", () => {
    if (pending) clearTimeout(pending.timer);
    ipcMain.removeListener("loopcat:close-ready", complete);
  });
}
module.exports = { attachPersistenceClose };
