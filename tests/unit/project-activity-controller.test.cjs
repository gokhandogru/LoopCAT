const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-activity-controller.js")).href);
}

function createHarness(createProjectActivityController, overrides = {}) {
  const calls = [];
  const defaultProject = { id: "project-1" };
  const projects = overrides.projects || [defaultProject];
  let projectRead = 0;
  const event = Object.prototype.hasOwnProperty.call(overrides, "event") ? overrides.event : { id: "activity-1" };
  const listedEvents = Object.prototype.hasOwnProperty.call(overrides, "listedEvents")
    ? overrides.listedEvents
    : [event];
  const options = {
    session: {
      getProject() {
        calls.push(["session.getProject"]);
        if (overrides.projectError) throw overrides.projectError;
        const index = Math.min(projectRead, projects.length - 1);
        projectRead += 1;
        return projects[index];
      },
      prependActivityEvent(value) {
        calls.push(["session.prependActivityEvent", value]);
        if (overrides.prependError) throw overrides.prependError;
        return overrides.prependResult;
      },
      replaceActivityEvents(value) {
        calls.push(["session.replaceActivityEvents", value]);
        if (overrides.replaceError) throw overrides.replaceError;
        return overrides.replaceResult;
      }
    },
    repository: {
      record(activity) {
        calls.push(["repository.record", activity]);
        if (overrides.recordError) throw overrides.recordError;
        return Object.prototype.hasOwnProperty.call(overrides, "recordResult") ? overrides.recordResult : event;
      },
      list(projectId) {
        calls.push(["repository.list", projectId]);
        if (overrides.listError) throw overrides.listError;
        return Object.prototype.hasOwnProperty.call(overrides, "listResult") ? overrides.listResult : listedEvents;
      }
    },
    workspace: {
      mark(projectId) {
        calls.push(["workspace.mark", projectId]);
        if (overrides.markError) throw overrides.markError;
        return overrides.markResult;
      }
    },
    reminder: {
      render() {
        calls.push(["reminder.render"]);
        if (overrides.reminderError) throw overrides.reminderError;
        return overrides.reminderResult;
      }
    },
    ids: {
      make(prefix) {
        calls.push(["ids.make", prefix]);
        if (overrides.idError) throw overrides.idError;
        return Object.prototype.hasOwnProperty.call(overrides, "activityId") ? overrides.activityId : "activity-id";
      }
    },
    defaults: {
      workspaceId() {
        calls.push(["defaults.workspaceId"]);
        if (overrides.workspaceIdError) throw overrides.workspaceIdError;
        return Object.prototype.hasOwnProperty.call(overrides, "workspaceId")
          ? overrides.workspaceId
          : "default-workspace";
      },
      userId() {
        calls.push(["defaults.userId"]);
        if (overrides.userIdError) throw overrides.userIdError;
        return Object.prototype.hasOwnProperty.call(overrides, "userId") ? overrides.userId : "default-user";
      }
    },
    clock: {
      iso() {
        calls.push(["clock.iso"]);
        if (overrides.clockError) throw overrides.clockError;
        return Object.prototype.hasOwnProperty.call(overrides, "now") ? overrides.now : "2026-08-21T12:00:00.000Z";
      }
    },
    portable: {
      sanitize(value) {
        calls.push(["portable.sanitize", value]);
        if (overrides.sanitizeError) throw overrides.sanitizeError;
        return Object.prototype.hasOwnProperty.call(overrides, "sanitized") ? overrides.sanitized : value;
      }
    },
    logger: {
      warn(...args) {
        calls.push(["logger.warn", ...args]);
        if (overrides.warnError) throw overrides.warnError;
        return overrides.warnResult;
      }
    },
    testHooks: {
      beforeOptionalCurrent(type) {
        calls.push(["testHooks.beforeOptionalCurrent", type]);
        if (overrides.currentHookError) throw overrides.currentHookError;
        return overrides.currentHookResult;
      },
      beforeOptionalProject(type) {
        calls.push(["testHooks.beforeOptionalProject", type]);
        if (overrides.projectHookError) throw overrides.projectHookError;
        return overrides.projectHookResult;
      }
    }
  };

  return { calls, event, listedEvents, options, controller: createProjectActivityController(options) };
}

test("ProjectActivityController preserves default-project no-op and exact active recording sequence", async () => {
  const { createProjectActivityController } = await loadFactory();
  const absent = createHarness(createProjectActivityController, { projects: [null] });
  assert.equal(await absent.controller.log("qa", "QA run"), null);
  assert.deepEqual(absent.calls, [["session.getProject"]]);

  const project = { id: "project-1" };
  const detail = { count: 2 };
  const active = createHarness(createProjectActivityController, { projects: [project, { id: "project-1" }] });
  assert.equal(await active.controller.log("qa", "QA run", detail), active.event);
  assert.deepEqual(active.calls, [
    ["session.getProject"],
    ["repository.record", { projectId: "project-1", type: "qa", summary: "QA run", detail }],
    ["session.getProject"],
    ["session.prependActivityEvent", active.event],
    ["reminder.render"],
    ["workspace.mark", "project-1"]
  ]);
  assert.equal(active.calls[1][1].detail, detail);
});

test("ProjectActivityController preserves explicit, inactive, and falsy-event recording branches", async () => {
  const { createProjectActivityController } = await loadFactory();
  const project = { id: "explicit" };
  const inactive = createHarness(createProjectActivityController, { projects: [{ id: "other" }] });
  assert.equal(await inactive.controller.log("type", "summary", {}, project), inactive.event);
  assert.deepEqual(
    inactive.calls.map((call) => call[0]),
    ["repository.record", "session.getProject", "workspace.mark"]
  );

  const falsy = createHarness(createProjectActivityController, { event: null });
  assert.equal(await falsy.controller.log("type", "summary", undefined, project), null);
  assert.deepEqual(
    falsy.calls.map((call) => call[0]),
    ["repository.record", "workspace.mark"]
  );
  assert.deepEqual(falsy.calls[0][1].detail, {});
});

test("ProjectActivityController preserves every primary recording failure boundary", async () => {
  const { createProjectActivityController } = await loadFactory();
  for (const [override, expectedLast] of [
    [{ recordError: new Error("record failed") }, "repository.record"],
    [{ projectError: new Error("project failed") }, "session.getProject"],
    [{ prependError: new Error("prepend failed") }, "session.prependActivityEvent"],
    [{ reminderError: new Error("reminder failed") }, "reminder.render"],
    [{ markError: new Error("mark failed") }, "workspace.mark"]
  ]) {
    const explicitProject = expectedLast === "session.getProject" ? { id: "project-1" } : undefined;
    const harness = createHarness(createProjectActivityController, override);
    await assert.rejects(harness.controller.log("type", "summary", {}, explicitProject), Object.values(override)[0]);
    assert.equal(harness.calls.at(-1)[0], expectedLast);
  }
});

test("ProjectActivityController drafts exact portable activity records and preserves fallbacks", async () => {
  const { createProjectActivityController } = await loadFactory();
  const detail = { source: "test" };
  const sanitized = { sanitized: true };
  const harness = createHarness(createProjectActivityController, {
    activityId: "activity-7",
    workspaceId: "",
    userId: "",
    now: "2026-08-21T13:00:00.000Z",
    sanitized
  });
  assert.equal(harness.controller.draft(null, "export", "", detail), sanitized);
  assert.deepEqual(harness.calls, [
    ["clock.iso"],
    ["ids.make", "activity"],
    ["defaults.workspaceId"],
    ["defaults.userId"],
    ["defaults.userId"],
    [
      "portable.sanitize",
      {
        id: "activity-7",
        workspaceId: "local-workspace",
        ownerId: "local-user",
        projectId: "",
        type: "export",
        summary: "export",
        detail,
        createdBy: "local-user",
        createdAt: "2026-08-21T13:00:00.000Z"
      }
    ]
  ]);
  assert.equal(harness.calls.at(-1)[1].detail, detail);
});

test("ProjectActivityController draft uses project identity before defaults and returns sanitizer identity", async () => {
  const { createProjectActivityController } = await loadFactory();
  const project = {
    id: "project-2",
    workspaceId: "workspace-2",
    ownerId: "owner-2",
    updatedBy: "editor-2"
  };
  const harness = createHarness(createProjectActivityController);
  const result = harness.controller.draft(project, "import", "Imported", undefined);
  assert.equal(result, harness.calls.at(-1)[1]);
  assert.deepEqual(
    harness.calls.map((call) => call[0]),
    ["clock.iso", "ids.make", "portable.sanitize"]
  );
  assert.deepEqual(result, {
    id: "activity-id",
    workspaceId: "workspace-2",
    ownerId: "owner-2",
    projectId: "project-2",
    type: "import",
    summary: "Imported",
    detail: {},
    createdBy: "editor-2",
    createdAt: "2026-08-21T12:00:00.000Z"
  });
});

test("ProjectActivityController optional current logging preserves hook, success, and default-label behavior", async () => {
  const { createProjectActivityController } = await loadFactory();
  const detail = { count: 1 };
  const success = createHarness(createProjectActivityController);
  assert.equal(await success.controller.logOptional("export", "Exported", detail), true);
  assert.deepEqual(
    success.calls.map((call) => call[0]),
    [
      "testHooks.beforeOptionalCurrent",
      "session.getProject",
      "repository.record",
      "session.getProject",
      "session.prependActivityEvent",
      "reminder.render",
      "workspace.mark"
    ]
  );

  const failure = new Error("injected failure");
  const failed = createHarness(createProjectActivityController, {
    currentHookError: failure,
    projects: [{ id: "dirty-project" }, { id: "dirty-project" }]
  });
  assert.equal(await failed.controller.logOptional("import", "", {}, undefined), false);
  assert.deepEqual(failed.calls, [
    ["testHooks.beforeOptionalCurrent", "import"],
    ["logger.warn", "import activity log failed.", failure],
    ["session.getProject"],
    ["session.getProject"],
    ["workspace.mark", "dirty-project"]
  ]);
});

test("ProjectActivityController optional current logging preserves catch failure timing", async () => {
  const { createProjectActivityController } = await loadFactory();
  const primary = new Error("record rejected");
  const warnError = new Error("warn failed");
  const warning = createHarness(createProjectActivityController, { recordResult: Promise.reject(primary), warnError });
  await assert.rejects(warning.controller.logOptional("type", "Label"), warnError);
  assert.equal(warning.calls.at(-1)[0], "logger.warn");

  const projectError = new Error("catch project read failed");
  const project = createHarness(createProjectActivityController, { currentHookError: primary, projectError });
  await assert.rejects(project.controller.logOptional("type", "Label"), projectError);
  assert.equal(project.calls.at(-1)[0], "session.getProject");
});

test("ProjectActivityController logs explicit project activity and reloads the active session", async () => {
  const { createProjectActivityController } = await loadFactory();
  const detail = { imported: true };
  const harness = createHarness(createProjectActivityController, { projects: [{ id: "project-9" }] });
  const result = await harness.controller.logOptionalForProject("project-9", "import", "Imported", detail);
  assert.deepEqual(result, { ok: true, event: harness.event });
  assert.equal(result.event, harness.event);
  assert.deepEqual(harness.calls, [
    ["testHooks.beforeOptionalProject", "import"],
    ["repository.record", { projectId: "project-9", type: "import", summary: "Imported", detail }],
    ["session.getProject"],
    ["repository.list", "project-9"],
    ["session.replaceActivityEvents", harness.listedEvents],
    ["reminder.render"],
    ["workspace.mark", "project-9"]
  ]);
});

test("ProjectActivityController preserves inactive explicit logging and contained failures", async () => {
  const { createProjectActivityController } = await loadFactory();
  const inactive = createHarness(createProjectActivityController, { projects: [{ id: "other" }] });
  assert.deepEqual(await inactive.controller.logOptionalForProject("project-9", "import", "Imported"), {
    ok: true,
    event: inactive.event
  });
  assert.deepEqual(
    inactive.calls.map((call) => call[0]),
    ["testHooks.beforeOptionalProject", "repository.record", "session.getProject", "workspace.mark"]
  );

  const failure = new Error("explicit hook failed");
  const failed = createHarness(createProjectActivityController, { projectHookError: failure });
  assert.deepEqual(await failed.controller.logOptionalForProject("project-9", "import", ""), {
    ok: false,
    event: null
  });
  assert.deepEqual(failed.calls, [
    ["testHooks.beforeOptionalProject", "import"],
    ["logger.warn", "import activity log failed.", failure],
    ["workspace.mark", "project-9"]
  ]);

  const empty = createHarness(createProjectActivityController, { projectHookError: failure });
  assert.deepEqual(await empty.controller.logOptionalForProject("", "import", "Imported"), {
    ok: false,
    event: null
  });
  assert.equal(
    empty.calls.some(([name]) => name === "workspace.mark"),
    false
  );
});

test("ProjectActivityController contains late explicit refresh failures and preserves dirty timing", async () => {
  const { createProjectActivityController } = await loadFactory();
  for (const [override, expectedBeforeWarning] of [
    [{ listError: new Error("list failed") }, "repository.list"],
    [{ replaceError: new Error("replace failed") }, "session.replaceActivityEvents"],
    [{ reminderError: new Error("reminder failed") }, "reminder.render"]
  ]) {
    const harness = createHarness(createProjectActivityController, {
      ...override,
      projects: [{ id: "project-1" }]
    });
    assert.deepEqual(await harness.controller.logOptionalForProject("project-1", "import", "Imported"), {
      ok: false,
      event: null
    });
    const warningIndex = harness.calls.findIndex(([name]) => name === "logger.warn");
    assert.equal(harness.calls[warningIndex - 1][0], expectedBeforeWarning);
    assert.deepEqual(harness.calls.at(-1), ["workspace.mark", "project-1"]);
  }
});

test("ProjectActivityController preserves shared warning and status truthiness policy", async () => {
  const { createProjectActivityController } = await loadFactory();
  const harness = createHarness(createProjectActivityController);
  for (const truthy of [true, 1, "yes", {}]) {
    assert.equal(harness.controller.appendWarning("Saved", truthy), "Saved");
    assert.equal(harness.controller.statusMode("saved", truthy), "saved");
  }
  for (const falsy of [false, 0, "", null, undefined, Number.NaN]) {
    assert.equal(harness.controller.appendWarning("Saved", falsy), "Saved; activity log failed");
    assert.equal(harness.controller.statusMode("saved", falsy), "dirty");
  }
  assert.deepEqual(harness.calls, []);
});

test("ProjectActivityController validates every boundary and exposes an immutable API", async () => {
  const { createProjectActivityController } = await loadFactory();
  const valid = createHarness(createProjectActivityController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), [
    "log",
    "draft",
    "logOptional",
    "logOptionalForProject",
    "appendWarning",
    "statusMode"
  ]);

  const invalid = [
    undefined,
    {},
    { ...valid.options, session: { ...valid.options.session, getProject: null } },
    { ...valid.options, session: { ...valid.options.session, prependActivityEvent: null } },
    { ...valid.options, session: { ...valid.options.session, replaceActivityEvents: null } },
    { ...valid.options, repository: { ...valid.options.repository, record: null } },
    { ...valid.options, repository: { ...valid.options.repository, list: null } },
    { ...valid.options, workspace: { mark: null } },
    { ...valid.options, reminder: { render: null } },
    { ...valid.options, ids: { make: null } },
    { ...valid.options, defaults: { ...valid.options.defaults, workspaceId: null } },
    { ...valid.options, defaults: { ...valid.options.defaults, userId: null } },
    { ...valid.options, clock: { iso: null } },
    { ...valid.options, portable: { sanitize: null } },
    { ...valid.options, logger: { warn: null } },
    { ...valid.options, testHooks: { ...valid.options.testHooks, beforeOptionalCurrent: null } },
    { ...valid.options, testHooks: { ...valid.options.testHooks, beforeOptionalProject: null } }
  ];
  invalid.forEach((options) => {
    assert.throws(() => createProjectActivityController(options), /ProjectActivityController requires/);
  });
});
