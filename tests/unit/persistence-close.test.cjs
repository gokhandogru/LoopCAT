const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { attachPersistenceClose } = require("../../desktop/persistence-close.cjs");

test("R11 desktop close waits for an authenticated persistence acknowledgement and failed Retry stays open", async () => {
  const ipcMain = new EventEmitter();
  const window = new EventEmitter();
  const sent = [];
  let closed = 0;
  let choice = 3;
  window.webContents = { send: (_name, request) => sent.push(request) };
  window.isDestroyed = () => false;
  window.close = () => {
    let prevented = false;
    window.emit("close", {
      preventDefault() {
        prevented = true;
      }
    });
    if (!prevented) closed++;
  };
  attachPersistenceClose(window, {
    ipcMain,
    isAllowedRequest: (event) => event.allowed,
    dialog: { showMessageBox: () => Promise.resolve({ response: choice }) }
  });
  window.close();
  assert.equal(closed, 0);
  ipcMain.emit("loopcat:close-ready", { sender: {}, allowed: true }, { id: sent[0].id, ok: true });
  assert.equal(closed, 0);
  ipcMain.emit("loopcat:close-ready", { sender: window.webContents, allowed: true }, { id: sent[0].id, ok: false });
  await new Promise(setImmediate);
  assert.equal(closed, 0);
  choice = 0;
  window.close();
  ipcMain.emit("loopcat:close-ready", { sender: window.webContents, allowed: true }, { id: sent.at(-1).id, ok: false });
  await new Promise(setImmediate);
  assert.equal(sent.filter((message) => message.mode === "flush").length, 3);
  ipcMain.emit("loopcat:close-ready", { sender: window.webContents, allowed: true }, { id: sent.at(-1).id, ok: true });
  assert.equal(closed, 1);
  window.emit("closed");
});
