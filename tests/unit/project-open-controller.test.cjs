const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-open-controller.js")).href);
}

function createHarness(createProjectOpenController, overrides = {}) {
  const calls = [];
  let currentProject = overrides.initialProject ?? null;
  let currentReadIndex = 0;
  let currentSegments = overrides.initialSegments ?? [];
  let currentActivity = overrides.initialActivity ?? [];
  let commandProjectId;
  const fail = (name) => {
    if (overrides[`${name}Error`]) throw overrides[`${name}Error`];
  };
  const options = {
    autosave: {
      flush() {
        calls.push(["autosave.flush"]);
        fail("autosave");
        return overrides.autosaveResult;
      }
    },
    session: {
      getProject() {
        calls.push(["session.getProject"]);
        fail("current");
        if (Array.isArray(overrides.currentReads)) {
          const index = Math.min(currentReadIndex, overrides.currentReads.length - 1);
          currentReadIndex += 1;
          return overrides.currentReads[index];
        }
        return currentProject;
      },
      getProjects() {
        calls.push(["session.getProjects"]);
        fail("projects");
        return overrides.projects === undefined ? [] : overrides.projects;
      },
      getSegments() {
        calls.push(["session.getSegments"]);
        fail("segments");
        return currentSegments;
      },
      replaceProject(project) {
        calls.push(["session.replaceProject", project]);
        fail("replaceProject");
        currentProject = project;
        return overrides.replaceProjectResult;
      },
      replaceSegments(segments) {
        calls.push(["session.replaceSegments", segments]);
        fail("replaceSegments");
        currentSegments = segments;
        return overrides.replaceSegmentsResult;
      },
      replaceActivityEvents(events) {
        calls.push(["session.replaceActivityEvents", events]);
        fail("replaceActivity");
        currentActivity = events;
        return overrides.replaceActivityResult;
      }
    },
    command: {
      setProjectId(projectId) {
        calls.push(["command.setProjectId", projectId]);
        fail("command");
        commandProjectId = projectId;
        return overrides.commandResult;
      }
    },
    repository: {
      listSegments(projectId) {
        calls.push(["repository.listSegments", projectId]);
        fail("listSegments");
        return overrides.segmentResult === undefined ? [] : overrides.segmentResult;
      },
      listActivity(projectId) {
        calls.push(["repository.listActivity", projectId]);
        fail("listActivity");
        return overrides.activityResult === undefined ? [] : overrides.activityResult;
      }
    },
    histories: {
      prepare(segments) {
        calls.push(["histories.prepare", segments]);
        fail("histories");
        return typeof overrides.prepare === "function" ? overrides.prepare(segments) : segments;
      }
    },
    terms: {
      refresh() {
        calls.push(["terms.refresh"]);
        fail("terms");
        return overrides.termsResult;
      }
    },
    filters: {
      ready() {
        calls.push(["filters.ready"]);
        fail("filterReady");
        return overrides.readyResult;
      },
      restore(projectId) {
        calls.push(["filters.restore", projectId]);
        fail("filterRestore");
        return overrides.restoreResult;
      }
    },
    navigation: {
      open(projectId, activeIndex) {
        calls.push(["navigation.open", projectId, activeIndex]);
        fail("navigation");
        return overrides.navigationResult;
      }
    },
    presentation: {
      renderAll() {
        calls.push(["presentation.renderAll"]);
        fail("presentation");
        return overrides.presentationResult;
      }
    },
    context: {
      getView() {
        calls.push(["context.getView"]);
        fail("view");
        return overrides.view ?? "projects";
      },
      refreshEditor() {
        calls.push(["context.refreshEditor"]);
        fail("context");
        return overrides.contextResult;
      }
    }
  };

  return {
    calls,
    options,
    getProject: () => currentProject,
    getSegments: () => currentSegments,
    getActivity: () => currentActivity,
    getCommandProjectId: () => commandProjectId,
    controller: createProjectOpenController(options)
  };
}

test("ProjectOpenController preserves the complete selected-project sequence and identities", async () => {
  const { createProjectOpenController } = await loadFactory();
  const first = { id: "project", version: 1 };
  const duplicate = { id: "project", version: 2 };
  const segments = [{ id: "segment" }];
  const prepared = [{ id: "prepared" }];
  const activity = [{ id: "activity" }];
  const harness = createHarness(createProjectOpenController, {
    projects: [{ id: "other" }, first, duplicate],
    segmentResult: Promise.resolve(segments),
    activityResult: Promise.resolve(activity),
    prepare: (value) => {
      assert.equal(value, segments);
      return prepared;
    },
    termsResult: Promise.resolve("terms"),
    readyResult: Promise.resolve("ready"),
    restoreResult: Promise.resolve("restored"),
    view: "editor",
    contextResult: Promise.resolve("context")
  });

  assert.equal(await harness.controller.open("project"), undefined);
  assert.equal(harness.getProject(), first);
  assert.equal(harness.getSegments(), prepared);
  assert.equal(harness.getActivity(), activity);
  assert.equal(harness.getCommandProjectId(), "project");
  assert.deepEqual(harness.calls, [
    ["autosave.flush"],
    ["session.getProjects"],
    ["session.replaceProject", first],
    ["session.getProject"],
    ["command.setProjectId", "project"],
    ["session.getProject"],
    ["repository.listSegments", "project"],
    ["histories.prepare", segments],
    ["session.replaceSegments", prepared],
    ["session.getProject"],
    ["repository.listActivity", "project"],
    ["session.replaceActivityEvents", activity],
    ["terms.refresh"],
    ["session.getSegments"],
    ["filters.ready"],
    ["session.getProject"],
    ["filters.restore", "project"],
    ["session.getProject"],
    ["navigation.open", "project", 0],
    ["presentation.renderAll"],
    ["context.getView"],
    ["context.refreshEditor"]
  ]);
});

test("ProjectOpenController preserves missing-project empty replacements and fallback IDs", async () => {
  const { createProjectOpenController } = await loadFactory();
  const harness = createHarness(createProjectOpenController, {
    projects: [{ id: "other" }],
    listSegmentsError: new Error("segments must not be read"),
    listActivityError: new Error("activity must not be read"),
    view: "project"
  });

  await harness.controller.open("missing");

  assert.equal(harness.getProject(), null);
  assert.deepEqual(harness.getSegments(), []);
  assert.deepEqual(harness.getActivity(), []);
  assert.equal(harness.getCommandProjectId(), "missing");
  assert.deepEqual(
    harness.calls.filter(([name]) => ["histories.prepare", "filters.restore", "navigation.open"].includes(name)),
    [
      ["histories.prepare", []],
      ["filters.restore", "missing"],
      ["navigation.open", "missing", -1]
    ]
  );
  assert.equal(
    harness.calls.some(([name]) => name === "context.refreshEditor"),
    false
  );
});

test("ProjectOpenController preserves strict first-match lookup and direct malformed failures", async () => {
  const { createProjectOpenController } = await loadFactory();
  const stringId = { id: "7", version: 1 };
  const secondStringId = { id: "7", version: 2 };
  const strict = createHarness(createProjectOpenController, {
    projects: [{ id: 7 }, stringId, secondStringId]
  });
  await strict.controller.open("7");
  assert.equal(strict.getProject(), stringId);

  for (const projects of [null, [null]]) {
    const malformed = createHarness(createProjectOpenController, { projects });
    await assert.rejects(malformed.controller.open("missing"), TypeError);
    assert.equal(malformed.calls.at(-1)[0], "session.getProjects");
  }
});

test("ProjectOpenController loads segments before activity and prepares before replacement", async () => {
  const { createProjectOpenController } = await loadFactory();
  let resolveSegments;
  let resolveActivity;
  const segments = [{ id: "segment" }];
  const activity = [{ id: "activity" }];
  const segmentResult = new Promise((resolve) => {
    resolveSegments = resolve;
  });
  const activityResult = new Promise((resolve) => {
    resolveActivity = resolve;
  });
  const harness = createHarness(createProjectOpenController, {
    projects: [{ id: "project" }],
    segmentResult,
    activityResult
  });

  const openPromise = harness.controller.open("project");
  await Promise.resolve();
  assert.equal(harness.calls.at(-1)[0], "repository.listSegments");
  assert.equal(
    harness.calls.some(([name]) => name === "repository.listActivity"),
    false
  );

  resolveSegments(segments);
  await Promise.resolve();
  assert.equal(harness.calls.at(-1)[0], "repository.listActivity");
  assert(
    harness.calls.findIndex(([name]) => name === "histories.prepare") <
      harness.calls.findIndex(([name]) => name === "session.replaceSegments")
  );
  assert(
    harness.calls.findIndex(([name]) => name === "session.replaceSegments") <
      harness.calls.findIndex(([name]) => name === "repository.listActivity")
  );
  assert.equal(
    harness.calls.some(([name]) => name === "terms.refresh"),
    false
  );

  resolveActivity(activity);
  await openPromise;
  assert.equal(harness.getActivity(), activity);
});

test("ProjectOpenController awaits readiness and restoration with live project-ID reads", async () => {
  const { createProjectOpenController } = await loadFactory();
  let resolveReady;
  let resolveRestore;
  const readyResult = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const restoreResult = new Promise((resolve) => {
    resolveRestore = resolve;
  });
  const selected = { id: "selected" };
  const filterProject = { id: "filter-project" };
  const navigationProject = { id: "navigation-project" };
  const harness = createHarness(createProjectOpenController, {
    projects: [selected],
    currentReads: [selected, selected, selected, filterProject, navigationProject],
    readyResult,
    restoreResult
  });

  const openPromise = harness.controller.open("selected");
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.calls.at(-1)[0], "filters.ready");
  assert.equal(
    harness.calls.some(([name]) => name === "filters.restore"),
    false
  );

  resolveReady("ready");
  await Promise.resolve();
  assert.deepEqual(harness.calls.slice(-2), [["session.getProject"], ["filters.restore", "filter-project"]]);
  assert.equal(
    harness.calls.some(([name]) => name === "navigation.open"),
    false
  );

  resolveRestore("restored");
  await openPromise;
  assert.deepEqual(
    harness.calls.find(([name]) => name === "navigation.open"),
    ["navigation.open", "navigation-project", -1]
  );
});

test("ProjectOpenController does not await navigation and skips editor context outside the editor", async () => {
  const { createProjectOpenController } = await loadFactory();
  const neverSettles = new Promise(() => {});
  const harness = createHarness(createProjectOpenController, {
    projects: [{ id: "project" }],
    segmentResult: [{ id: "segment" }],
    navigationResult: neverSettles,
    view: "projects",
    contextError: new Error("context must not refresh")
  });

  assert.equal(await harness.controller.open("project"), undefined);
  assert.deepEqual(harness.calls.slice(-3), [
    ["navigation.open", "project", 0],
    ["presentation.renderAll"],
    ["context.getView"]
  ]);
});

test("ProjectOpenController preserves falsy selected-ID precedence", async () => {
  const { createProjectOpenController } = await loadFactory();
  const project = { id: 0 };
  const harness = createHarness(createProjectOpenController, { projects: [project] });

  await harness.controller.open(0);

  assert.equal(harness.getProject(), project);
  assert.equal(harness.getCommandProjectId(), "");
  assert.deepEqual(
    harness.calls.find(([name]) => name === "filters.restore"),
    ["filters.restore", 0]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "navigation.open"),
    ["navigation.open", 0, -1]
  );
});

test("ProjectOpenController preserves every dependency and late presentation failure boundary", async () => {
  const { createProjectOpenController } = await loadFactory();
  const project = { id: "project" };
  const stages = [
    ["autosave", { autosaveError: new Error("autosave failed") }, "autosave.flush"],
    ["projects", { projects: [project], projectsError: new Error("projects failed") }, "session.getProjects"],
    [
      "replaceProject",
      { projects: [project], replaceProjectError: new Error("replace project failed") },
      "session.replaceProject"
    ],
    ["current", { projects: [project], currentError: new Error("current failed") }, "session.getProject"],
    ["command", { projects: [project], commandError: new Error("command failed") }, "command.setProjectId"],
    [
      "listSegments",
      { projects: [project], listSegmentsError: new Error("segments failed") },
      "repository.listSegments"
    ],
    ["histories", { projects: [project], historiesError: new Error("history failed") }, "histories.prepare"],
    [
      "replaceSegments",
      { projects: [project], replaceSegmentsError: new Error("replace segments failed") },
      "session.replaceSegments"
    ],
    [
      "listActivity",
      { projects: [project], listActivityError: new Error("activity failed") },
      "repository.listActivity"
    ],
    [
      "replaceActivity",
      { projects: [project], replaceActivityError: new Error("replace activity failed") },
      "session.replaceActivityEvents"
    ],
    ["terms", { projects: [project], termsError: new Error("terms failed") }, "terms.refresh"],
    ["segments", { projects: [project], segmentsError: new Error("segment read failed") }, "session.getSegments"],
    ["filterReady", { projects: [project], filterReadyError: new Error("ready failed") }, "filters.ready"],
    ["filterRestore", { projects: [project], filterRestoreError: new Error("restore failed") }, "filters.restore"],
    ["navigation", { projects: [project], navigationError: new Error("navigation failed") }, "navigation.open"],
    [
      "presentation",
      { projects: [project], presentationError: new Error("presentation failed") },
      "presentation.renderAll"
    ],
    ["view", { projects: [project], viewError: new Error("view failed") }, "context.getView"],
    [
      "context",
      { projects: [project], view: "editor", contextError: new Error("context failed") },
      "context.refreshEditor"
    ]
  ];

  for (const [failureName, overrides, expectedLastCall] of stages) {
    const harness = createHarness(createProjectOpenController, overrides);
    await assert.rejects(harness.controller.open("project"), overrides[`${failureName}Error`]);
    assert.equal(harness.calls.at(-1)[0], expectedLastCall);
  }
});

test("ProjectOpenController validates every boundary and exposes an immutable API", async () => {
  const { createProjectOpenController } = await loadFactory();
  const valid = createHarness(createProjectOpenController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["open"]);

  for (const options of [
    undefined,
    {},
    { ...valid.options, autosave: { flush: null } },
    { ...valid.options, session: { ...valid.options.session, getProject: null } },
    { ...valid.options, session: { ...valid.options.session, getProjects: null } },
    { ...valid.options, session: { ...valid.options.session, getSegments: null } },
    { ...valid.options, session: { ...valid.options.session, replaceProject: null } },
    { ...valid.options, session: { ...valid.options.session, replaceSegments: null } },
    { ...valid.options, session: { ...valid.options.session, replaceActivityEvents: null } },
    { ...valid.options, command: { setProjectId: null } },
    { ...valid.options, repository: { ...valid.options.repository, listSegments: null } },
    { ...valid.options, repository: { ...valid.options.repository, listActivity: null } },
    { ...valid.options, histories: { prepare: null } },
    { ...valid.options, terms: { refresh: null } },
    { ...valid.options, filters: { ...valid.options.filters, ready: null } },
    { ...valid.options, filters: { ...valid.options.filters, restore: null } },
    { ...valid.options, navigation: { open: null } },
    { ...valid.options, presentation: { renderAll: null } },
    { ...valid.options, context: { ...valid.options.context, getView: null } },
    { ...valid.options, context: { ...valid.options.context, refreshEditor: null } }
  ]) {
    assert.throws(() => createProjectOpenController(options), /ProjectOpenController requires/);
  }
});
