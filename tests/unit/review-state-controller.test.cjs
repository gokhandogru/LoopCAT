const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/quality/review-state-controller.js")).href);
}

function createHarness(createReviewStateController, overrides = {}) {
  const project = { id: "p1" };
  const segment = {
    id: "s1",
    projectId: "p1",
    reviewState: "needs-review",
    revision: 4,
    updatedAt: "before"
  };
  const segments = [segment];
  const calls = [];
  const statuses = [];
  let activeIndex = 0;
  let createdOptions = null;

  const controller = createReviewStateController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getSegments: () => segments
    },
    commands: {
      bus: {
        execute(command) {
          calls.push(["execute"]);
          return command.execute();
        }
      },
      create(options) {
        calls.push(["create", options.projectId, options.segmentId]);
        createdOptions = options;
        return { execute: options.applyFirst };
      },
      changed: () => calls.push(["commandsChanged"])
    },
    selection: { getActiveIndex: () => activeIndex },
    mutation: {
      toggle(value, reviewState) {
        calls.push(["toggle", reviewState]);
        value.reviewState = value.reviewState === reviewState ? "" : reviewState;
      },
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
        calls.push(["save", value.reviewState]);
        return overrides.saveError ? Promise.reject(overrides.saveError) : Promise.resolve();
      }
    },
    restoration: {
      restoreCommand: (segmentId, snapshot) => {
        calls.push(["restoreCommand", segmentId, snapshot]);
        return Promise.resolve();
      }
    },
    activity: {
      log: (value, activeProject, summary) => {
        calls.push(["activity", value.id, activeProject.id, summary]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    presentation: {
      syncState: (reviewState) => calls.push(["syncState", reviewState]),
      renderReview: () => calls.push(["renderReview"]),
      updateRow: (index) => calls.push(["updateRow", index]),
      renderHistory: () => calls.push(["renderHistory"])
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    describeState: (reviewState) => ({ reviewed: "reviewed", blocked: "blocked" })[reviewState] || "",
    testHooks: overrides.testHooks,
    logger: { warn: (...values) => calls.push(["warn", ...values]) }
  });

  return {
    calls,
    controller,
    createdOptions: () => createdOptions,
    segment,
    setActiveIndex: (index) => {
      activeIndex = index;
    },
    statuses
  };
}

test("quick review state command toggles, persists, synchronizes presentation, and exposes Undo", async () => {
  const { createReviewStateController } = await loadFactory();
  const harness = createHarness(createReviewStateController);

  assert.equal(await harness.controller.setState("reviewed"), undefined);
  assert.equal(harness.segment.reviewState, "reviewed");
  assert.equal(harness.segment.revision, 5);
  assert.deepEqual(harness.statuses.at(-1), ["Marked reviewed; Undo is available", "saved"]);
  assert.deepEqual(harness.calls.slice(0, 6), [
    ["create", "p1", "s1"],
    ["execute"],
    ["toggle", "reviewed"],
    ["touch"],
    ["syncState", "reviewed"],
    ["clearPending", "s1"]
  ]);
  assert.ok(harness.calls.some(([name, , , summary]) => name === "activity" && summary === "Marked reviewed"));
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));
  assert.ok(harness.calls.some(([name]) => name === "commandsChanged"));
  assert.equal(harness.createdOptions().beforeSnapshot.reviewState, "needs-review");

  await harness.createdOptions().restoreSnapshot({ reviewState: "needs-review" });
  assert.ok(harness.calls.some(([name, segmentId]) => name === "restoreCommand" && segmentId === "s1"));
});

test("selecting the active quick review state clears it with the original status and activity copy", async () => {
  const { createReviewStateController } = await loadFactory();
  const harness = createHarness(createReviewStateController);

  await harness.controller.setState("needs-review");

  assert.equal(harness.segment.reviewState, "");
  assert.deepEqual(harness.statuses.at(-1), ["Review state cleared; Undo is available", "saved"]);
  assert.ok(harness.calls.some(([name, , , summary]) => name === "activity" && summary === "Review state cleared"));
});

test("primary quick review save failure restores the exact snapshot and failure presentation", async () => {
  const { createReviewStateController } = await loadFactory();
  const harness = createHarness(createReviewStateController, {
    saveError: new Error("review storage unavailable")
  });

  await harness.controller.setState("reviewed");

  assert.equal(harness.segment.reviewState, "needs-review");
  assert.equal(harness.segment.revision, 4);
  assert.equal(harness.segment.updatedAt, "before");
  assert.deepEqual(harness.statuses.at(-1), ["review storage unavailable", "dirty"]);
  for (const expected of ["restore", "prepareHistory", "renderReview", "updateRow", "renderHistory"]) {
    assert.ok(
      harness.calls.some(([name]) => name === expected),
      `${expected} should run`
    );
  }
  assert.equal(
    harness.calls.some(([name]) => name === "commandsChanged"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    false
  );
});

test("secondary quick review activity failure keeps the saved command durable", async () => {
  const { createReviewStateController } = await loadFactory();
  const harness = createHarness(createReviewStateController, {
    activityError: new Error("activity unavailable")
  });

  await harness.controller.setState("blocked");

  assert.equal(harness.segment.reviewState, "blocked");
  assert.deepEqual(harness.statuses.at(-1), ["Marked blocked; Undo is available", "saved"]);
  assert.ok(harness.calls.some(([name]) => name === "warn"));
  assert.ok(harness.calls.some(([name]) => name === "commandsChanged"));
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));
});

test("quick review state is inert without an active project or segment", async () => {
  const { createReviewStateController } = await loadFactory();
  const withoutProject = createHarness(createReviewStateController, { noProject: true });
  assert.equal(await withoutProject.controller.setState("reviewed"), undefined);
  assert.equal(withoutProject.calls.length, 0);

  const withoutSegment = createHarness(createReviewStateController);
  withoutSegment.setActiveIndex(8);
  assert.equal(await withoutSegment.controller.setState("reviewed"), undefined);
  assert.equal(withoutSegment.calls.length, 0);
});
