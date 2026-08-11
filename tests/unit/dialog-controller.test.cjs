const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeElement() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const values = listeners.get(type) || [];
      values.push(listener);
      listeners.set(type, values);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) || []).filter((value) => value !== listener)
      );
    },
    dispatch(type, event = {}) {
      for (const listener of [...(listeners.get(type) || [])]) listener({ type, target: this, ...event });
    }
  };
}

function fakeDialog() {
  const dialog = fakeElement();
  return Object.assign(dialog, {
    open: false,
    returnValue: "",
    close(returnValue = "") {
      if (!this.open) return;
      this.returnValue = returnValue;
      this.open = false;
      this.dispatch("close");
    }
  });
}

test("DialogController owns open, close, cancel, and explicit focus-return lifecycle", async () => {
  const { createDialogController } = await moduleAt("src/ui/dialog-controller.js");
  const opener = fakeElement();
  const returnTarget = fakeElement();
  const closer = fakeElement();
  const dialog = fakeDialog();
  const calls = [];
  const focusController = {
    showModal(surface, options) {
      surface.open = true;
      calls.push({ type: "show", surface, options });
      return true;
    }
  };
  const controller = createDialogController({ focusController, getActiveElement: () => opener });
  controller.register({
    id: "about",
    dialog,
    opener,
    closer,
    initialFocus: closer,
    returnTarget,
    onCancel: () => calls.push({ type: "cancel" }),
    onClose: () => calls.push({ type: "close" })
  });
  assert.equal(controller.mount(), true);

  opener.dispatch("click");
  await Promise.resolve();
  assert.equal(dialog.open, true);
  assert.equal(controller.isOpen("about"), true);
  assert.equal(calls[0].options.initialFocus, closer);
  assert.equal(calls[0].options.returnTarget, returnTarget);

  dialog.dispatch("cancel");
  assert.equal(
    calls.some((call) => call.type === "cancel"),
    true
  );
  closer.dispatch("click");
  assert.equal(dialog.open, false);
  assert.equal(
    calls.some((call) => call.type === "close"),
    true
  );

  assert.equal(controller.unmount(), true);
  opener.dispatch("click");
  await Promise.resolve();
  assert.equal(dialog.open, false, "unmounted dialog controls must not retain listeners");
});

test("DialogController prepares async feature data once without taking ownership of it", async () => {
  const { createDialogController } = await moduleAt("src/ui/dialog-controller.js");
  const dialog = fakeDialog();
  let prepared = 0;
  let refreshed = 0;
  let finishPreparation;
  const focusController = {
    showModal(surface) {
      surface.open = true;
      return true;
    }
  };
  const controller = createDialogController({ focusController });
  controller.register({
    id: "trash",
    dialog,
    beforeOpen: () =>
      new Promise((resolve) => {
        prepared += 1;
        finishPreparation = resolve;
      }),
    afterOpen: () => {
      refreshed += 1;
    }
  });

  const firstOpen = controller.open("trash");
  const secondOpen = controller.open("trash");
  await Promise.resolve();
  assert.equal(prepared, 1, "concurrent requests must share one feature preparation boundary");
  finishPreparation();
  assert.equal(await firstOpen, true);
  assert.equal(await secondOpen, true);
  assert.equal(refreshed, 1);
  assert.equal(controller.close("trash", "done"), true);
  assert.equal(dialog.returnValue, "done");
});

test("DialogController reports opener failures without leaving a partially open dialog", async () => {
  const { createDialogController } = await moduleAt("src/ui/dialog-controller.js");
  const opener = fakeElement();
  const dialog = fakeDialog();
  const errors = [];
  const controller = createDialogController({
    focusController: { showModal: () => true },
    onError: (error, context) => errors.push({ message: error.message, ...context })
  });
  controller.register({
    id: "diagnostics",
    dialog,
    opener,
    beforeOpen: () => Promise.reject(new Error("diagnostics preparation failed"))
  });
  controller.mount();

  opener.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(dialog.open, false);
  assert.deepEqual(errors, [{ message: "diagnostics preparation failed", id: "diagnostics", phase: "open" }]);
});
