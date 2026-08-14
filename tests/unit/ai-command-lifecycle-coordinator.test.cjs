const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const loadFactory = () =>
  import(pathToFileURL(path.join(root, "src/features/ai/ai-command-lifecycle-coordinator.js")).href);

function harness(createCoordinator) {
  const shared = {
    running: false,
    promptBusy: false,
    abortController: null,
    progress: { completed: 1, total: 4 }
  };
  const calls = [];
  const coordinator = createCoordinator({
    state: {
      read: () => shared,
      patch: (values) => {
        calls.push(["patch", values]);
        Object.assign(shared, values);
      }
    },
    presentation: { renderProgress: () => calls.push(["renderProgress"]) },
    status: { set: (...args) => calls.push(["status", ...args]) }
  });
  return { calls, coordinator, shared };
}

function abortHandle(name) {
  return {
    name,
    aborted: false,
    abort() {
      this.aborted = true;
    }
  };
}

test("AI command lifecycle coordinator requires checked state, presentation, and status boundaries", async () => {
  const { createAiCommandLifecycleCoordinator } = await loadFactory();
  assert.throws(() => createAiCommandLifecycleCoordinator({}), /state, progress-presentation, and status boundaries/);
});

test("AI command lifecycle adapter mirrors pretranslation progress and running state", async () => {
  const { createAiCommandLifecycleCoordinator } = await loadFactory();
  const item = harness(createAiCommandLifecycleCoordinator);
  const lifecycle = item.coordinator.createLifecycle("pretranslation", {
    alwaysSyncProgress: true
  });
  const abortController = abortHandle("pretranslation");

  lifecycle.sync({ running: true, abortController, progress: { completed: 0, total: 2 } });
  assert.equal(lifecycle.isBusy(), true);
  assert.equal(lifecycle.isRunning(), true);
  assert.equal(item.shared.abortController, abortController);
  assert.deepEqual(item.shared.progress, { completed: 0, total: 2 });

  lifecycle.sync({ running: false, abortController: null, progress: undefined });
  assert.equal(item.shared.running, false);
  assert.equal(item.shared.abortController, null);
  assert.equal(item.shared.progress, undefined);
});

test("AI command lifecycle adapter preserves conditional progress and owned prompt-busy state", async () => {
  const { createAiCommandLifecycleCoordinator } = await loadFactory();
  const item = harness(createAiCommandLifecycleCoordinator);
  const lifecycle = item.coordinator.createLifecycle("review", { trackPromptBusy: true });

  lifecycle.sync({ running: false, promptBusy: true, progress: undefined });
  assert.equal(lifecycle.isPromptBusy(), true);
  assert.deepEqual(item.shared.progress, { completed: 1, total: 4 });

  lifecycle.sync({ running: false, promptBusy: false, progress: { completed: 2, total: 4 } });
  assert.equal(item.shared.promptBusy, false);
  assert.deepEqual(item.shared.progress, { completed: 2, total: 4 });

  lifecycle.sync({ running: false, promptBusy: false, progress: undefined });
  assert.equal(item.shared.promptBusy, false);
});

test("AI command lifecycle identity guard prevents a finished owner clearing the latest active command", async () => {
  const { createAiCommandLifecycleCoordinator } = await loadFactory();
  const item = harness(createAiCommandLifecycleCoordinator);
  const first = item.coordinator.createLifecycle("first", { trackPromptBusy: true });
  const second = item.coordinator.createLifecycle("second", { trackPromptBusy: true });
  const firstAbort = abortHandle("first");
  const secondAbort = abortHandle("second");

  first.sync({ running: true, promptBusy: false, abortController: firstAbort });
  second.sync({ running: true, promptBusy: false, abortController: secondAbort });
  first.sync({ running: false, promptBusy: false, abortController: null });
  assert.equal(item.shared.running, true);
  assert.equal(item.shared.abortController, secondAbort);

  second.sync({ running: false, promptBusy: false, abortController: null });
  assert.equal(item.shared.running, false);
  assert.equal(item.shared.abortController, null);
});

test("AI command lifecycle cancellation preserves registered priority and stops after acceptance", async () => {
  const { createAiCommandLifecycleCoordinator } = await loadFactory();
  const item = harness(createAiCommandLifecycleCoordinator);
  const attempts = [];
  item.coordinator.setCancelHandlers(
    ["pretranslation", "review", "tag-repair", "alternatives"].map((name) => ({
      cancel: () => {
        attempts.push(name);
        return name === "tag-repair";
      }
    }))
  );

  assert.equal(item.coordinator.cancel(), true);
  assert.deepEqual(attempts, ["pretranslation", "review", "tag-repair"]);
  assert.equal(
    item.calls.some(([name]) => name === "renderProgress"),
    false
  );
  assert.equal(
    item.calls.some(([name]) => name === "status"),
    false
  );
});

test("AI command lifecycle fallback aborts, merges canceled progress, renders, and reports dirty", async () => {
  const { createAiCommandLifecycleCoordinator } = await loadFactory();
  const item = harness(createAiCommandLifecycleCoordinator);
  const abortController = abortHandle("legacy");
  item.shared.abortController = abortController;
  item.coordinator.setCancelHandlers([{ cancel: () => false }, { cancel: () => false }]);

  assert.equal(item.coordinator.cancel(), false);
  assert.equal(abortController.aborted, true);
  assert.deepEqual(item.shared.progress, { completed: 1, total: 4, canceled: true });
  assert.deepEqual(item.calls.slice(-3), [
    ["patch", { progress: { completed: 1, total: 4, canceled: true } }],
    ["renderProgress"],
    ["status", "Canceling local AI batch...", "dirty"]
  ]);
});

test("AI command lifecycle rejects duplicate owners and invalid cancel handlers", async () => {
  const { createAiCommandLifecycleCoordinator } = await loadFactory();
  const item = harness(createAiCommandLifecycleCoordinator);
  item.coordinator.createLifecycle("review");
  assert.throws(() => item.coordinator.createLifecycle("review"), /unique lifecycle owner ID/);
  assert.throws(() => item.coordinator.setCancelHandlers([{}]), /ordered cancel handlers/);
});
