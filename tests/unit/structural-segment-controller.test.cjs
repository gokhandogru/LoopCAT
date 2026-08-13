const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/structural-segment-controller.js")).href);
}

function fakeButton() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type) {
      listeners.get(type)?.forEach((listener) => listener({ type, target: this }));
    }
  };
}

function createHarness(createStructuralSegmentController, overrides = {}) {
  const splitButton = fakeButton();
  const mergeButton = fakeButton();
  const project = { id: "p1" };
  let segments = structuredClone(
    overrides.segments || [
      {
        id: "s1",
        projectId: "p1",
        documentId: "d1",
        index: 0,
        documentIndex: 0,
        source: "First source half. Second source half.",
        target: "First target half. Second target half.",
        status: "draft",
        targetHistory: [],
        revision: 4
      },
      {
        id: "s2",
        projectId: "p1",
        documentId: "d1",
        index: 1,
        documentIndex: 1,
        source: "Merge source.",
        target: "Merge target.",
        status: "draft",
        targetHistory: [],
        revision: 3
      }
    ]
  );
  const calls = [];
  const statuses = [];
  const created = {};
  let activeIndex = 0;

  function createCommand(kind) {
    return (options) => {
      created[kind] = options;
      calls.push(["create", kind]);
      if (overrides.missingCommand === kind) return null;
      return { execute: options.applyFirst, kind };
    };
  }

  const controller = createStructuralSegmentController({
    elements: { splitButton, mergeButton },
    editorSessionStore: {
      getProject: () => project,
      getSegments: () => segments,
      replaceSegments: (next) => {
        segments = next;
        calls.push(["replaceSegments", next.map((segment) => segment.id)]);
      }
    },
    commands: {
      bus: {
        execute(command) {
          calls.push(["execute", command.kind]);
          return command.execute();
        }
      },
      createSplit: createCommand("split"),
      createMerge: createCommand("merge"),
      setProjectId: (projectId) => calls.push(["setProjectId", projectId]),
      changed: () => calls.push(["commandsChanged"])
    },
    selection: {
      getActiveIndex: () => activeIndex,
      findEditor: () => (overrides.noEditor ? null : { selectionStart: overrides.cursor ?? 18 }),
      select: (index) => {
        activeIndex = index;
        calls.push(["select", index]);
      },
      focusTarget: () => calls.push(["focusTarget"])
    },
    mutation: {
      applyTarget: (segment, target, status, reason) => {
        calls.push(["applyTarget", target, status, reason]);
        segment.targetHistory = [...(segment.targetHistory || []), { reason, target }];
        segment.target = target;
        segment.status = status;
      },
      touch: (segment) => {
        segment.revision += 1;
        segment.updatedAt = "touched";
      },
      detectTags: (text) =>
        Array.from(String(text).matchAll(/<[^>]+>/g)).map((match) => ({
          index: match.index,
          text: match[0]
        })),
      prepareHistoryStates: (next) => next,
      prepareRestoreSnapshot: (snapshot, current) => ({
        ...structuredClone(snapshot),
        revision: Math.max(Number(snapshot.revision || 0), Number(current?.revision || 0)) + 1,
        updatedAt: "restored"
      })
    },
    persistence: {
      flush: (projectId) => {
        calls.push(["flush", projectId]);
        return overrides.flushError ? Promise.reject(overrides.flushError) : Promise.resolve();
      },
      saveStructure: (next, deleted = []) => {
        calls.push(["saveStructure", next.map((segment) => segment.id), deleted]);
        if (overrides.saveError) return Promise.reject(overrides.saveError);
        return Promise.resolve(structuredClone(next));
      },
      discardPending: (segmentId) => calls.push(["discardPending", segmentId])
    },
    view: {
      invalidateFilters: () => calls.push(["invalidateFilters"]),
      renderAll: () => calls.push(["renderAll"])
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    ids: { segment: () => "s-created" },
    clock: { now: () => "created" },
    testHooks: overrides.testHooks
  });

  return {
    calls,
    controller,
    created,
    mergeButton,
    segments: () => segments,
    setActiveIndex: (index) => {
      activeIndex = index;
    },
    splitButton,
    statuses
  };
}

test("structural controller maps split cursors outside protected ranges and owns action listener lifecycle", async () => {
  const { createStructuralSegmentController } = await loadFactory();
  const harness = createHarness(createStructuralSegmentController);
  const source = "Keep <b>protected words</b> outside split";
  const splitIndex = harness.controller.mappedSourceSplitIndex(source, "Uzun hedef metin", 7);

  assert.ok(splitIndex > 0 && splitIndex < source.length);
  assert.equal(
    harness.controller.splitProtectedRanges(source).some((range) => splitIndex > range.start && splitIndex < range.end),
    false
  );
  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  harness.splitButton.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(
    harness.segments().some((segment) => segment.id === "s-created"),
    true
  );
  assert.equal(harness.controller.unmount(), true);
});

test("split flushes pending saves, records stable IDs, normalizes order, selects the created segment, and restores Undo", async () => {
  const { createStructuralSegmentController } = await loadFactory();
  const harness = createHarness(createStructuralSegmentController);
  const original = structuredClone(harness.segments());

  const result = await harness.controller.split();

  assert.equal(result.activeSegmentId, "s-created");
  assert.equal(harness.segments().length, 3);
  assert.deepEqual(
    harness.segments().map((segment) => segment.index),
    [0, 1, 2]
  );
  assert.deepEqual(
    harness.segments().map((segment) => segment.documentIndex),
    [0, 1, 2]
  );
  assert.deepEqual(harness.statuses.at(-1), ["Segment split; Undo is available", "saved"]);
  assert.equal(harness.created.split.createdSegmentId, "s-created");
  assert.ok(harness.calls.some(([name]) => name === "flush"));
  assert.ok(harness.calls.some(([name]) => name === "commandsChanged"));

  await harness.created.split.restoreSegments(original, {
    direction: "undo",
    activeSegmentId: "s1",
    originalSegmentId: "s1",
    createdSegmentId: "s-created"
  });
  assert.deepEqual(
    harness.segments().map((segment) => segment.id),
    ["s1", "s2"]
  );
  assert.ok(harness.calls.some(([name, segmentId]) => name === "discardPending" && segmentId === "s-created"));
});

test("merge atomically persists deletion, regenerates target history and tags, and restores the merged segment", async () => {
  const { createStructuralSegmentController } = await loadFactory();
  const harness = createHarness(createStructuralSegmentController, {
    segments: [
      {
        id: "s1",
        projectId: "p1",
        documentId: "d1",
        index: 0,
        documentIndex: 0,
        source: "First <b>source</b>.",
        target: "First target.",
        status: "draft",
        targetHistory: [],
        revision: 2
      },
      {
        id: "s2",
        projectId: "p1",
        documentId: "d1",
        index: 1,
        documentIndex: 1,
        source: "Second source.",
        target: "Second target.",
        status: "draft",
        targetHistory: [],
        revision: 3
      }
    ]
  });
  const original = structuredClone(harness.segments());

  const result = await harness.controller.merge();

  assert.equal(result.activeSegmentId, "s1");
  assert.equal(harness.segments().length, 1);
  assert.equal(harness.segments()[0].source, "First <b>source</b>. Second source.");
  assert.equal(harness.segments()[0].target, "First target. Second target.");
  assert.ok(harness.segments()[0].targetHistory.some((entry) => entry.reason === "merge"));
  assert.ok(harness.segments()[0].tags.some((tag) => tag.text === "<b>"));
  assert.ok(
    harness.calls.some(([name, , deleted]) => name === "saveStructure" && deleted.length === 1 && deleted[0] === "s2")
  );
  assert.deepEqual(harness.statuses.at(-1), ["Segments merged; Undo is available", "saved"]);

  await harness.created.merge.restoreSegments(original, {
    direction: "undo",
    activeSegmentId: "s1",
    segmentId: "s1",
    mergedSegmentId: "s2"
  });
  assert.deepEqual(
    harness.segments().map((segment) => segment.id),
    ["s1", "s2"]
  );
  assert.ok(harness.segments().every((segment) => segment.updatedAt === "restored"));
});

test("structural validation and pending-save failures stop before command creation", async () => {
  const { createStructuralSegmentController } = await loadFactory();
  const blockedSplit = createHarness(createStructuralSegmentController, {
    segments: [
      {
        id: "s1",
        projectId: "p1",
        documentId: "d1",
        index: 0,
        documentIndex: 0,
        source: "Structured source.",
        target: "Structured target.",
        structure: { type: "xliff-unit" }
      }
    ]
  });
  assert.equal(await blockedSplit.controller.split(), null);
  assert.deepEqual(blockedSplit.statuses.at(-1), [
    "Split is unavailable for structure-preserving localization files.",
    "dirty"
  ]);
  assert.equal(blockedSplit.created.split, undefined);

  const failedFlush = createHarness(createStructuralSegmentController, {
    flushError: new Error("pending edits unavailable")
  });
  assert.equal(await failedFlush.controller.merge(), null);
  assert.deepEqual(failedFlush.statuses.at(-1), ["pending edits unavailable", "dirty"]);
  assert.equal(failedFlush.created.merge, undefined);
});

test("initial structural persistence failures restore the exact visible list, selection, focus, and status", async () => {
  const { createStructuralSegmentController } = await loadFactory();
  const splitHarness = createHarness(createStructuralSegmentController, {
    saveError: new Error("split transaction failed")
  });
  const splitBefore = structuredClone(splitHarness.segments());
  assert.equal(await splitHarness.controller.split(), null);
  assert.deepEqual(splitHarness.segments(), splitBefore);
  assert.deepEqual(splitHarness.statuses.at(-1), ["split transaction failed", "dirty"]);
  assert.ok(splitHarness.calls.some(([name]) => name === "renderAll"));
  assert.ok(splitHarness.calls.some(([name]) => name === "focusTarget"));
  assert.equal(
    splitHarness.calls.some(([name]) => name === "commandsChanged"),
    false
  );

  const mergeHarness = createHarness(createStructuralSegmentController, {
    saveError: new Error("merge transaction failed")
  });
  const mergeBefore = structuredClone(mergeHarness.segments());
  assert.equal(await mergeHarness.controller.merge(), null);
  assert.deepEqual(mergeHarness.segments(), mergeBefore);
  assert.deepEqual(mergeHarness.statuses.at(-1), ["merge transaction failed", "dirty"]);
  assert.equal(
    mergeHarness.calls.some(([name]) => name === "commandsChanged"),
    false
  );
});
