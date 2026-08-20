const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/segment-action-buttons-controller.js")).href);
}

function createButton(calls, name, options = {}) {
  let listener = null;
  const button = {
    addEventListener(type, nextListener) {
      calls.push([name, "addEventListener", type, nextListener]);
      if (options.addError) throw options.addError;
      listener = nextListener;
    },
    click(event) {
      return listener?.call(button, event);
    },
    removeEventListener(type, nextListener) {
      calls.push([name, "removeEventListener", type, nextListener === listener]);
      if (options.removeError) throw options.removeError;
      if (nextListener === listener) listener = null;
    }
  };
  return button;
}

function createHarness(createSegmentActionButtonsController, overrides = {}) {
  const calls = [];
  const saveTmButton = createButton(calls, "saveTm", {
    addError: overrides.saveAddError,
    removeError: overrides.saveRemoveError
  });
  const nextOpenButton = createButton(calls, "nextOpen", {
    addError: overrides.nextAddError,
    removeError: overrides.nextRemoveError
  });
  const saveResult = overrides.saveResult || Promise.resolve({ saved: true });
  const nextResult = overrides.nextResult || Promise.resolve({ selected: true });
  const actions = {
    saveToTm(...args) {
      calls.push(["action", "saveToTm", args, this]);
      if (overrides.saveError) throw overrides.saveError;
      return saveResult;
    },
    nextOpen(...args) {
      calls.push(["action", "nextOpen", args, this]);
      if (overrides.nextError) throw overrides.nextError;
      return nextResult;
    }
  };
  return {
    actions,
    calls,
    controller: createSegmentActionButtonsController({
      elements: { saveTmButton, nextOpenButton },
      actions
    }),
    nextOpenButton,
    nextResult,
    saveResult,
    saveTmButton
  };
}

test("SegmentActionButtonsController owns exact ordered listener lifecycle and immutable API", async () => {
  const { createSegmentActionButtonsController } = await loadFactory();
  const harness = createHarness(createSegmentActionButtonsController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(
    harness.calls.map((call) => call.slice(0, 4)),
    [
      ["saveTm", "addEventListener", "click", harness.actions.saveToTm],
      ["nextOpen", "addEventListener", "click", harness.actions.nextOpen],
      ["saveTm", "removeEventListener", "click", true],
      ["nextOpen", "removeEventListener", "click", true]
    ]
  );
});

test("SegmentActionButtonsController preserves browser event, receiver, and result passthrough", async () => {
  const { createSegmentActionButtonsController } = await loadFactory();
  const harness = createHarness(createSegmentActionButtonsController);
  harness.controller.mount();
  harness.calls.length = 0;
  const saveEvent = { type: "click", action: "save" };
  const nextEvent = { type: "click", action: "next" };

  assert.equal(harness.saveTmButton.click(saveEvent), harness.saveResult);
  assert.equal(harness.nextOpenButton.click(nextEvent), harness.nextResult);
  assert.deepEqual(harness.calls, [
    ["action", "saveToTm", [saveEvent], harness.saveTmButton],
    ["action", "nextOpen", [nextEvent], harness.nextOpenButton]
  ]);
});

test("SegmentActionButtonsController preserves promise fulfillment and rejection identity", async () => {
  const { createSegmentActionButtonsController } = await loadFactory();
  const rejection = Promise.reject(new Error("next rejected"));
  rejection.catch(() => {});
  const harness = createHarness(createSegmentActionButtonsController, {
    saveResult: Promise.resolve("saved"),
    nextResult: rejection
  });
  harness.controller.mount();

  assert.equal(await harness.saveTmButton.click(), "saved");
  assert.equal(harness.nextOpenButton.click(), rejection);
  await assert.rejects(rejection, /next rejected/);
});

test("SegmentActionButtonsController preserves action and listener failure timing", async () => {
  const { createSegmentActionButtonsController } = await loadFactory();
  const saveAction = createHarness(createSegmentActionButtonsController, {
    saveError: new Error("save failed")
  });
  saveAction.controller.mount();
  assert.throws(() => saveAction.saveTmButton.click(), /save failed/);

  const nextAction = createHarness(createSegmentActionButtonsController, {
    nextError: new Error("next failed")
  });
  nextAction.controller.mount();
  assert.throws(() => nextAction.nextOpenButton.click(), /next failed/);

  const saveAdd = createHarness(createSegmentActionButtonsController, {
    saveAddError: new Error("save add failed")
  });
  assert.throws(() => saveAdd.controller.mount(), /save add failed/);
  assert.equal(
    saveAdd.calls.some(([owner]) => owner === "nextOpen"),
    false
  );

  const nextAdd = createHarness(createSegmentActionButtonsController, {
    nextAddError: new Error("next add failed")
  });
  assert.throws(() => nextAdd.controller.mount(), /next add failed/);
  assert.deepEqual(
    nextAdd.calls.map((call) => call.slice(0, 3)),
    [
      ["saveTm", "addEventListener", "click"],
      ["nextOpen", "addEventListener", "click"]
    ]
  );

  const saveRemove = createHarness(createSegmentActionButtonsController, {
    saveRemoveError: new Error("save remove failed")
  });
  saveRemove.controller.mount();
  assert.throws(() => saveRemove.controller.unmount(), /save remove failed/);
  assert.equal(
    saveRemove.calls.some(([owner, operation]) => owner === "nextOpen" && operation === "removeEventListener"),
    false
  );
});

test("SegmentActionButtonsController validates required elements and actions", async () => {
  const { createSegmentActionButtonsController } = await loadFactory();
  const valid = createHarness(createSegmentActionButtonsController);
  for (const [elementName, message] of [
    ["saveTmButton", /requires a checked Save to TM button/],
    ["nextOpenButton", /requires a checked Next open button/]
  ]) {
    for (const missing of ["addEventListener", "removeEventListener"]) {
      assert.throws(
        () =>
          createSegmentActionButtonsController({
            elements: {
              saveTmButton: valid.saveTmButton,
              nextOpenButton: valid.nextOpenButton,
              [elementName]: { ...valid[elementName], [missing]: null }
            },
            actions: valid.actions
          }),
        message
      );
    }
  }
  for (const missing of ["saveToTm", "nextOpen"]) {
    assert.throws(
      () =>
        createSegmentActionButtonsController({
          elements: {
            saveTmButton: valid.saveTmButton,
            nextOpenButton: valid.nextOpenButton
          },
          actions: { ...valid.actions, [missing]: null }
        }),
      /requires checked segment actions/
    );
  }
});
