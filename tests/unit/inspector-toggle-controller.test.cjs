const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/inspector-toggle-controller.js")).href);
}

function createElement(calls, { addError = null, focusError = null } = {}) {
  let listener = null;
  return {
    addEventListener(type, nextListener) {
      calls.push(["element", "addEventListener", type, nextListener]);
      if (addError) throw addError;
      listener = nextListener;
    },
    click(event = {}) {
      return listener?.(event);
    },
    focus() {
      calls.push(["element", "focus"]);
      if (focusError) throw focusError;
    },
    removeEventListener(type, nextListener) {
      calls.push(["element", "removeEventListener", type, nextListener === listener]);
      if (nextListener === listener) listener = null;
    }
  };
}

function createHarness(createInspectorToggleController, overrides = {}) {
  const calls = [];
  let open = overrides.open === true;
  let frameCallback = null;
  let selected = overrides.noSelected
    ? null
    : {
        focus() {
          calls.push(["selected", "focus"]);
          if (overrides.selectedFocusError) throw overrides.selectedFocusError;
        }
      };
  const element = overrides.noElement
    ? null
    : createElement(calls, { addError: overrides.addError, focusError: overrides.elementFocusError });
  const state = {
    getOpen() {
      calls.push(["getOpen", open]);
      if (overrides.getError) throw overrides.getError;
      return open;
    },
    setOpen(value) {
      calls.push(["setOpen", value]);
      if (overrides.setError) throw overrides.setError;
      open = value;
    }
  };
  const layout = {
    setOpen(value) {
      calls.push(["layout.setOpen", value]);
      if (overrides.layoutError) throw overrides.layoutError;
      if (overrides.layoutState !== undefined) open = overrides.layoutState;
      return overrides.layoutResult;
    }
  };
  const presentation = {
    renderEditor() {
      calls.push(["renderEditor"]);
      if (overrides.renderError) throw overrides.renderError;
      return overrides.renderResult;
    }
  };
  const frame = {
    request(callback) {
      calls.push(["requestFrame", callback]);
      if (overrides.frameError) throw overrides.frameError;
      frameCallback = callback;
      return overrides.frameResult;
    }
  };
  const selection = {
    getSelected() {
      calls.push(["getSelected"]);
      if (overrides.selectionError) throw overrides.selectionError;
      return selected;
    }
  };
  return {
    calls,
    controller: createInspectorToggleController({ element, state, layout, presentation, frame, selection }),
    element,
    frame,
    layout,
    presentation,
    selection,
    setSelected(nextSelected) {
      selected = nextSelected;
    },
    state,
    flushFrame() {
      const callback = frameCallback;
      frameCallback = null;
      return callback?.();
    }
  };
}

test("InspectorToggleController opens with exact state, layout, render, and deferred focus order", async () => {
  const { createInspectorToggleController } = await loadFactory();
  const layoutResult = Promise.resolve({ persisted: true });
  const harness = createHarness(createInspectorToggleController, { layoutResult, frameResult: 91 });
  harness.controller.mount();
  harness.calls.length = 0;

  assert.equal(harness.element.click({ type: "click", marker: "ignored" }), undefined);
  assert.deepEqual(harness.calls, [
    ["getOpen", false],
    ["setOpen", true],
    ["getOpen", true],
    ["layout.setOpen", true],
    ["renderEditor"],
    ["getOpen", true],
    ["requestFrame", harness.calls[6][1]]
  ]);
  assert.equal(
    harness.calls.some(([operation]) => operation === "getSelected"),
    false
  );

  assert.equal(harness.flushFrame(), undefined);
  assert.deepEqual(harness.calls.slice(-2), [["getSelected"], ["selected", "focus"]]);
});

test("InspectorToggleController closes with immediate toggle focus and no animation frame", async () => {
  const { createInspectorToggleController } = await loadFactory();
  const harness = createHarness(createInspectorToggleController, { open: true });
  harness.controller.mount();
  harness.calls.length = 0;

  assert.equal(harness.element.click(), undefined);
  assert.deepEqual(harness.calls, [
    ["getOpen", true],
    ["setOpen", false],
    ["getOpen", false],
    ["layout.setOpen", false],
    ["renderEditor"],
    ["getOpen", false],
    ["element", "focus"]
  ]);
  assert.equal(
    harness.calls.some(([operation]) => operation === "requestFrame"),
    false
  );
});

test("InspectorToggleController preserves live post-layout state branching", async () => {
  const { createInspectorToggleController } = await loadFactory();
  const harness = createHarness(createInspectorToggleController, { layoutState: false });
  harness.controller.mount();
  harness.calls.length = 0;

  harness.element.click();
  assert.deepEqual(harness.calls.slice(0, 4), [
    ["getOpen", false],
    ["setOpen", true],
    ["getOpen", true],
    ["layout.setOpen", true]
  ]);
  assert.deepEqual(harness.calls.slice(-2), [
    ["getOpen", false],
    ["element", "focus"]
  ]);
});

test("InspectorToggleController queries the selected tab at callback time and tolerates its absence", async () => {
  const { createInspectorToggleController } = await loadFactory();
  const harness = createHarness(createInspectorToggleController, { noSelected: true });
  harness.controller.mount();
  harness.element.click();
  const lateSelected = {
    focus() {
      harness.calls.push(["lateSelected", "focus"]);
    }
  };
  harness.setSelected(lateSelected);

  harness.flushFrame();
  assert.deepEqual(harness.calls.slice(-2), [["getSelected"], ["lateSelected", "focus"]]);

  const absent = createHarness(createInspectorToggleController, { noSelected: true });
  absent.controller.mount();
  absent.element.click();
  assert.equal(absent.flushFrame(), undefined);
  assert.deepEqual(absent.calls.slice(-1), [["getSelected"]]);
});

test("InspectorToggleController owns exact idempotent listener lifecycle and immutable API", async () => {
  const { createInspectorToggleController } = await loadFactory();
  const harness = createHarness(createInspectorToggleController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.deepEqual(
    harness.calls.slice(0, 1).map((call) => call.slice(0, 3)),
    [["element", "addEventListener", "click"]]
  );
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(harness.calls.slice(1), [["element", "removeEventListener", "click", true]]);
});

test("InspectorToggleController independently skips an absent optional toggle", async () => {
  const { createInspectorToggleController } = await loadFactory();
  const harness = createHarness(createInspectorToggleController, { noElement: true });

  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(harness.calls, []);
});

test("InspectorToggleController preserves synchronous and deferred failure timing", async () => {
  const { createInspectorToggleController } = await loadFactory();
  for (const [overrides, error, forbidden] of [
    [{ getError: new Error("get failed") }, /get failed/, "setOpen"],
    [{ setError: new Error("set failed") }, /set failed/, "layout.setOpen"],
    [{ layoutError: new Error("layout failed") }, /layout failed/, "renderEditor"],
    [{ renderError: new Error("render failed") }, /render failed/, "requestFrame"],
    [{ frameError: new Error("frame failed") }, /frame failed/, "getSelected"],
    [{ open: true, elementFocusError: new Error("toggle focus failed") }, /toggle focus failed/, "requestFrame"]
  ]) {
    const harness = createHarness(createInspectorToggleController, overrides);
    harness.controller.mount();
    assert.throws(() => harness.element.click(), error);
    assert.equal(
      harness.calls.some(([operation]) => operation === forbidden),
      false
    );
  }

  for (const [overrides, error] of [
    [{ selectionError: new Error("query failed") }, /query failed/],
    [{ selectedFocusError: new Error("selected focus failed") }, /selected focus failed/]
  ]) {
    const harness = createHarness(createInspectorToggleController, overrides);
    harness.controller.mount();
    harness.element.click();
    assert.throws(() => harness.flushFrame(), error);
  }

  const listenerHarness = createHarness(createInspectorToggleController, {
    addError: new Error("listener failed")
  });
  assert.throws(() => listenerHarness.controller.mount(), /listener failed/);
  assert.deepEqual(
    listenerHarness.calls.slice(0, 1).map((call) => call.slice(0, 3)),
    [["element", "addEventListener", "click"]]
  );
});

test("InspectorToggleController validates boundaries and optional toggle elements", async () => {
  const { createInspectorToggleController } = await loadFactory();
  const valid = createHarness(createInspectorToggleController);
  for (const [group, member] of [
    ["state", "getOpen"],
    ["state", "setOpen"],
    ["layout", "setOpen"],
    ["presentation", "renderEditor"],
    ["frame", "request"],
    ["selection", "getSelected"]
  ]) {
    assert.throws(() => {
      const boundaries = {
        element: valid.element,
        state: valid.state,
        layout: valid.layout,
        presentation: valid.presentation,
        frame: valid.frame,
        selection: valid.selection
      };
      boundaries[group] = { ...boundaries[group], [member]: null };
      createInspectorToggleController(boundaries);
    }, /InspectorToggleController requires/);
  }
  for (const missing of ["addEventListener", "removeEventListener", "focus"]) {
    assert.throws(
      () =>
        createInspectorToggleController({
          element: { ...valid.element, [missing]: null },
          state: valid.state,
          layout: valid.layout,
          presentation: valid.presentation,
          frame: valid.frame,
          selection: valid.selection
        }),
      /InspectorToggleController requires a checked optional toggle element\./
    );
  }
});
