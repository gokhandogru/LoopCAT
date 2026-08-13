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

test("filter state updates atomically and resets to deterministic defaults", async () => {
  const { createFilterStore } = await moduleAt("src/features/editor/filter-store.js");
  const filters = createFilterStore({ status: "draft" });
  filters.update({ query: "term", regex: true });
  assert.equal(filters.getState().status, "draft");
  assert.equal(filters.getState().query, "term");
  filters.reset();
  assert.deepEqual(filters.getState(), {
    documentId: "",
    query: "",
    scope: "both",
    regex: false,
    caseSensitive: false,
    status: "all",
    reviewState: "",
    aiState: ""
  });
});
