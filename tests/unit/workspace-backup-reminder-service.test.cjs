const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const STORAGE_KEY = "loopcat.backupReminder.dismissedUntil";
const DAY_MS = 86400000;

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/workspace/workspace-backup-reminder-service.js")).href);
}

function createHarness(createWorkspaceBackupReminderService, overrides = {}) {
  const calls = [];
  const rendered = [];
  const model = {
    project: Object.hasOwn(overrides, "project") ? overrides.project : null,
    activityEvents: Object.hasOwn(overrides, "activityEvents") ? overrides.activityEvents : [],
    stored: Object.hasOwn(overrides, "stored") ? overrides.stored : null,
    now: overrides.now || new Date("2026-08-21T12:00:00.000Z"),
    nowMs: Object.hasOwn(overrides, "nowMs") ? overrides.nowMs : new Date("2026-08-21T12:00:00.000Z").getTime()
  };
  const dependencies = {
    session: {
      getProject() {
        calls.push(["getProject"]);
        if (overrides.getProjectError) throw overrides.getProjectError;
        return model.project;
      },
      getActivityEvents() {
        calls.push(["getActivityEvents"]);
        if (overrides.getActivityEventsError) throw overrides.getActivityEventsError;
        return model.activityEvents;
      }
    },
    storage: {
      getItem(key) {
        calls.push(["getItem", key]);
        if (overrides.getItemError) throw overrides.getItemError;
        return model.stored;
      },
      setItem(key, value) {
        calls.push(["setItem", key, value]);
        if (overrides.setItemError) throw overrides.setItemError;
        model.stored = value;
      },
      removeItem(key) {
        calls.push(["removeItem", key]);
        if (overrides.removeItemError) throw overrides.removeItemError;
        model.stored = null;
      }
    },
    clock: {
      now() {
        calls.push(["now"]);
        if (overrides.nowError) throw overrides.nowError;
        return model.now;
      },
      nowMs() {
        calls.push(["nowMs"]);
        if (overrides.nowMsError) throw overrides.nowMsError;
        return model.nowMs;
      },
      create(value) {
        calls.push(["create", value]);
        if (overrides.createErrorValue === value) throw overrides.createError;
        return new Date(value);
      }
    },
    recovery: {
      render(viewModel) {
        calls.push(["render", viewModel]);
        rendered.push(viewModel);
        if (overrides.renderError) throw overrides.renderError;
        return overrides.renderResult;
      }
    }
  };
  return {
    calls,
    rendered,
    model,
    dependencies,
    service: createWorkspaceBackupReminderService(dependencies)
  };
}

test("WorkspaceBackupReminderService preserves exact day arithmetic and invalid-date policy", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const now = new Date("2026-08-21T12:00:00.000Z");
  const harness = createHarness(createWorkspaceBackupReminderService, { now });
  assert.equal(harness.service.daysBetween("2026-08-20T12:00:00.000Z"), 1);
  assert.equal(harness.service.daysBetween("2026-08-20T12:00:00.001Z", now), 0);
  assert.equal(harness.service.daysBetween("2026-08-22T12:00:00.000Z", now), 0);
  assert.equal(harness.service.daysBetween("invalid", now), Infinity);
  assert.equal(harness.service.daysBetween(null, now), Math.floor(now.getTime() / DAY_MS));
  assert.deepEqual(
    harness.calls.map((entry) => entry[0]),
    ["now", "create", "create", "create", "create", "create"]
  );
});

test("WorkspaceBackupReminderService preserves dismissal JSON shapes and fresh records", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const harness = createHarness(createWorkspaceBackupReminderService, {
    stored: '{"project":"2026-08-22T00:00:00.000Z"}'
  });
  const first = harness.service.dismissals();
  const second = harness.service.dismissals();
  assert.deepEqual(first, { project: "2026-08-22T00:00:00.000Z" });
  assert.deepEqual(second, first);
  assert.notStrictEqual(first, second);
  for (const stored of ["[]", "null", '"text"', "0", "false", null]) {
    harness.model.stored = stored;
    assert.deepEqual(harness.service.dismissals(), {});
  }
  assert.equal(
    harness.calls.every((entry) => entry[0] === "getItem" && entry[1] === STORAGE_KEY),
    true
  );
});

test("WorkspaceBackupReminderService cleans malformed dismissal storage with exact failure timing", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const malformed = createHarness(createWorkspaceBackupReminderService, { stored: "{" });
  assert.deepEqual(malformed.service.dismissals(), {});
  assert.deepEqual(malformed.calls, [
    ["getItem", STORAGE_KEY],
    ["removeItem", STORAGE_KEY]
  ]);

  const readFailure = new Error("read failed");
  const failedRead = createHarness(createWorkspaceBackupReminderService, { getItemError: readFailure });
  assert.deepEqual(failedRead.service.dismissals(), {});
  assert.deepEqual(failedRead.calls, [
    ["getItem", STORAGE_KEY],
    ["removeItem", STORAGE_KEY]
  ]);

  const cleanupFailure = new Error("cleanup failed");
  const failedCleanup = createHarness(createWorkspaceBackupReminderService, {
    stored: "{",
    removeItemError: cleanupFailure
  });
  assert.throws(() => failedCleanup.service.dismissals(), cleanupFailure);
});

test("WorkspaceBackupReminderService preserves dismissal expiry and default-clock order", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const now = new Date("2026-08-21T12:00:00.000Z");
  const harness = createHarness(createWorkspaceBackupReminderService, {
    now,
    stored: JSON.stringify({
      future: "2026-08-21T12:00:00.001Z",
      equal: "2026-08-21T12:00:00.000Z",
      invalid: "invalid",
      blank: ""
    })
  });
  assert.equal(harness.service.isDismissed("future"), true);
  assert.deepEqual(
    harness.calls.slice(0, 3).map((entry) => entry[0]),
    ["now", "getItem", "create"]
  );
  harness.calls.length = 0;
  assert.equal(harness.service.isDismissed("equal", now), false);
  assert.equal(harness.service.isDismissed("invalid", now), false);
  assert.equal(harness.service.isDismissed("blank", now), false);
  assert.equal(harness.service.isDismissed("missing", now), false);
  assert.deepEqual(
    harness.calls.map((entry) => entry[0]),
    ["getItem", "create", "getItem", "create", "getItem", "getItem"]
  );
});

test("WorkspaceBackupReminderService dismisses the current project for 24 hours then rerenders", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const now = new Date("2026-08-21T12:00:00.000Z");
  const project = { id: "project", createdAt: "2026-08-01T12:00:00.000Z", exportHistory: [] };
  const harness = createHarness(createWorkspaceBackupReminderService, {
    project,
    now,
    nowMs: now.getTime(),
    stored: '{"other":"2026-08-22T00:00:00.000Z"}'
  });
  assert.equal(harness.service.dismiss(), undefined);
  assert.deepEqual(JSON.parse(harness.model.stored), {
    other: "2026-08-22T00:00:00.000Z",
    project: "2026-08-22T12:00:00.000Z"
  });
  assert.deepEqual(harness.rendered, [{ info: null }]);
  assert.deepEqual(
    harness.calls.map((entry) => entry[0]),
    [
      "getProject",
      "getItem",
      "nowMs",
      "create",
      "setItem",
      "getProject",
      "getActivityEvents",
      "now",
      "getItem",
      "create",
      "render"
    ]
  );
});

test("WorkspaceBackupReminderService preserves dismiss guards, custom hours, and contained writes", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const noProject = createHarness(createWorkspaceBackupReminderService, { project: null });
  assert.equal(noProject.service.dismiss(), undefined);
  assert.deepEqual(noProject.calls, [["getProject"]]);

  const explicitBlank = createHarness(createWorkspaceBackupReminderService, { project: { id: "current" } });
  assert.equal(explicitBlank.service.dismiss("", 1), undefined);
  assert.deepEqual(explicitBlank.calls, []);

  const writeFailure = new Error("write failed");
  const failedWrite = createHarness(createWorkspaceBackupReminderService, {
    project: { id: "project", createdAt: "2026-08-01T12:00:00.000Z", exportHistory: [] },
    nowMs: new Date("2026-08-21T12:00:00.000Z").getTime(),
    setItemError: writeFailure
  });
  assert.doesNotThrow(() => failedWrite.service.dismiss("project", 2));
  assert.equal(
    failedWrite.calls.some(([name]) => name === "render"),
    true
  );

  const dateFailure = new Error("date failed");
  const failedDate = createHarness(createWorkspaceBackupReminderService, {
    createErrorValue: new Date("2026-08-21T12:00:00.000Z").getTime() + 3600000,
    createError: dateFailure,
    nowMs: new Date("2026-08-21T12:00:00.000Z").getTime()
  });
  assert.throws(() => failedDate.service.dismiss("project", 1), dateFailure);
  assert.equal(
    failedDate.calls.some(([name]) => name === "setItem" || name === "render"),
    false
  );
});

test("WorkspaceBackupReminderService selects the latest valid package export without mutating history", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const oldExport = { type: "project-package", createdAt: "2026-07-01T00:00:00.000Z", marker: "old" };
  const latestExport = { type: "project-package", createdAt: "2026-08-20T00:00:00.000Z", marker: "latest" };
  const project = {
    exportHistory: [
      oldExport,
      { type: "target-txt", createdAt: "2026-08-21T00:00:00.000Z" },
      { type: "project-package", createdAt: "" },
      latestExport
    ]
  };
  const originalHistory = [...project.exportHistory];
  const harness = createHarness(createWorkspaceBackupReminderService, { project });
  assert.strictEqual(harness.service.latestExport(), latestExport);
  assert.deepEqual(project.exportHistory, originalHistory);
  assert.equal(harness.service.latestExport({ exportHistory: [] }), null);
  assert.equal(harness.service.latestExport(null), null);
  assert.throws(() => harness.service.latestExport({ exportHistory: {} }), TypeError);
  assert.equal(harness.calls[0][0], "getProject");
});

test("WorkspaceBackupReminderService preserves info default reads, project guard, and dismissal short circuit", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const noProject = createHarness(createWorkspaceBackupReminderService, { project: null });
  assert.equal(noProject.service.info(), null);
  assert.deepEqual(
    noProject.calls.map((entry) => entry[0]),
    ["getProject", "getActivityEvents", "now"]
  );

  const project = { id: "dismissed", createdAt: "2026-08-01T12:00:00.000Z", exportHistory: [] };
  const dismissed = createHarness(createWorkspaceBackupReminderService, {
    project,
    activityEvents: [{ createdAt: "2026-08-20T00:00:00.000Z" }],
    stored: '{"dismissed":"2026-08-22T00:00:00.000Z"}'
  });
  assert.equal(dismissed.service.info(), null);
  assert.deepEqual(
    dismissed.calls.map((entry) => entry[0]),
    ["getProject", "getActivityEvents", "now", "getItem", "create"]
  );
});

test("WorkspaceBackupReminderService preserves every threshold and exact reminder copy", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const now = new Date("2026-08-21T12:00:00.000Z");
  const info = (project, activityEvents = []) =>
    createHarness(createWorkspaceBackupReminderService, { project, activityEvents, now }).service.info(
      project,
      activityEvents,
      now
    );

  assert.equal(info({ id: "recent", createdAt: new Date(now - 6 * DAY_MS).toISOString(), exportHistory: [] }), null);
  assert.deepEqual(info({ id: "old", createdAt: new Date(now - 7 * DAY_MS).toISOString(), exportHistory: [] }), {
    reason: "This project is 7 days old and has no project package export yet.",
    projectAgeDays: 7,
    daysSinceExport: Infinity,
    activitiesSinceExport: 0
  });
  assert.match(
    info(
      { id: "active", createdAt: new Date(now - DAY_MS).toISOString(), exportHistory: [] },
      Array.from({ length: 25 }, (_, index) => ({ createdAt: new Date(now - index * 1000).toISOString() }))
    ).reason,
    /^This project is 1 day old/
  );

  const recentExport = { type: "project-package", createdAt: new Date(now - 6 * DAY_MS).toISOString() };
  const longProject = {
    id: "exported",
    createdAt: new Date(now - 20 * DAY_MS).toISOString(),
    exportHistory: [recentExport]
  };
  assert.equal(
    info(
      longProject,
      Array.from({ length: 9 }, () => ({ createdAt: now.toISOString() }))
    ),
    null
  );

  const oldExport = { type: "project-package", createdAt: new Date(now - 7 * DAY_MS).toISOString() };
  const staleProject = { ...longProject, exportHistory: [oldExport] };
  assert.deepEqual(info(staleProject, [{ createdAt: now.toISOString() }]), {
    reason: "1 project activity has happened since the last project package export.",
    projectAgeDays: 20,
    daysSinceExport: 7,
    activitiesSinceExport: 1
  });
  assert.match(
    info(
      longProject,
      Array.from({ length: 10 }, (_, index) => ({ createdAt: new Date(now.getTime() - index * 1000).toISOString() }))
    ).reason,
    /^10 project activities have happened/
  );
});

test("WorkspaceBackupReminderService renders the exact live info and preserves presentation failures", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const project = { id: "project", createdAt: "2026-08-01T12:00:00.000Z", exportHistory: [] };
  const harness = createHarness(createWorkspaceBackupReminderService, { project, renderResult: "ignored" });
  assert.equal(harness.service.render(), undefined);
  assert.deepEqual(harness.rendered, [
    {
      info: {
        reason: "This project is 20 days old and has no project package export yet.",
        projectAgeDays: 20,
        daysSinceExport: Infinity,
        activitiesSinceExport: 0
      }
    }
  ]);

  const renderFailure = new Error("render failed");
  const failed = createHarness(createWorkspaceBackupReminderService, { project, renderError: renderFailure });
  assert.throws(() => failed.service.render(), renderFailure);
  assert.equal(failed.calls.at(-1)[0], "render");
});

test("WorkspaceBackupReminderService validates every boundary and exposes an immutable API", async () => {
  const { createWorkspaceBackupReminderService } = await loadFactory();
  const valid = createHarness(createWorkspaceBackupReminderService).dependencies;
  for (const [owner, method] of [
    ["session", "getProject"],
    ["session", "getActivityEvents"],
    ["storage", "getItem"],
    ["storage", "setItem"],
    ["storage", "removeItem"],
    ["clock", "now"],
    ["clock", "nowMs"],
    ["clock", "create"],
    ["recovery", "render"]
  ]) {
    const dependencies = { ...valid, [owner]: { ...valid[owner], [method]: undefined } };
    assert.throws(
      () => createWorkspaceBackupReminderService(dependencies),
      /requires checked session, storage, clock, and recovery boundaries/
    );
  }
  const service = createWorkspaceBackupReminderService(valid);
  assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(Object.keys(service), [
    "daysBetween",
    "dismissals",
    "isDismissed",
    "dismiss",
    "latestExport",
    "info",
    "render"
  ]);
  assert.equal(
    Reflect.set(service, "render", () => {}),
    false
  );
});
