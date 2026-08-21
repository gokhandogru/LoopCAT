const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createRevisionHistoryRenderScheduler, overrides = {}) {
  const calls = [];
  const frames = [];
  let nextFrame = overrides.firstFrame ?? 1;
  let scheduler;
  scheduler = createRevisionHistoryRenderScheduler({
    requestFrame(callback) {
      calls.push(["requestFrame", callback]);
      if (overrides.requestError) throw overrides.requestError;
      frames.push(callback);
      const current = nextFrame;
      nextFrame += 1;
      return overrides.returnZero ? 0 : current;
    },
    presentation: {
      render() {
        calls.push(["render"]);
        if (overrides.renderError) throw overrides.renderError;
        if (overrides.reentrant) scheduler.schedule();
        return overrides.renderResult;
      }
    }
  });
  return { calls, frames, scheduler };
}

test("RevisionHistoryRenderScheduler queues one frame and coalesces repeated scheduling", async () => {
  const { createRevisionHistoryRenderScheduler } = await moduleAt(
    "src/features/quality/revision-history-render-scheduler.js"
  );
  const harness = createHarness(createRevisionHistoryRenderScheduler, { firstFrame: 9 });

  assert.equal(harness.scheduler.schedule(), undefined);
  assert.equal(harness.scheduler.schedule(), undefined);
  assert.equal(harness.scheduler.schedule(), undefined);

  assert.equal(harness.frames.length, 1);
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ["requestFrame"]
  );
});

test("RevisionHistoryRenderScheduler clears the marker before rendering and accepts a later frame", async () => {
  const { createRevisionHistoryRenderScheduler } = await moduleAt(
    "src/features/quality/revision-history-render-scheduler.js"
  );
  const harness = createHarness(createRevisionHistoryRenderScheduler);
  harness.scheduler.schedule();

  assert.equal(harness.frames[0](), undefined);
  assert.equal(harness.scheduler.schedule(), undefined);

  assert.equal(harness.frames.length, 2);
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ["requestFrame", "render", "requestFrame"]
  );
});

test("RevisionHistoryRenderScheduler permits reentrant scheduling from presentation", async () => {
  const { createRevisionHistoryRenderScheduler } = await moduleAt(
    "src/features/quality/revision-history-render-scheduler.js"
  );
  const harness = createHarness(createRevisionHistoryRenderScheduler, { reentrant: true });
  harness.scheduler.schedule();

  harness.frames[0]();

  assert.equal(harness.frames.length, 2);
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ["requestFrame", "render", "requestFrame"]
  );
});

test("RevisionHistoryRenderScheduler preserves falsy frame-handle scheduling behavior", async () => {
  const { createRevisionHistoryRenderScheduler } = await moduleAt(
    "src/features/quality/revision-history-render-scheduler.js"
  );
  const harness = createHarness(createRevisionHistoryRenderScheduler, { returnZero: true });

  harness.scheduler.schedule();
  harness.scheduler.schedule();

  assert.equal(harness.frames.length, 2);
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ["requestFrame", "requestFrame"]
  );
});

test("RevisionHistoryRenderScheduler preserves request and render failure recovery timing", async () => {
  const { createRevisionHistoryRenderScheduler } = await moduleAt(
    "src/features/quality/revision-history-render-scheduler.js"
  );
  const requestError = new Error("request failed");
  const requestFailure = createHarness(createRevisionHistoryRenderScheduler, { requestError });
  assert.throws(
    () => requestFailure.scheduler.schedule(),
    (error) => error === requestError
  );
  assert.throws(
    () => requestFailure.scheduler.schedule(),
    (error) => error === requestError
  );
  assert.deepEqual(
    requestFailure.calls.map(([name]) => name),
    ["requestFrame", "requestFrame"]
  );

  const renderError = new Error("render failed");
  const renderFailure = createHarness(createRevisionHistoryRenderScheduler, { renderError });
  renderFailure.scheduler.schedule();
  assert.throws(
    () => renderFailure.frames[0](),
    (error) => error === renderError
  );
  renderFailure.scheduler.schedule();
  assert.deepEqual(
    renderFailure.calls.map(([name]) => name),
    ["requestFrame", "render", "requestFrame"]
  );
});

test("RevisionHistoryRenderScheduler validates boundaries and exposes an immutable API", async () => {
  const { createRevisionHistoryRenderScheduler } = await moduleAt(
    "src/features/quality/revision-history-render-scheduler.js"
  );
  const valid = createHarness(createRevisionHistoryRenderScheduler).scheduler;
  assert.deepEqual(Object.keys(valid), ["schedule"]);
  assert.equal(Object.isFrozen(valid), true);

  assert.throws(
    () => createRevisionHistoryRenderScheduler({ requestFrame: null, presentation: { render() {} } }),
    /RevisionHistoryRenderScheduler requires frame and presentation boundaries\./
  );
  assert.throws(
    () => createRevisionHistoryRenderScheduler({ requestFrame() {}, presentation: { render: null } }),
    /RevisionHistoryRenderScheduler requires frame and presentation boundaries\./
  );
});
