const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

test("editor context controller coordinates contextual panels before asynchronous services", async () => {
  const { createEditorContextController } = await import(
    pathToFileURL(path.join(root, "src/features/editor/editor-context-controller.js")).href
  );
  const calls = [];
  const context = { projectId: "project-1", segmentId: "segment-2" };
  const controller = createEditorContextController({
    getContext: () => context,
    renderReview: (value) => calls.push(["review", value]),
    renderHistory: (value) => calls.push(["history", value]),
    renderAi: (value) => calls.push(["ai", value]),
    renderQuality: (value) => calls.push(["quality", value]),
    refreshMatches(value) {
      calls.push(["matches", value]);
      return Promise.resolve();
    },
    refreshTerms(value) {
      calls.push(["terms", value]);
      return Promise.resolve();
    }
  });

  const result = await controller.refresh();
  assert.deepEqual(
    calls.map(([name]) => name),
    ["review", "history", "ai", "quality", "matches", "terms"]
  );
  assert.deepEqual(result.context, context);
  assert.equal(result.current, true);
});

test("editor context controller identifies a superseded asynchronous refresh", async () => {
  const { createEditorContextController } = await import(
    pathToFileURL(path.join(root, "src/features/editor/editor-context-controller.js")).href
  );
  let context = { projectId: "project-1", segmentId: "segment-1" };
  let releaseFirst;
  const controller = createEditorContextController({
    getContext: () => context,
    refreshMatches: () =>
      new Promise((resolve) => {
        releaseFirst = resolve;
      }),
    refreshTerms: () => Promise.resolve()
  });

  const first = controller.refresh();
  context = { projectId: "project-1", segmentId: "segment-2" };
  controller.invalidate();
  releaseFirst();
  assert.equal((await first).current, false);
  assert.deepEqual(controller.currentContext(), context);
});
