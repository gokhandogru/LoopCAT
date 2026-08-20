const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/global-keyboard-controller.js")).href);
}

function fakeTarget(calls) {
  let listener = null;
  return {
    addEventListener(type, nextListener, capture) {
      calls.push(["addEventListener", type, capture]);
      listener = nextListener;
    },
    removeEventListener(type, nextListener, capture) {
      calls.push(["removeEventListener", type, capture, nextListener === listener]);
      if (nextListener === listener) listener = null;
    },
    dispatch(event) {
      listener?.(event);
    }
  };
}

function keyboardEvent(overrides = {}) {
  const effects = [];
  return {
    altKey: false,
    code: "",
    ctrlKey: false,
    key: "",
    metaKey: false,
    shiftKey: false,
    target: {
      matches: () => Boolean(overrides.editable)
    },
    preventDefault: () => effects.push("preventDefault"),
    stopPropagation: () => effects.push("stopPropagation"),
    ...overrides,
    effects
  };
}

function createHarness(createGlobalKeyboardController, overrides = {}) {
  const calls = [];
  const target = fakeTarget(calls);
  let concordanceOpen = Boolean(overrides.concordanceOpen);
  let paletteOpen = Boolean(overrides.paletteOpen);
  let focusActive = Boolean(overrides.focusActive);
  const commandResult = overrides.commandResult || { pending: true };
  const options = {
    target,
    normalizeKey(value) {
      calls.push(["normalizeKey", value]);
      return String(value || "").toLowerCase();
    },
    commands: {
      getProjectId: () => {
        calls.push(["getProjectId"]);
        return overrides.projectId === undefined ? "p1" : overrides.projectId;
      },
      canUndo: (projectId) => {
        calls.push(["canUndo", projectId]);
        return overrides.canUndo !== false;
      },
      canRedo: (projectId) => {
        calls.push(["canRedo", projectId]);
        return overrides.canRedo !== false;
      },
      undo: () => {
        calls.push(["undo"]);
        return commandResult;
      },
      redo: () => {
        calls.push(["redo"]);
        return commandResult;
      }
    },
    context: {
      getView: () => {
        calls.push(["getView"]);
        return overrides.view || "editor";
      },
      hasProject: () => {
        calls.push(["hasProject"]);
        return overrides.hasProject !== false;
      }
    },
    palette: overrides.noPalette
      ? null
      : {
          isOpen: () => {
            calls.push(["paletteIsOpen"]);
            return paletteOpen;
          },
          open: () => {
            calls.push(["paletteOpen"]);
            if (overrides.paletteOpenError) throw overrides.paletteOpenError;
            paletteOpen = true;
          },
          close: () => {
            calls.push(["paletteClose"]);
            paletteOpen = false;
          }
        },
    concordance: {
      isOpen: () => {
        calls.push(["concordanceIsOpen"]);
        return concordanceOpen;
      },
      open: () => {
        calls.push(["concordanceOpen"]);
        if (overrides.concordanceOpenError) throw overrides.concordanceOpenError;
        concordanceOpen = true;
      },
      close: () => {
        calls.push(["concordanceClose"]);
        concordanceOpen = false;
      }
    },
    focus: {
      isActive: () => {
        calls.push(["focusIsActive"]);
        return focusActive;
      },
      toggle: () => {
        calls.push(["focusToggle"]);
        focusActive = !focusActive;
      },
      disable: () => {
        calls.push(["focusDisable"]);
        focusActive = false;
      }
    }
  };
  if (overrides.invalidBoundary === "target") options.target = {};
  if (overrides.invalidBoundary === "commands") options.commands.undo = null;
  if (overrides.invalidBoundary === "context") options.context.getView = null;
  if (overrides.invalidBoundary === "concordance") options.concordance.close = null;
  if (overrides.invalidBoundary === "focus") options.focus.disable = null;

  return {
    calls,
    controller: createGlobalKeyboardController(options),
    getState: () => ({ concordanceOpen, focusActive, paletteOpen }),
    target
  };
}

test("GlobalKeyboardController owns capture listener lifecycle and exposes a checked immutable API", async () => {
  const { createGlobalKeyboardController } = await loadFactory();
  const harness = createHarness(createGlobalKeyboardController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.deepEqual(harness.calls[0], ["addEventListener", "keydown", true]);
  harness.target.dispatch(keyboardEvent({ key: "x" }));
  assert.ok(harness.calls.some(([name, key]) => name === "normalizeKey" && key === "x"));
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "removeEventListener"),
    ["removeEventListener", "keydown", true, true]
  );

  for (const invalidBoundary of ["target", "commands", "context", "concordance", "focus"]) {
    assert.throws(
      () => createHarness(createGlobalKeyboardController, { invalidBoundary }),
      /GlobalKeyboardController requires/
    );
  }
});

test("global Undo and Redo preserve editable exclusion, capability checks, project identity, and event effects", async () => {
  const { createGlobalKeyboardController } = await loadFactory();
  const harness = createHarness(createGlobalKeyboardController, { projectId: "command-project" });
  const undoEvent = keyboardEvent({ ctrlKey: true, key: "Z" });
  assert.equal(harness.controller.handleKeydown(undoEvent), undefined);
  assert.deepEqual(undoEvent.effects, ["preventDefault", "stopPropagation"]);
  assert.ok(harness.calls.some(([name, projectId]) => name === "canUndo" && projectId === "command-project"));
  assert.ok(harness.calls.some(([name]) => name === "undo"));

  const redoEvent = keyboardEvent({ key: "z", metaKey: true, shiftKey: true });
  harness.controller.handleKeydown(redoEvent);
  assert.deepEqual(redoEvent.effects, ["preventDefault", "stopPropagation"]);
  assert.ok(harness.calls.some(([name, projectId]) => name === "canRedo" && projectId === "command-project"));
  assert.ok(harness.calls.some(([name]) => name === "redo"));

  const editable = createHarness(createGlobalKeyboardController);
  const editableEvent = keyboardEvent({ ctrlKey: true, editable: true, key: "z" });
  editable.controller.handleKeydown(editableEvent);
  assert.deepEqual(editableEvent.effects, []);
  assert.equal(
    editable.calls.some(([name]) => name === "getProjectId"),
    false
  );

  const unavailable = createHarness(createGlobalKeyboardController, { canUndo: false });
  const unavailableEvent = keyboardEvent({ ctrlKey: true, key: "z" });
  unavailable.controller.handleKeydown(unavailableEvent);
  assert.deepEqual(unavailableEvent.effects, []);
  assert.equal(
    unavailable.calls.some(([name]) => name === "undo"),
    false
  );
});

test("palette shortcuts preserve modifier overlap, KeyK fallback, optional startup behavior, and event order", async () => {
  const { createGlobalKeyboardController } = await loadFactory();
  for (const event of [
    keyboardEvent({ ctrlKey: true, key: "P", shiftKey: true }),
    keyboardEvent({ key: "k", metaKey: true }),
    keyboardEvent({ code: "KeyK", ctrlKey: true, key: "Unidentified", shiftKey: true })
  ]) {
    const harness = createHarness(createGlobalKeyboardController);
    harness.controller.handleKeydown(event);
    assert.deepEqual(event.effects, ["preventDefault", "stopPropagation"]);
    assert.equal(harness.calls.filter(([name]) => name === "paletteOpen").length, 1);
    assert.equal(
      harness.calls.some(([name]) => name === "concordanceOpen"),
      false
    );
  }

  const optional = createHarness(createGlobalKeyboardController, { noPalette: true });
  const optionalEvent = keyboardEvent({ ctrlKey: true, key: "k" });
  optional.controller.handleKeydown(optionalEvent);
  assert.deepEqual(optionalEvent.effects, ["preventDefault", "stopPropagation"]);

  const paletteOpenError = new Error("palette unavailable");
  const failing = createHarness(createGlobalKeyboardController, { paletteOpenError });
  const failingEvent = keyboardEvent({ ctrlKey: true, key: "k" });
  assert.throws(() => failing.controller.handleKeydown(failingEvent), paletteOpenError);
  assert.deepEqual(failingEvent.effects, ["preventDefault", "stopPropagation"]);
});

test("Focus-mode shortcut preserves editor and project eligibility", async () => {
  const { createGlobalKeyboardController } = await loadFactory();
  const eligible = createHarness(createGlobalKeyboardController);
  const eligibleEvent = keyboardEvent({ ctrlKey: true, key: "F", shiftKey: true });
  eligible.controller.handleKeydown(eligibleEvent);
  assert.deepEqual(eligibleEvent.effects, ["preventDefault", "stopPropagation"]);
  assert.equal(eligible.getState().focusActive, true);

  for (const overrides of [{ view: "projects" }, { hasProject: false }]) {
    const ineligible = createHarness(createGlobalKeyboardController, overrides);
    const event = keyboardEvent({ ctrlKey: true, key: "f", shiftKey: true });
    ineligible.controller.handleKeydown(event);
    assert.deepEqual(event.effects, []);
    assert.equal(
      ineligible.calls.some(([name]) => name === "focusToggle"),
      false
    );
  }
});

test("concordance shortcut preserves editor qualification, Alt priority, KeyK fallback, and synchronous failures", async () => {
  const { createGlobalKeyboardController } = await loadFactory();
  const eligible = createHarness(createGlobalKeyboardController);
  const eligibleEvent = keyboardEvent({ altKey: true, code: "KeyK", ctrlKey: true, key: "Unidentified" });
  eligible.controller.handleKeydown(eligibleEvent);
  assert.deepEqual(eligibleEvent.effects, ["preventDefault", "stopPropagation"]);
  assert.equal(eligible.getState().concordanceOpen, true);
  assert.equal(
    eligible.calls.some(([name]) => name === "paletteOpen"),
    false
  );

  const ineligible = createHarness(createGlobalKeyboardController, { view: "resources" });
  const ineligibleEvent = keyboardEvent({ altKey: true, key: "k", metaKey: true });
  ineligible.controller.handleKeydown(ineligibleEvent);
  assert.deepEqual(ineligibleEvent.effects, []);

  const concordanceOpenError = new Error("concordance unavailable");
  const failing = createHarness(createGlobalKeyboardController, { concordanceOpenError });
  const failingEvent = keyboardEvent({ altKey: true, ctrlKey: true, key: "k" });
  assert.throws(() => failing.controller.handleKeydown(failingEvent), concordanceOpenError);
  assert.deepEqual(failingEvent.effects, ["preventDefault", "stopPropagation"]);
});

test("Escape preserves concordance, palette, and Focus-mode priority without stopping propagation", async () => {
  const { createGlobalKeyboardController } = await loadFactory();
  const concordance = createHarness(createGlobalKeyboardController, {
    concordanceOpen: true,
    focusActive: true,
    paletteOpen: true
  });
  const concordanceEvent = keyboardEvent({ key: "Escape" });
  concordance.controller.handleKeydown(concordanceEvent);
  assert.deepEqual(concordanceEvent.effects, ["preventDefault"]);
  assert.deepEqual(concordance.getState(), { concordanceOpen: false, focusActive: true, paletteOpen: true });
  assert.equal(
    concordance.calls.some(([name]) => name === "paletteClose"),
    false
  );

  const palette = createHarness(createGlobalKeyboardController, { focusActive: true, paletteOpen: true });
  const paletteEvent = keyboardEvent({ key: "Escape" });
  palette.controller.handleKeydown(paletteEvent);
  assert.deepEqual(paletteEvent.effects, ["preventDefault"]);
  assert.deepEqual(palette.getState(), { concordanceOpen: false, focusActive: true, paletteOpen: false });

  const focus = createHarness(createGlobalKeyboardController, { focusActive: true });
  const focusEvent = keyboardEvent({ key: "Escape" });
  focus.controller.handleKeydown(focusEvent);
  assert.deepEqual(focusEvent.effects, ["preventDefault"]);
  assert.equal(focus.getState().focusActive, false);

  const wrongCase = createHarness(createGlobalKeyboardController, { focusActive: true });
  const wrongCaseEvent = keyboardEvent({ key: "escape" });
  wrongCase.controller.handleKeydown(wrongCaseEvent);
  assert.deepEqual(wrongCaseEvent.effects, []);
  assert.equal(wrongCase.getState().focusActive, true);
});
