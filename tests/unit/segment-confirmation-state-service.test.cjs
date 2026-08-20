const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createSegmentConfirmationStateService) {
  const calls = [];
  const service = createSegmentConfirmationStateService({
    targetState: {
      recordHistory(...args) {
        calls.push(["recordHistory", ...args]);
      },
      touch(segment) {
        calls.push(["touch", segment]);
        segment.revision = Number(segment.revision || 0) + 1;
      }
    },
    now() {
      calls.push(["now"]);
      return "2026-08-20T14:00:00.000Z";
    }
  });
  return { calls, service };
}

test("SegmentConfirmationStateService records confirmation history, preserves target, clears needs-review, and touches", async () => {
  const { createSegmentConfirmationStateService } = await moduleAt(
    "src/features/editor/segment-confirmation-state-service.js"
  );
  const harness = createHarness(createSegmentConfirmationStateService);
  const segment = { id: "s1", target: "Translated", status: "draft", reviewState: "needs-review", revision: 4 };
  assert.equal(harness.service.confirm(segment), undefined);
  assert.equal(segment.target, "Translated");
  assert.equal(segment.status, "confirmed");
  assert.equal(segment.reviewState, "");
  assert.equal(segment.revision, 5);
  assert.deepEqual(harness.calls[0], ["recordHistory", segment, "Translated", "confirmed", "confirm"]);
  assert.deepEqual(harness.calls[1], ["touch", segment]);
});

test("SegmentConfirmationStateService preserves unrelated review state and the original nullish-segment failure", async () => {
  const { createSegmentConfirmationStateService } = await moduleAt(
    "src/features/editor/segment-confirmation-state-service.js"
  );
  const harness = createHarness(createSegmentConfirmationStateService);
  const segment = { target: "Target", status: "draft", reviewState: "reviewed", revision: 0 };
  harness.service.confirm(segment);
  assert.equal(segment.reviewState, "reviewed");
  assert.throws(() => harness.service.confirm(null), TypeError);
});

test("SegmentConfirmationStateService restores snapshots in place with exact own-key assignment semantics", async () => {
  const { createSegmentConfirmationStateService } = await moduleAt(
    "src/features/editor/segment-confirmation-state-service.js"
  );
  const { service } = createHarness(createSegmentConfirmationStateService);
  const staleSymbol = Symbol("stale");
  const restoredSymbol = Symbol("restored");
  const segment = { id: "s1", stale: true, [staleSymbol]: "remove" };
  Object.defineProperty(segment, "hidden", { value: "remove", configurable: true });
  const snapshot = { id: "s1", target: "Before", status: "draft", [restoredSymbol]: "keep" };
  Object.defineProperty(snapshot, "notEnumerable", { value: "do not copy", enumerable: false });
  const identity = segment;
  assert.equal(service.restore(segment, snapshot), undefined);
  assert.equal(segment, identity);
  assert.deepEqual(Reflect.ownKeys(segment), ["id", "target", "status", restoredSymbol]);
  assert.equal(segment[restoredSymbol], "keep");
  assert.equal(staleSymbol in segment, false);
  assert.equal("hidden" in segment, false);
  assert.equal("notEnumerable" in segment, false);
});

test("SegmentConfirmationStateService preserves persisted rollback coercion, monotonic revision, and timestamp", async () => {
  const { createSegmentConfirmationStateService } = await moduleAt(
    "src/features/editor/segment-confirmation-state-service.js"
  );
  const { service } = createHarness(createSegmentConfirmationStateService);
  const segment = { revision: "7", updatedAt: "old" };
  assert.equal(service.preparePersistedRollback(segment, "11"), undefined);
  assert.equal(segment.revision, 12);
  assert.equal(segment.updatedAt, "2026-08-20T14:00:00.000Z");
  service.preparePersistedRollback(segment, "not-finite");
  assert.equal(Number.isNaN(segment.revision), true);
});

test("SegmentConfirmationStateService validates boundaries and exposes an immutable API", async () => {
  const { createSegmentConfirmationStateService } = await moduleAt(
    "src/features/editor/segment-confirmation-state-service.js"
  );
  assert.throws(() => createSegmentConfirmationStateService({}), /requires target-state and clock boundaries/);
  const { service } = createHarness(createSegmentConfirmationStateService);
  assert.equal(Object.isFrozen(service), true);
});
