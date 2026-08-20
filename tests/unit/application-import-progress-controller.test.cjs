const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-import-progress-controller.js")).href);
}

function createHarness(createApplicationImportProgressController, overrides = {}) {
  const calls = [];
  const frameCallbacks = [];
  const timerCallbacks = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "progress"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  let task = overrides.task ?? null;
  let workspaceStatus = overrides.workspaceStatus ?? null;
  let hasFrame = overrides.hasFrame ?? true;
  const context = {
    getTask() {
      calls.push(["context.getTask", task]);
      fail("context.getTask");
      return task;
    },
    getWorkspaceStatus() {
      calls.push(["context.getWorkspaceStatus", workspaceStatus]);
      fail("context.getWorkspaceStatus");
      return workspaceStatus;
    }
  };
  const presentation = {
    renderImportBusy(busy) {
      calls.push(["presentation.renderImportBusy", busy]);
      fail("presentation.renderImportBusy");
    },
    renderRecoveryBusy(viewModel) {
      calls.push(["presentation.renderRecoveryBusy", viewModel]);
      fail("presentation.renderRecoveryBusy");
    }
  };
  const status = {
    set(value) {
      calls.push(["status.set", value]);
      fail("status.set");
    }
  };
  const schedulers = {
    hasFrame() {
      calls.push(["schedulers.hasFrame", hasFrame]);
      fail("schedulers.hasFrame");
      return hasFrame;
    },
    frame(callback) {
      calls.push(["schedulers.frame", callback]);
      fail("schedulers.frame");
      frameCallbacks.push(callback);
      if (overrides.frameImmediately) callback();
      return overrides.frameResult;
    },
    timer(callback, delay) {
      calls.push(["schedulers.timer", callback, delay]);
      fail("schedulers.timer");
      timerCallbacks.push(callback);
      if (overrides.timerImmediately) callback();
      return overrides.timerResult;
    }
  };
  const controller = createApplicationImportProgressController({ context, presentation, status, schedulers });
  return {
    calls,
    context,
    controller,
    frameCallbacks,
    presentation,
    schedulers,
    setHasFrame(value) {
      hasFrame = value;
    },
    setTask(value) {
      task = value;
    },
    setWorkspaceStatus(value) {
      workspaceStatus = value;
    },
    status,
    timerCallbacks
  };
}

test("ApplicationImportProgressController preserves live busy presentation and immutable API", async () => {
  const { createApplicationImportProgressController } = await loadFactory();
  const harness = createHarness(createApplicationImportProgressController);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.renderBusy(), undefined);
  assert.deepEqual(harness.calls, [
    ["context.getTask", null],
    ["presentation.renderImportBusy", false],
    ["context.getWorkspaceStatus", null],
    ["presentation.renderRecoveryBusy", { busy: false, status: {} }]
  ]);

  const workspaceStatus = { connected: true };
  harness.setTask("Workspace sync");
  harness.setWorkspaceStatus(workspaceStatus);
  harness.controller.renderBusy();
  assert.deepEqual(harness.calls.slice(-4), [
    ["context.getTask", "Workspace sync"],
    ["presentation.renderImportBusy", true],
    ["context.getWorkspaceStatus", workspaceStatus],
    ["presentation.renderRecoveryBusy", { busy: true, status: workspaceStatus }]
  ]);
});

test("ApplicationImportProgressController preserves every file-size numeric edge and unit", async () => {
  const { createApplicationImportProgressController } = await loadFactory();
  const { controller } = createHarness(createApplicationImportProgressController);
  for (const value of [undefined, null, "", 0, -1, Number.NaN, Number.POSITIVE_INFINITY, "not-a-number"]) {
    assert.equal(controller.formatFileSize(value), "");
  }
  for (const [value, expected] of [
    [1, "1 B"],
    [9.6, "10 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [10240, "10 KB"],
    [1048576, "1.0 MB"],
    [1073741824, "1.0 GB"],
    [10737418240, "10 GB"],
    ["2048", "2.0 KB"]
  ]) {
    assert.equal(controller.formatFileSize(value), expected);
  }
});

test("ApplicationImportProgressController preserves every progress fragment and live task fallback", async () => {
  const { createApplicationImportProgressController } = await loadFactory();
  const harness = createHarness(createApplicationImportProgressController);
  assert.equal(harness.controller.setProgress("Reading"), undefined);
  assert.deepEqual(harness.calls, [
    ["context.getTask", null],
    ["status.set", "Import: Reading"]
  ]);

  harness.setTask("Project import");
  harness.controller.setProgress("Parsing", { name: "package.json", size: 1536 }, "2 of 3");
  assert.deepEqual(harness.calls.slice(-2), [
    ["context.getTask", "Project import"],
    ["status.set", "Project import: Parsing - package.json (1.5 KB) - 2 of 3"]
  ]);

  harness.controller.setProgress("Reading", { name: "", size: Number.POSITIVE_INFINITY });
  assert.deepEqual(harness.calls.at(-1), ["status.set", "Project import: Reading ()"]);
});

test("ApplicationImportProgressController schedules frame and timer and settles only once", async () => {
  const { createApplicationImportProgressController } = await loadFactory();
  const harness = createHarness(createApplicationImportProgressController, {
    frameResult: 17,
    timerResult: 23
  });
  const result = harness.controller.yieldToUi();
  assert.equal(result instanceof Promise, true);
  assert.equal(harness.frameCallbacks.length, 1);
  assert.equal(harness.timerCallbacks.length, 1);
  assert.equal(harness.calls[0][0], "schedulers.hasFrame");
  assert.equal(harness.calls[1][0], "schedulers.frame");
  assert.deepEqual(harness.calls[2].slice(0, 1), ["schedulers.timer"]);
  assert.equal(harness.calls[2][2], 50);

  let settlements = 0;
  void result.then(() => {
    settlements += 1;
  });
  harness.timerCallbacks[0]();
  await result;
  harness.frameCallbacks[0]();
  await Promise.resolve();
  assert.equal(settlements, 1);
});

test("ApplicationImportProgressController preserves absent and live frame scheduling", async () => {
  const { createApplicationImportProgressController } = await loadFactory();
  const harness = createHarness(createApplicationImportProgressController, { hasFrame: false });
  const first = harness.controller.yieldToUi();
  assert.equal(harness.frameCallbacks.length, 0);
  assert.equal(harness.timerCallbacks.length, 1);
  harness.timerCallbacks.shift()();
  await first;

  harness.setHasFrame(true);
  const second = harness.controller.yieldToUi();
  assert.equal(harness.frameCallbacks.length, 1);
  assert.equal(harness.timerCallbacks.length, 1);
  harness.frameCallbacks[0]();
  await second;
});

test("ApplicationImportProgressController preserves synchronous callback and unconditional timer scheduling", async () => {
  const { createApplicationImportProgressController } = await loadFactory();
  const frame = createHarness(createApplicationImportProgressController, { frameImmediately: true });
  await frame.controller.yieldToUi();
  assert.equal(frame.timerCallbacks.length, 1);

  const timer = createHarness(createApplicationImportProgressController, { timerImmediately: true });
  await timer.controller.yieldToUi();
  assert.equal(timer.frameCallbacks.length, 1);
});

test("ApplicationImportProgressController reports status before awaiting the UI yield", async () => {
  const { createApplicationImportProgressController } = await loadFactory();
  const harness = createHarness(createApplicationImportProgressController, { task: "TMX import", hasFrame: false });
  const result = harness.controller.reportProgress("Indexing", { name: "memory.tmx", size: 1024 }, "ready");
  assert.deepEqual(
    harness.calls.slice(0, 4).map(([name]) => name),
    ["context.getTask", "status.set", "schedulers.hasFrame", "schedulers.timer"]
  );
  harness.timerCallbacks[0]();
  assert.equal(await result, undefined);
});

test("ApplicationImportProgressController preserves busy, status, and scheduler failure timing", async () => {
  const { createApplicationImportProgressController } = await loadFactory();
  for (const failAt of [
    "context.getTask",
    "presentation.renderImportBusy",
    "context.getWorkspaceStatus",
    "presentation.renderRecoveryBusy"
  ]) {
    const failure = new Error(`${failAt} failed`);
    const harness = createHarness(createApplicationImportProgressController, { failAt, failure });
    assert.throws(() => harness.controller.renderBusy(), failure);
  }

  const statusFailure = new Error("status failed");
  const status = createHarness(createApplicationImportProgressController, {
    failAt: "status.set",
    failure: statusFailure
  });
  await assert.rejects(status.controller.reportProgress("Reading"), statusFailure);
  assert.equal(
    status.calls.some(([name]) => name.startsWith("schedulers.")),
    false
  );

  for (const failAt of ["schedulers.hasFrame", "schedulers.frame", "schedulers.timer"]) {
    const failure = new Error(`${failAt} failed`);
    const harness = createHarness(createApplicationImportProgressController, { failAt, failure });
    await assert.rejects(harness.controller.yieldToUi(), failure);
  }
});

test("ApplicationImportProgressController validates every injected owner", async () => {
  const { createApplicationImportProgressController } = await loadFactory();
  const valid = createHarness(createApplicationImportProgressController);
  const create = (changes = {}) =>
    createApplicationImportProgressController({
      context: valid.context,
      presentation: valid.presentation,
      status: valid.status,
      schedulers: valid.schedulers,
      ...changes
    });
  for (const changes of [{ context: {} }, { presentation: {} }, { status: {} }, { schedulers: {} }]) {
    assert.throws(() => create(changes), /ApplicationImportProgressController requires checked|requires a checked/);
  }
});
