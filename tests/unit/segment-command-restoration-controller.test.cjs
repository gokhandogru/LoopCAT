const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createSegmentCommandRestorationController, overrides = {}) {
  const calls = [];
  const originalSegments = overrides.segments || [
    { id: "s1", target: "First", status: "draft", targetHistory: [], revision: 2, updatedAt: "old-1" },
    { id: "s2", target: "Second", status: "confirmed", targetHistory: [], revision: 5, updatedAt: "old-2" }
  ];
  const segments = originalSegments.map((segment) => structuredClone(segment));
  let activeIndex = overrides.activeIndex ?? 0;
  const capturePatch = (segment) => ({
    target: String(segment?.target || ""),
    status: segment?.status || "empty",
    targetHistory: structuredClone(segment?.targetHistory || []),
    revision: Number(segment?.revision || 0),
    updatedAt: segment?.updatedAt || ""
  });
  const controller = createSegmentCommandRestorationController({
    editorSessionStore: {
      getSegments() {
        calls.push(["getSegments"]);
        return segments;
      },
      replaceSegmentAt(index, segment) {
        calls.push(["replaceSegmentAt", index, segment.id]);
        segments[index] = segment;
      }
    },
    targetState: {
      capturePatch(segment) {
        calls.push(["capturePatch", segment.id]);
        return capturePatch(segment);
      },
      applyPatch(segment, patch) {
        calls.push(["applyPatch", segment.id, patch.target]);
        segment.target = String(patch?.target || "");
        segment.status = patch?.status || (segment.target.trim() ? "draft" : "empty");
        segment.targetHistory = structuredClone(patch?.targetHistory || []);
        segment.revision = Number(patch?.revision || 0);
        segment.updatedAt = patch?.updatedAt || "fallback-time";
        return segment;
      },
      prepareHistory(segment) {
        calls.push(["prepareHistory", segment?.id]);
        segment.targetHistory = Array.isArray(segment.targetHistory) ? segment.targetHistory : [];
        return segment;
      }
    },
    autosave: { clear: (segment) => calls.push(["clear", segment.id]) },
    persistence: {
      save(segment) {
        calls.push(["save", segment.id]);
        return overrides.saveError ? Promise.reject(overrides.saveError) : Promise.resolve();
      },
      saveMany(restored) {
        calls.push(["saveMany", restored.map((segment) => segment.id)]);
        return overrides.saveManyError ? Promise.reject(overrides.saveManyError) : Promise.resolve();
      }
    },
    selection: {
      getActiveSegment() {
        calls.push(["getActiveSegment"]);
        return segments[activeIndex] || null;
      },
      select(index, segmentId) {
        calls.push(["select", index, segmentId]);
        activeIndex = index;
      },
      selectGrid(index, segmentId) {
        calls.push(["selectGrid", index, segmentId]);
        activeIndex = index;
      },
      inspect: (segmentId) => calls.push(["inspect", segmentId]),
      normalize(selection, targetLength) {
        calls.push(["normalize", selection, targetLength]);
        return {
          start: Math.min(Math.max(Number(selection.start || 0), 0), targetLength),
          end: Math.min(Math.max(Number(selection.end || 0), 0), targetLength)
        };
      },
      focus: (selection) => calls.push(["focus", selection]),
      navigateNext() {
        calls.push(["navigateNext"]);
        activeIndex = Math.min(activeIndex + 1, segments.length - 1);
        return Promise.resolve();
      }
    },
    filters: { invalidate: () => calls.push(["invalidate"]) },
    presentation: {
      renderSegments: (options) => calls.push(["renderSegments", options]),
      renderProgress: (options) => calls.push(["renderProgress", options]),
      renderHistory: () => calls.push(["renderHistory"]),
      renderAll: () => calls.push(["renderAll"]),
      refreshContext: () => {
        calls.push(["refreshContext"]);
        return Promise.resolve();
      }
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    clone(value) {
      calls.push(["clone"]);
      return structuredClone(value);
    },
    now: () => {
      calls.push(["now"]);
      return "2026-08-20T12:00:00.000Z";
    }
  });
  return { calls, controller, originalSegments, segments };
}

test("SegmentCommandRestorationController prepares isolated snapshots with finite monotonic revisions", async () => {
  const { createSegmentCommandRestorationController } = await moduleAt(
    "src/features/editor/segment-command-restoration-controller.js"
  );
  const harness = createHarness(createSegmentCommandRestorationController);
  const snapshot = { id: "s1", target: "Restored", status: "draft", revision: "bad", targetHistory: null };
  const restored = harness.controller.prepareSnapshot(snapshot, { revision: "7" });
  assert.notEqual(restored, snapshot);
  assert.equal(restored.revision, 8);
  assert.equal(restored.updatedAt, "2026-08-20T12:00:00.000Z");
  assert.deepEqual(restored.targetHistory, []);
  snapshot.target = "Changed later";
  assert.equal(restored.target, "Restored");
});

test("SegmentCommandRestorationController restores one target patch with exact selection and presentation recovery", async () => {
  const { createSegmentCommandRestorationController } = await moduleAt(
    "src/features/editor/segment-command-restoration-controller.js"
  );
  const harness = createHarness(createSegmentCommandRestorationController);
  const result = await harness.controller.restorePatch(
    "s1",
    { target: "Restored target", status: "confirmed", revision: 8, targetHistory: [{ id: "h1" }] },
    { selection: { start: 99, end: -2 } }
  );
  assert.equal(harness.segments[0].target, "Restored target");
  assert.equal(harness.segments[0].revision, 9);
  assert.equal(harness.segments[0].updatedAt, "2026-08-20T12:00:00.000Z");
  assert.deepEqual(result, {
    recoveryToken: "s1",
    activeSegmentId: "s1",
    focusTarget: true,
    selection: { start: 15, end: 0 }
  });
  const names = harness.calls.map(([name]) => name);
  assert.ok(names.indexOf("clear") < names.indexOf("save"));
  assert.ok(names.indexOf("save") < names.indexOf("selectGrid"));
  assert.ok(names.indexOf("renderHistory") < names.indexOf("refreshContext"));
  assert.ok(names.indexOf("refreshContext") < names.indexOf("markDirty"));
  assert.ok(names.indexOf("markDirty") < names.indexOf("normalize"));
  assert.deepEqual(harness.calls.find(([name]) => name === "renderProgress")[1], {
    previousStatus: "draft",
    nextStatus: "confirmed"
  });
});

test("SegmentCommandRestorationController rejects a missing patch segment and restores the exact patch after failure", async () => {
  const { createSegmentCommandRestorationController } = await moduleAt(
    "src/features/editor/segment-command-restoration-controller.js"
  );
  const missing = createHarness(createSegmentCommandRestorationController);
  await assert.rejects(() => missing.controller.restorePatch("missing", {}), /affected segment is no longer available/);

  const saveError = new Error("save failed");
  const failed = createHarness(createSegmentCommandRestorationController, { saveError });
  const before = structuredClone(failed.segments[0]);
  await assert.rejects(
    () => failed.controller.restorePatch("s1", { target: "Not durable", status: "draft", revision: 9 }),
    saveError
  );
  assert.deepEqual(failed.segments[0], before);
  assert.equal(failed.calls.filter(([name]) => name === "applyPatch").length, 2);
  assert.equal(failed.calls.filter(([name]) => name === "invalidate").length, 1);
  assert.equal(failed.calls.filter(([name]) => name === "renderSegments").length, 1);
  assert.equal(failed.calls.filter(([name]) => name === "renderHistory").length, 1);
});

test("SegmentCommandRestorationController validates and restores matching target-patch batches", async () => {
  const { createSegmentCommandRestorationController } = await moduleAt(
    "src/features/editor/segment-command-restoration-controller.js"
  );
  const harness = createHarness(createSegmentCommandRestorationController);
  await assert.rejects(() => harness.controller.restorePatches([], {}), /matching segment IDs and patches/);
  await assert.rejects(
    () => harness.controller.restorePatches([{}], { segmentIds: ["s1", "s2"] }),
    /matching segment IDs and patches/
  );
  await assert.rejects(
    () => harness.controller.restorePatches([{}], { segmentIds: ["missing"] }),
    /pretranslation segment is no longer available/
  );

  const result = await harness.controller.restorePatches(
    [
      { target: "Batch one", status: "draft", revision: 10 },
      { target: "Batch two", status: "confirmed", revision: 1 }
    ],
    { segmentIds: ["s1", "s2"], activeSegmentId: "s2" }
  );
  assert.equal(harness.segments[0].revision, 11);
  assert.equal(harness.segments[1].revision, 6);
  assert.equal(result.activeSegmentId, "s2");
  assert.equal(result.affectedCount, 2);
  assert.equal(result.focusTarget, true);
  assert.deepEqual(
    result.patches.map((patch) => patch.target),
    ["Batch one", "Batch two"]
  );
  assert.ok(harness.calls.some(([name, index, id]) => name === "select" && index === 1 && id === "s2"));
  assert.ok(harness.calls.some(([name]) => name === "invalidate"));
  assert.ok(harness.calls.some(([name]) => name === "renderAll"));
  assert.ok(harness.calls.some(([name]) => name === "focus"));
});

test("SegmentCommandRestorationController rolls back every target patch after batch persistence failure", async () => {
  const { createSegmentCommandRestorationController } = await moduleAt(
    "src/features/editor/segment-command-restoration-controller.js"
  );
  const saveManyError = new Error("batch failed");
  const harness = createHarness(createSegmentCommandRestorationController, { saveManyError });
  const before = structuredClone(harness.segments);
  await assert.rejects(
    () =>
      harness.controller.restorePatches(
        [
          { target: "Changed one", status: "draft", revision: 7 },
          { target: "Changed two", status: "draft", revision: 8 }
        ],
        { segmentIds: ["s1", "s2"] }
      ),
    saveManyError
  );
  assert.deepEqual(harness.segments, before);
  assert.equal(harness.calls.filter(([name]) => name === "applyPatch").length, 4);
  assert.equal(harness.calls.filter(([name]) => name === "invalidate").length, 1);
  assert.equal(harness.calls.filter(([name]) => name === "renderAll").length, 1);
});

test("SegmentCommandRestorationController restores full snapshot batches with active-segment fallback", async () => {
  const { createSegmentCommandRestorationController } = await moduleAt(
    "src/features/editor/segment-command-restoration-controller.js"
  );
  const harness = createHarness(createSegmentCommandRestorationController);
  const result = await harness.controller.restoreSnapshots(
    [
      { id: "s1", target: "Snapshot one", status: "draft", revision: 9 },
      { id: "s2", target: "Snapshot two", status: "draft", revision: 1 }
    ],
    { activeSegmentId: "s2" }
  );
  assert.equal(harness.segments[0].revision, 10);
  assert.equal(harness.segments[1].revision, 6);
  assert.equal(result.activeSegmentId, "s2");
  assert.deepEqual(
    result.snapshots.map((snapshot) => snapshot.target),
    ["Snapshot one", "Snapshot two"]
  );
  harness.segments[0].target = "Mutated after return";
  assert.equal(result.snapshots[0].target, "Snapshot one");
  assert.equal(
    harness.calls.some(([name]) => name === "invalidate"),
    false
  );
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));
  assert.ok(harness.calls.some(([name]) => name === "focus"));
});

test("SegmentCommandRestorationController rejects unknown snapshots and rolls back full snapshot batches", async () => {
  const { createSegmentCommandRestorationController } = await moduleAt(
    "src/features/editor/segment-command-restoration-controller.js"
  );
  const missing = createHarness(createSegmentCommandRestorationController);
  await assert.rejects(
    () => missing.controller.restoreSnapshots([{ id: "missing" }]),
    /affected segment is no longer available/
  );
  assert.equal(
    missing.calls.some(([name]) => name === "saveMany"),
    false
  );

  const saveManyError = new Error("snapshot batch failed");
  const failed = createHarness(createSegmentCommandRestorationController, { saveManyError });
  const before = structuredClone(failed.segments);
  await assert.rejects(
    () =>
      failed.controller.restoreSnapshots([
        { id: "s1", target: "Changed one", revision: 3 },
        { id: "s2", target: "Changed two", revision: 6 }
      ]),
    saveManyError
  );
  assert.deepEqual(failed.segments, before);
  assert.equal(failed.calls.filter(([name]) => name === "renderAll").length, 1);
});

test("SegmentCommandRestorationController restores one full snapshot with navigation and exact failure recovery", async () => {
  const { createSegmentCommandRestorationController } = await moduleAt(
    "src/features/editor/segment-command-restoration-controller.js"
  );
  const harness = createHarness(createSegmentCommandRestorationController);
  const result = await harness.controller.restoreSnapshot(
    "s1",
    { id: "s1", target: "Snapshot", status: "confirmed", revision: 6 },
    { navigateNext: true }
  );
  assert.equal(harness.segments[0].revision, 7);
  assert.equal(result.snapshot.target, "Snapshot");
  assert.equal(result.activeSegmentId, "s2");
  assert.ok(harness.calls.some(([name]) => name === "navigateNext"));
  assert.equal(
    harness.calls.some(([name]) => name === "focus"),
    false
  );

  const saveError = new Error("single snapshot failed");
  const failed = createHarness(createSegmentCommandRestorationController, { saveError });
  const before = structuredClone(failed.segments[0]);
  await assert.rejects(
    () => failed.controller.restoreSnapshot("s1", { id: "s1", target: "Not durable", revision: 3 }),
    saveError
  );
  assert.deepEqual(failed.segments[0], before);
  assert.equal(failed.calls.filter(([name]) => name === "renderAll").length, 1);
});

test("SegmentCommandRestorationController validates collaborators and exposes an immutable API", async () => {
  const { createSegmentCommandRestorationController } = await moduleAt(
    "src/features/editor/segment-command-restoration-controller.js"
  );
  assert.throws(() => createSegmentCommandRestorationController({}), /requires EditorSessionStore boundaries/);
  const harness = createHarness(createSegmentCommandRestorationController);
  assert.equal(Object.isFrozen(harness.controller), true);
});
