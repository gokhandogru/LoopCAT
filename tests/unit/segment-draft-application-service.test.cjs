const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createSegmentDraftApplicationService, overrides = {}) {
  const calls = [];
  const matchResults = [...(overrides.matchResults || [true, true])];
  const patch = overrides.patch || { target: "captured" };
  const service = createSegmentDraftApplicationService({
    targetState: {
      setTarget(segment, target, status, reason) {
        calls.push(["setTarget", target, status, reason]);
        if (overrides.setTargetError) throw overrides.setTargetError;
        segment.target = target;
        segment.status = status;
      },
      touch: (segment, options) => calls.push(["touch", segment.status, options]),
      capturePatch(segment) {
        calls.push(["capturePatch", segment.status]);
        return patch;
      }
    },
    filters: {
      matches(segment) {
        calls.push(["matches", segment.status || ""]);
        return matchResults.shift();
      }
    },
    presentation: {
      renderSegments: (options) => calls.push(["renderSegments", options]),
      scheduleRowUpdate: (index) => calls.push(["scheduleRowUpdate", index]),
      cancelRowUpdate: (index) => calls.push(["cancelRowUpdate", index]),
      renderProgress: (options) => calls.push(["renderProgress", options]),
      scheduleHistory: () => calls.push(["scheduleHistory"])
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) }
  });
  return { calls, patch, service };
}

test("SegmentDraftApplicationService preserves explicit status, matching-row scheduling, effects, and patch return", async () => {
  const { createSegmentDraftApplicationService } = await moduleAt(
    "src/features/editor/segment-draft-application-service.js"
  );
  const harness = createHarness(createSegmentDraftApplicationService);
  const segment = { id: "s1", target: "Before", status: "confirmed" };
  const result = harness.service.apply({ index: 4, segment, target: "After" });
  assert.deepEqual(result, { segment, patch: harness.patch });
  assert.deepEqual(harness.calls, [
    ["matches", "confirmed"],
    ["setTarget", "After", "draft", "edit"],
    ["matches", "draft"],
    ["touch", "draft", { invalidateFilters: false }],
    ["scheduleRowUpdate", 4],
    ["renderProgress", { previousStatus: "confirmed", nextStatus: "draft" }],
    ["scheduleHistory"],
    ["markDirty"],
    ["capturePatch", "draft"]
  ]);
});

test("SegmentDraftApplicationService derives draft fallback and rerenders with preserved scroll after membership change", async () => {
  const { createSegmentDraftApplicationService } = await moduleAt(
    "src/features/editor/segment-draft-application-service.js"
  );
  const harness = createHarness(createSegmentDraftApplicationService, { matchResults: [true, false] });
  const segment = { target: "Prior target" };
  harness.service.apply({ index: 2, segment, target: "" });
  assert.deepEqual(harness.calls.slice(0, 6), [
    ["matches", ""],
    ["setTarget", "", "empty", "edit"],
    ["matches", "empty"],
    ["touch", "empty", { invalidateFilters: true }],
    ["renderSegments", { preserveScroll: true }],
    ["renderProgress", { previousStatus: "draft", nextStatus: "empty" }]
  ]);
  assert.equal(
    harness.calls.some(([name]) => name === "scheduleRowUpdate"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "cancelRowUpdate"),
    false
  );
});

test("SegmentDraftApplicationService derives empty fallback and cancels a still-hidden row update", async () => {
  const { createSegmentDraftApplicationService } = await moduleAt(
    "src/features/editor/segment-draft-application-service.js"
  );
  const harness = createHarness(createSegmentDraftApplicationService, { matchResults: [false, false] });
  const segment = { target: "   " };
  harness.service.apply({ index: 6, segment, target: "Translated" });
  assert.deepEqual(
    harness.calls.find(([name]) => name === "touch"),
    ["touch", "draft", { invalidateFilters: false }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "cancelRowUpdate"),
    ["cancelRowUpdate", 6]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "renderProgress"),
    ["renderProgress", { previousStatus: "empty", nextStatus: "draft" }]
  );
});

test("SegmentDraftApplicationService propagates target mutation failure before downstream effects", async () => {
  const { createSegmentDraftApplicationService } = await moduleAt(
    "src/features/editor/segment-draft-application-service.js"
  );
  const setTargetError = new Error("mutation failed");
  const harness = createHarness(createSegmentDraftApplicationService, { setTargetError });
  const segment = { target: "Before", status: "draft" };
  assert.throws(() => harness.service.apply({ index: 0, segment, target: "After" }), setTargetError);
  assert.deepEqual(harness.calls, [
    ["matches", "draft"],
    ["setTarget", "After", "draft", "edit"]
  ]);
});

test("SegmentDraftApplicationService validates collaborators and exposes an immutable API", async () => {
  const { createSegmentDraftApplicationService } = await moduleAt(
    "src/features/editor/segment-draft-application-service.js"
  );
  assert.throws(() => createSegmentDraftApplicationService({}), /requires target-state boundaries/);
  const { service } = createHarness(createSegmentDraftApplicationService);
  assert.equal(Object.isFrozen(service), true);
});
