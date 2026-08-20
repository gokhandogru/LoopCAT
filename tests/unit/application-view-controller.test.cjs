const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-view-controller.js")).href);
}

function createElement(name, calls, error = null) {
  let listener = null;
  return {
    addEventListener(type, nextListener) {
      calls.push([name, "addEventListener", type]);
      if (error) throw error;
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

function createHarness(createApplicationViewController, overrides = {}) {
  const calls = [];
  const brandHomeLink = createElement("brand", calls, overrides.brandAddError);
  const projectsButton = createElement("projectsButton", calls, overrides.projectsAddError);
  const navigationState = overrides.navigationState || {
    activeIndex: 7,
    documentId: "d1",
    projectId: "p1",
    segmentId: "s1",
    view: "project"
  };
  const refreshResult = overrides.refreshResult || Promise.resolve("refreshed");
  const options = {
    elements: { brandHomeLink, projectsButton },
    navigation: {
      openProjects() {
        calls.push(["openProjects"]);
        if (overrides.navigationError) throw overrides.navigationError;
      },
      openResources() {
        calls.push(["openResources"]);
        if (overrides.navigationError) throw overrides.navigationError;
      },
      openProject(projectId, activeIndex) {
        calls.push(["openProject", projectId, activeIndex]);
        if (overrides.navigationError) throw overrides.navigationError;
      },
      openEditor(input) {
        calls.push(["openEditor", input]);
        if (overrides.navigationError) throw overrides.navigationError;
      }
    },
    context: {
      getProjectId() {
        calls.push(["getProjectId"]);
        return overrides.projectId === undefined ? "current-project" : overrides.projectId;
      },
      getNavigation() {
        calls.push(["getNavigation"]);
        return navigationState;
      }
    },
    presentation: {
      renderEditor() {
        calls.push(["renderEditor"]);
        if (overrides.renderError) throw overrides.renderError;
      }
    },
    refresh: {
      projects() {
        calls.push(["refreshProjects"]);
        if (overrides.refreshError) throw overrides.refreshError;
        return refreshResult;
      },
      resources() {
        calls.push(["refreshResources"]);
        if (overrides.refreshError) throw overrides.refreshError;
        return refreshResult;
      }
    }
  };
  return {
    brandHomeLink,
    calls,
    controller: createApplicationViewController(options),
    navigationState,
    options,
    projectsButton
  };
}

test("ApplicationViewController preserves Projects navigation, render, refresh, and return timing", async () => {
  const { createApplicationViewController } = await loadFactory();
  const harness = createHarness(createApplicationViewController);

  assert.equal(harness.controller.show("projects"), undefined);
  assert.deepEqual(harness.calls, [["openProjects"], ["renderEditor"], ["refreshProjects"]]);
});

test("ApplicationViewController preserves Resources navigation, render, refresh, and return timing", async () => {
  const { createApplicationViewController } = await loadFactory();
  const harness = createHarness(createApplicationViewController);

  assert.equal(harness.controller.show("resources"), undefined);
  assert.deepEqual(harness.calls, [["openResources"], ["renderEditor"], ["refreshResources"]]);
});

test("ApplicationViewController preserves Project route inputs without a refresh", async () => {
  const { createApplicationViewController } = await loadFactory();
  for (const projectId of ["current-project", null]) {
    const harness = createHarness(createApplicationViewController, { projectId });
    harness.controller.show("project");
    assert.deepEqual(harness.calls, [
      ["getProjectId"],
      ["getNavigation"],
      ["openProject", projectId, 7],
      ["renderEditor"]
    ]);
  }
});

test("ApplicationViewController preserves fallback Editor snapshot spreading without refresh", async () => {
  const { createApplicationViewController } = await loadFactory();
  const harness = createHarness(createApplicationViewController);
  harness.controller.show("unexpected");

  assert.deepEqual(harness.calls, [
    ["getNavigation"],
    [
      "openEditor",
      {
        activeIndex: 7,
        documentId: "d1",
        projectId: "p1",
        segmentId: "s1",
        view: "editor"
      }
    ],
    ["renderEditor"]
  ]);
  assert.notEqual(harness.calls[1][1], harness.navigationState);
});

test("ApplicationViewController owns exact idempotent listener lifecycle and immutable API", async () => {
  const { createApplicationViewController } = await loadFactory();
  const harness = createHarness(createApplicationViewController);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  assert.deepEqual(harness.calls, [
    ["brand", "addEventListener", "click"],
    ["projectsButton", "addEventListener", "click"]
  ]);
  assert.equal(harness.controller.unmount(), true);
  assert.equal(harness.controller.unmount(), false);
  assert.deepEqual(harness.calls.slice(2), [
    ["brand", "removeEventListener", "click", true],
    ["projectsButton", "removeEventListener", "click", true]
  ]);
});

test("ApplicationViewController preserves brand prevention and Projects button event effects", async () => {
  const { createApplicationViewController } = await loadFactory();
  const harness = createHarness(createApplicationViewController);
  harness.controller.mount();
  harness.calls.length = 0;
  const eventEffects = [];

  assert.equal(harness.brandHomeLink.click({ preventDefault: () => eventEffects.push("preventDefault") }), undefined);
  assert.deepEqual(eventEffects, ["preventDefault"]);
  assert.deepEqual(harness.calls, [["openProjects"], ["renderEditor"], ["refreshProjects"]]);

  harness.calls.length = 0;
  assert.equal(harness.projectsButton.click({ preventDefault: () => eventEffects.push("unexpected") }), undefined);
  assert.deepEqual(eventEffects, ["preventDefault"]);
  assert.deepEqual(harness.calls, [["openProjects"], ["renderEditor"], ["refreshProjects"]]);
});

test("ApplicationViewController preserves navigation, render, refresh, and listener failure timing", async () => {
  const { createApplicationViewController } = await loadFactory();
  for (const [overrides, expectedCalls, error] of [
    [{ navigationError: new Error("navigation failed") }, [["openProjects"]], "navigation failed"],
    [{ renderError: new Error("render failed") }, [["openProjects"], ["renderEditor"]], "render failed"],
    [
      { refreshError: new Error("refresh failed") },
      [["openProjects"], ["renderEditor"], ["refreshProjects"]],
      "refresh failed"
    ]
  ]) {
    const harness = createHarness(createApplicationViewController, overrides);
    assert.throws(() => harness.controller.show("projects"), new RegExp(error));
    assert.deepEqual(harness.calls, expectedCalls);
  }

  const listenerError = new Error("listener failed");
  const listenerHarness = createHarness(createApplicationViewController, { projectsAddError: listenerError });
  assert.throws(() => listenerHarness.controller.mount(), listenerError);
  assert.deepEqual(listenerHarness.calls, [
    ["brand", "addEventListener", "click"],
    ["projectsButton", "addEventListener", "click"]
  ]);
});

test("ApplicationViewController validates every required boundary", async () => {
  const { createApplicationViewController } = await loadFactory();
  const valid = createHarness(createApplicationViewController).options;
  for (const mutate of [
    (input) => (input.elements.brandHomeLink = {}),
    (input) => (input.elements.projectsButton = {}),
    (input) => (input.navigation.openProjects = null),
    (input) => (input.navigation.openResources = null),
    (input) => (input.navigation.openProject = null),
    (input) => (input.navigation.openEditor = null),
    (input) => (input.context.getProjectId = null),
    (input) => (input.context.getNavigation = null),
    (input) => (input.presentation.renderEditor = null),
    (input) => (input.refresh.projects = null),
    (input) => (input.refresh.resources = null)
  ]) {
    const input = {
      elements: { ...valid.elements },
      navigation: { ...valid.navigation },
      context: { ...valid.context },
      presentation: { ...valid.presentation },
      refresh: { ...valid.refresh }
    };
    mutate(input);
    assert.throws(
      () => createApplicationViewController(input),
      /ApplicationViewController requires navigation elements, navigation, context, presentation, and refresh boundaries\./
    );
  }
});
