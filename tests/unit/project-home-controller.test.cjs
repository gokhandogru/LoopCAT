const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-home-controller.js")).href);
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

function createHarness(createProjectHomeController, overrides = {}) {
  const calls = [];
  const projectValues = overrides.projectValues || [{ id: "project-1" }, { id: "project-1" }];
  let projectRead = 0;
  const elements = {
    projectFilesButton: createButton("files", calls, overrides.filesAddError),
    deleteButton: createButton("delete", calls, overrides.deleteAddError)
  };
  const session = {
    getProject() {
      calls.push(["getProject"]);
      if (overrides.projectError && projectRead === (overrides.projectErrorRead || 0)) {
        throw overrides.projectError;
      }
      return projectValues[Math.min(projectRead++, projectValues.length - 1)];
    },
    getSegments() {
      calls.push(["getSegments"]);
      if (overrides.segmentsError) throw overrides.segmentsError;
      return overrides.segments || [{ id: "segment-1" }];
    }
  };
  const navigation = overrides.noNavigation
    ? null
    : {
        openProject(projectId, activeIndex) {
          calls.push(["openProject", projectId, activeIndex]);
          if (overrides.navigationError) throw overrides.navigationError;
          return overrides.navigationResult;
        }
      };
  const presentation = {
    renderAll() {
      calls.push(["renderAll"]);
      if (overrides.renderError) throw overrides.renderError;
      return overrides.renderResult;
    }
  };
  const actions = {
    confirmDelete(...args) {
      calls.push(["confirmDelete", args]);
      if (overrides.deleteError) throw overrides.deleteError;
      return overrides.deleteResult;
    }
  };
  return {
    actions,
    calls,
    controller: createProjectHomeController({ elements, session, navigation, presentation, actions }),
    elements,
    navigation,
    presentation,
    session
  };
}

test("ProjectHomeController is inert without a current project", async () => {
  const { createProjectHomeController } = await loadFactory();
  const harness = createHarness(createProjectHomeController, { projectValues: [null] });

  assert.equal(harness.controller.show(), undefined);
  assert.deepEqual(harness.calls, [["getProject"]]);
});

test("ProjectHomeController preserves live project reads and both active-index branches", async () => {
  const { createProjectHomeController } = await loadFactory();
  const populated = createHarness(createProjectHomeController, {
    projectValues: [{ id: "initial" }, { id: "live" }],
    renderResult: { ignored: true }
  });

  assert.equal(populated.controller.show(), undefined);
  assert.deepEqual(populated.calls, [
    ["getProject"],
    ["getSegments"],
    ["getProject"],
    ["openProject", "live", 0],
    ["renderAll"]
  ]);

  const empty = createHarness(createProjectHomeController, { segments: [] });
  empty.controller.show();
  assert.deepEqual(empty.calls.slice(-2), [["openProject", "project-1", -1], ["renderAll"]]);
});

test("ProjectHomeController preserves optional navigation short-circuit and final rendering", async () => {
  const { createProjectHomeController } = await loadFactory();
  const harness = createHarness(createProjectHomeController, {
    noNavigation: true,
    projectValues: [{ id: "only-read-once" }]
  });

  assert.equal(harness.controller.show(), undefined);
  assert.deepEqual(harness.calls, [["getProject"], ["getSegments"], ["renderAll"]]);
});

test("ProjectHomeController preserves direct files click and no-argument delete result passthrough", async () => {
  const { createProjectHomeController } = await loadFactory();
  const deleteResult = Promise.resolve({ deleted: true });
  const harness = createHarness(createProjectHomeController, { deleteResult });
  harness.controller.mount();
  harness.calls.length = 0;

  assert.equal(harness.elements.projectFilesButton.click({ type: "click", marker: "files" }), undefined);
  assert.equal(harness.elements.deleteButton.click({ type: "click", marker: "delete" }), deleteResult);
  assert.deepEqual(harness.calls.slice(-1), [["confirmDelete", []]]);
});

test("ProjectHomeController owns exact idempotent listener lifecycle and immutable API", async () => {
  const { createProjectHomeController } = await loadFactory();
  const harness = createHarness(createProjectHomeController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.deepEqual(
    harness.calls.map((call) => call.slice(0, 3)),
    [
      ["files", "addEventListener", "click"],
      ["delete", "addEventListener", "click"]
    ]
  );
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(harness.calls.slice(2), [
    ["files", "removeEventListener", "click", true],
    ["delete", "removeEventListener", "click", true]
  ]);
});

test("ProjectHomeController preserves session, navigation, rendering, action, and listener failure timing", async () => {
  const { createProjectHomeController } = await loadFactory();
  for (const [overrides, expectedCalls, error] of [
    [{ projectError: new Error("project failed") }, [["getProject"]], /project failed/],
    [{ segmentsError: new Error("segments failed") }, [["getProject"], ["getSegments"]], /segments failed/],
    [
      { projectError: new Error("live project failed"), projectErrorRead: 1 },
      [["getProject"], ["getSegments"], ["getProject"]],
      /live project failed/
    ],
    [
      { navigationError: new Error("navigation failed") },
      [["getProject"], ["getSegments"], ["getProject"], ["openProject", "project-1", 0]],
      /navigation failed/
    ],
    [
      { renderError: new Error("render failed") },
      [["getProject"], ["getSegments"], ["getProject"], ["openProject", "project-1", 0], ["renderAll"]],
      /render failed/
    ]
  ]) {
    const harness = createHarness(createProjectHomeController, overrides);
    assert.throws(() => harness.controller.show(), error);
    assert.deepEqual(harness.calls, expectedCalls);
  }

  const deleteHarness = createHarness(createProjectHomeController, { deleteError: new Error("delete failed") });
  deleteHarness.controller.mount();
  assert.throws(() => deleteHarness.elements.deleteButton.click(), /delete failed/);

  const listenerHarness = createHarness(createProjectHomeController, {
    deleteAddError: new Error("delete listener failed")
  });
  assert.throws(() => listenerHarness.controller.mount(), /delete listener failed/);
  assert.deepEqual(
    listenerHarness.calls.map((call) => call.slice(0, 3)),
    [
      ["files", "addEventListener", "click"],
      ["delete", "addEventListener", "click"]
    ]
  );
});

test("ProjectHomeController validates boundaries and project-home controls", async () => {
  const { createProjectHomeController } = await loadFactory();
  const valid = createHarness(createProjectHomeController);
  for (const [group, member] of [
    ["session", "getProject"],
    ["session", "getSegments"],
    ["presentation", "renderAll"],
    ["actions", "confirmDelete"]
  ]) {
    assert.throws(
      () =>
        createProjectHomeController({
          elements: valid.elements,
          session: group === "session" ? { ...valid.session, [member]: null } : valid.session,
          navigation: valid.navigation,
          presentation: group === "presentation" ? { ...valid.presentation, [member]: null } : valid.presentation,
          actions: group === "actions" ? { ...valid.actions, [member]: null } : valid.actions
        }),
      /ProjectHomeController requires session, presentation, and project-delete boundaries\./
    );
  }
  assert.throws(
    () =>
      createProjectHomeController({
        elements: valid.elements,
        session: valid.session,
        navigation: { openProject: true },
        presentation: valid.presentation,
        actions: valid.actions
      }),
    /ProjectHomeController requires a checked optional navigation boundary\./
  );
  for (const element of ["projectFilesButton", "deleteButton"]) {
    assert.throws(
      () =>
        createProjectHomeController({
          elements: { ...valid.elements, [element]: {} },
          session: valid.session,
          navigation: valid.navigation,
          presentation: valid.presentation,
          actions: valid.actions
        }),
      /ProjectHomeController requires checked project-home control elements\./
    );
  }
});
