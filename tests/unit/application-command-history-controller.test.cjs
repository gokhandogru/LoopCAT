const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-command-history-controller.js")).href);
}

function createHarness(createApplicationCommandHistoryController, overrides = {}) {
  const calls = [];
  const controls = {
    undo: overrides.noUndoControl ? null : { disabled: false },
    redo: overrides.noRedoControl ? null : { disabled: false }
  };
  const views = overrides.views || ["projects"];
  let viewIndex = 0;
  let project = Object.hasOwn(overrides, "project") ? overrides.project : { id: overrides.projectId || "project-1" };
  let projectList = overrides.projectList || (project ? [project] : []);
  let segments = overrides.segments || [];
  const commandResult = (kind) =>
    Object.hasOwn(overrides, `${kind}Result`)
      ? overrides[`${kind}Result`]
      : {
          receipt: { commandId: `${kind}-command`, undoLabel: "Undo target edit" },
          result: {}
        };
  const context = {
    getProjectId() {
      calls.push(["context.getProjectId"]);
      return Object.hasOwn(overrides, "commandProjectId") ? overrides.commandProjectId : project?.id || null;
    },
    getView() {
      const view = views[Math.min(viewIndex, views.length - 1)];
      viewIndex += 1;
      calls.push(["context.getView", view]);
      return view;
    }
  };
  const commands = {
    canUndo(projectId) {
      calls.push(["commands.canUndo", projectId]);
      return overrides.canUndo ?? true;
    },
    canRedo(projectId) {
      calls.push(["commands.canRedo", projectId]);
      return overrides.canRedo ?? false;
    },
    undo(projectId) {
      calls.push(["commands.undo", projectId]);
      if (overrides.undoError) return Promise.reject(overrides.undoError);
      return Promise.resolve(commandResult("undo"));
    },
    redo(projectId) {
      calls.push(["commands.redo", projectId]);
      if (overrides.redoError) return Promise.reject(overrides.redoError);
      return Promise.resolve(commandResult("redo"));
    }
  };
  const edits = {
    finalizeProject(projectId) {
      calls.push(["edits.finalizeProject", projectId]);
    },
    finalizeAll() {
      calls.push(["edits.finalizeAll"]);
    },
    focusActive(selection) {
      calls.push(["edits.focusActive", selection]);
    }
  };
  const session = {
    getProject() {
      calls.push(["session.getProject", project]);
      return project;
    },
    getProjects() {
      calls.push(["session.getProjects"]);
      return projectList;
    },
    getSegments() {
      calls.push(["session.getSegments"]);
      return segments;
    },
    replaceProject(nextProject) {
      calls.push(["session.replaceProject", nextProject]);
      project = nextProject;
    },
    replaceSegments(nextSegments) {
      calls.push(["session.replaceSegments", nextSegments]);
      segments = nextSegments;
    }
  };
  const readSegments = overrides.readSegments || segments;
  const projects = {
    load(selectFirst) {
      calls.push(["projects.load", selectFirst]);
      if (overrides.loadError) return Promise.reject(overrides.loadError);
      overrides.afterLoad?.({
        setProject: (value) => (project = value),
        setProjects: (value) => (projectList = value)
      });
      return Promise.resolve();
    },
    open(projectId) {
      calls.push(["projects.open", projectId]);
      return Promise.resolve();
    },
    readSegments(projectId) {
      calls.push(["projects.readSegments", projectId]);
      return Promise.resolve(readSegments);
    },
    prepareHistories(value) {
      calls.push(["projects.prepareHistories", value]);
      return overrides.preparedSegments || value;
    }
  };
  const navigation = {
    getActiveIndex() {
      calls.push(["navigation.getActiveIndex"]);
      return overrides.activeIndex ?? 0;
    },
    selectSegment(selection) {
      calls.push(["navigation.selectSegment", selection]);
    },
    clearSelection() {
      calls.push(["navigation.clearSelection"]);
    },
    showProjects() {
      calls.push(["navigation.showProjects"]);
    }
  };
  const resources = {
    markLinkedDirty(...args) {
      calls.push(["resources.markLinkedDirty", ...args]);
      if (overrides.resourceError === "markLinkedDirty") throw new Error("markLinkedDirty failed");
    },
    ...Object.fromEntries(
      ["refreshResources", "refreshTerms", "refreshSuggestions", "refreshEditorContext"].map((name) => [
        name,
        (...args) => {
          calls.push([`resources.${name}`, ...args]);
          if (overrides.resourceError === name) return Promise.reject(new Error(`${name} failed`));
          return Promise.resolve();
        }
      ])
    )
  };
  const trash = {
    isOpen() {
      calls.push(["trash.isOpen"]);
      return overrides.trashOpen || false;
    },
    renderList() {
      calls.push(["trash.renderList"]);
      return Promise.resolve();
    },
    renderSummary() {
      calls.push(["trash.renderSummary"]);
      return Promise.resolve();
    }
  };
  const presentation = { renderAll: () => calls.push(["presentation.renderAll"]) };
  const status = { set: (...args) => calls.push(["status.set", ...args]) };
  const controller = createApplicationCommandHistoryController({
    controls,
    context,
    commands,
    edits,
    session,
    projects,
    navigation,
    resources,
    trash,
    presentation,
    status
  });
  return {
    calls,
    commands,
    context,
    controller,
    controls,
    edits,
    navigation,
    presentation,
    projects,
    resources,
    session,
    status,
    trash
  };
}

test("ApplicationCommandHistoryController preserves command-control presentation and immutable API", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const harness = createHarness(createApplicationCommandHistoryController, { canUndo: false, canRedo: true });
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.render(), undefined);
  assert.equal(harness.controls.undo.disabled, true);
  assert.equal(harness.controls.redo.disabled, false);
  assert.deepEqual(harness.calls, [
    ["context.getProjectId"],
    ["commands.canUndo", "project-1"],
    ["commands.canRedo", "project-1"]
  ]);

  const optional = createHarness(createApplicationCommandHistoryController, {
    noUndoControl: true,
    noRedoControl: true
  });
  optional.controller.render();
  assert.deepEqual(optional.calls, [["context.getProjectId"]]);
});

test("ApplicationCommandHistoryController normalizes resource results and preserves invalid synchronization no-op", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const harness = createHarness(createApplicationCommandHistoryController);
  for (const entityType of ["tm-entry", "term", "translation-memory", "termbase"]) {
    const entry = { entityType };
    assert.equal(harness.controller.entryFromCommandResult({ result: entry }), entry);
    assert.equal(harness.controller.entryFromCommandResult({ result: { entry } }), entry);
  }
  assert.equal(harness.controller.entryFromCommandResult({ result: { entityType: "project" } }), null);
  assert.equal(await harness.controller.synchronize(null), false);
  assert.equal(await harness.controller.synchronize({ entityType: "project" }), false);
  assert.deepEqual(harness.calls, []);
});

test("ApplicationCommandHistoryController preserves TM and termbase resource refresh branches", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const tm = createHarness(createApplicationCommandHistoryController, { views: ["editor"], trashOpen: true });
  assert.equal(
    await tm.controller.synchronize({
      entityType: "tm-entry",
      resourceType: "tm",
      resourceName: "Main TM",
      sourceLang: "en",
      targetLang: "tr"
    }),
    true
  );
  assert.deepEqual(tm.calls, [
    ["resources.markLinkedDirty", "tm", "Main TM", "en", "tr"],
    ["resources.refreshResources"],
    ["context.getView", "editor"],
    ["resources.refreshEditorContext"],
    ["trash.isOpen"],
    ["trash.renderList"]
  ]);

  const tb = createHarness(createApplicationCommandHistoryController, {
    views: ["projects", "editor"],
    trashOpen: false
  });
  await tb.controller.synchronize({ entityType: "term", resourceType: "tb", resourceName: "Terms" });
  assert.deepEqual(tb.calls, [
    ["resources.markLinkedDirty", "termbase", "Terms", undefined, undefined],
    ["resources.refreshResources"],
    ["context.getView", "projects"],
    ["resources.refreshTerms", { rerender: false }],
    ["context.getView", "editor"],
    ["resources.refreshSuggestions"],
    ["trash.isOpen"],
    ["trash.renderSummary"]
  ]);

  const forced = createHarness(createApplicationCommandHistoryController, { views: ["projects"] });
  await forced.controller.synchronize(
    { entityType: "termbase", resourceType: "tb", resourceName: "Terms" },
    { refreshSuggestions: true }
  );
  assert.equal(forced.calls.filter(([name]) => name === "context.getView").length, 1);
  assert.equal(
    forced.calls.some(([name]) => name === "resources.refreshSuggestions"),
    true
  );
});

test("ApplicationCommandHistoryController preserves project or all-edit finalization and no-result guards", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const projectUndo = createHarness(createApplicationCommandHistoryController, { undoResult: null });
  assert.equal(await projectUndo.controller.undo(), false);
  assert.deepEqual(projectUndo.calls, [
    ["context.getProjectId"],
    ["edits.finalizeProject", "project-1"],
    ["commands.undo", "project-1"]
  ]);

  const allRedo = createHarness(createApplicationCommandHistoryController, {
    project: null,
    commandProjectId: null,
    redoResult: null
  });
  assert.equal(await allRedo.controller.redo(), false);
  assert.deepEqual(allRedo.calls, [["context.getProjectId"], ["edits.finalizeAll"], ["commands.redo", null]]);
});

test("ApplicationCommandHistoryController restores the active project on Undo before status, controls, and focus", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const result = {
    receipt: { commandId: "edit-target", undoLabel: "Undo target edit" },
    result: { activeSegmentId: "segment-b", focusTarget: true, selection: { start: 2, end: 4 } }
  };
  const storedProject = { id: "project-1", stored: true };
  const readSegments = [{ id: "segment-a" }, { id: "segment-b" }];
  const harness = createHarness(createApplicationCommandHistoryController, {
    undoResult: result,
    projectList: [storedProject],
    readSegments,
    preparedSegments: readSegments
  });
  assert.equal(await harness.controller.undo(), result);
  assert.equal(
    harness.calls.findIndex(([name]) => name === "projects.load") <
      harness.calls.findIndex(([name]) => name === "session.replaceProject"),
    true
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "navigation.selectSegment"),
    ["navigation.selectSegment", { activeIndex: 1, segmentId: "segment-b" }]
  );
  assert.deepEqual(harness.calls.slice(-5), [
    ["status.set", "Undo target edit", "saved"],
    ["context.getProjectId"],
    ["commands.canUndo", "project-1"],
    ["commands.canRedo", "project-1"],
    ["edits.focusActive", { start: 2, end: 4 }]
  ]);
  assert.equal(harness.calls.at(-1)[0], "edits.focusActive");
});

test("ApplicationCommandHistoryController reopens a restored project and preserves Undo common effects", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const restored = { id: "project-1" };
  const result = { receipt: { commandId: "delete-project", undoLabel: "Undo project delete" }, result: {} };
  const harness = createHarness(createApplicationCommandHistoryController, {
    project: null,
    commandProjectId: "project-1",
    projectList: [restored],
    undoResult: result
  });
  assert.equal(await harness.controller.undo(), result);
  assert.equal(
    harness.calls.some((call) => call[0] === "projects.open" && call[1] === "project-1"),
    true
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "status.set"),
    ["status.set", "Undo project delete", "saved"]
  );
});

test("ApplicationCommandHistoryController preserves Redo delete-project and requested-segment branches", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const deleteResult = { receipt: { commandId: "delete-project", undoLabel: "Undo project delete" }, result: {} };
  const deleted = createHarness(createApplicationCommandHistoryController, { redoResult: deleteResult });
  assert.equal(await deleted.controller.redo(), deleteResult);
  assert.equal(
    deleted.calls.findIndex(([name]) => name === "navigation.showProjects") <
      deleted.calls.findIndex(([name]) => name === "projects.load"),
    true
  );
  assert.equal(
    deleted.calls.some(([name]) => name === "navigation.clearSelection"),
    true
  );
  assert.deepEqual(
    deleted.calls.find(([name]) => name === "status.set"),
    ["status.set", "Redid project delete", "saved"]
  );

  const requestedResult = {
    receipt: { commandId: "copy-source", undoLabel: "Undo copy source" },
    result: { activeSegmentId: "segment-b" }
  };
  const requested = createHarness(createApplicationCommandHistoryController, {
    redoResult: requestedResult,
    readSegments: [{ id: "segment-a" }, { id: "segment-b" }],
    preparedSegments: [{ id: "segment-a" }, { id: "segment-b" }]
  });
  assert.equal(await requested.controller.redo(), requestedResult);
  assert.deepEqual(
    requested.calls.find(([name]) => name === "navigation.selectSegment"),
    ["navigation.selectSegment", { activeIndex: 1, segmentId: "segment-b" }]
  );
});

test("ApplicationCommandHistoryController preserves Redo deleted-document restoration and bounded selection", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const result = { receipt: { commandId: "delete-document", undoLabel: "Undo document delete" }, result: {} };
  const storedProject = { id: "project-1", stored: true };
  const segments = [{ id: "segment-a" }, { id: "segment-b" }];
  const restored = createHarness(createApplicationCommandHistoryController, {
    activeIndex: 9,
    projectList: [storedProject],
    readSegments: segments,
    preparedSegments: segments,
    redoResult: result
  });
  assert.equal(await restored.controller.redo(), result);
  assert.deepEqual(
    restored.calls.find(([name]) => name === "session.replaceProject"),
    ["session.replaceProject", storedProject]
  );
  assert.deepEqual(
    restored.calls.find(([name]) => name === "navigation.selectSegment"),
    ["navigation.selectSegment", { activeIndex: 1, segmentId: "segment-b" }]
  );
  assert.equal(
    restored.calls.findIndex(([name]) => name === "navigation.selectSegment") <
      restored.calls.findIndex(([name]) => name === "presentation.renderAll"),
    true
  );

  const empty = createHarness(createApplicationCommandHistoryController, {
    activeIndex: 4,
    readSegments: [],
    preparedSegments: [],
    redoResult: result
  });
  assert.equal(await empty.controller.redo(), result);
  assert.deepEqual(
    empty.calls.find(([name]) => name === "navigation.selectSegment"),
    ["navigation.selectSegment", { activeIndex: -1, segmentId: "" }]
  );
});

test("ApplicationCommandHistoryController preserves Undo fallback selection for missing and empty segment sets", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const result = {
    receipt: { commandId: "replace-target", undoLabel: "Undo target replacement" },
    result: { activeSegmentId: "missing" }
  };
  const segments = [{ id: "segment-a" }, { id: "segment-b" }];
  const bounded = createHarness(createApplicationCommandHistoryController, {
    activeIndex: 8,
    readSegments: segments,
    preparedSegments: segments,
    undoResult: result
  });
  assert.equal(await bounded.controller.undo(), result);
  assert.deepEqual(
    bounded.calls.find(([name]) => name === "navigation.selectSegment"),
    ["navigation.selectSegment", { activeIndex: 1, segmentId: "segment-b" }]
  );

  const empty = createHarness(createApplicationCommandHistoryController, {
    activeIndex: 4,
    readSegments: [],
    preparedSegments: [],
    undoResult: result
  });
  assert.equal(await empty.controller.undo(), result);
  assert.deepEqual(
    empty.calls.find(([name]) => name === "navigation.selectSegment"),
    ["navigation.selectSegment", { activeIndex: -1, segmentId: "" }]
  );
});

test("ApplicationCommandHistoryController preserves synchronous and awaited resource failure timing", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const entry = { entityType: "term", resourceType: "tb", resourceName: "Terms" };
  for (const resourceError of ["markLinkedDirty", "refreshResources", "refreshTerms", "refreshSuggestions"]) {
    const harness = createHarness(createApplicationCommandHistoryController, {
      resourceError,
      views: ["editor"]
    });
    await assert.rejects(harness.controller.synchronize(entry), new RegExp(`${resourceError} failed`));
    const failureIndex = harness.calls.findIndex(([name]) => name === `resources.${resourceError}`);
    assert.equal(failureIndex >= 0, true);
    assert.equal(
      harness.calls.slice(failureIndex + 1).some(([name]) => name.startsWith("trash.")),
      false
    );
  }

  const editorContext = createHarness(createApplicationCommandHistoryController, {
    resourceError: "refreshEditorContext",
    views: ["editor"]
  });
  await assert.rejects(
    editorContext.controller.synchronize({ entityType: "tm-entry", resourceType: "tm" }),
    /refreshEditorContext failed/
  );
  assert.equal(
    editorContext.calls.some(([name]) => name.startsWith("trash.")),
    false
  );
});

test("ApplicationCommandHistoryController validates every injected owner and propagates awaited failures", async () => {
  const { createApplicationCommandHistoryController } = await loadFactory();
  const valid = createHarness(createApplicationCommandHistoryController);
  const create = (changes = {}) =>
    createApplicationCommandHistoryController({
      controls: valid.controls,
      context: valid.context,
      commands: valid.commands,
      edits: valid.edits,
      session: valid.session,
      projects: valid.projects,
      navigation: valid.navigation,
      resources: valid.resources,
      trash: valid.trash,
      presentation: valid.presentation,
      status: valid.status,
      ...changes
    });
  for (const changes of [
    { context: {} },
    { commands: {} },
    { edits: {} },
    { session: {} },
    { projects: {} },
    { navigation: {} },
    { resources: {} },
    { trash: {} },
    { presentation: {} },
    { status: {} }
  ]) {
    assert.throws(() => create(changes), /ApplicationCommandHistoryController requires checked/);
  }

  const error = new Error("undo failed");
  const failed = createHarness(createApplicationCommandHistoryController, { undoError: error });
  await assert.rejects(failed.controller.undo(), error);
  assert.deepEqual(failed.calls.slice(-2), [
    ["edits.finalizeProject", "project-1"],
    ["commands.undo", "project-1"]
  ]);
});
