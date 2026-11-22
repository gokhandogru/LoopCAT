const assert = require("node:assert/strict");
const test = require("node:test");

test("selection ignores draft progress updates but reconciles replaced rows and project changes", async () => {
  const { createEditorSessionStore } = await import("../../src/features/editor/editor-session-store.js");
  const { createSegmentSelectionStore, bindSegmentSelectionToSession } =
    await import("../../src/features/editor/segment-selection-store.js");
  let reads = 0;
  const rows = Array.from({ length: 10000 }, (_, index) => ({
    get id() {
      reads++;
      return String(index);
    }
  }));
  const session = createEditorSessionStore({ project: { id: "first" }, segments: rows });
  const selection = createSegmentSelectionStore();
  selection.sync("first", rows);
  selection.select([rows[0], rows[1]]);
  let notifications = 0;
  selection.subscribe(() => notifications++);
  const unsubscribe = bindSegmentSelectionToSession(session, selection);
  reads = 0;
  session.replaceProgressSummary({ total: rows.length, confirmed: 1 });
  session.markProjectSummaryDirty("first");
  session.replaceQaChecks([{ id: "issue" }]);
  session.replaceProject({ id: "first", name: "Renamed" });
  assert.equal(reads, 0, "unrelated session changes must not scan project segments");
  assert.equal(notifications, 0);
  assert.deepEqual(selection.ids(), ["0", "1"]);
  session.replaceSegments(rows.slice(1));
  assert.equal(reads, 9999);
  assert.equal(notifications, 1);
  assert.deepEqual(selection.ids(), ["1"]);
  session.replaceProject({ id: "second" });
  assert.deepEqual(selection.ids(), []);
  assert.equal(notifications, 2);
  unsubscribe();
  session.replaceSegments([]);
  assert.equal(notifications, 2);
});

test("typing that changes filter membership refreshes selection controls without rebuilding the ID set", async () => {
  const { createEditorSessionStore } = await import("../../src/features/editor/editor-session-store.js");
  const { bindSegmentSelectionToSession } = await import("../../src/features/editor/segment-selection-store.js");
  const session = createEditorSessionStore({ project: { id: "p" }, segments: [{ id: "s" }] });
  let visible = [0],
    syncs = 0,
    views = 0;
  bindSegmentSelectionToSession(
    session,
    { sync: () => syncs++ },
    {
      getVisibleIndexes: () => visible,
      onVisibleChange: () => views++
    }
  );
  session.replaceProgressSummary({ total: 1 });
  assert.equal(views, 0);
  visible = [];
  session.replaceProgressSummary({ total: 1 });
  assert.equal(views, 1);
  assert.equal(syncs, 0);
  session.markProjectSummaryDirty("p");
  assert.equal(views, 1);
  session.replaceSegments([]);
  assert.equal(syncs, 1);
});
