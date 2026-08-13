const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/quality/quality-decision-controller.js")).href);
}

function createHarness(createQualityDecisionController, overrides = {}) {
  const project = { id: "p1" };
  const segment = {
    id: "s1",
    projectId: "p1",
    reviewState: "reviewed",
    comments: [{ id: "existing", body: "Existing", state: "open" }],
    revision: 7,
    updatedAt: "before"
  };
  const segments = [segment];
  const calls = [];
  const statuses = [];
  const queue = { projectId: "p1", totalRiskItems: 1, items: [{ segmentId: "s1" }] };
  let activeIndex = 0;

  const controller = createQualityDecisionController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getSegments: () => segments,
      replaceQualityRiskQueue: (value) => calls.push(["replaceQueue", value])
    },
    selection: { getActiveIndex: () => activeIndex },
    mutation: {
      touch(value) {
        calls.push(["touch"]);
        value.revision += 1;
        value.updatedAt = "after";
      },
      restore(value, snapshot) {
        calls.push(["restore"]);
        Reflect.ownKeys(value).forEach((key) => delete value[key]);
        Object.assign(value, snapshot);
      },
      prepareHistory: () => calls.push(["prepareHistory"])
    },
    persistence: {
      clearPending: (value) => calls.push(["clearPending", value.id]),
      save: (value) => {
        calls.push(["save", structuredClone(value)]);
        return overrides.saveError ? Promise.reject(overrides.saveError) : Promise.resolve();
      }
    },
    risk: {
      buildQueue: () => {
        calls.push(["buildQueue"]);
        return queue;
      }
    },
    activity: {
      log: (value, activeProject, decision) => {
        calls.push(["activity", value.id, activeProject.id, decision]);
        return Promise.resolve(overrides.activityLogged !== false);
      }
    },
    presentation: {
      clearNote: () => calls.push(["clearNote"]),
      renderReview: (options) => calls.push(["renderReview", options]),
      renderWorkbench: () => calls.push(["renderWorkbench"]),
      updateRow: (index) => calls.push(["updateRow", index])
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    labels: {
      category: (category) => ({ accuracy: "Accuracy", review: "Review" })[category] || category,
      severity: (severity) => ({ high: "High", medium: "Medium" })[severity] || severity
    },
    ids: { comment: () => "comment-stable" },
    clock: { now: () => "2026-08-13T13:00:00.000Z" }
  });

  return {
    calls,
    controller,
    segment,
    setActiveIndex: (index) => {
      activeIndex = index;
    },
    statuses
  };
}

test("quality decision normalizes metadata, persists one stable comment, refreshes risk, and clears the note", async () => {
  const { createQualityDecisionController } = await loadFactory();
  const harness = createHarness(createQualityDecisionController);

  assert.equal(
    await harness.controller.save({ category: "ACCURACY", severity: "HIGH", note: "  Evidence note  " }),
    true
  );

  assert.equal(harness.segment.reviewState, "needs-review");
  assert.equal(harness.segment.revision, 8);
  assert.deepEqual(harness.segment.comments.at(-1), {
    id: "comment-stable",
    body: "Quality decision: Accuracy (High)\nEvidence note",
    state: "open",
    qualityDecision: { category: "accuracy", severity: "high" },
    createdAt: "2026-08-13T13:00:00.000Z",
    updatedAt: "2026-08-13T13:00:00.000Z"
  });
  assert.deepEqual(
    harness.calls.slice(0, 3).map(([name]) => name),
    ["touch", "clearPending", "save"]
  );
  assert.ok(harness.calls.some(([name]) => name === "clearNote"));
  assert.ok(harness.calls.some(([name]) => name === "replaceQueue"));
  assert.ok(harness.calls.some(([name, options]) => name === "renderReview" && options.force === true));
  assert.deepEqual(harness.statuses.at(-1), ["Quality decision saved", "saved"]);
});

test("invalid decision values fall back to review and medium without an empty note line", async () => {
  const { createQualityDecisionController } = await loadFactory();
  const harness = createHarness(createQualityDecisionController);

  await harness.controller.save({ category: "unknown", severity: "unknown", note: "  " });

  assert.equal(harness.segment.comments.at(-1).body, "Quality decision: Review (Medium)");
  assert.deepEqual(harness.segment.comments.at(-1).qualityDecision, { category: "review", severity: "medium" });
});

test("primary quality decision persistence failure restores the exact snapshot and failure presentation", async () => {
  const { createQualityDecisionController } = await loadFactory();
  const harness = createHarness(createQualityDecisionController, {
    saveError: new Error("quality storage unavailable")
  });
  const before = structuredClone(harness.segment);

  assert.equal(await harness.controller.save({ category: "accuracy", severity: "high", note: "Transient" }), false);

  assert.deepEqual(harness.segment, before);
  assert.deepEqual(harness.statuses.at(-1), ["quality storage unavailable", "dirty"]);
  for (const expected of ["restore", "prepareHistory", "renderReview", "renderWorkbench", "updateRow"]) {
    assert.ok(
      harness.calls.some(([name]) => name === expected),
      `${expected} should run`
    );
  }
  assert.equal(
    harness.calls.some(([name]) => ["clearNote", "buildQueue", "activity", "markDirty"].includes(name)),
    false
  );
});

test("secondary quality decision activity failure keeps the saved decision and reports a dirty warning", async () => {
  const { createQualityDecisionController } = await loadFactory();
  const harness = createHarness(createQualityDecisionController, { activityLogged: false });

  assert.equal(await harness.controller.save({ category: "accuracy", severity: "high", note: "Durable" }), true);

  assert.equal(harness.segment.reviewState, "needs-review");
  assert.equal(harness.segment.comments.at(-1).body.includes("Durable"), true);
  assert.deepEqual(harness.statuses.at(-1), ["Quality decision saved; activity log failed", "dirty"]);
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));
  assert.equal(
    harness.calls.some(([name]) => name === "restore"),
    false
  );
});

test("quality decision save is inert without an active project or segment", async () => {
  const { createQualityDecisionController } = await loadFactory();
  const withoutProject = createHarness(createQualityDecisionController, { noProject: true });
  assert.equal(await withoutProject.controller.save({ category: "accuracy" }), false);
  assert.deepEqual(withoutProject.calls, []);

  const withoutSegment = createHarness(createQualityDecisionController);
  withoutSegment.setActiveIndex(9);
  assert.equal(await withoutSegment.controller.save({ category: "accuracy" }), false);
  assert.deepEqual(withoutSegment.calls, []);
});
