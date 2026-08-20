const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/palette/palette-controller.js")).href);
}

function createEventTarget(calls, name, { addError = null, removeError = null } = {}) {
  let listener = null;
  return {
    addEventListener(type, nextListener) {
      calls.push([name, "addEventListener", type, nextListener]);
      if (addError) throw addError;
      listener = nextListener;
    },
    dispatch(event = {}) {
      return listener?.(event);
    },
    removeEventListener(type, nextListener) {
      calls.push([name, "removeEventListener", type, nextListener === listener]);
      if (removeError) throw removeError;
      if (nextListener === listener) listener = null;
    }
  };
}

function createHarness(createPaletteController, overrides = {}) {
  const calls = [];
  let hidden = overrides.open !== true;
  const triggerButton = overrides.noTrigger
    ? null
    : createEventTarget(calls, "trigger", {
        addError: overrides.addError,
        removeError: overrides.removeError
      });
  const overlayEvents = createEventTarget(calls, "overlay");
  const overlay = {
    ...overlayEvents,
    classList: {
      add(name) {
        calls.push(["overlay.classList", "add", name]);
        hidden = true;
      },
      contains(name) {
        calls.push(["overlay.classList", "contains", name]);
        return name === "hidden" && hidden;
      },
      remove(name) {
        calls.push(["overlay.classList", "remove", name]);
        hidden = false;
      }
    },
    setAttribute(name, value) {
      calls.push(["overlay", "setAttribute", name, value]);
    }
  };
  const inputEvents = createEventTarget(calls, "input");
  const input = {
    ...inputEvents,
    value: "stale query",
    focus() {
      calls.push(["input", "focus"]);
    },
    removeAttribute(name) {
      calls.push(["input", "removeAttribute", name]);
    },
    setAttribute(name, value) {
      calls.push(["input", "setAttribute", name, value]);
    }
  };
  const results = {
    querySelectorAll(selector) {
      calls.push(["results", "querySelectorAll", selector]);
      return [];
    },
    replaceChildren(...children) {
      calls.push(["results", "replaceChildren", children]);
    }
  };
  const appShell = {
    removeAttribute(name) {
      calls.push(["appShell", "removeAttribute", name]);
    },
    setAttribute(name, value) {
      calls.push(["appShell", "setAttribute", name, value]);
    }
  };
  const returnTarget = { id: "return-target" };
  const documentStub = {
    activeElement: returnTarget,
    createElement(tagName) {
      calls.push(["document", "createElement", tagName]);
      return {
        setAttribute(name, value) {
          calls.push(["empty", "setAttribute", name, value]);
        }
      };
    }
  };
  const focusController = overrides.noFocusController
    ? null
    : {
        open(...args) {
          calls.push(["focusController", "open", args]);
        }
      };
  const controller = createPaletteController({
    overlay,
    input,
    results,
    closeButton: null,
    triggerButton,
    appShell,
    getCommands() {
      calls.push(["getCommands"]);
      if (overrides.commandError) throw overrides.commandError;
      return [];
    },
    focusController
  });
  return { calls, controller, documentStub, input, overlay, returnTarget, triggerButton };
}

test("PaletteController trigger opens through the existing palette behavior and ignores the native event", async () => {
  const { createPaletteController } = await loadFactory();
  const harness = createHarness(createPaletteController);
  const previousDocument = global.document;
  global.document = harness.documentStub;
  try {
    harness.controller.mountTrigger();
    harness.calls.length = 0;
    const nativeEvent = new Proxy(
      {},
      {
        get() {
          throw new Error("native event was inspected");
        }
      }
    );

    assert.equal(harness.triggerButton.dispatch(nativeEvent), undefined);
    assert.equal(harness.input.value, "");
    assert.equal(
      harness.calls.some(
        ([owner, operation, name, value]) =>
          owner === "overlay" && operation === "setAttribute" && name === "aria-hidden" && value === "false"
      ),
      true
    );
    assert.equal(
      harness.calls.some(
        ([owner, operation, name, value]) =>
          owner === "input" && operation === "setAttribute" && name === "aria-expanded" && value === "true"
      ),
      true
    );
    const focusCall = harness.calls.find(([owner, operation]) => owner === "focusController" && operation === "open");
    assert.deepEqual(focusCall[2], [
      harness.overlay,
      { initialFocus: harness.input, returnTarget: harness.returnTarget }
    ]);
  } finally {
    global.document = previousDocument;
  }
});

test("PaletteController trigger preserves the already-open no-op branch", async () => {
  const { createPaletteController } = await loadFactory();
  const harness = createHarness(createPaletteController, { open: true });
  harness.controller.mountTrigger();
  harness.calls.length = 0;

  assert.equal(harness.triggerButton.dispatch({ type: "click" }), undefined);
  assert.deepEqual(harness.calls, [["overlay.classList", "contains", "hidden"]]);
});

test("PaletteController owns exact idempotent trigger listener lifecycle independently of initialization", async () => {
  const { createPaletteController } = await loadFactory();
  const harness = createHarness(createPaletteController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mountTrigger(), true);
  assert.equal(harness.controller.mountTrigger(), false);
  assert.deepEqual(
    harness.calls.map((call) => call.slice(0, 3)),
    [["trigger", "addEventListener", "click"]]
  );
  assert.equal(harness.controller.unmountTrigger(), true);
  assert.equal(harness.controller.unmountTrigger(), false);
  assert.deepEqual(harness.calls.slice(1), [["trigger", "removeEventListener", "click", true]]);
});

test("PaletteController independently skips an absent optional trigger", async () => {
  const { createPaletteController } = await loadFactory();
  const harness = createHarness(createPaletteController, { noTrigger: true });

  assert.equal(harness.controller.mountTrigger(), true);
  assert.equal(harness.controller.mountTrigger(), false);
  assert.equal(harness.controller.unmountTrigger(), true);
  assert.equal(harness.controller.unmountTrigger(), false);
  assert.deepEqual(harness.calls, []);
});

test("PaletteController trigger preserves listener and synchronous open failure timing", async () => {
  const { createPaletteController } = await loadFactory();
  const addHarness = createHarness(createPaletteController, { addError: new Error("add failed") });
  assert.throws(() => addHarness.controller.mountTrigger(), /add failed/);
  assert.throws(() => addHarness.controller.mountTrigger(), /add failed/);

  const removeHarness = createHarness(createPaletteController, { removeError: new Error("remove failed") });
  removeHarness.controller.mountTrigger();
  assert.throws(() => removeHarness.controller.unmountTrigger(), /remove failed/);
  assert.throws(() => removeHarness.controller.unmountTrigger(), /remove failed/);

  const openHarness = createHarness(createPaletteController, { commandError: new Error("commands failed") });
  const previousDocument = global.document;
  global.document = openHarness.documentStub;
  try {
    openHarness.controller.mountTrigger();
    assert.throws(() => openHarness.triggerButton.dispatch(), /commands failed/);
    assert.equal(
      openHarness.calls.some(([owner, operation]) => owner === "overlay.classList" && operation === "remove"),
      false
    );
  } finally {
    global.document = previousDocument;
  }
});

test("PaletteController validates the checked optional trigger boundary", async () => {
  const { createPaletteController } = await loadFactory();
  const valid = createHarness(createPaletteController);
  for (const missing of ["addEventListener", "removeEventListener"]) {
    assert.throws(
      () =>
        createPaletteController({
          overlay: valid.overlay,
          input: valid.input,
          results: {
            querySelectorAll() {
              return [];
            },
            replaceChildren() {}
          },
          triggerButton: { ...valid.triggerButton, [missing]: null },
          getCommands: () => []
        }),
      /PaletteController requires a checked optional trigger button\./
    );
  }
});
