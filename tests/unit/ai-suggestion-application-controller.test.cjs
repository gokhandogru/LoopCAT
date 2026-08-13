const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-suggestion-application-controller.js")).href);
}

function createHarness(createAiSuggestionApplicationController, overrides = {}) {
  const project = { id: "p1" };
  const suggestion = {
    id: "ai-1",
    origin: "AI review",
    provider: "Test provider",
    model: "test-model",
    suggestedTarget: "Suggested target"
  };
  const segment = {
    id: "s1",
    projectId: "p1",
    source: "Source",
    target: "Original target",
    status: overrides.status || "draft",
    locked: Boolean(overrides.locked),
    reviewState: "reviewed",
    revision: 4,
    updatedAt: "before",
    targetHistory: [],
    aiSuggestions: overrides.noSuggestion ? [] : [suggestion]
  };
  const segments = [segment];
  const calls = [];
  const statuses = [];
  let activeIndex = 0;
  let createdOptions = null;
  let failRestoreSave = false;

  const controller = createAiSuggestionApplicationController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getSegments: () => segments,
      replaceSegmentAt: (index, value) => {
        calls.push(["replaceSegmentAt", index, value.target]);
        segments[index] = value;
        return value;
      }
    },
    commands: {
      bus: {
        execute(command) {
          calls.push(["execute"]);
          return command.execute();
        }
      },
      create(options) {
        calls.push(["create", options.projectId, options.segmentId, options.suggestion.id]);
        createdOptions = options;
        return { execute: options.applyFirst };
      },
      changed: () => calls.push(["commandsChanged"])
    },
    selection: {
      getActiveIndex: () => activeIndex,
      goToNextOpen: () => calls.push(["goToNextOpen"])
    },
    mutation: {
      applyTarget(value, target, status, origin) {
        calls.push(["applyTarget", target, status, origin]);
        value.targetHistory.push({ target: value.target, status: value.status });
        value.target = target;
        value.status = status;
      },
      touch(value) {
        calls.push(["touch"]);
        value.revision += 1;
        value.updatedAt = "after";
      },
      restoreInPlace(value, snapshot) {
        calls.push(["restoreInPlace"]);
        Reflect.ownKeys(value).forEach((key) => delete value[key]);
        Object.assign(value, structuredClone(snapshot));
      },
      prepareHistory(value) {
        calls.push(["prepareHistory", value.target]);
        value.targetHistory = Array.isArray(value.targetHistory) ? value.targetHistory : [];
        return value;
      },
      prepareRestoreSnapshot(nextSnapshot, currentSnapshot) {
        calls.push(["prepareRestoreSnapshot", nextSnapshot.target, currentSnapshot.target]);
        return { ...structuredClone(nextSnapshot), revision: currentSnapshot.revision + 1 };
      }
    },
    persistence: {
      flush: (projectId) => {
        calls.push(["flush", projectId]);
        return overrides.flushError ? Promise.reject(overrides.flushError) : Promise.resolve();
      },
      clearPending: (value) => calls.push(["clearPending", value.id]),
      save: (value) => {
        calls.push(["save", value.target]);
        if (overrides.saveError && value === segment) return Promise.reject(overrides.saveError);
        if (failRestoreSave) return Promise.reject(new Error("restore unavailable"));
        return Promise.resolve();
      }
    },
    activity: {
      log: (details) => {
        calls.push(["activity", details]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    presentation: {
      renderSegments: () => calls.push(["renderSegments"]),
      renderProgress: () => calls.push(["renderProgress"]),
      renderHistory: () => calls.push(["renderHistory"]),
      renderSuggestions: () => calls.push(["renderSuggestions"]),
      refreshSidebar: () => {
        calls.push(["refreshSidebar"]);
        return Promise.resolve();
      },
      renderAll: () => calls.push(["renderAll"]),
      focusTarget: () => calls.push(["focusTarget"])
    },
    workspace: {
      markDirty: () => calls.push(["markDirty"]),
      markActivityWarningDirty: () => calls.push(["markActivityWarningDirty"])
    },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    clock: { now: () => "2026-08-14T12:00:00.000Z" },
    logger: { warn: (...values) => calls.push(["warn", ...values]) }
  });

  return {
    calls,
    controller,
    createdOptions: () => createdOptions,
    currentSegment: () => segments[0],
    segment,
    setActiveIndex: (value) => {
      activeIndex = value;
    },
    setFailRestoreSave: (value) => {
      failRestoreSave = value;
    },
    statuses,
    suggestion
  };
}

test("AI suggestion application preserves project, segment, suggestion, confirmed, and locked safeguards", async () => {
  const { createAiSuggestionApplicationController } = await loadFactory();
  const noProject = createHarness(createAiSuggestionApplicationController, { noProject: true });
  assert.equal(await noProject.controller.apply("ai-1"), false);
  assert.equal(noProject.calls.length, 0);

  const noSegment = createHarness(createAiSuggestionApplicationController);
  noSegment.setActiveIndex(9);
  assert.equal(await noSegment.controller.apply("ai-1"), false);
  assert.equal(noSegment.calls.length, 0);

  const noSuggestion = createHarness(createAiSuggestionApplicationController, { noSuggestion: true });
  assert.equal(await noSuggestion.controller.apply("ai-1"), false);
  assert.equal(noSuggestion.calls.length, 0);

  for (const options of [{ locked: true }, { status: "confirmed" }]) {
    const harness = createHarness(createAiSuggestionApplicationController, options);
    assert.equal(await harness.controller.apply("ai-1"), false);
    assert.deepEqual(harness.statuses.at(-1), [
      "Confirmed or locked segments must be reopened before applying an AI suggestion",
      "dirty"
    ]);
    assert.equal(harness.calls.length, 0);
  }
});

test("AI suggestion application flush failure leaves the active target unchanged", async () => {
  const { createAiSuggestionApplicationController } = await loadFactory();
  const harness = createHarness(createAiSuggestionApplicationController, {
    flushError: new Error("pending save unavailable")
  });

  assert.equal(await harness.controller.apply("ai-1"), false);
  assert.equal(harness.segment.target, "Original target");
  assert.deepEqual(harness.statuses.at(-1), ["pending save unavailable", "dirty"]);
  assert.deepEqual(harness.calls, [["flush", "p1"]]);
});

test("AI suggestion application executes a reversible command with provenance and apply-and-next", async () => {
  const { createAiSuggestionApplicationController } = await loadFactory();
  const harness = createHarness(createAiSuggestionApplicationController);

  assert.equal(await harness.controller.apply("ai-1", { andNext: true }), true);
  assert.equal(harness.segment.target, "Suggested target");
  assert.equal(harness.segment.status, "draft");
  assert.equal(harness.segment.reviewState, "needs-review");
  assert.deepEqual(harness.segment.aiApplication, {
    suggestionId: "ai-1",
    origin: "AI review",
    provider: "Test provider",
    model: "test-model",
    appliedAt: "2026-08-14T12:00:00.000Z",
    reviewState: "needs-review"
  });
  assert.deepEqual(harness.statuses.at(-1), ["AI suggestion applied; Undo is available", "saved"]);
  assert.ok(harness.calls.some(([name]) => name === "commandsChanged"));
  assert.ok(harness.calls.some(([name]) => name === "goToNextOpen"));
  assert.ok(harness.calls.some(([name]) => name === "activity"));
  assert.equal(harness.createdOptions().beforeSnapshot.target, "Original target");
});

test("primary AI suggestion save failure restores the exact target snapshot and focus", async () => {
  const { createAiSuggestionApplicationController } = await loadFactory();
  const harness = createHarness(createAiSuggestionApplicationController, {
    saveError: new Error("segment storage unavailable")
  });

  assert.equal(await harness.controller.apply("ai-1"), false);
  assert.equal(harness.segment.target, "Original target");
  assert.equal(harness.segment.status, "draft");
  assert.equal(harness.segment.reviewState, "reviewed");
  assert.equal(harness.segment.revision, 4);
  assert.equal(harness.segment.aiApplication, undefined);
  assert.deepEqual(harness.statuses.at(-1), ["segment storage unavailable", "dirty"]);
  for (const expected of ["restoreInPlace", "prepareHistory", "renderSuggestions", "focusTarget"]) {
    assert.ok(
      harness.calls.some(([name]) => name === expected),
      `${expected} should run`
    );
  }
  assert.equal(
    harness.calls.some(([name]) => name === "commandsChanged"),
    false
  );
});

test("secondary AI suggestion activity failure keeps the saved application durable and reports dirty", async () => {
  const { createAiSuggestionApplicationController } = await loadFactory();
  const harness = createHarness(createAiSuggestionApplicationController, {
    activityError: new Error("activity unavailable")
  });

  assert.equal(await harness.controller.apply("ai-1"), true);
  assert.equal(harness.segment.target, "Suggested target");
  assert.deepEqual(harness.statuses.at(-1), ["AI suggestion applied; activity log failed; Undo is available", "dirty"]);
  assert.ok(harness.calls.some(([name]) => name === "warn"));
  assert.ok(harness.calls.some(([name]) => name === "markActivityWarningDirty"));
  assert.ok(harness.calls.some(([name]) => name === "commandsChanged"));
});

test("AI suggestion Undo and Redo restoration persists monotonic snapshots and refreshes context", async () => {
  const { createAiSuggestionApplicationController } = await loadFactory();
  const harness = createHarness(createAiSuggestionApplicationController);
  await harness.controller.apply("ai-1");

  const restored = await harness.createdOptions().restoreSnapshot({
    ...structuredClone(harness.segment),
    target: "Undo target",
    revision: 2
  });

  assert.equal(restored.target, "Undo target");
  assert.equal(restored.revision, 6);
  assert.equal(harness.currentSegment().target, "Undo target");
  for (const expected of [
    "prepareRestoreSnapshot",
    "replaceSegmentAt",
    "save",
    "renderSuggestions",
    "refreshSidebar",
    "markDirty"
  ]) {
    assert.ok(
      harness.calls.some(([name]) => name === expected),
      `${expected} should run`
    );
  }
});

test("AI suggestion restoration failure reinstates the current snapshot and full presentation", async () => {
  const { createAiSuggestionApplicationController } = await loadFactory();
  const harness = createHarness(createAiSuggestionApplicationController);
  await harness.controller.apply("ai-1");
  harness.setFailRestoreSave(true);

  await assert.rejects(
    harness.createdOptions().restoreSnapshot({
      ...structuredClone(harness.segment),
      target: "Failed undo target"
    }),
    /restore unavailable/
  );

  assert.equal(harness.currentSegment().target, "Suggested target");
  assert.ok(harness.calls.some(([name]) => name === "renderAll"));
});
