const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("CommandBus emits a redacted-shape receipt and supports Undo/Redo", async () => {
  const [{ createCommandBus }, { createUndoStore }] = await Promise.all([
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js")
  ]);
  const undoStore = createUndoStore(2);
  const bus = createCommandBus({ undoStore });
  let value = 0;
  const command = {
    id: "increment",
    label: "Increment",
    projectId: "project-1",
    affectedIds: ["segment-1"],
    provenance: { origin: "user" },
    execute() {
      value += 1;
      return Promise.resolve({ recoveryToken: "revision-1" });
    },
    undo() {
      value -= 1;
      return Promise.resolve(value);
    }
  };

  const applied = await bus.execute(command);
  assert.equal(value, 1);
  assert.equal(applied.receipt.reversible, true);
  assert.equal(applied.receipt.recoveryToken, "revision-1");
  await bus.undo("project-1");
  assert.equal(value, 0);
  await bus.redo("project-1");
  assert.equal(value, 1);
});

test("UndoStore is bounded per project", async () => {
  const { createUndoStore } = await moduleAt("src/commands/undo-store.js");
  const store = createUndoStore(2);
  store.push("one", { receipt: { id: "1" } });
  store.push("one", { receipt: { id: "2" } });
  store.push("one", { receipt: { id: "3" } });
  assert.equal(store.popUndo("one").receipt.id, "3");
  assert.equal(store.popUndo("one").receipt.id, "2");
  assert.equal(store.popUndo("one"), null);
});

test("DeleteProject command restores the exact Trash token on Undo", async () => {
  const { createDeleteProjectCommand } = await moduleAt("src/commands/trash-commands.js");
  const calls = [];
  const command = createDeleteProjectCommand({
    projectId: "project-1",
    trashRepository: {
      moveProject(projectId) {
        calls.push(["move", projectId]);
        return Promise.resolve({ id: "trash-1" });
      },
      restore(entryId) {
        calls.push(["restore", entryId]);
        return Promise.resolve({ id: entryId });
      }
    }
  });
  await command.execute();
  await command.undo();
  assert.deepEqual(calls, [
    ["move", "project-1"],
    ["restore", "trash-1"]
  ]);
});

test("Redo preserves the remaining redo stack", async () => {
  const [{ createCommandBus }, { createUndoStore }] = await Promise.all([
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js")
  ]);
  const bus = createCommandBus({ undoStore: createUndoStore(10) });
  const values = [];
  const command = (id) => ({
    id,
    projectId: "p1",
    execute: () => Promise.resolve(values.push(id)),
    undo: () => Promise.resolve(values.pop())
  });
  await bus.execute(command("one"));
  await bus.execute(command("two"));
  await bus.undo("p1");
  await bus.undo("p1");
  await bus.redo("p1");
  assert.equal(bus.canRedo("p1"), true);
  await bus.redo("p1");
  assert.deepEqual(values, ["one", "two"]);
});

test("failed Undo and Redo keep their command available for recovery", async () => {
  const [{ createCommandBus }, { createUndoStore }] = await Promise.all([
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js")
  ]);
  const bus = createCommandBus({ undoStore: createUndoStore(10) });
  let failUndo = true;
  let failRedo = false;
  let value = 0;
  const command = {
    id: "recoverable",
    projectId: "p1",
    execute() {
      if (failRedo) return Promise.reject(new Error("redo failed"));
      value += 1;
      return Promise.resolve();
    },
    undo() {
      if (failUndo) return Promise.reject(new Error("undo failed"));
      value -= 1;
      return Promise.resolve();
    }
  };
  await bus.execute(command);
  await assert.rejects(bus.undo("p1"), /undo failed/);
  assert.equal(bus.canUndo("p1"), true);
  failUndo = false;
  await bus.undo("p1");
  failRedo = true;
  await assert.rejects(bus.redo("p1"), /redo failed/);
  assert.equal(bus.canRedo("p1"), true);
  assert.equal(value, 0);
});

test("AI suggestion command preserves provenance and restores its exact segment snapshot", async () => {
  const [{ createApplyAiSuggestionCommand }, { createCommandBus }, { createUndoStore }] = await Promise.all([
    moduleAt("src/commands/ai-commands.js"),
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js")
  ]);
  let current = { id: "s1", target: "Before", status: "draft" };
  const command = createApplyAiSuggestionCommand({
    projectId: "p1",
    segmentId: "s1",
    suggestion: { id: "a1", provider: "Local AI", model: "model-1" },
    beforeSnapshot: current,
    applyFirst: () => {
      current = { ...current, target: "After", reviewState: "needs-review" };
      return Promise.resolve({ snapshot: current });
    },
    restoreSnapshot: (snapshot) => {
      current = snapshot;
      return Promise.resolve(current);
    }
  });
  const bus = createCommandBus({ undoStore: createUndoStore() });
  const applied = await bus.execute(command);
  assert.equal(applied.receipt.provenance.provider, "Local AI");
  await bus.undo("p1");
  assert.equal(current.target, "Before");
  await bus.redo("p1");
  assert.equal(current.target, "After");
  assert.equal(current.reviewState, "needs-review");
});

test("ConfirmSegment restores the exact segment snapshot and replays the confirmed state", async () => {
  const [{ createConfirmSegmentCommand }, { createCommandBus }, { createUndoStore }] = await Promise.all([
    moduleAt("src/commands/segment-commands.js"),
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js")
  ]);
  let current = { id: "s1", target: "Target", status: "draft", reviewState: "needs-review", revision: 4 };
  const command = createConfirmSegmentCommand({
    projectId: "p1",
    segmentId: "s1",
    beforeSnapshot: current,
    applyFirst: () => {
      current = { ...current, status: "confirmed", reviewState: "", revision: 5 };
      return Promise.resolve({ snapshot: current, activeSegmentId: "s2" });
    },
    restoreSnapshot: (snapshot, context) => {
      current = snapshot;
      return Promise.resolve({ snapshot: current, direction: context.direction, activeSegmentId: "s1" });
    }
  });
  const bus = createCommandBus({ undoStore: createUndoStore() });
  const applied = await bus.execute(command);
  assert.equal(applied.receipt.commandId, "confirm-segment");
  assert.equal(current.status, "confirmed");
  const undone = await bus.undo("p1");
  assert.equal(undone.result.direction, "undo");
  assert.deepEqual(current, {
    id: "s1",
    target: "Target",
    status: "draft",
    reviewState: "needs-review",
    revision: 4
  });
  await bus.redo("p1");
  assert.equal(current.status, "confirmed");
  assert.equal(current.reviewState, "");
});

test("ChangeReviewState records no command when its first persistence boundary fails", async () => {
  const [{ createChangeReviewStateCommand }, { createCommandBus }, { createUndoStore }] = await Promise.all([
    moduleAt("src/commands/segment-commands.js"),
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js")
  ]);
  const bus = createCommandBus({ undoStore: createUndoStore() });
  const command = createChangeReviewStateCommand({
    projectId: "p1",
    segmentId: "s1",
    beforeSnapshot: { id: "s1", reviewState: "" },
    applyFirst: () => Promise.reject(new Error("storage failed")),
    restoreSnapshot: () => Promise.resolve()
  });
  await assert.rejects(bus.execute(command), /storage failed/);
  assert.equal(bus.canUndo("p1"), false);
});

test("ReplaceTargets restores every affected segment and replays the exact applied snapshots", async () => {
  const [{ createReplaceTargetsCommand }, { createCommandBus }, { createUndoStore }] = await Promise.all([
    moduleAt("src/commands/segment-commands.js"),
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js")
  ]);
  let current = [
    { id: "s1", target: "One", revision: 1 },
    { id: "s2", target: "Two", revision: 2 }
  ];
  const before = structuredClone(current);
  const command = createReplaceTargetsCommand({
    projectId: "p1",
    segmentIds: current.map((segment) => segment.id),
    beforeSnapshots: before,
    applyFirst: () => {
      current = current.map((segment) => ({
        ...segment,
        target: `${segment.target}!`,
        revision: segment.revision + 1
      }));
      return Promise.resolve({ snapshots: current });
    },
    restoreSnapshots: (snapshots) => {
      current = snapshots;
      return Promise.resolve({ snapshots: current, activeSegmentId: "s1" });
    }
  });
  const bus = createCommandBus({ undoStore: createUndoStore() });
  await bus.execute(command);
  assert.deepEqual(
    current.map((segment) => segment.target),
    ["One!", "Two!"]
  );
  await bus.undo("p1");
  assert.deepEqual(current, before);
  await bus.redo("p1");
  assert.deepEqual(
    current.map((segment) => segment.target),
    ["One!", "Two!"]
  );
});

test("EditTarget sessions coalesce continuous typing into one redacted Undo entry", async () => {
  const [{ createEditTargetCommand }, { createEditTargetSessionStore }, { createCommandBus }, { createUndoStore }] =
    await Promise.all([
      moduleAt("src/commands/segment-commands.js"),
      moduleAt("src/commands/edit-target-session.js"),
      moduleAt("src/commands/command-bus.js"),
      moduleAt("src/commands/undo-store.js")
    ]);
  const bus = createCommandBus({ undoStore: createUndoStore() });
  const sessions = createEditTargetSessionStore({ commandBus: bus, createEditTargetCommand });
  const before = {
    target: "Before target",
    status: "draft",
    targetHistory: [{ id: "h1", toTarget: "Before target" }],
    aiApplication: { provider: "Local AI" },
    revision: 4
  };
  let current = structuredClone(before);
  const restorePatch = (patch, context) => {
    current = structuredClone(patch);
    return Promise.resolve({ activeSegmentId: "s1", direction: context.direction });
  };

  sessions.begin({ projectId: "p1", segmentId: "s1", beforePatch: before, restorePatch });
  current = { ...current, target: "Sensitive first draft", revision: 5 };
  sessions.capture("s1", current, { activeSegmentId: "s1" });
  current = {
    ...current,
    target: "Sensitive final draft",
    targetHistory: [...current.targetHistory, { id: "h2", toTarget: "Sensitive final draft" }],
    revision: 6
  };
  sessions.capture("s1", current, { activeSegmentId: "s1" });
  const recorded = sessions.finalize("s1");

  assert.equal(recorded.receipt.commandId, "edit-target");
  assert.equal(JSON.stringify(recorded.receipt).includes("Sensitive"), false);
  assert.equal(sessions.size(), 0);
  await bus.undo("p1");
  assert.deepEqual(current, before);
  assert.equal(bus.canUndo("p1"), false, "continuous typing must create one Undo entry");
  await bus.redo("p1");
  assert.equal(current.target, "Sensitive final draft");
  assert.deepEqual(current.aiApplication, { provider: "Local AI" });
});

test("failed EditTarget Undo preserves the applied state and remains retryable", async () => {
  const [{ createEditTargetCommand }, { createEditTargetSessionStore }, { createCommandBus }, { createUndoStore }] =
    await Promise.all([
      moduleAt("src/commands/segment-commands.js"),
      moduleAt("src/commands/edit-target-session.js"),
      moduleAt("src/commands/command-bus.js"),
      moduleAt("src/commands/undo-store.js")
    ]);
  const bus = createCommandBus({ undoStore: createUndoStore() });
  const sessions = createEditTargetSessionStore({ commandBus: bus, createEditTargetCommand });
  const before = { target: "Before", status: "draft", targetHistory: [], revision: 1 };
  const applied = { target: "After", status: "draft", targetHistory: [], revision: 2 };
  let current = structuredClone(applied);
  let failRestore = true;
  const restorePatch = (patch) => {
    if (failRestore) return Promise.reject(new Error("transaction failed"));
    current = structuredClone(patch);
    return Promise.resolve({ activeSegmentId: "s1" });
  };

  sessions.begin({ projectId: "p1", segmentId: "s1", beforePatch: before, restorePatch });
  sessions.capture("s1", applied);
  sessions.finalize("s1");
  await assert.rejects(bus.undo("p1"), /transaction failed/);
  assert.deepEqual(current, applied);
  assert.equal(bus.canUndo("p1"), true);
  failRestore = false;
  await bus.undo("p1");
  assert.deepEqual(current, before);
});

test("discrete target producers preserve patches, provenance boundaries, selection, and retryable Undo", async () => {
  const [
    {
      createCopySourceToTargetCommand,
      createInsertProtectedTagCommand,
      createInsertTermTargetCommand,
      createInsertTmTargetCommand
    },
    { createCommandBus },
    { createUndoStore }
  ] = await Promise.all([
    moduleAt("src/commands/segment-commands.js"),
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js")
  ]);
  const bus = createCommandBus({ undoStore: createUndoStore() });
  const before = {
    target: "Before target",
    status: "draft",
    targetHistory: [{ id: "h1", toTarget: "Before target" }],
    tmPretranslation: { score: 99, tmName: "Private TM" },
    aiApplication: { provider: "Private provider" },
    revision: 7
  };
  const appliedByFactory = [
    [
      createCopySourceToTargetCommand,
      "Copied sensitive source",
      "copy-source-to-target",
      { origin: "user", producer: "copy-source" }
    ],
    [
      createInsertTmTargetCommand,
      "Sensitive TM target",
      "insert-tm-target",
      { origin: "translation-memory", channel: "concordance", resourceId: "tm-1" }
    ],
    [
      createInsertTermTargetCommand,
      "Before approved term target",
      "insert-term-target",
      { origin: "termbase", resourceId: "term-1", sourceTerm: "source term" }
    ],
    [
      createInsertProtectedTagCommand,
      "Before <b>target",
      "insert-protected-tag",
      { origin: "user", producer: "protected-tag" }
    ]
  ];

  for (const [factory, target, commandId, provenance] of appliedByFactory) {
    let current = structuredClone(before);
    let selection = { start: 3, end: 5 };
    let failRestore = true;
    const applied = {
      ...structuredClone(before),
      target,
      targetHistory: [...before.targetHistory, { id: "h2", toTarget: target }],
      revision: before.revision + 1
    };
    const command = factory({
      projectId: "p1",
      segmentId: "s1",
      beforePatch: before,
      beforeSelection: selection,
      provenance,
      applyFirst: () => {
        current = structuredClone(applied);
        selection = { start: target.length, end: target.length };
        return { patch: current, selection, activeSegmentId: "s1", focusTarget: true };
      },
      restorePatch: (patch, context) => {
        if (failRestore && context.direction === "undo") throw new Error("transaction failed");
        current = structuredClone(patch);
        selection = structuredClone(context.selection);
        return Promise.resolve({ activeSegmentId: "s1", focusTarget: true, selection });
      }
    });

    const executed = await bus.execute(command);
    assert.equal(executed.receipt.commandId, commandId);
    assert.deepEqual(executed.receipt.provenance, provenance);
    assert.equal(JSON.stringify(executed.receipt).includes("Sensitive"), false);
    assert.equal(JSON.stringify(executed.receipt).includes("Private"), false);
    await assert.rejects(bus.undo("p1"), /transaction failed/);
    assert.deepEqual(current, applied, "failed Undo must preserve the applied patch");
    assert.equal(bus.canUndo("p1"), true, "failed Undo must remain retryable");
    failRestore = false;
    const undone = await bus.undo("p1");
    assert.deepEqual(current, before);
    assert.deepEqual(undone.result.selection, { start: 3, end: 5 });
    const redone = await bus.redo("p1");
    assert.equal(current.target, target);
    assert.equal(current.revision, before.revision + 1);
    assert.deepEqual(redone.result.selection, { start: target.length, end: target.length });
  }
});

test("batch pretranslation commands bound receipts and restore every private target patch atomically", async () => {
  const [{ createAiPretranslationCommand, createTmPretranslationCommand }, { createCommandBus }, { createUndoStore }] =
    await Promise.all([
      moduleAt("src/commands/segment-commands.js"),
      moduleAt("src/commands/command-bus.js"),
      moduleAt("src/commands/undo-store.js")
    ]);
  const segmentIds = Array.from({ length: 105 }, (_, index) => `segment-${index + 1}`);
  const before = segmentIds.map((segmentId, index) => ({
    target: `Private original ${segmentId}`,
    status: index % 2 ? "draft" : "empty",
    targetHistory: [],
    revision: index + 1
  }));
  const applied = before.map((patch, index) => ({
    ...patch,
    target: `Sensitive translated ${index + 1}`,
    status: "draft",
    aiPretranslation: { present: true, value: { provider: "Private AI", model: "private-model" } },
    reviewState: { present: true, value: "needs-review" },
    revision: patch.revision + 1
  }));

  for (const [factory, commandId, origin] of [
    [createTmPretranslationCommand, "tm-pretranslate", "translation-memory"],
    [createAiPretranslationCommand, "ai-pretranslate", "ai"]
  ]) {
    const bus = createCommandBus({ undoStore: createUndoStore() });
    let current = structuredClone(before);
    let failRestore = true;
    const command = factory({
      projectId: "p1",
      segmentIds,
      beforePatches: before,
      provenance: { origin, provider: origin === "ai" ? "Local AI" : undefined },
      applyFirst: () => {
        current = structuredClone(applied);
        return Promise.resolve({ patches: current, activeSegmentId: segmentIds[0] });
      },
      restorePatches: (patches) => {
        if (failRestore) throw new Error("batch transaction failed");
        current = structuredClone(patches);
        return Promise.resolve({ patches: current, activeSegmentId: segmentIds[0] });
      }
    });

    const executed = await bus.execute(command);
    assert.equal(executed.receipt.commandId, commandId);
    assert.equal(executed.receipt.affectedIds.length, 100);
    assert.equal(executed.receipt.provenance.affectedCount, 105);
    assert.equal(executed.receipt.provenance.affectedIdsTruncated, true);
    assert.equal(JSON.stringify(executed.receipt).includes("Sensitive translated"), false);
    assert.equal(JSON.stringify(executed.receipt).includes("Private original"), false);
    await assert.rejects(bus.undo("p1"), /batch transaction failed/);
    assert.deepEqual(current, applied);
    assert.equal(bus.canUndo("p1"), true);
    failRestore = false;
    await bus.undo("p1");
    assert.deepEqual(current, before);
    await bus.redo("p1");
    assert.deepEqual(current, applied);
  }
});

test("SplitSegment restores ordering with a stable created ID and retryable atomic Undo", async () => {
  const [{ createSplitSegmentCommand }, { createCommandBus }, { createUndoStore }] = await Promise.all([
    moduleAt("src/commands/segment-commands.js"),
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js")
  ]);
  const before = [
    {
      id: "s1",
      projectId: "p1",
      index: 0,
      documentIndex: 0,
      source: "Private whole source",
      target: "Private whole target",
      revision: 4
    },
    {
      id: "s2",
      projectId: "p1",
      index: 1,
      documentIndex: 1,
      source: "Following source",
      target: "Following target",
      revision: 2
    }
  ];
  const applied = [
    { ...before[0], source: "Private first source", target: "Private first target", revision: 5 },
    {
      id: "s-created",
      projectId: "p1",
      index: 1,
      documentIndex: 1,
      source: "Private second source",
      target: "Private second target",
      revision: 1
    },
    { ...before[1], index: 2, documentIndex: 2 }
  ];
  let current = structuredClone(before);
  let failRestore = true;
  const command = createSplitSegmentCommand({
    projectId: "p1",
    segmentId: "s1",
    createdSegmentId: "s-created",
    beforeSegments: before,
    applyFirst: () => {
      current = structuredClone(applied);
      return Promise.resolve({ segments: current, activeSegmentId: "s-created", focusTarget: true });
    },
    restoreSegments: (segments, context) => {
      if (failRestore && context.direction === "undo") throw new Error("structural transaction failed");
      current = structuredClone(segments);
      return Promise.resolve({
        segments: current,
        activeSegmentId: context.activeSegmentId,
        focusTarget: true
      });
    }
  });
  const bus = createCommandBus({ undoStore: createUndoStore() });

  const executed = await bus.execute(command);
  assert.equal(executed.receipt.commandId, "split-segment");
  assert.deepEqual(executed.receipt.affectedIds, ["s1", "s-created"]);
  assert.equal(executed.receipt.provenance.operation, "split");
  assert.equal(JSON.stringify(executed.receipt).includes("Private"), false);
  await assert.rejects(bus.undo("p1"), /structural transaction failed/);
  assert.deepEqual(current, applied, "failed structural Undo must preserve the applied split");
  assert.equal(bus.canUndo("p1"), true, "failed structural Undo must remain retryable");

  failRestore = false;
  const undone = await bus.undo("p1");
  assert.deepEqual(current, before);
  assert.equal(undone.result.activeSegmentId, "s1");
  const redone = await bus.redo("p1");
  assert.deepEqual(current, applied);
  assert.equal(redone.result.activeSegmentId, "s-created");
  assert.equal(current[1].id, "s-created", "Redo must retain the created segment ID and order");
});

test("MergeSegment restores the deleted segment with stable IDs and retryable atomic Undo", async () => {
  const [{ createMergeSegmentCommand }, { createCommandBus }, { createUndoStore }] = await Promise.all([
    moduleAt("src/commands/segment-commands.js"),
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js")
  ]);
  const before = [
    {
      id: "s1",
      projectId: "p1",
      index: 0,
      documentIndex: 0,
      source: "Private first source",
      target: "Private first target",
      revision: 4
    },
    {
      id: "s2",
      projectId: "p1",
      index: 1,
      documentIndex: 1,
      source: "Private second source",
      target: "Private second target",
      revision: 3
    },
    {
      id: "s3",
      projectId: "p1",
      index: 2,
      documentIndex: 2,
      source: "Following source",
      target: "Following target",
      revision: 2
    }
  ];
  const applied = [
    {
      ...before[0],
      source: "Private first source Private second source",
      target: "Private first target Private second target",
      revision: 5
    },
    { ...before[2], index: 1, documentIndex: 1 }
  ];

  const failedCurrent = structuredClone(before);
  const failedBus = createCommandBus({ undoStore: createUndoStore() });
  const failedCommand = createMergeSegmentCommand({
    projectId: "p1",
    segmentId: "s1",
    mergedSegmentId: "s2",
    beforeSegments: before,
    applyFirst: () => Promise.reject(new Error("structural transaction failed")),
    restoreSegments: () => Promise.reject(new Error("unexpected restore"))
  });
  await assert.rejects(failedBus.execute(failedCommand), /structural transaction failed/);
  assert.deepEqual(failedCurrent, before);
  assert.equal(failedBus.canUndo("p1"), false, "failed initial merge must not record a command");

  let current = structuredClone(before);
  let failRestore = true;
  const command = createMergeSegmentCommand({
    projectId: "p1",
    segmentId: "s1",
    mergedSegmentId: "s2",
    beforeSegments: before,
    applyFirst: () => {
      current = structuredClone(applied);
      return Promise.resolve({ segments: current, activeSegmentId: "s1", focusTarget: true });
    },
    restoreSegments: (segments, context) => {
      if (failRestore && context.direction === "undo") throw new Error("structural restore failed");
      current = structuredClone(segments);
      return Promise.resolve({
        segments: current,
        activeSegmentId: context.activeSegmentId,
        focusTarget: true
      });
    }
  });
  const bus = createCommandBus({ undoStore: createUndoStore() });

  const executed = await bus.execute(command);
  assert.equal(executed.receipt.commandId, "merge-segments");
  assert.deepEqual(executed.receipt.affectedIds, ["s1", "s2"]);
  assert.equal(executed.receipt.provenance.operation, "merge");
  assert.equal(JSON.stringify(executed.receipt).includes("Private"), false);
  await assert.rejects(bus.undo("p1"), /structural restore failed/);
  assert.deepEqual(current, applied, "failed structural Undo must preserve the applied merge");
  assert.equal(bus.canUndo("p1"), true, "failed structural Undo must remain retryable");

  failRestore = false;
  const undone = await bus.undo("p1");
  assert.deepEqual(current, before);
  assert.equal(undone.result.activeSegmentId, "s1");
  assert.equal(current[1].id, "s2", "Undo must restore the merged-away segment ID and order");
  const redone = await bus.redo("p1");
  assert.deepEqual(current, applied);
  assert.equal(redone.result.activeSegmentId, "s1");
  assert.equal(
    current.some((segment) => segment.id === "s2"),
    false,
    "Redo must delete only the merged-away segment"
  );
});
