const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeElement(properties = {}) {
  const listeners = new Map();
  const classes = new Set(properties.classes || []);
  return Object.assign(
    {
      value: "",
      open: false,
      returnValue: "",
      classList: {
        toggle(name, force) {
          if (force) classes.add(name);
          else classes.delete(name);
        },
        contains: (name) => classes.has(name)
      },
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
    },
    properties
  );
}

function fakeDialogLifecycle() {
  const definitions = new Map();
  const openCalls = [];
  const closeCalls = [];
  return {
    definitions,
    openCalls,
    closeCalls,
    register(definition) {
      definitions.set(definition.id, definition);
      return definition.id;
    },
    async open(id, options) {
      const definition = definitions.get(id);
      openCalls.push({ id, options });
      await definition.beforeOpen?.();
      definition.dialog.open = true;
      await definition.afterOpen?.();
      return true;
    },
    close(id, returnValue = "") {
      const definition = definitions.get(id);
      closeCalls.push({ id, returnValue });
      if (!definition.dialog.open) return false;
      definition.dialog.returnValue = returnValue;
      definition.dialog.open = false;
      definition.onClose?.();
      return true;
    }
  };
}

test("TM pretranslation dialog controller resolves apply and cancel intent through the shared lifecycle", async () => {
  const { createTmPretranslationDialogController } = await moduleAt(
    "src/features/resources/tm-pretranslation-dialog-controller.js"
  );
  const dialogLifecycle = fakeDialogLifecycle();
  const dialog = fakeElement();
  const thresholdInput = fakeElement({
    value: "12",
    focus() {
      this.focused = true;
    },
    select() {
      this.selected = true;
    }
  });
  const returnTarget = fakeElement();
  const controller = createTmPretranslationDialogController({
    dialogLifecycle,
    elements: { dialog, thresholdInput },
    defaultThreshold: 85,
    scheduleFrame: (callback) => callback()
  });

  const firstRequest = controller.request({ returnTarget });
  const duplicateRequest = controller.request({ returnTarget: fakeElement() });
  assert.equal(firstRequest, duplicateRequest, "one open dialog must represent one threshold decision");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(dialog.open, true);
  assert.equal(thresholdInput.value, "85");
  assert.equal(thresholdInput.focused, true);
  assert.equal(thresholdInput.selected, true);
  assert.deepEqual(dialogLifecycle.openCalls, [{ id: "tm-pretranslation", options: { returnTarget } }]);

  thresholdInput.value = "80";
  dialogLifecycle.close("tm-pretranslation", "apply");
  assert.equal(await firstRequest, "80");

  const canceled = controller.request({ returnTarget });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(controller.cancel(), true);
  assert.equal(await canceled, null);
});

test("TM pretranslation dialog controller settles safely and reports an open failure", async () => {
  const { createTmPretranslationDialogController } = await moduleAt(
    "src/features/resources/tm-pretranslation-dialog-controller.js"
  );
  const errors = [];
  const dialog = fakeElement();
  const definition = {};
  const controller = createTmPretranslationDialogController({
    dialogLifecycle: {
      register(value) {
        Object.assign(definition, value);
        return value.id;
      },
      open: () => Promise.reject(new Error("dialog unavailable")),
      close: () => false
    },
    elements: { dialog, thresholdInput: fakeElement() },
    onError: (error, context) => errors.push({ message: error.message, ...context })
  });

  assert.equal(await controller.request(), null);
  assert.deepEqual(errors, [{ message: "dialog unavailable", phase: "open" }]);
  assert.equal(definition.id, "tm-pretranslation");
});

test("OPUS-CAT help controller owns visibility, dialog registration, retry, and listener cleanup", async () => {
  const { createOpusCatHelpController } = await moduleAt("src/features/ai/opus-cat-help-controller.js");
  const dialogLifecycle = fakeDialogLifecycle();
  const dialog = fakeElement();
  const opener = fakeElement({ classes: ["hidden"] });
  const closer = fakeElement();
  const retryButton = fakeElement();
  const returnTarget = fakeElement();
  let retries = 0;
  const controller = createOpusCatHelpController({
    dialogLifecycle,
    elements: { dialog, opener, closer, retryButton },
    retryConnection: () => {
      retries += 1;
      return Promise.resolve();
    }
  });

  const definition = dialogLifecycle.definitions.get("opus-cat-help");
  assert.equal(definition.opener, opener);
  assert.equal(definition.closer, closer);
  assert.equal(definition.initialFocus, closer);
  assert.equal(controller.mount(), true);
  assert.equal(await controller.open({ returnTarget }), true);
  assert.equal(controller.isVisible(), true);
  assert.deepEqual(dialogLifecycle.openCalls[0], {
    id: "opus-cat-help",
    options: { returnTarget }
  });

  retryButton.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(dialog.open, false);
  assert.equal(retries, 1);
  assert.deepEqual(dialogLifecycle.closeCalls[0], { id: "opus-cat-help", returnValue: "retry" });

  controller.setVisible(false);
  assert.equal(controller.isVisible(), false);
  assert.equal(controller.unmount(), true);
  retryButton.dispatch("click");
  await Promise.resolve();
  assert.equal(retries, 1, "unmounted OPUS-CAT help must not retain its retry listener");
});
