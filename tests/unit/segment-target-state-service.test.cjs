const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createSegmentTargetStateService, overrides = {}) {
  const calls = [];
  let id = 0;
  let nowIso = overrides.nowIso || "2026-08-20T10:00:00.000Z";
  let nowMs = overrides.nowMs ?? Date.parse(nowIso);
  const segments = overrides.segments || [];
  const service = createSegmentTargetStateService({
    getSegments() {
      calls.push(["getSegments"]);
      return segments;
    },
    createId(prefix) {
      calls.push(["createId", prefix]);
      id += 1;
      return `${prefix}-${id}`;
    },
    nowIso() {
      calls.push(["nowIso"]);
      return nowIso;
    },
    nowMs() {
      calls.push(["nowMs"]);
      return nowMs;
    },
    clone(value) {
      calls.push(["clone"]);
      return structuredClone(value);
    },
    invalidateFilters() {
      calls.push(["invalidateFilters"]);
    }
  });
  return {
    calls,
    segments,
    service,
    setClock(iso, ms = Date.parse(iso)) {
      nowIso = iso;
      nowMs = ms;
    }
  };
}

test("SegmentTargetStateService preserves hidden-field descriptors and absent-record no-op", async () => {
  const { createSegmentTargetStateService } = await moduleAt("src/features/editor/segment-target-state-service.js");
  const { service } = createHarness(createSegmentTargetStateService);
  assert.equal(service.setHiddenField(null, "hidden", true), undefined);
  const record = {};
  service.setHiddenField(record, "hidden", { value: 1 });
  assert.deepEqual(Object.getOwnPropertyDescriptor(record, "hidden"), {
    value: { value: 1 },
    writable: true,
    enumerable: false,
    configurable: true
  });
  assert.deepEqual(Object.keys(record), []);
});

test("SegmentTargetStateService preserves history preparation, defaults, collection identity, and injected collection fallback", async () => {
  const { createSegmentTargetStateService } = await moduleAt("src/features/editor/segment-target-state-service.js");
  const segments = [{ target: "Target", status: "draft", targetHistory: "legacy" }, {}];
  const harness = createHarness(createSegmentTargetStateService, { segments });
  assert.equal(harness.service.prepareHistory(null), null);
  assert.equal(harness.service.prepareHistories(), segments);
  assert.deepEqual(segments[0].targetHistory, []);
  assert.equal(segments[0].__historyTarget, "Target");
  assert.equal(segments[0].__historyStatus, "draft");
  assert.equal(segments[1].__historyTarget, "");
  assert.equal(segments[1].__historyStatus, "empty");
  assert.equal(harness.calls.filter(([name]) => name === "getSegments").length, 1);
  const existing = segments[0].targetHistory;
  assert.equal(harness.service.prepareHistory(segments[0]).targetHistory, existing);
});

test("SegmentTargetStateService preserves history no-op, append metadata, target normalization, and TM clearing policy", async () => {
  const { createSegmentTargetStateService } = await moduleAt("src/features/editor/segment-target-state-service.js");
  const { service } = createHarness(createSegmentTargetStateService);
  const segment = { target: "", status: "empty", revision: "4", tmPretranslation: { score: 90 } };
  service.prepareHistory(segment);
  assert.equal(service.recordHistory(segment, "", "empty"), undefined);
  assert.deepEqual(segment.targetHistory, []);
  service.setTarget(segment, 42, "", "replace");
  assert.equal(segment.target, "42");
  assert.equal(segment.status, "draft");
  assert.equal("tmPretranslation" in segment, false);
  assert.deepEqual(segment.targetHistory[0], {
    id: "target-history-1",
    reason: "replace",
    fromTarget: "",
    toTarget: "42",
    fromStatus: "empty",
    toStatus: "draft",
    revisionBefore: 4,
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z"
  });
  segment.tmPretranslation = { score: 80 };
  service.setTarget(segment, "TM", "draft", "pretranslate");
  assert.deepEqual(segment.tmPretranslation, { score: 80 });
});

test("SegmentTargetStateService preserves edit coalescing window, non-edit separation, and 25-entry cap", async () => {
  const { createSegmentTargetStateService } = await moduleAt("src/features/editor/segment-target-state-service.js");
  const harness = createHarness(createSegmentTargetStateService);
  const segment = { target: "a", status: "draft", revision: 1 };
  harness.service.prepareHistory(segment);
  harness.service.setTarget(segment, "ab", "draft", "edit");
  harness.setClock("2026-08-20T10:00:20.000Z");
  harness.service.setTarget(segment, "abc", "draft", "edit");
  assert.equal(segment.targetHistory.length, 1);
  assert.equal(segment.targetHistory[0].fromTarget, "a");
  assert.equal(segment.targetHistory[0].toTarget, "abc");
  assert.equal(segment.targetHistory[0].updatedAt, "2026-08-20T10:00:20.000Z");
  harness.setClock("2026-08-20T10:01:00.001Z");
  harness.service.setTarget(segment, "abcd", "draft", "edit");
  harness.service.setTarget(segment, "abcde", "draft", "replace");
  assert.equal(segment.targetHistory.length, 3);
  for (let index = 0; index < 25; index += 1) {
    harness.service.setTarget(segment, `target-${index}`, "draft", "replace");
  }
  assert.equal(segment.targetHistory.length, 25);
  assert.equal(segment.targetHistory.at(-1).toTarget, "target-24");
});

test("SegmentTargetStateService captures deep patches with exact optional-field presence", async () => {
  const { createSegmentTargetStateService } = await moduleAt("src/features/editor/segment-target-state-service.js");
  const { service } = createHarness(createSegmentTargetStateService);
  const segment = {
    target: "Target",
    status: "confirmed",
    targetHistory: [{ id: "history" }],
    revision: "3",
    updatedAt: "then",
    tmPretranslation: { score: 88 },
    reviewState: undefined,
    aiApplication: null
  };
  const patch = service.capturePatch(segment);
  assert.deepEqual(patch, {
    target: "Target",
    status: "confirmed",
    targetHistory: [{ id: "history" }],
    revision: 3,
    updatedAt: "then",
    tmPretranslation: { present: true, value: { score: 88 } },
    aiPretranslation: { present: false, value: null },
    reviewState: { present: true, value: undefined },
    aiApplication: { present: true, value: null }
  });
  segment.targetHistory[0].id = "changed";
  segment.tmPretranslation.score = 1;
  assert.deepEqual(patch.targetHistory, [{ id: "history" }]);
  assert.deepEqual(patch.tmPretranslation.value, { score: 88 });
});

test("SegmentTargetStateService applies patch fallbacks, clones optionals, deletes absent fields, and resets history baselines", async () => {
  const { createSegmentTargetStateService } = await moduleAt("src/features/editor/segment-target-state-service.js");
  const { service } = createHarness(createSegmentTargetStateService);
  const segment = {
    tmPretranslation: { stale: true },
    aiPretranslation: { stale: true },
    reviewState: "reviewed",
    aiApplication: { stale: true }
  };
  const patch = {
    target: "Restored",
    targetHistory: [{ id: "restored" }],
    revision: "7",
    tmPretranslation: { present: true, value: { score: 77 } },
    reviewState: { present: true, value: "needs-review" }
  };
  assert.equal(service.applyPatch(segment, patch), segment);
  assert.equal(segment.status, "draft");
  assert.equal(segment.revision, 7);
  assert.equal(segment.updatedAt, "2026-08-20T10:00:00.000Z");
  assert.deepEqual(segment.tmPretranslation, { score: 77 });
  assert.equal("aiPretranslation" in segment, false);
  assert.equal(segment.reviewState, "needs-review");
  assert.equal("aiApplication" in segment, false);
  assert.equal(segment.__historyTarget, "Restored");
  assert.equal(segment.__historyStatus, "draft");
  patch.targetHistory[0].id = "changed";
  patch.tmPretranslation.value.score = 1;
  assert.deepEqual(segment.targetHistory, [{ id: "restored" }]);
  assert.deepEqual(segment.tmPretranslation, { score: 77 });
});

test("SegmentTargetStateService preserves monotonic touch revisions, timestamps, invalidation, and suppression", async () => {
  const { createSegmentTargetStateService } = await moduleAt("src/features/editor/segment-target-state-service.js");
  const harness = createHarness(createSegmentTargetStateService);
  assert.equal(harness.service.touch(null), null);
  const segment = { revision: "not-finite" };
  assert.equal(harness.service.touch(segment), segment);
  assert.equal(segment.revision, 1);
  assert.equal(segment.updatedAt, "2026-08-20T10:00:00.000Z");
  assert.equal(harness.calls.filter(([name]) => name === "invalidateFilters").length, 1);
  harness.service.touch(segment, { invalidateFilters: false });
  assert.equal(segment.revision, 2);
  assert.equal(harness.calls.filter(([name]) => name === "invalidateFilters").length, 1);
});

test("SegmentTargetStateService validates boundaries and exposes an immutable API", async () => {
  const { createSegmentTargetStateService } = await moduleAt("src/features/editor/segment-target-state-service.js");
  assert.throws(() => createSegmentTargetStateService({}), /requires segment, ID, clock, clone, and filter boundaries/);
  const { service } = createHarness(createSegmentTargetStateService);
  assert.equal(Object.isFrozen(service), true);
});
