const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("editor selection state exposes stable segment identity", async () => {
  const { createSegmentGridController } = await moduleAt("src/features/editor/segment-grid-controller.js");
  const selections = [];
  const grid = createSegmentGridController({
    navigation: {
      selectSegment(selection) {
        selections.push(selection);
        return selection;
      }
    }
  });

  assert.deepEqual(grid.selectSegment(4, "segment-5"), { activeIndex: 4, segmentId: "segment-5" });
  assert.deepEqual(selections, [{ activeIndex: 4, segmentId: "segment-5" }]);
});

test("segment grid owns virtualization and coalesced render scheduling", async () => {
  const { createSegmentGridController } = await moduleAt("src/features/editor/segment-grid-controller.js");
  const frames = [];
  const viewport = { clientHeight: 236, scrollTop: 354 };
  const grid = createSegmentGridController({
    navigation: { selectSegment: (selection) => selection },
    viewport,
    rowHeight: 118,
    rowBuffer: 1,
    requestFrame(callback) {
      frames.push(callback);
      return frames.length;
    }
  });

  const nextWindow = grid.calculateWindow([0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(nextWindow, { start: 2, end: 6, total: 7, indexes: [2, 3, 4, 5] });
  grid.commitWindow(nextWindow);
  assert.equal(
    grid.ensureVisible(4, () => assert.fail("visible row should not rerender")),
    false
  );
  assert.equal(
    grid.ensureVisible(6, () => {}),
    true
  );
  assert.equal(viewport.scrollTop, 590);

  const rowBatches = [];
  grid.scheduleRowUpdate(2, (indexes) => rowBatches.push(indexes));
  grid.scheduleRowUpdate(4, (indexes) => rowBatches.push(indexes));
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.deepEqual(rowBatches, [[2, 4]]);

  let scrollRenders = 0;
  grid.scheduleScroll(() => scrollRenders++);
  grid.scheduleScroll(() => scrollRenders++);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(scrollRenders, 1);
});

test("filter state updates atomically and resets to deterministic defaults", async () => {
  const { createFilterStore } = await moduleAt("src/features/editor/filter-store.js");
  const filters = createFilterStore({ status: "draft" });
  filters.update({ query: "term", regex: true });
  assert.equal(filters.getState().status, "draft");
  assert.equal(filters.getState().query, "term");
  filters.reset();
  assert.deepEqual(filters.getState(), {
    query: "",
    scope: "both",
    regex: false,
    caseSensitive: false,
    status: "all",
    reviewState: "",
    aiState: ""
  });
});
