const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-update-controls-controller.js")).href);
}

function createButton(name, calls, addError = null) {
  let listener = null;
  return {
    addEventListener(type, nextListener) {
      calls.push([name, "addEventListener", type, nextListener]);
      if (addError) throw addError;
      listener = nextListener;
    },
    click(event = {}) {
      return listener?.(event);
    },
    removeEventListener(type, nextListener) {
      calls.push([name, "removeEventListener", type, nextListener === listener]);
      if (nextListener === listener) listener = null;
    }
  };
}

function createHarness(createApplicationUpdateControlsController, overrides = {}) {
  const calls = [];
  let updateController = overrides.updateController || null;
  const actions = {
    activate() {
      calls.push(["activateBoundary"]);
      if (overrides.activateError) throw overrides.activateError;
      return updateController?.activate?.();
    },
    defer() {
      calls.push(["deferBoundary"]);
      if (overrides.deferError) throw overrides.deferError;
      return updateController?.defer?.();
    }
  };
  const elements = {
    reloadButton: overrides.noReload ? null : createButton("reload", calls, overrides.reloadAddError),
    deferButton: overrides.noDefer ? null : createButton("defer", calls, overrides.deferAddError)
  };
  return {
    actions,
    calls,
    controller: createApplicationUpdateControlsController({ elements, actions }),
    elements,
    setUpdateController(nextController) {
      updateController = nextController;
    }
  };
}

test("ApplicationUpdateControlsController owns exact mount, unmount, identity, and immutable lifecycle", async () => {
  const { createApplicationUpdateControlsController } = await loadFactory();
  const harness = createHarness(createApplicationUpdateControlsController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.equal(harness.calls.length, 2);
  const reloadListener = harness.calls[0][3];
  const deferListener = harness.calls[1][3];
  assert.deepEqual(
    harness.calls.slice(0, 2).map((call) => call.slice(0, 3)),
    [
      ["reload", "addEventListener", "click"],
      ["defer", "addEventListener", "click"]
    ]
  );
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(harness.calls.slice(2), [
    ["reload", "removeEventListener", "click", true],
    ["defer", "removeEventListener", "click", true]
  ]);
  assert.equal(typeof reloadListener, "function");
  assert.equal(typeof deferListener, "function");
});

test("ApplicationUpdateControlsController preserves pre-controller no-ops and late controller replacement", async () => {
  const { createApplicationUpdateControlsController } = await loadFactory();
  const harness = createHarness(createApplicationUpdateControlsController);
  harness.controller.mount();
  harness.calls.length = 0;

  assert.equal(harness.elements.reloadButton.click(), undefined);
  assert.equal(harness.elements.deferButton.click(), undefined);
  assert.deepEqual(harness.calls, [["activateBoundary"], ["deferBoundary"]]);

  const firstResult = { first: true };
  harness.setUpdateController({
    activate: () => {
      harness.calls.push(["firstActivate"]);
      return firstResult;
    },
    defer: () => {
      harness.calls.push(["firstDefer"]);
      return firstResult;
    }
  });
  assert.equal(harness.elements.reloadButton.click(), undefined);
  assert.equal(harness.elements.deferButton.click(), firstResult);

  const secondResult = { second: true };
  harness.setUpdateController({
    activate: () => secondResult,
    defer: () => secondResult
  });
  assert.equal(harness.elements.reloadButton.click(), undefined);
  assert.equal(harness.elements.deferButton.click(), secondResult);
});

test("ApplicationUpdateControlsController independently skips absent optional buttons", async () => {
  const { createApplicationUpdateControlsController } = await loadFactory();
  for (const absent of ["noReload", "noDefer"]) {
    const harness = createHarness(createApplicationUpdateControlsController, { [absent]: true });
    assert.equal(harness.controller.mount(), true);
    assert.equal(harness.calls.filter(([, operation]) => operation === "addEventListener").length, 1);
    assert.equal(harness.controller.unmount(), true);
    assert.equal(harness.calls.filter(([, operation]) => operation === "removeEventListener").length, 1);
  }
});

test("ApplicationUpdateControlsController preserves action and listener failure timing", async () => {
  const { createApplicationUpdateControlsController } = await loadFactory();
  for (const [button, overrides, error] of [
    ["reloadButton", { activateError: new Error("activate failed") }, /activate failed/],
    ["deferButton", { deferError: new Error("defer failed") }, /defer failed/]
  ]) {
    const harness = createHarness(createApplicationUpdateControlsController, overrides);
    harness.controller.mount();
    assert.throws(() => harness.elements[button].click(), error);
  }

  const listenerError = new Error("defer listener failed");
  const listenerHarness = createHarness(createApplicationUpdateControlsController, {
    deferAddError: listenerError
  });
  assert.throws(() => listenerHarness.controller.mount(), listenerError);
  assert.deepEqual(
    listenerHarness.calls.slice(0, 2).map((call) => call.slice(0, 3)),
    [
      ["reload", "addEventListener", "click"],
      ["defer", "addEventListener", "click"]
    ]
  );
});

test("ApplicationUpdateControlsController validates actions and present optional elements", async () => {
  const { createApplicationUpdateControlsController } = await loadFactory();
  const valid = createHarness(createApplicationUpdateControlsController);
  for (const action of ["activate", "defer"]) {
    assert.throws(
      () =>
        createApplicationUpdateControlsController({
          elements: valid.elements,
          actions: { ...valid.actions, [action]: null }
        }),
      /ApplicationUpdateControlsController requires activate and defer actions\./
    );
  }
  for (const element of ["reloadButton", "deferButton"]) {
    assert.throws(
      () =>
        createApplicationUpdateControlsController({
          elements: { ...valid.elements, [element]: {} },
          actions: valid.actions
        }),
      /ApplicationUpdateControlsController requires checked optional button elements\./
    );
  }
});
