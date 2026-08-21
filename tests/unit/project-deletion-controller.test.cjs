const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-deletion-controller.js")).href);
}

function createHarness(createProjectDeletionController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "project-deletion"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  const defaultProject = Object.prototype.hasOwnProperty.call(overrides, "project")
    ? overrides.project
    : { id: "project-1", name: "Project one" };
  const projectReads = overrides.projectReads || [defaultProject];
  const projectsReads = overrides.projectsReads || [overrides.projects || (defaultProject ? [defaultProject] : [])];
  const segmentReads = overrides.segmentReads || [overrides.currentSegments || []];
  let projectRead = 0;
  let projectsRead = 0;
  let segmentRead = 0;
  const projectDeleteCommand = Object.prototype.hasOwnProperty.call(overrides, "projectDeleteCommand")
    ? overrides.projectDeleteCommand
    : { id: "delete-project-command" };
  const documentDeleteCommand = Object.prototype.hasOwnProperty.call(overrides, "documentDeleteCommand")
    ? overrides.documentDeleteCommand
    : { id: "delete-document-command" };
  const commandResult = overrides.commandResult || { result: { project: { id: "project-1", name: "Updated" } } };
  const listedSegments = overrides.listedSegments || [];
  const preparedSegments = overrides.preparedSegments || listedSegments;

  const session = {
    getProject() {
      const value = projectReads[Math.min(projectRead, projectReads.length - 1)];
      projectRead += 1;
      calls.push(["session.getProject", value]);
      fail(`session.getProject:${projectRead}`);
      return value;
    },
    getProjects() {
      const value = projectsReads[Math.min(projectsRead, projectsReads.length - 1)];
      projectsRead += 1;
      calls.push(["session.getProjects", value]);
      fail(`session.getProjects:${projectsRead}`);
      return value;
    },
    getSegments() {
      const value = segmentReads[Math.min(segmentRead, segmentReads.length - 1)];
      segmentRead += 1;
      calls.push(["session.getSegments", value]);
      fail(`session.getSegments:${segmentRead}`);
      return value;
    },
    replaceProject(value) {
      calls.push(["session.replaceProject", value]);
      fail("session.replaceProject");
      return overrides.replaceProjectResult;
    },
    replaceProjects(value) {
      calls.push(["session.replaceProjects", value]);
      fail("session.replaceProjects");
      return overrides.replaceProjectsResult;
    },
    replaceSegments(value) {
      calls.push(["session.replaceSegments", value]);
      fail("session.replaceSegments");
      return overrides.replaceSegmentsResult;
    }
  };
  const confirmation = {
    ask(message) {
      calls.push(["confirmation.ask", message]);
      fail("confirmation.ask");
      return overrides.confirm ?? true;
    }
  };
  const text = {
    safe(value) {
      calls.push(["text.safe", value]);
      fail("text.safe");
      return `safe:${value}`;
    }
  };
  const autosave = {
    flush(projectId) {
      calls.push(["autosave.flush", projectId]);
      fail("autosave.flush");
      return Promise.resolve(overrides.flushResult);
    }
  };
  const commands = {
    createProjectDelete(options) {
      calls.push(["commands.createProjectDelete", options]);
      fail("commands.createProjectDelete");
      return projectDeleteCommand;
    },
    createDocumentDelete(options) {
      calls.push(["commands.createDocumentDelete", options]);
      fail("commands.createDocumentDelete");
      return documentDeleteCommand;
    },
    execute(command) {
      calls.push(["commands.execute", command]);
      fail("commands.execute");
      return Promise.resolve(commandResult);
    }
  };
  const commandState = {
    selectProject(projectId) {
      calls.push(["commandState.selectProject", projectId]);
      fail("commandState.selectProject");
      return overrides.selectProjectResult;
    }
  };
  const workspace = {
    clear(projectId) {
      calls.push(["workspace.clear", projectId]);
      fail("workspace.clear");
      return overrides.clearResult;
    },
    mark() {
      calls.push(["workspace.mark"]);
      fail("workspace.mark");
      return overrides.markResult;
    }
  };
  const navigation = {
    openProjects() {
      calls.push(["navigation.openProjects"]);
      fail("navigation.openProjects");
      return overrides.openProjectsResult;
    },
    clearSelection() {
      calls.push(["navigation.clearSelection"]);
      fail("navigation.clearSelection");
      return overrides.clearSelectionResult;
    },
    selectDocument(options) {
      calls.push(["navigation.selectDocument", options]);
      fail("navigation.selectDocument");
      return overrides.selectDocumentResult;
    },
    selectSegment(options) {
      calls.push(["navigation.selectSegment", options]);
      fail("navigation.selectSegment");
      return overrides.selectSegmentResult;
    }
  };
  const projects = {
    load(selectFirst) {
      calls.push(["projects.load", selectFirst]);
      fail("projects.load");
      return Promise.resolve(overrides.loadResult);
    }
  };
  const segments = {
    list(projectId) {
      calls.push(["segments.list", projectId]);
      fail("segments.list");
      return Promise.resolve(listedSegments);
    }
  };
  const histories = {
    prepare(value) {
      calls.push(["histories.prepare", value]);
      fail("histories.prepare");
      return preparedSegments;
    }
  };
  const activity = {
    log(type, summary, details) {
      calls.push(["activity.log", type, summary, details]);
      fail("activity.log");
      return Promise.resolve(overrides.activityResult);
    }
  };
  const summaries = {
    refresh() {
      calls.push(["summaries.refresh"]);
      fail("summaries.refresh");
      return Promise.resolve(overrides.summaryResult);
    }
  };
  const home = {
    show() {
      calls.push(["home.show"]);
      fail("home.show");
      return overrides.homeResult;
    }
  };
  const status = {
    set(message, mode) {
      calls.push(["status.set", message, mode]);
      fail("status.set");
      return overrides.statusResult;
    }
  };
  const history = {
    render() {
      calls.push(["history.render"]);
      fail("history.render");
      return overrides.historyResult;
    }
  };
  const checkedTest = {
    projectDeleteFails(project) {
      calls.push(["test.projectDeleteFails", project]);
      fail("test.projectDeleteFails");
      return Boolean(overrides.projectDeleteFails);
    },
    documentDeleteFails(documentInfo) {
      calls.push(["test.documentDeleteFails", documentInfo]);
      fail("test.documentDeleteFails");
      return Boolean(overrides.documentDeleteFails);
    },
    documentActivityFails(documentInfo) {
      calls.push(["test.documentActivityFails", documentInfo]);
      fail("test.documentActivityFails");
      return Boolean(overrides.documentActivityFails);
    }
  };
  const logger = {
    warn(...args) {
      calls.push(["logger.warn", ...args]);
      fail("logger.warn");
      return overrides.warnResult;
    }
  };
  const options = {
    session,
    confirmation,
    text,
    autosave,
    commands,
    commandState,
    workspace,
    navigation,
    projects,
    segments,
    histories,
    activity,
    summaries,
    home,
    status,
    history,
    test: checkedTest,
    logger
  };
  const controller = createProjectDeletionController(options);
  return { calls, controller, failure, options, projectDeleteCommand, documentDeleteCommand, commandResult };
}

test("ProjectDeletionController preserves default project lookup strict matching and missing no-op", async () => {
  const { createProjectDeletionController } = await loadFactory();
  const numeric = { id: 1, name: "Numeric" };
  const string = { id: "1", name: "String" };
  const defaultHarness = createHarness(createProjectDeletionController, {
    projectReads: [{ id: 1 }],
    projects: [string]
  });
  assert.equal(await defaultHarness.controller.deleteProject(), false);
  assert.deepEqual(defaultHarness.calls, [
    ["session.getProject", { id: 1 }],
    ["session.getProjects", [string]]
  ]);

  const explicitHarness = createHarness(createProjectDeletionController, {
    projects: [numeric, string],
    confirm: false
  });
  assert.equal(await explicitHarness.controller.deleteProject("1"), false);
  assert.equal(explicitHarness.calls.filter(([name]) => name === "session.getProject").length, 0);
  assert.deepEqual(explicitHarness.calls.slice(0, 4), [
    ["session.getProjects", [numeric, string]],
    ["text.safe", "String"],
    ["confirmation.ask", 'Move project "safe:String" and all of its files to Trash?']
  ]);
});

test("ProjectDeletionController preserves active project command cleanup reload status and history order", async () => {
  const { createProjectDeletionController } = await loadFactory();
  const selected = { id: "project-1", name: "Selected" };
  const harness = createHarness(createProjectDeletionController, {
    project: selected,
    projects: [selected]
  });
  assert.equal(await harness.controller.deleteProject("project-1"), true);
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    [
      "session.getProjects",
      "text.safe",
      "confirmation.ask",
      "autosave.flush",
      "test.projectDeleteFails",
      "commands.createProjectDelete",
      "commands.execute",
      "commandState.selectProject",
      "workspace.clear",
      "session.getProject",
      "session.replaceProject",
      "session.replaceSegments",
      "navigation.openProjects",
      "navigation.clearSelection",
      "projects.load",
      "status.set",
      "history.render"
    ]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "commands.createProjectDelete"),
    ["commands.createProjectDelete", { projectId: "project-1" }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "session.replaceProject"),
    ["session.replaceProject", null]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "session.replaceSegments"),
    ["session.replaceSegments", []]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "projects.load"),
    ["projects.load", false]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "status.set"),
    ["status.set", "Project moved to Trash. Undo is available.", "saved"]
  );
});

test("ProjectDeletionController preserves inactive project branch and contained primary failures", async () => {
  const { createProjectDeletionController } = await loadFactory();
  const deleted = { id: "deleted", name: "Deleted" };
  const inactive = createHarness(createProjectDeletionController, {
    projectReads: [{ id: "current" }],
    projects: [deleted]
  });
  assert.equal(await inactive.controller.deleteProject("deleted"), true);
  for (const name of [
    "session.replaceProject",
    "session.replaceSegments",
    "navigation.openProjects",
    "navigation.clearSelection"
  ]) {
    assert.equal(
      inactive.calls.some(([call]) => call === name),
      false,
      name
    );
  }

  const unavailable = createHarness(createProjectDeletionController, {
    projects: [deleted],
    projectDeleteCommand: null
  });
  assert.equal(await unavailable.controller.deleteProject("deleted"), false);
  assert.deepEqual(unavailable.calls.at(-1), [
    "status.set",
    "The reversible project deletion service is unavailable.",
    "dirty"
  ]);
  assert.equal(
    unavailable.calls.some(([name]) => name === "commands.execute"),
    false
  );

  const simulated = createHarness(createProjectDeletionController, {
    projects: [deleted],
    projectDeleteFails: true
  });
  assert.equal(await simulated.controller.deleteProject("deleted"), false);
  assert.deepEqual(simulated.calls.at(-1), ["status.set", "Simulated project delete failure", "dirty"]);
});

test("ProjectDeletionController preserves project failure short circuit and status failure timing", async () => {
  const { createProjectDeletionController } = await loadFactory();
  const deleted = { id: "deleted", name: "Deleted" };
  for (const failAt of [
    "autosave.flush",
    "test.projectDeleteFails",
    "commands.createProjectDelete",
    "commands.execute",
    "commandState.selectProject",
    "workspace.clear",
    "session.getProject:1",
    "projects.load",
    "history.render"
  ]) {
    const harness = createHarness(createProjectDeletionController, {
      projects: [deleted],
      projectReads: [{ id: "other" }],
      failAt
    });
    assert.equal(await harness.controller.deleteProject("deleted"), false, failAt);
    assert.deepEqual(harness.calls.at(-1), ["status.set", harness.failure.message, "dirty"], failAt);
  }
  const statusFailure = createHarness(createProjectDeletionController, {
    projects: [deleted],
    projectReads: [{ id: "other" }],
    failAt: "status.set"
  });
  await assert.rejects(statusFailure.controller.deleteProject("deleted"), (error) => error === statusFailure.failure);
  assert.equal(statusFailure.calls.filter(([name]) => name === "status.set").length, 2);
});

test("ProjectDeletionController preserves document guards confirmation and exact live session replacement", async () => {
  const { createProjectDeletionController } = await loadFactory();
  const noProject = createHarness(createProjectDeletionController, { project: null });
  assert.equal(await noProject.controller.deleteDocument({ id: "doc" }), false);
  assert.deepEqual(noProject.calls, [["session.getProject", null]]);

  const noDocument = createHarness(createProjectDeletionController);
  assert.equal(await noDocument.controller.deleteDocument(null), false);
  assert.deepEqual(noDocument.calls, [["session.getProject", { id: "project-1", name: "Project one" }]]);

  const declined = createHarness(createProjectDeletionController, { confirm: false });
  const documentInfo = { id: "doc-1", name: "Unsafe <file>" };
  assert.equal(await declined.controller.deleteDocument(documentInfo), false);
  assert.deepEqual(declined.calls.slice(0, 3), [
    ["session.getProject", { id: "project-1", name: "Project one" }],
    ["text.safe", "Unsafe <file>"],
    ["confirmation.ask", 'Move file "safe:Unsafe <file>" to Trash?']
  ]);
  assert.equal(
    declined.calls.some(([name]) => name === "autosave.flush"),
    false
  );
});

test("ProjectDeletionController preserves document command live reads histories selection activity and presentation", async () => {
  const { createProjectDeletionController } = await loadFactory();
  const original = { id: "project-1", name: "Original" };
  const updated = { id: "project-1", name: "Updated" };
  const unrelated = { id: "other", name: "Other" };
  const firstSegment = { id: "segment-1" };
  const documentInfo = { id: "doc-1", name: "File one" };
  const harness = createHarness(createProjectDeletionController, {
    projectReads: [original, original, original, original, updated, updated, updated],
    projectsReads: [[unrelated, original]],
    currentSegments: [firstSegment],
    listedSegments: [{ id: "raw" }],
    preparedSegments: [firstSegment],
    commandResult: { result: { project: updated } }
  });

  assert.equal(await harness.controller.deleteDocument(documentInfo), true);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "commands.createDocumentDelete"),
    ["commands.createDocumentDelete", { project: original, documentId: "doc-1" }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "session.replaceProject"),
    ["session.replaceProject", updated]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "session.replaceProjects"),
    ["session.replaceProjects", [unrelated, updated]]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "segments.list"),
    ["segments.list", "project-1"]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "histories.prepare"),
    ["histories.prepare", [{ id: "raw" }]]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "navigation.selectDocument"),
    ["navigation.selectDocument", { documentId: "" }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "navigation.selectSegment"),
    ["navigation.selectSegment", { activeIndex: 0, segmentId: "segment-1" }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "activity.log"),
    ["activity.log", "delete-file", "Project file deleted", { documentId: "doc-1", fileName: "File one" }]
  );
  assert.deepEqual(harness.calls.slice(-4), [
    ["summaries.refresh"],
    ["home.show"],
    ["status.set", "File moved to Trash. Undo is available.", "saved"],
    ["history.render"]
  ]);
});

test("ProjectDeletionController preserves empty segment selection and contained activity warnings", async () => {
  const { createProjectDeletionController } = await loadFactory();
  const activityFailure = new Error("activity unavailable");
  const documentInfo = { id: "doc-2", name: "File two" };
  const harness = createHarness(createProjectDeletionController, {
    currentSegments: [],
    failAt: "activity.log",
    failure: activityFailure
  });
  assert.equal(await harness.controller.deleteDocument(documentInfo), true);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "navigation.selectSegment"),
    ["navigation.selectSegment", { activeIndex: -1, segmentId: "" }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "logger.warn"),
    ["logger.warn", "File delete activity log failed.", activityFailure]
  );
  assert.equal(harness.calls.filter(([name]) => name === "workspace.mark").length, 2);
  assert.deepEqual(
    harness.calls.find(([name, message]) => name === "status.set" && message.includes("activity")),
    ["status.set", "File moved to Trash; activity log failed", "saved"]
  );

  const simulated = createHarness(createProjectDeletionController, { documentActivityFails: true });
  assert.equal(await simulated.controller.deleteDocument(documentInfo), true);
  assert.equal(
    simulated.calls.some(([name]) => name === "activity.log"),
    false
  );
  assert.match(simulated.calls.find(([name]) => name === "logger.warn")[2].message, /Simulated file delete activity/);
});

test("ProjectDeletionController preserves document primary failure containment and post-save timing", async () => {
  const { createProjectDeletionController } = await loadFactory();
  const documentInfo = { id: "doc", name: "Document" };
  const unavailable = createHarness(createProjectDeletionController, { documentDeleteCommand: null });
  assert.equal(await unavailable.controller.deleteDocument(documentInfo), false);
  assert.deepEqual(unavailable.calls.at(-1), [
    "status.set",
    "The reversible file deletion service is unavailable.",
    "dirty"
  ]);

  const simulated = createHarness(createProjectDeletionController, { documentDeleteFails: true });
  assert.equal(await simulated.controller.deleteDocument(documentInfo), false);
  assert.deepEqual(simulated.calls.at(-1), ["status.set", "Simulated file delete failure", "dirty"]);

  for (const failAt of [
    "autosave.flush",
    "test.documentDeleteFails",
    "commands.createDocumentDelete",
    "commands.execute",
    "commandState.selectProject",
    "session.replaceProject",
    "session.getProjects:1",
    "session.replaceProjects",
    "segments.list",
    "histories.prepare",
    "session.replaceSegments",
    "navigation.selectDocument",
    "session.getSegments:1",
    "navigation.selectSegment",
    "workspace.mark",
    "summaries.refresh",
    "home.show",
    "history.render"
  ]) {
    const harness = createHarness(createProjectDeletionController, { failAt });
    assert.equal(await harness.controller.deleteDocument(documentInfo), false, failAt);
    assert.deepEqual(harness.calls.at(-1), ["status.set", harness.failure.message, "dirty"], failAt);
  }
});

test("ProjectDeletionController validates every owner and exposes an immutable API", async () => {
  const { createProjectDeletionController } = await loadFactory();
  const valid = createHarness(createProjectDeletionController).options;
  const cases = [
    ["session", {}, /project session boundaries/],
    ["confirmation", {}, /confirmation and text-safety boundaries/],
    ["text", {}, /confirmation and text-safety boundaries/],
    ["autosave", {}, /autosave boundary/],
    ["commands", {}, /reversible command boundaries/],
    ["commandState", {}, /command-state boundary/],
    ["workspace", {}, /workspace-dirty boundaries/],
    ["navigation", {}, /navigation boundaries/],
    ["projects", {}, /project and segment repository boundaries/],
    ["segments", {}, /project and segment repository boundaries/],
    ["histories", {}, /project and segment repository boundaries/],
    ["activity", {}, /activity and presentation boundaries/],
    ["summaries", {}, /activity and presentation boundaries/],
    ["home", {}, /activity and presentation boundaries/],
    ["status", {}, /status and history boundaries/],
    ["history", {}, /status and history boundaries/],
    ["test", {}, /checked test boundaries/],
    ["logger", {}, /warning logger boundary/]
  ];
  for (const [key, value, pattern] of cases) {
    assert.throws(() => createProjectDeletionController({ ...valid, [key]: value }), pattern, key);
  }
  const controller = createProjectDeletionController(valid);
  assert.equal(Object.isFrozen(controller), true);
  assert.deepEqual(Object.keys(controller), ["deleteProject", "deleteDocument"]);
});
