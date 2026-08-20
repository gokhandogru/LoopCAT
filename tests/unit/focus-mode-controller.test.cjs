const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/focus-mode-controller.js")).href);
}

function createSurface(name, calls, toggleError = null) {
  return {
    classList: {
      toggle(token, force) {
        calls.push([name, "classList.toggle", token, force]);
        if (toggleError) throw toggleError;
      }
    }
  };
}

function createButton(name, calls, { addError = null, toggleError = null } = {}) {
  let listener = null;
  const button = {
    classList: createSurface(name, calls, toggleError).classList,
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
    },
    setAttribute(attribute, value) {
      calls.push([name, "setAttribute", attribute, value]);
    }
  };
  Object.defineProperties(button, {
    textContent: {
      set(value) {
        calls.push([name, "textContent", value]);
      }
    },
    title: {
      set(value) {
        calls.push([name, "title", value]);
      }
    }
  });
  return button;
}

function createHarness(createFocusModeController, overrides = {}) {
  const calls = [];
  let state = overrides.state || {
    interface: { focusMode: false },
    navigation: { view: "editor" }
  };
  let project = overrides.hasProject === false ? null : { id: "project-1" };
  let frameCallback = null;
  const elements = {
    body: createSurface("body", calls, overrides.bodyToggleError),
    workspace: createSurface("workspace", calls, overrides.workspaceToggleError),
    toggleButton: overrides.noToggle ? null : createButton("toggle", calls, { addError: overrides.toggleAddError }),
    exitButton: overrides.noExit
      ? null
      : createButton("exit", calls, {
          addError: overrides.exitAddError,
          toggleError: overrides.exitToggleError
        })
  };
  const store = {
    getState() {
      calls.push(["getState"]);
      if (overrides.getStateError) throw overrides.getStateError;
      return state;
    }
  };
  if (!overrides.noDispatch) {
    store.dispatch = (action) => {
      calls.push(["dispatch", action]);
      if (overrides.dispatchError) throw overrides.dispatchError;
      state = {
        ...state,
        interface: { ...state.interface, focusMode: Boolean(action.payload.enabled) }
      };
      return overrides.dispatchResult;
    };
  }
  const session = {
    getProject() {
      calls.push(["getProject"]);
      if (overrides.projectError) throw overrides.projectError;
      return project;
    }
  };
  const localization = {
    translate(key) {
      calls.push(["translate", key]);
      if (overrides.translationError) throw overrides.translationError;
      return `translated:${key}`;
    }
  };
  const menu = {
    closeAll() {
      calls.push(["closeAll"]);
      if (overrides.menuError) throw overrides.menuError;
      return overrides.menuResult;
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
  const editor = {
    renderSegments(options) {
      calls.push(["renderSegments", options]);
      if (overrides.renderSegmentsError) throw overrides.renderSegmentsError;
      return overrides.renderSegmentsResult;
    },
    focusActive() {
      calls.push(["focusActive"]);
      if (overrides.focusError) throw overrides.focusError;
      return overrides.focusResult;
    }
  };
  return {
    calls,
    controller: createFocusModeController({ elements, store, session, localization, menu, frame, editor }),
    editor,
    elements,
    frame,
    localization,
    menu,
    session,
    setProject(nextProject) {
      project = nextProject;
    },
    setState(nextState) {
      state = nextState;
    },
    store,
    flushFrame() {
      const callback = frameCallback;
      frameCallback = null;
      return callback?.();
    }
  };
}

test("FocusModeController renders active localized presentation in exact order", async () => {
  const { createFocusModeController } = await loadFactory();
  const harness = createHarness(createFocusModeController, {
    state: { interface: { focusMode: true }, navigation: { view: "editor" } }
  });

  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(harness.calls, [
    ["getState"],
    ["getState"],
    ["getProject"],
    ["body", "classList.toggle", "focus-mode", true],
    ["workspace", "classList.toggle", "focus-mode", true],
    ["translate", "app.focus.normalView"],
    ["toggle", "textContent", "translated:app.focus.normalView"],
    ["translate", "app.focus.returnTitle"],
    ["toggle", "title", "translated:app.focus.returnTitle"],
    ["toggle", "setAttribute", "aria-pressed", "true"],
    ["exit", "classList.toggle", "hidden", false],
    ["exit", "setAttribute", "aria-hidden", "false"]
  ]);
});

test("FocusModeController preserves inactive, non-editor, projectless, and optional-control branches", async () => {
  const { createFocusModeController } = await loadFactory();
  for (const [overrides, prefix] of [
    [{ noToggle: true, noExit: true }, [["getState"]]],
    [
      {
        noToggle: true,
        noExit: true,
        state: { interface: { focusMode: true }, navigation: { view: "projects" } }
      },
      [["getState"], ["getState"]]
    ],
    [
      {
        hasProject: false,
        noToggle: true,
        noExit: true,
        state: { interface: { focusMode: true }, navigation: { view: "editor" } }
      },
      [["getState"], ["getState"], ["getProject"]]
    ]
  ]) {
    const harness = createHarness(createFocusModeController, overrides);
    harness.controller.render();
    assert.deepEqual(harness.calls.slice(0, prefix.length), prefix);
    assert.deepEqual(harness.calls.slice(-2), [
      ["body", "classList.toggle", "focus-mode", false],
      ["workspace", "classList.toggle", "focus-mode", false]
    ]);
  }
});

test("FocusModeController enables Focus mode and defers segment rendering and target focus", async () => {
  const { createFocusModeController } = await loadFactory();
  const harness = createHarness(createFocusModeController, { frameResult: 77 });

  assert.equal(harness.controller.set(true), undefined);
  assert.deepEqual(
    harness.calls
      .filter(([operation]) => ["getProject", "dispatch", "closeAll", "requestFrame"].includes(operation))
      .map(([operation]) => operation),
    ["getProject", "dispatch", "getProject", "closeAll", "getProject", "requestFrame"]
  );
  assert.deepEqual(harness.calls.find(([operation]) => operation === "dispatch")[1], {
    type: "interface/focus-mode-changed",
    payload: { enabled: true }
  });
  assert.equal(
    harness.calls.some(([operation]) => operation === "renderSegments"),
    false
  );

  assert.equal(harness.flushFrame(), undefined);
  assert.deepEqual(harness.calls.slice(-3), [
    ["renderSegments", { preserveScroll: true }],
    ["getState"],
    ["focusActive"]
  ]);
});

test("FocusModeController disables Focus mode with short-circuited eligibility and no deferred focus", async () => {
  const { createFocusModeController } = await loadFactory();
  const harness = createHarness(createFocusModeController, {
    state: { interface: { focusMode: true }, navigation: { view: "editor" } }
  });

  harness.controller.set(false);
  const dispatchIndex = harness.calls.findIndex(([operation]) => operation === "dispatch");
  assert.equal(
    harness.calls.slice(0, dispatchIndex).some(([operation]) => operation === "getProject"),
    false
  );
  assert.deepEqual(harness.calls[dispatchIndex][1].payload, { enabled: false });
  harness.flushFrame();
  assert.deepEqual(harness.calls.slice(-2), [["renderSegments", { preserveScroll: true }], ["getState"]]);
});

test("FocusModeController preserves projectless set and live post-frame Focus state", async () => {
  const { createFocusModeController } = await loadFactory();
  const projectless = createHarness(createFocusModeController, { hasProject: false });
  projectless.controller.set(true);
  assert.deepEqual(projectless.calls.find(([operation]) => operation === "dispatch")[1].payload, {
    enabled: false
  });
  assert.equal(
    projectless.calls.some(([operation]) => operation === "requestFrame"),
    false
  );

  const live = createHarness(createFocusModeController);
  live.controller.set(true);
  live.setState({ interface: { focusMode: false }, navigation: { view: "editor" } });
  live.flushFrame();
  assert.deepEqual(live.calls.slice(-2), [["renderSegments", { preserveScroll: true }], ["getState"]]);
});

test("FocusModeController preserves toggle and exact optional listener lifecycle", async () => {
  const { createFocusModeController } = await loadFactory();
  const harness = createHarness(createFocusModeController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  const added = harness.calls.slice();
  assert.deepEqual(
    added.map((call) => call.slice(0, 3)),
    [
      ["toggle", "addEventListener", "click"],
      ["exit", "addEventListener", "click"]
    ]
  );

  harness.calls.length = 0;
  assert.equal(harness.elements.toggleButton.click({ type: "click", marker: "toggle" }), undefined);
  assert.deepEqual(harness.calls.find(([operation]) => operation === "dispatch")[1].payload, { enabled: true });
  harness.calls.length = 0;
  assert.equal(harness.elements.exitButton.click({ type: "click", marker: "exit" }), undefined);
  assert.deepEqual(harness.calls.find(([operation]) => operation === "dispatch")[1].payload, { enabled: false });

  harness.calls.length = 0;
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(harness.calls, [
    ["toggle", "removeEventListener", "click", true],
    ["exit", "removeEventListener", "click", true]
  ]);
});

test("FocusModeController independently skips absent optional buttons", async () => {
  const { createFocusModeController } = await loadFactory();
  for (const absent of ["noToggle", "noExit"]) {
    const harness = createHarness(createFocusModeController, { [absent]: true });
    assert.equal(harness.controller.mount(), true);
    assert.equal(harness.calls.filter(([, operation]) => operation === "addEventListener").length, 1);
    assert.equal(harness.controller.unmount(), true);
    assert.equal(harness.calls.filter(([, operation]) => operation === "removeEventListener").length, 1);
  }
});

test("FocusModeController preserves synchronous and deferred failure timing", async () => {
  const { createFocusModeController } = await loadFactory();
  for (const [method, overrides, error, forbidden] of [
    ["render", { getStateError: new Error("state failed") }, /state failed/, "classList.toggle"],
    ["render", { bodyToggleError: new Error("body failed") }, /body failed/, "workspace"],
    ["render", { translationError: new Error("translation failed") }, /translation failed/, "setAttribute"],
    ["set", { dispatchError: new Error("dispatch failed") }, /dispatch failed/, "classList.toggle"],
    ["set", { menuError: new Error("menu failed") }, /menu failed/, "requestFrame"],
    ["set", { frameError: new Error("frame failed") }, /frame failed/, "renderSegments"]
  ]) {
    const harness = createHarness(createFocusModeController, overrides);
    assert.throws(() => harness.controller[method](true), error);
    assert.equal(harness.calls.flat().includes(forbidden), false);
  }

  const renderHarness = createHarness(createFocusModeController, {
    renderSegmentsError: new Error("segments failed")
  });
  renderHarness.controller.set(true);
  assert.throws(() => renderHarness.flushFrame(), /segments failed/);
  assert.equal(
    renderHarness.calls.some(([operation]) => operation === "focusActive"),
    false
  );

  const focusHarness = createHarness(createFocusModeController, { focusError: new Error("focus failed") });
  focusHarness.controller.set(true);
  assert.throws(() => focusHarness.flushFrame(), /focus failed/);

  const listenerHarness = createHarness(createFocusModeController, {
    exitAddError: new Error("exit listener failed")
  });
  assert.throws(() => listenerHarness.controller.mount(), /exit listener failed/);
  assert.deepEqual(
    listenerHarness.calls.map((call) => call.slice(0, 3)),
    [
      ["toggle", "addEventListener", "click"],
      ["exit", "addEventListener", "click"]
    ]
  );
});

test("FocusModeController validates boundaries, elements, and immutable API", async () => {
  const { createFocusModeController } = await loadFactory();
  const valid = createHarness(createFocusModeController);
  for (const [group, member] of [
    ["store", "getState"],
    ["session", "getProject"],
    ["localization", "translate"],
    ["menu", "closeAll"],
    ["frame", "request"],
    ["editor", "renderSegments"],
    ["editor", "focusActive"]
  ]) {
    assert.throws(() => {
      const boundaries = {
        elements: valid.elements,
        store: valid.store,
        session: valid.session,
        localization: valid.localization,
        menu: valid.menu,
        frame: valid.frame,
        editor: valid.editor
      };
      boundaries[group] = { ...boundaries[group], [member]: null };
      createFocusModeController(boundaries);
    }, /FocusModeController requires/);
  }
  assert.throws(
    () =>
      createFocusModeController({
        elements: valid.elements,
        store: { ...valid.store, dispatch: true },
        session: valid.session,
        localization: valid.localization,
        menu: valid.menu,
        frame: valid.frame,
        editor: valid.editor
      }),
    /FocusModeController requires checked store and session boundaries\./
  );
  for (const element of ["body", "workspace", "toggleButton", "exitButton"]) {
    assert.throws(
      () =>
        createFocusModeController({
          elements: { ...valid.elements, [element]: {} },
          store: valid.store,
          session: valid.session,
          localization: valid.localization,
          menu: valid.menu,
          frame: valid.frame,
          editor: valid.editor
        }),
      /FocusModeController requires/
    );
  }
});
