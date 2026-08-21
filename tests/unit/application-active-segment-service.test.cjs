const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-active-segment-service.js")).href);
}

function createHarness(createApplicationActiveSegmentService, initialSegments = [], initialIndex = -1) {
  const calls = [];
  let records = initialSegments;
  let activeIndex = initialIndex;
  const service = createApplicationActiveSegmentService({
    segments: {
      getAll() {
        calls.push("segments");
        return records;
      }
    },
    navigation: {
      getActiveIndex() {
        calls.push("index");
        return activeIndex;
      }
    }
  });
  return {
    calls,
    service,
    setRecords(value) {
      records = value;
    },
    setActiveIndex(value) {
      activeIndex = value;
    }
  };
}

test("ApplicationActiveSegmentService preserves empty sparse and out-of-range fallbacks", async () => {
  const { createApplicationActiveSegmentService } = await loadFactory();
  const harness = createHarness(createApplicationActiveSegmentService);
  assert.equal(Object.isFrozen(harness.service), true);
  for (const [records, index] of [
    [[], -1],
    [[], 0],
    [new Array(3), 1],
    [[{ id: "first" }], -1],
    [[{ id: "first" }], 4],
    [[{ id: "first" }], undefined]
  ]) {
    harness.setRecords(records);
    harness.setActiveIndex(index);
    assert.equal(harness.service.get(), null);
  }
});

test("ApplicationActiveSegmentService returns the exact selected record reference", async () => {
  const { createApplicationActiveSegmentService } = await loadFactory();
  const first = { id: "first" };
  const selected = { id: "selected" };
  const harness = createHarness(createApplicationActiveSegmentService, [first, selected], 1);
  assert.equal(harness.service.get(), selected);
  selected.target = "mutated";
  assert.equal(harness.service.get().target, "mutated");
});

test("ApplicationActiveSegmentService preserves the exact falsy-record fallback", async () => {
  const { createApplicationActiveSegmentService } = await loadFactory();
  const harness = createHarness(createApplicationActiveSegmentService);
  for (const record of [undefined, null, false, 0, "", Number.NaN]) {
    harness.setRecords([record]);
    harness.setActiveIndex(0);
    assert.equal(harness.service.get(), null);
  }
});

test("ApplicationActiveSegmentService performs fresh ordered reads on every invocation", async () => {
  const { createApplicationActiveSegmentService } = await loadFactory();
  const first = { id: "first" };
  const second = { id: "second" };
  const harness = createHarness(createApplicationActiveSegmentService, [first], 0);
  assert.equal(harness.service.get(), first);
  harness.setRecords([first, second]);
  harness.setActiveIndex(1);
  assert.equal(harness.service.get(), second);
  assert.deepEqual(harness.calls, ["segments", "index", "segments", "index"]);
});

test("ApplicationActiveSegmentService preserves dependency and indexed-access failure timing", async () => {
  const { createApplicationActiveSegmentService } = await loadFactory();
  const calls = [];
  const segmentError = new Error("segments failed");
  const indexError = new Error("index failed");
  const accessError = new Error("access failed");
  const segmentFailure = createApplicationActiveSegmentService({
    segments: {
      getAll() {
        calls.push("segments");
        throw segmentError;
      }
    },
    navigation: {
      getActiveIndex() {
        calls.push("index");
        return 0;
      }
    }
  });
  assert.throws(
    () => segmentFailure.get(),
    (error) => error === segmentError
  );
  assert.deepEqual(calls, ["segments"]);

  calls.length = 0;
  const indexFailure = createApplicationActiveSegmentService({
    segments: {
      getAll() {
        calls.push("segments");
        return [];
      }
    },
    navigation: {
      getActiveIndex() {
        calls.push("index");
        throw indexError;
      }
    }
  });
  assert.throws(
    () => indexFailure.get(),
    (error) => error === indexError
  );
  assert.deepEqual(calls, ["segments", "index"]);

  calls.length = 0;
  const indexedFailure = createApplicationActiveSegmentService({
    segments: {
      getAll() {
        calls.push("segments");
        return new Proxy([], {
          get() {
            calls.push("access");
            throw accessError;
          }
        });
      }
    },
    navigation: {
      getActiveIndex() {
        calls.push("index");
        return 0;
      }
    }
  });
  assert.throws(
    () => indexedFailure.get(),
    (error) => error === accessError
  );
  assert.deepEqual(calls, ["segments", "index", "access"]);
});

test("ApplicationActiveSegmentService validates every injected boundary", async () => {
  const { createApplicationActiveSegmentService } = await loadFactory();
  const valid = {
    segments: { getAll: () => [] },
    navigation: { getActiveIndex: () => -1 }
  };
  for (const value of [
    undefined,
    null,
    {},
    { ...valid, segments: null },
    { ...valid, segments: { getAll: null } },
    { ...valid, navigation: null },
    { ...valid, navigation: { getActiveIndex: null } }
  ]) {
    assert.throws(() => createApplicationActiveSegmentService(value), /checked segment and navigation boundaries/);
  }
});
