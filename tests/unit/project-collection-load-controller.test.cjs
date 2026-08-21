const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-collection-load-controller.js")).href);
}

function createHarness(createProjectCollectionLoadController, overrides = {}) {
  const calls = [];
  let storedProjects = overrides.initialProjects ?? [];
  let projectReadIndex = 0;
  let currentReadIndex = 0;
  let prunedIds;
  const fail = (name) => {
    if (overrides[`${name}Error`]) throw overrides[`${name}Error`];
  };
  const options = {
    repository: {
      list() {
        calls.push(["repository.list"]);
        fail("repository");
        return overrides.repositoryResult === undefined ? [] : overrides.repositoryResult;
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
        return overrides.current === undefined ? null : overrides.current;
      },
      getProjects() {
        calls.push(["session.getProjects"]);
        fail("projects");
        if (Array.isArray(overrides.projectReads)) {
          const index = Math.min(projectReadIndex, overrides.projectReads.length - 1);
          projectReadIndex += 1;
          return overrides.projectReads[index];
        }
        return storedProjects;
      },
      replaceProjects(projects) {
        calls.push(["session.replaceProjects", projects]);
        fail("replace");
        storedProjects = projects;
        return overrides.replaceResult;
      },
      pruneProjectSummaryRevisions(projectIds) {
        calls.push(["session.pruneProjectSummaryRevisions", projectIds]);
        fail("revisionPrune");
        prunedIds = projectIds;
        return overrides.revisionPruneResult;
      }
    },
    dirty: {
      prune() {
        calls.push(["dirty.prune"]);
        fail("dirtyPrune");
        return overrides.dirtyPruneResult;
      }
    },
    summaries: {
      refresh() {
        calls.push(["summaries.refresh"]);
        fail("summaries");
        return overrides.summaryResult;
      }
    },
    presentation: {
      renderList() {
        calls.push(["presentation.renderList"]);
        fail("renderList");
        return overrides.listRenderResult;
      },
      renderEditor() {
        calls.push(["presentation.renderEditor"]);
        fail("renderEditor");
        return overrides.editorRenderResult;
      },
      renderTrashSummary() {
        calls.push(["presentation.renderTrashSummary"]);
        fail("renderTrashSummary");
        return overrides.trashRenderResult;
      }
    },
    selection: {
      open(projectId) {
        calls.push(["selection.open", projectId]);
        fail("open");
        return overrides.openResult;
      }
    }
  };

  return {
    calls,
    options,
    getProjects: () => storedProjects,
    getPrunedIds: () => prunedIds,
    controller: createProjectCollectionLoadController(options)
  };
}

test("ProjectCollectionLoadController preserves the default full load and presentation sequence", async () => {
  const { createProjectCollectionLoadController } = await loadFactory();
  const projects = [{ id: "first" }, { id: "second" }];
  const harness = createHarness(createProjectCollectionLoadController, {
    repositoryResult: Promise.resolve(projects),
    replaceResult: "ignored replacement",
    revisionPruneResult: "ignored revisions",
    dirtyPruneResult: "ignored dirtiness",
    summaryResult: Promise.resolve("ignored summaries"),
    listRenderResult: "ignored list",
    editorRenderResult: "ignored editor",
    trashRenderResult: "ignored Trash"
  });

  assert.equal(await harness.controller.load(), undefined);
  assert.equal(harness.getProjects(), projects);
  assert.deepEqual(Array.from(harness.getPrunedIds()), ["first", "second"]);
  assert.deepEqual(harness.calls, [
    ["repository.list"],
    ["session.replaceProjects", projects],
    ["session.getProjects"],
    ["session.pruneProjectSummaryRevisions", harness.getPrunedIds()],
    ["dirty.prune"],
    ["summaries.refresh"],
    ["presentation.renderList"],
    ["presentation.renderEditor"],
    ["presentation.renderTrashSummary"]
  ]);
});

test("ProjectCollectionLoadController preserves strict stable Set construction without filtering IDs", async () => {
  const { createProjectCollectionLoadController } = await loadFactory();
  const projects = [{ id: "same" }, { id: "same" }, { id: 0 }, { id: undefined }, { id: null }];
  const harness = createHarness(createProjectCollectionLoadController, { repositoryResult: projects });

  await harness.controller.load(false);

  assert.deepEqual(Array.from(harness.getPrunedIds()), ["same", 0, undefined, null]);
  assert.equal(harness.getPrunedIds() instanceof Set, true);
});

test("ProjectCollectionLoadController awaits summary refresh before any presentation", async () => {
  const { createProjectCollectionLoadController } = await loadFactory();
  let resolveSummaries;
  const summaryResult = new Promise((resolve) => {
    resolveSummaries = resolve;
  });
  const harness = createHarness(createProjectCollectionLoadController, { summaryResult });

  const loadPromise = harness.controller.load(false);
  await Promise.resolve();
  assert.equal(harness.calls.at(-1)[0], "summaries.refresh");
  assert.equal(
    harness.calls.some(([name]) => name.startsWith("presentation.")),
    false
  );

  resolveSummaries("done");
  assert.equal(await loadPromise, undefined);
  assert.deepEqual(
    harness.calls.slice(-3).map(([name]) => name),
    ["presentation.renderList", "presentation.renderEditor", "presentation.renderTrashSummary"]
  );
});

test("ProjectCollectionLoadController invokes but does not await Trash summary rendering", async () => {
  const { createProjectCollectionLoadController } = await loadFactory();
  const neverSettles = new Promise(() => {});
  const harness = createHarness(createProjectCollectionLoadController, { trashRenderResult: neverSettles });

  assert.equal(await harness.controller.load(false), undefined);
  assert.equal(harness.calls.at(-1)[0], "presentation.renderTrashSummary");
});

test("ProjectCollectionLoadController preserves current-project and empty-list selection guards", async () => {
  const { createProjectCollectionLoadController } = await loadFactory();
  const current = createHarness(createProjectCollectionLoadController, {
    repositoryResult: [{ id: "first" }],
    current: { id: "current" },
    openError: new Error("open must not run")
  });
  await current.controller.load(true);
  assert.deepEqual(current.calls.slice(-2), [["presentation.renderTrashSummary"], ["session.getProject"]]);

  const empty = createHarness(createProjectCollectionLoadController, {
    repositoryResult: [],
    current: null,
    openError: new Error("open must not run")
  });
  await empty.controller.load(true);
  assert.deepEqual(empty.calls.slice(-3), [
    ["presentation.renderTrashSummary"],
    ["session.getProject"],
    ["session.getProjects"]
  ]);
});

test("ProjectCollectionLoadController preserves repeated live reads and awaits the selected project", async () => {
  const { createProjectCollectionLoadController } = await loadFactory();
  let resolveOpen;
  const openResult = new Promise((resolve) => {
    resolveOpen = resolve;
  });
  const known = [{ id: "known" }];
  const condition = [{ id: "condition" }];
  const selected = [{ id: "selected" }];
  const harness = createHarness(createProjectCollectionLoadController, {
    repositoryResult: [{ id: "stored" }],
    projectReads: [known, condition, selected],
    current: null,
    openResult
  });

  const loadPromise = harness.controller.load("truthy");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(harness.calls.slice(-4), [
    ["session.getProject"],
    ["session.getProjects"],
    ["session.getProjects"],
    ["selection.open", "selected"]
  ]);
  let settled = false;
  void loadPromise.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  resolveOpen("ignored open result");
  assert.equal(await loadPromise, undefined);
  assert.deepEqual(Array.from(harness.getPrunedIds()), ["known"]);
});

test("ProjectCollectionLoadController preserves each primary dependency failure boundary", async () => {
  const { createProjectCollectionLoadController } = await loadFactory();
  const project = { id: "project" };
  const stages = [
    ["repository", { repositoryError: new Error("repository failed") }, "repository.list"],
    ["replace", { repositoryResult: [project], replaceError: new Error("replace failed") }, "session.replaceProjects"],
    ["projects", { repositoryResult: [project], projectsError: new Error("projects failed") }, "session.getProjects"],
    [
      "revisionPrune",
      { repositoryResult: [project], revisionPruneError: new Error("revision prune failed") },
      "session.pruneProjectSummaryRevisions"
    ],
    ["dirtyPrune", { repositoryResult: [project], dirtyPruneError: new Error("dirty failed") }, "dirty.prune"],
    ["summaries", { repositoryResult: [project], summariesError: new Error("summary failed") }, "summaries.refresh"],
    [
      "renderList",
      { repositoryResult: [project], renderListError: new Error("list failed") },
      "presentation.renderList"
    ],
    [
      "renderEditor",
      { repositoryResult: [project], renderEditorError: new Error("editor failed") },
      "presentation.renderEditor"
    ],
    [
      "renderTrashSummary",
      { repositoryResult: [project], renderTrashSummaryError: new Error("Trash failed") },
      "presentation.renderTrashSummary"
    ]
  ];

  for (const [failureName, overrides, expectedLastCall] of stages) {
    const harness = createHarness(createProjectCollectionLoadController, overrides);
    await assert.rejects(harness.controller.load(false), overrides[`${failureName}Error`]);
    assert.equal(harness.calls.at(-1)[0], expectedLastCall);
  }
});

test("ProjectCollectionLoadController preserves malformed records and selection failure timing", async () => {
  const { createProjectCollectionLoadController } = await loadFactory();
  for (const repositoryResult of [null, [null]]) {
    const harness = createHarness(createProjectCollectionLoadController, { repositoryResult });
    await assert.rejects(harness.controller.load(false), TypeError);
    assert.equal(harness.calls.at(-1)[0], "session.getProjects");
  }

  const currentFailure = createHarness(createProjectCollectionLoadController, {
    repositoryResult: [{ id: "project" }],
    currentError: new Error("current failed")
  });
  await assert.rejects(currentFailure.controller.load(true), /current failed/);
  assert.equal(currentFailure.calls.at(-1)[0], "session.getProject");

  const openFailure = createHarness(createProjectCollectionLoadController, {
    repositoryResult: [{ id: "project" }],
    current: null,
    openError: new Error("open failed")
  });
  await assert.rejects(openFailure.controller.load(true), /open failed/);
  assert.deepEqual(openFailure.calls.slice(-3), [
    ["session.getProjects"],
    ["session.getProjects"],
    ["selection.open", "project"]
  ]);
});

test("ProjectCollectionLoadController validates every boundary and exposes an immutable API", async () => {
  const { createProjectCollectionLoadController } = await loadFactory();
  const valid = createHarness(createProjectCollectionLoadController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["load"]);

  for (const options of [
    undefined,
    {},
    { ...valid.options, repository: { list: null } },
    { ...valid.options, session: { ...valid.options.session, getProject: null } },
    { ...valid.options, session: { ...valid.options.session, getProjects: null } },
    { ...valid.options, session: { ...valid.options.session, replaceProjects: null } },
    { ...valid.options, session: { ...valid.options.session, pruneProjectSummaryRevisions: null } },
    { ...valid.options, dirty: { prune: null } },
    { ...valid.options, summaries: { refresh: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, renderList: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, renderEditor: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, renderTrashSummary: null } },
    { ...valid.options, selection: { open: null } }
  ]) {
    assert.throws(() => createProjectCollectionLoadController(options), /ProjectCollectionLoadController requires/);
  }
});
