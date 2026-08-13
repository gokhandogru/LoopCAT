const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function fakeScheduler() {
  let nextId = 1;
  const tasks = [];
  return {
    setTimer(callback, delay) {
      const task = { id: nextId++, callback, delay, cleared: false, ran: false };
      tasks.push(task);
      return task;
    },
    clearTimer(task) {
      if (task) task.cleared = true;
    },
    active() {
      return tasks.filter((task) => !task.cleared && !task.ran);
    },
    async runNext() {
      const task = tasks.find((item) => !item.cleared && !item.ran);
      assert.ok(task, "an active timer must exist");
      task.ran = true;
      await task.callback();
      return task;
    }
  };
}

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/autosave-service.js")).href);
}

function createHarness(createAutosaveService, overrides = {}) {
  const scheduler = fakeScheduler();
  const state = { segments: overrides.segments || [] };
  const saved = [];
  const savedBatches = [];
  const finalized = [];
  const statuses = [];
  let savedNotifications = 0;
  const service = createAutosaveService({
    editorSessionStore: { getSegments: () => state.segments },
    repository: {
      save:
        overrides.save ||
        ((segment) => {
          saved.push(segment);
          return Promise.resolve();
        }),
      saveMany:
        overrides.saveMany ||
        ((segments) => {
          savedBatches.push(segments);
          return Promise.resolve();
        })
    },
    editLifecycle: {
      finalize: (segmentId) => finalized.push(["segment", segmentId]),
      finalizeProject: (projectId) => finalized.push(["project", projectId]),
      finalizeAll: () => finalized.push(["all"])
    },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    onSaved: () => {
      savedNotifications += 1;
    },
    testHooks: overrides.testHooks,
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });
  return {
    finalized,
    saved,
    savedBatches,
    scheduler,
    service,
    state,
    statuses,
    savedNotifications: () => savedNotifications
  };
}

test("autosave debounce coalesces timers and persists the latest EditorSessionStore record", async () => {
  const { createAutosaveService } = await loadFactory();
  const original = { id: "s1", projectId: "p1", documentId: "d1", target: "first" };
  const harness = createHarness(createAutosaveService, { segments: [original] });

  harness.service.debounce(original);
  const latest = { ...original, target: "latest" };
  harness.state.segments = [latest];
  harness.service.debounce(latest);

  assert.equal(harness.service.size(), 1);
  assert.equal(harness.scheduler.active().length, 1);
  assert.equal(harness.scheduler.active()[0].delay, 450);
  assert.deepEqual(harness.statuses.slice(0, 2), [
    ["Unsaved changes", "dirty"],
    ["Unsaved changes", "dirty"]
  ]);

  await harness.scheduler.runNext();
  assert.deepEqual(harness.saved, [latest]);
  assert.deepEqual(harness.finalized, [["segment", "s1"]]);
  assert.equal(harness.service.size(), 0);
  assert.deepEqual(harness.statuses.at(-1), ["Saved", "saved"]);
  assert.equal(harness.savedNotifications(), 1);
});

test("timed autosave failure remains pending and retries after two seconds", async () => {
  const { createAutosaveService } = await loadFactory();
  const segment = { id: "s1", projectId: "p1", documentId: "d1", target: "retry" };
  let attempts = 0;
  const harness = createHarness(createAutosaveService, {
    segments: [segment],
    save: () => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error("transient write failure"));
      return Promise.resolve();
    }
  });

  harness.service.debounce(segment);
  await harness.scheduler.runNext();
  assert.equal(harness.service.has(segment.id), true);
  assert.equal(harness.scheduler.active()[0].delay, 2000);
  assert.deepEqual(harness.statuses.at(-1), ["transient write failure; retrying autosave", "dirty"]);

  await harness.scheduler.runNext();
  assert.equal(attempts, 2);
  assert.equal(harness.service.has(segment.id), false);
  assert.deepEqual(harness.statuses.at(-1), ["Saved", "saved"]);
});

test("failed project flush requeues only its records and a recovered flush persists them", async () => {
  const { createAutosaveService } = await loadFactory();
  const first = { id: "s1", projectId: "p1", documentId: "d1", target: "one" };
  const second = { id: "s2", projectId: "p2", documentId: "d2", target: "two" };
  let failFlush = true;
  const harness = createHarness(createAutosaveService, {
    segments: [first, second],
    testHooks: {
      beforeFlush() {
        if (failFlush) throw new Error("forced flush failure");
      }
    }
  });
  harness.service.queue(first);
  harness.service.queue(second);

  await assert.rejects(harness.service.flush("p1"), /forced flush failure/);
  assert.equal(harness.service.has(first.id), true);
  assert.equal(harness.service.has(second.id), true);
  assert.equal(
    harness.scheduler.active().find((task) => harness.service.pendingRecords("p1")[0]?.timer === task)?.delay,
    2000
  );
  assert.deepEqual(harness.finalized, [["project", "p1"]]);

  failFlush = false;
  const flushed = await harness.service.flush("p1");
  assert.deepEqual(flushed, [first]);
  assert.deepEqual(harness.savedBatches, [[first]]);
  assert.equal(harness.service.has(first.id), false);
  assert.equal(harness.service.has(second.id), true);

  harness.service.clearDocument("p2", "d2");
  assert.equal(harness.service.size(), 0);
  assert.deepEqual(harness.finalized.at(-1), ["segment", "s2"]);
});
