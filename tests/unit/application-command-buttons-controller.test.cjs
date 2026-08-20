const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-command-buttons-controller.js")).href);
}

function createButton(name, calls, addError = null) {
  let listener = null;
  return {
    addEventListener(type, nextListener) {
      calls.push([name, "addEventListener", type, nextListener]);
      if (addError) throw addError;
      listener = nextListener;
    },
    click(event) {
      return listener?.(event);
    },
    removeEventListener(type, nextListener) {
      calls.push([name, "removeEventListener", type, nextListener === listener]);
      if (nextListener === listener) listener = null;
    }
  };
}

function createHarness(createApplicationCommandButtonsController, overrides = {}) {
  const calls = [];
  const event = { type: "click" };
  const results = {
    emptyTrash: overrides.emptyTrashResult || Promise.resolve("empty"),
    undo: overrides.undoResult || Promise.resolve("undo"),
    redo: overrides.redoResult || Promise.resolve("redo")
  };
  const actions = {
    emptyTrash(receivedEvent) {
      calls.push(["emptyTrash", receivedEvent]);
      if (overrides.emptyTrashError) throw overrides.emptyTrashError;
      return results.emptyTrash;
    },
    undo(receivedEvent) {
      calls.push(["undo", receivedEvent]);
      if (overrides.undoError) throw overrides.undoError;
      return results.undo;
    },
    redo(receivedEvent) {
      calls.push(["redo", receivedEvent]);
      if (overrides.redoError) throw overrides.redoError;
      return results.redo;
    }
  };
  const elements = {
    emptyTrashButton: overrides.noEmptyTrash
      ? null
      : createButton("emptyTrashButton", calls, overrides.emptyTrashAddError),
    undoButton: overrides.noUndo ? null : createButton("undoButton", calls, overrides.undoAddError),
    redoButton: overrides.noRedo ? null : createButton("redoButton", calls, overrides.redoAddError)
  };
  return {
    actions,
    calls,
    controller: createApplicationCommandButtonsController({ elements, actions }),
    elements,
    event,
    results
  };
}

test("ApplicationCommandButtonsController owns exact mount, unmount, identity, and immutable lifecycle", async () => {
  const { createApplicationCommandButtonsController } = await loadFactory();
  const harness = createHarness(createApplicationCommandButtonsController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.deepEqual(harness.calls, [
    ["emptyTrashButton", "addEventListener", "click", harness.actions.emptyTrash],
    ["undoButton", "addEventListener", "click", harness.actions.undo],
    ["redoButton", "addEventListener", "click", harness.actions.redo]
  ]);
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(harness.calls.slice(3), [
    ["emptyTrashButton", "removeEventListener", "click", true],
    ["undoButton", "removeEventListener", "click", true],
    ["redoButton", "removeEventListener", "click", true]
  ]);
});

test("ApplicationCommandButtonsController preserves event and promise passthrough for every action", async () => {
  const { createApplicationCommandButtonsController } = await loadFactory();
  const harness = createHarness(createApplicationCommandButtonsController);
  harness.controller.mount();
  harness.calls.length = 0;

  assert.equal(harness.elements.emptyTrashButton.click(harness.event), harness.results.emptyTrash);
  assert.equal(harness.elements.undoButton.click(harness.event), harness.results.undo);
  assert.equal(harness.elements.redoButton.click(harness.event), harness.results.redo);
  assert.deepEqual(harness.calls, [
    ["emptyTrash", harness.event],
    ["undo", harness.event],
    ["redo", harness.event]
  ]);
});

test("ApplicationCommandButtonsController independently skips each absent optional button", async () => {
  const { createApplicationCommandButtonsController } = await loadFactory();
  for (const absent of ["noEmptyTrash", "noUndo", "noRedo"]) {
    const harness = createHarness(createApplicationCommandButtonsController, { [absent]: true });
    assert.equal(harness.controller.mount(), true);
    assert.equal(harness.calls.filter(([, operation]) => operation === "addEventListener").length, 2);
    assert.equal(harness.controller.unmount(), true);
    assert.equal(harness.calls.filter(([, operation]) => operation === "removeEventListener").length, 2);
  }
});

test("ApplicationCommandButtonsController preserves action and listener failure timing", async () => {
  const { createApplicationCommandButtonsController } = await loadFactory();
  const actionError = new Error("undo failed");
  const actionHarness = createHarness(createApplicationCommandButtonsController, { undoError: actionError });
  actionHarness.controller.mount();
  assert.throws(() => actionHarness.elements.undoButton.click(actionHarness.event), actionError);
  assert.deepEqual(actionHarness.calls.at(-1), ["undo", actionHarness.event]);

  const listenerError = new Error("redo listener failed");
  const listenerHarness = createHarness(createApplicationCommandButtonsController, {
    redoAddError: listenerError
  });
  assert.throws(() => listenerHarness.controller.mount(), listenerError);
  assert.deepEqual(
    listenerHarness.calls.map(([name, operation, type]) => [name, operation, type]),
    [
      ["emptyTrashButton", "addEventListener", "click"],
      ["undoButton", "addEventListener", "click"],
      ["redoButton", "addEventListener", "click"]
    ]
  );
});

test("ApplicationCommandButtonsController validates actions and present optional elements", async () => {
  const { createApplicationCommandButtonsController } = await loadFactory();
  const valid = createHarness(createApplicationCommandButtonsController);

  for (const action of ["emptyTrash", "undo", "redo"]) {
    assert.throws(
      () =>
        createApplicationCommandButtonsController({
          elements: valid.elements,
          actions: { ...valid.actions, [action]: null }
        }),
      /ApplicationCommandButtonsController requires Empty Trash, Undo, and Redo actions\./
    );
  }
  for (const element of ["emptyTrashButton", "undoButton", "redoButton"]) {
    assert.throws(
      () =>
        createApplicationCommandButtonsController({
          elements: { ...valid.elements, [element]: {} },
          actions: valid.actions
        }),
      /ApplicationCommandButtonsController requires checked optional button elements\./
    );
  }
});
