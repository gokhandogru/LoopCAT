const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createSegmentNavigationController, overrides = {}) {
  const calls = [];
  const segments = overrides.segments || [
    { id: "s0", status: "confirmed" },
    { id: "s1", status: "draft" },
    { id: "s2", status: "empty" }
  ];
  const statusFilter = { value: overrides.statusValue || "confirmed" };
  let activeIndex = overrides.activeIndex ?? 0;
  const renderSegments = (options) => calls.push(["renderSegments", options]);
  const contextError = overrides.contextError;
  const controller = createSegmentNavigationController({
    session: {
      getSegments() {
        calls.push(["getSegments"]);
        return segments;
      }
    },
    navigation: {
      getActiveIndex() {
        calls.push(["getActiveIndex"]);
        return activeIndex;
      }
    },
    grid: {
      select(index, segmentId) {
        calls.push(["select", index, segmentId]);
        activeIndex = index;
      },
      ensureVisible(position, render) {
        calls.push(["ensureVisible", position, render === renderSegments]);
      }
    },
    inspector: { setContext: (context) => calls.push(["inspect", context]) },
    confirmation: { renderBusy: () => calls.push(["renderBusy"]) },
    filters: {
      visiblePosition(index) {
        calls.push(["visiblePosition", index]);
        return overrides.visiblePosition === undefined ? index + 10 : overrides.visiblePosition;
      },
      isOpen(segment) {
        calls.push(["isOpen", segment.id]);
        return overrides.openIds ? overrides.openIds.includes(segment.id) : segment.status !== "confirmed";
      },
      matches(segment) {
        calls.push(["matches", segment.id]);
        return overrides.matches !== false;
      },
      resetStatus: () => calls.push(["resetStatus"])
    },
    presentation: {
      renderSegments,
      updateRow: (index) => calls.push(["updateRow", index]),
      renderPrompt: () => calls.push(["renderPrompt"])
    },
    context: {
      refresh() {
        calls.push(["refreshContext"]);
        return contextError ? Promise.reject(contextError) : Promise.resolve(overrides.contextResult);
      }
    },
    focus: { target: () => calls.push(["focusTarget"]) },
    statusFilter
  });
  return { calls, controller, segments, statusFilter };
}

test("SegmentNavigationController ensures only visible positions and preserves the render callback", async () => {
  const { createSegmentNavigationController } = await moduleAt("src/features/editor/segment-navigation-controller.js");
  const visible = createHarness(createSegmentNavigationController, { visiblePosition: 4 });
  assert.equal(visible.controller.ensureVisible(2), undefined);
  assert.deepEqual(visible.calls, [
    ["visiblePosition", 2],
    ["ensureVisible", 4, true]
  ]);
  const hidden = createHarness(createSegmentNavigationController, { visiblePosition: -1 });
  assert.equal(hidden.controller.ensureVisible(2), undefined);
  assert.deepEqual(hidden.calls, [["visiblePosition", 2]]);
});

test("SegmentNavigationController selection is inert for negative, out-of-range, and active indexes", async () => {
  const { createSegmentNavigationController } = await moduleAt("src/features/editor/segment-navigation-controller.js");
  const harness = createHarness(createSegmentNavigationController, { activeIndex: 1 });
  await harness.controller.select(-1);
  await harness.controller.select(3);
  await harness.controller.select(1);
  assert.equal(
    harness.calls.some(([name]) => name === "select"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "refreshContext"),
    false
  );
});

test("SegmentNavigationController preserves valid selection and contextual refresh order", async () => {
  const { createSegmentNavigationController } = await moduleAt("src/features/editor/segment-navigation-controller.js");
  const harness = createHarness(createSegmentNavigationController, { activeIndex: 0, visiblePosition: 7 });
  await harness.controller.select(2);
  const effects = harness.calls.filter(([name]) => !["getSegments", "getActiveIndex"].includes(name));
  assert.deepEqual(effects, [
    ["select", 2, "s2"],
    ["inspect", { segmentId: "s2" }],
    ["renderBusy"],
    ["visiblePosition", 2],
    ["ensureVisible", 7, true],
    ["updateRow", 0],
    ["updateRow", 2],
    ["renderPrompt"],
    ["refreshContext"]
  ]);
});

test("SegmentNavigationController propagates context failure after preserving preceding selection effects", async () => {
  const { createSegmentNavigationController } = await moduleAt("src/features/editor/segment-navigation-controller.js");
  const contextError = new Error("context failed");
  const harness = createHarness(createSegmentNavigationController, { contextError });
  await assert.rejects(() => harness.controller.select(1), contextError);
  assert.deepEqual(harness.calls.at(-2), ["renderPrompt"]);
  assert.deepEqual(harness.calls.at(-1), ["refreshContext"]);
  assert.equal(
    harness.calls.some(([name]) => name === "focusTarget"),
    false
  );
});

test("SegmentNavigationController next-open prefers later candidates and focuses without resetting matching filters", async () => {
  const { createSegmentNavigationController } = await moduleAt("src/features/editor/segment-navigation-controller.js");
  const harness = createHarness(createSegmentNavigationController, {
    activeIndex: 0,
    openIds: ["s1", "s2"]
  });
  await harness.controller.nextOpen();
  assert.deepEqual(
    harness.calls.find(([name]) => name === "select"),
    ["select", 1, "s1"]
  );
  assert.equal(
    harness.calls.some(([name]) => name === "resetStatus"),
    false
  );
  assert.deepEqual(harness.calls.at(-2), ["matches", "s1"]);
  assert.deepEqual(harness.calls.at(-1), ["focusTarget"]);
});

test("SegmentNavigationController next-open wraps, resets a hiding status filter, rerenders, and focuses", async () => {
  const { createSegmentNavigationController } = await moduleAt("src/features/editor/segment-navigation-controller.js");
  const harness = createHarness(createSegmentNavigationController, {
    activeIndex: 2,
    openIds: ["s1"],
    matches: false,
    statusValue: "confirmed"
  });
  await harness.controller.nextOpen();
  assert.deepEqual(
    harness.calls.find(([name]) => name === "select"),
    ["select", 1, "s1"]
  );
  assert.deepEqual(harness.calls.slice(-4), [
    ["matches", "s1"],
    ["resetStatus"],
    ["renderSegments", undefined],
    ["focusTarget"]
  ]);
  assert.equal(harness.statusFilter.value, "all");
});

test("SegmentNavigationController previous-open prefers earlier candidates and wraps backward", async () => {
  const { createSegmentNavigationController } = await moduleAt("src/features/editor/segment-navigation-controller.js");
  const earlier = createHarness(createSegmentNavigationController, {
    activeIndex: 2,
    openIds: ["s1", "s2"]
  });
  await earlier.controller.previousOpen();
  assert.deepEqual(
    earlier.calls.find(([name]) => name === "select"),
    ["select", 1, "s1"]
  );

  const wrapped = createHarness(createSegmentNavigationController, {
    activeIndex: 0,
    openIds: ["s1", "s2"]
  });
  await wrapped.controller.previousOpen();
  assert.deepEqual(
    wrapped.calls.find(([name]) => name === "select"),
    ["select", 2, "s2"]
  );
  assert.deepEqual(wrapped.calls.at(-1), ["focusTarget"]);
});

test("SegmentNavigationController next-open is inert for empty and fully confirmed collections", async () => {
  const { createSegmentNavigationController } = await moduleAt("src/features/editor/segment-navigation-controller.js");
  const empty = createHarness(createSegmentNavigationController, { segments: [] });
  await empty.controller.nextOpen();
  assert.equal(
    empty.calls.some(([name]) => name === "select"),
    false
  );
  const confirmed = createHarness(createSegmentNavigationController, { openIds: [] });
  await confirmed.controller.nextOpen();
  assert.equal(
    confirmed.calls.some(([name]) => name === "select"),
    false
  );
  assert.equal(
    confirmed.calls.some(([name]) => name === "focusTarget"),
    false
  );
});

test("SegmentNavigationController validates collaborators and exposes an immutable API", async () => {
  const { createSegmentNavigationController } = await moduleAt("src/features/editor/segment-navigation-controller.js");
  assert.throws(() => createSegmentNavigationController({}), /requires session and navigation boundaries/);
  const { controller } = createHarness(createSegmentNavigationController);
  assert.equal(Object.isFrozen(controller), true);
});
