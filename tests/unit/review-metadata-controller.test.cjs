const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/quality/review-metadata-controller.js")).href);
}

function createHarness(createReviewMetadataController, overrides = {}) {
  const segment = {
    id: "s1",
    projectId: "p1",
    reviewState: "reviewed",
    reviewNote: "Before note",
    comments: [{ id: "existing", body: "Existing", state: "open" }],
    revision: 4,
    updatedAt: "before"
  };
  const segments = [segment];
  const calls = [];
  const statuses = [];
  let activeIndex = 0;

  const controller = createReviewMetadataController({
    editorSessionStore: { getSegments: () => segments },
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
    activity: {
      log: (value) => {
        calls.push(["activity", value.id, value.reviewState]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    presentation: {
      renderReview: (options) => calls.push(["renderReview", options]),
      updateRow: (index) => calls.push(["updateRow", index]),
      renderHistory: () => calls.push(["renderHistory"])
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    ids: { comment: () => "comment-stable" },
    clock: { now: () => "2026-08-13T12:00:00.000Z" },
    testHooks: overrides.testHooks,
    logger: { warn: (...values) => calls.push(["warn", ...values]) }
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

test("full review metadata normalizes fields, appends one stable comment, persists, and refreshes presentation", async () => {
  const { createReviewMetadataController } = await loadFactory();
  const harness = createHarness(createReviewMetadataController);

  assert.equal(
    await harness.controller.save({
      reviewState: "needs-review",
      reviewNote: "  Saved note  ",
      commentBody: "  Saved comment  "
    }),
    undefined
  );

  assert.equal(harness.segment.reviewState, "needs-review");
  assert.equal(harness.segment.reviewNote, "Saved note");
  assert.equal(harness.segment.revision, 5);
  assert.deepEqual(harness.segment.comments.at(-1), {
    id: "comment-stable",
    body: "Saved comment",
    state: "open",
    createdAt: "2026-08-13T12:00:00.000Z",
    updatedAt: "2026-08-13T12:00:00.000Z"
  });
  assert.deepEqual(
    harness.calls.slice(0, 4).map(([name]) => name),
    ["touch", "clearPending", "save", "activity"]
  );
  assert.ok(harness.calls.some(([name, options]) => name === "renderReview" && options.force === true));
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));
  assert.deepEqual(harness.statuses.at(-1), ["Review saved", "saved"]);
});

test("blank review comments do not change the existing comment collection", async () => {
  const { createReviewMetadataController } = await loadFactory();
  const harness = createHarness(createReviewMetadataController);

  await harness.controller.save({ reviewState: "", reviewNote: "  ", commentBody: "  " });

  assert.equal(harness.segment.reviewState, "");
  assert.equal(harness.segment.reviewNote, "");
  assert.deepEqual(harness.segment.comments, [{ id: "existing", body: "Existing", state: "open" }]);
});

test("primary review metadata persistence failure restores the exact snapshot and failure presentation", async () => {
  const { createReviewMetadataController } = await loadFactory();
  const harness = createHarness(createReviewMetadataController, {
    saveError: new Error("review storage unavailable")
  });
  const before = structuredClone(harness.segment);

  await harness.controller.save({
    reviewState: "needs-review",
    reviewNote: "Changed",
    commentBody: "Transient"
  });

  assert.deepEqual(harness.segment, before);
  assert.deepEqual(harness.statuses.at(-1), ["review storage unavailable", "dirty"]);
  for (const expected of ["restore", "prepareHistory", "renderReview", "updateRow", "renderHistory"]) {
    assert.ok(
      harness.calls.some(([name]) => name === expected),
      `${expected} should run`
    );
  }
  assert.equal(
    harness.calls.some(([name]) => name === "activity" || name === "markDirty"),
    false
  );
});

test("secondary review metadata activity failure keeps the saved review durable", async () => {
  const { createReviewMetadataController } = await loadFactory();
  const harness = createHarness(createReviewMetadataController, {
    activityError: new Error("activity unavailable")
  });

  await harness.controller.save({ reviewState: "reviewed", reviewNote: "Durable", commentBody: "" });

  assert.equal(harness.segment.reviewNote, "Durable");
  assert.equal(harness.segment.revision, 5);
  assert.deepEqual(harness.statuses.at(-1), ["Review saved", "saved"]);
  assert.ok(harness.calls.some(([name]) => name === "warn"));
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));
  assert.equal(
    harness.calls.some(([name]) => name === "restore"),
    false
  );
});

test("review metadata save is inert without an active segment", async () => {
  const { createReviewMetadataController } = await loadFactory();
  const harness = createHarness(createReviewMetadataController);
  harness.setActiveIndex(8);

  assert.equal(await harness.controller.save({ reviewState: "reviewed" }), undefined);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.statuses, []);
});
