const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-startup-controller.js")).href);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

async function flushPromises() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function createDependencies(overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "startup"} failed`);
  const maybeFail = (stage) => {
    if (overrides.failAt === stage) throw failure;
  };
  const maybeReject = (stage, result) => {
    if (overrides.failAt === stage) return Promise.reject(failure);
    return result;
  };
  const dependencies = {
    reporting: {
      checkpoint(message) {
        calls.push(["checkpoint", message]);
        maybeFail(`checkpoint:${message}`);
      },
      progress(message) {
        calls.push(["progress", message]);
        maybeFail(`progress:${message}`);
      }
    },
    locale: {
      initialize() {
        calls.push(["locale", "initialize"]);
        return maybeReject("locale", overrides.localePromise || Promise.resolve("locale"));
      }
    },
    ui: {
      initialize() {
        calls.push(["ui", "initialize"]);
        maybeFail("ui.initialize");
        return overrides.uiResult || "ui result";
      },
      renderLocaleOptions() {
        calls.push(["ui", "renderLocaleOptions"]);
        maybeFail("ui.renderLocaleOptions");
        return "locale options result";
      }
    },
    wiring: {
      wire() {
        calls.push(["wiring", "wire"]);
        maybeFail("wiring");
        return "wiring result";
      }
    },
    workspace: {
      startAutosave() {
        calls.push(["workspace", "startAutosave"]);
        maybeFail("workspace.startAutosave");
        return "autosave result";
      },
      restoreDirty() {
        calls.push(["workspace", "restoreDirty"]);
        maybeFail("workspace.restoreDirty");
        return "restore result";
      },
      reconnect() {
        calls.push(["workspace", "reconnect"]);
        return maybeReject(
          "workspace.reconnect",
          overrides.reconnectPromise || Promise.resolve(overrides.workspaceStatus || { connected: true })
        );
      },
      assignStatus(status) {
        calls.push(["workspace", "assignStatus", status]);
        maybeFail("workspace.assignStatus");
      },
      renderStatus() {
        calls.push(["workspace", "renderStatus"]);
        maybeFail("workspace.renderStatus");
        return "status result";
      }
    },
    durability: {
      refresh() {
        calls.push(["durability", "refresh"]);
        return maybeReject("durability", overrides.durabilityPromise || Promise.resolve("durability"));
      }
    },
    projects: {
      load(restoreSelection) {
        calls.push(["projects", "load", restoreSelection]);
        return maybeReject("projects.load", overrides.projectsPromise || Promise.resolve("projects"));
      },
      count() {
        calls.push(["projects", "count"]);
        maybeFail("projects.count");
        return overrides.projectCount ?? 0;
      }
    },
    preferences: {},
    workflow: {
      run() {
        calls.push(["workflow", "run"]);
        return maybeReject("workflow", overrides.workflowPromise || Promise.resolve("workflow"));
      }
    },
    offline: {
      register() {
        calls.push(["offline", "register"]);
        maybeFail("offline");
        return overrides.offlineResult || "offline result";
      }
    },
    errors: {
      log(error) {
        calls.push(["errors", "log", error]);
        if (overrides.logError) throw overrides.logError;
      },
      setStatus(message, mode) {
        calls.push(["errors", "setStatus", message, mode]);
        if (overrides.statusError) throw overrides.statusError;
        return "error status result";
      }
    }
  };
  if (overrides.noWorkspace) delete dependencies.workspace.reconnect;
  if (!overrides.noTheme) {
    const theme = {
      initialize(options) {
        calls.push(["theme", "initialize", options, this === theme]);
        return maybeReject("theme", overrides.themePromise || Promise.resolve("theme"));
      }
    };
    dependencies.preferences.theme = theme;
  }
  if (!overrides.noLayout) {
    const layout = {
      initialize() {
        calls.push(["layout", "initialize", this === layout]);
        return maybeReject("layout", overrides.layoutPromise || Promise.resolve("layout"));
      }
    };
    dependencies.preferences.layout = layout;
  }
  return { calls, dependencies, failure };
}

test("ApplicationStartupController preserves exact successful startup order and immutable API", async () => {
  const { createApplicationStartupController } = await loadFactory();
  const offlinePending = deferred();
  const harness = createDependencies({ projectCount: 0, offlineResult: offlinePending.promise });
  const controller = createApplicationStartupController(harness.dependencies);

  assert.equal(Object.isFrozen(controller), true);
  assert.equal(await controller.start(), undefined);
  assert.deepEqual(
    harness.calls.map((call) => call.slice(0, 2)),
    [
      ["checkpoint", "loading active interface locale"],
      ["locale", "initialize"],
      ["checkpoint", "initializing UI and event wiring"],
      ["ui", "initialize"],
      ["checkpoint", "rendering UI locale options"],
      ["ui", "renderLocaleOptions"],
      ["checkpoint", "binding local AI drawer"],
      ["checkpoint", "wiring UI events"],
      ["wiring", "wire"],
      ["checkpoint", "starting workspace autosave"],
      ["workspace", "startAutosave"],
      ["checkpoint", "starting application bootstrap"],
      ["progress", "startup: restoring workspace state"],
      ["workspace", "restoreDirty"],
      ["progress", "startup: checking storage durability"],
      ["durability", "refresh"],
      ["progress", "startup: reconnecting workspace"],
      ["workspace", "reconnect"],
      ["workspace", "assignStatus"],
      ["workspace", "renderStatus"],
      ["progress", "startup: loading projects"],
      ["projects", "load"],
      ["progress", "startup: loading interface preferences"],
      ["projects", "count"],
      ["theme", "initialize"],
      ["layout", "initialize"],
      ["progress", "startup: starting workflow characterization"],
      ["workflow", "run"],
      ["offline", "register"]
    ]
  );
  assert.deepEqual(harness.calls.find((call) => call[0] === "theme").slice(2), [{ freshProfile: true }, true]);
  assert.equal(harness.calls.find((call) => call[0] === "layout")[2], true);
});

test("ApplicationStartupController preserves awaited boundaries and concurrent preference initialization", async () => {
  const { createApplicationStartupController } = await loadFactory();
  const locale = deferred();
  const durability = deferred();
  const theme = deferred();
  const layout = deferred();
  const harness = createDependencies({
    localePromise: locale.promise,
    durabilityPromise: durability.promise,
    themePromise: theme.promise,
    layoutPromise: layout.promise,
    projectCount: 2
  });
  const startup = createApplicationStartupController(harness.dependencies).start();
  await flushPromises();
  assert.deepEqual(
    harness.calls.map((call) => call.slice(0, 2)),
    [
      ["checkpoint", "loading active interface locale"],
      ["locale", "initialize"]
    ]
  );

  locale.resolve();
  await flushPromises();
  assert.equal(harness.calls.at(-1)[0], "durability");
  assert.equal(
    harness.calls.some((call) => call[0] === "workspace" && call[1] === "reconnect"),
    false
  );

  durability.resolve();
  await flushPromises();
  assert.equal(
    harness.calls.some((call) => call[0] === "theme"),
    true
  );
  assert.equal(
    harness.calls.some((call) => call[0] === "layout"),
    true
  );
  assert.equal(
    harness.calls.some((call) => call[0] === "workflow"),
    false
  );
  assert.deepEqual(harness.calls.find((call) => call[0] === "theme")[2], { freshProfile: false });

  theme.resolve();
  await flushPromises();
  assert.equal(
    harness.calls.some((call) => call[0] === "workflow"),
    false
  );
  layout.resolve();
  await startup;
  assert.equal(harness.calls.at(-1)[0], "offline");
});

test("ApplicationStartupController preserves absent workspace and optional preference branches", async () => {
  const { createApplicationStartupController } = await loadFactory();
  const harness = createDependencies({ noWorkspace: true, noTheme: true, noLayout: true });
  const controller = createApplicationStartupController(harness.dependencies);

  assert.equal(await controller.start(), undefined);
  for (const operation of ["reconnect", "assignStatus", "renderStatus"]) {
    assert.equal(
      harness.calls.some((call) => call[0] === "workspace" && call[1] === operation),
      false
    );
  }
  assert.equal(
    harness.calls.some((call) => call[0] === "projects" && call[1] === "count"),
    false
  );
  assert.equal(
    harness.calls.some((call) => call[0] === "theme" || call[0] === "layout"),
    false
  );
  assert.equal(harness.calls.at(-1)[0], "offline");
});

test("ApplicationStartupController stops and reports every primary startup failure", async () => {
  const { createApplicationStartupController } = await loadFactory();
  for (const failAt of [
    "locale",
    "ui.initialize",
    "ui.renderLocaleOptions",
    "wiring",
    "workspace.startAutosave",
    "workspace.restoreDirty",
    "durability",
    "workspace.reconnect",
    "workspace.assignStatus",
    "workspace.renderStatus",
    "projects.load",
    "projects.count",
    "theme",
    "layout",
    "workflow",
    "offline"
  ]) {
    const harness = createDependencies({ failAt });
    assert.equal(await createApplicationStartupController(harness.dependencies).start(), undefined);
    assert.deepEqual(harness.calls.slice(-2), [
      ["errors", "log", harness.failure],
      ["errors", "setStatus", `${failAt} failed`, "dirty"]
    ]);
  }
});

test("ApplicationStartupController preserves fallback copy and error-handler failure timing", async () => {
  const { createApplicationStartupController } = await loadFactory();
  const blank = createDependencies({ failAt: "workflow", failure: new Error("") });
  await createApplicationStartupController(blank.dependencies).start();
  assert.deepEqual(blank.calls.at(-1), ["errors", "setStatus", "Startup error", "dirty"]);

  const logError = new Error("logger failed");
  const logging = createDependencies({ failAt: "locale", logError });
  await assert.rejects(createApplicationStartupController(logging.dependencies).start(), logError);
  assert.equal(
    logging.calls.some((call) => call[1] === "setStatus"),
    false
  );

  const statusError = new Error("status failed");
  const status = createDependencies({ failAt: "locale", statusError });
  await assert.rejects(createApplicationStartupController(status.dependencies).start(), statusError);
  assert.equal(status.calls.at(-1)[1], "setStatus");
});

test("ApplicationStartupController validates all required and optional boundaries", async () => {
  const { createApplicationStartupController } = await loadFactory();
  const valid = createDependencies().dependencies;
  for (const [key, value, error] of [
    ["reporting", { ...valid.reporting, progress: null }, /requires checked progress reporters/],
    ["locale", { initialize: null }, /requires checked locale, UI, and wiring actions/],
    ["workspace", { ...valid.workspace, restoreDirty: null }, /requires checked workspace actions/],
    ["durability", { refresh: null }, /requires checked durability and project actions/],
    ["workflow", { run: null }, /requires checked workflow, offline, and error actions/]
  ]) {
    assert.throws(() => createApplicationStartupController({ ...valid, [key]: value }), error);
  }
  assert.throws(
    () =>
      createApplicationStartupController({
        ...valid,
        workspace: { ...valid.workspace, reconnect: true }
      }),
    /requires a checked optional workspace reconnect action/
  );
  for (const key of ["theme", "layout"]) {
    assert.throws(
      () =>
        createApplicationStartupController({
          ...valid,
          preferences: { ...valid.preferences, [key]: { initialize: true } }
        }),
      /requires checked optional preference controllers/
    );
  }
});
