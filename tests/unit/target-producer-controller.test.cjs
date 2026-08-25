const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/target-producer-controller.js")).href);
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

function clone(value) {
  return structuredClone(value);
}

function createHarness(createTargetProducerController, overrides = {}) {
  const button = fakeButton();
  const project = { id: "p1" };
  const segment = {
    id: "s1",
    projectId: "p1",
    source: "Source",
    target: "Draft",
    status: "draft",
    revision: 2,
    targetHistory: [{ reason: "edit", target: "Draft" }]
  };
  const segments = [segment];
  const calls = [];
  const statuses = [];
  const created = {};
  let activeIndex = 0;
  let activeSelection = overrides.activeSelection || { start: 1, end: 3 };

  function commandFactory(kind) {
    return (options) => {
      calls.push(["create", kind]);
      if (overrides.createError === kind) throw new Error(`${kind} creation failed`);
      created[kind] = options;
      return { execute: options.applyFirst, kind };
    };
  }

  const controller = createTargetProducerController({
    copySourceElement: button,
    editorSessionStore: {
      getProject: () => project,
      getSegments: () => segments
    },
    commands: {
      bus: {
        async execute(command) {
          calls.push(["execute", command.kind]);
          const applied = await command.execute();
          if (overrides.executeError) throw overrides.executeError;
          return { applied, receipt: { commandId: command.kind } };
        }
      },
      createCopySource: commandFactory("copy-source-to-target"),
      createTmTarget: commandFactory("insert-tm-target"),
      createTermTarget: commandFactory("insert-term-target"),
      createProtectedTag: commandFactory("insert-protected-tag"),
      changed: () => calls.push(["commandsChanged"])
    },
    editLifecycle: {
      finalize: (segmentId) => calls.push(["finalize", segmentId])
    },
    persistence: {
      clearPending: (value, options) => calls.push(["clearPending", value.id, options]),
      debounce: (value) => calls.push(["debounce", value.id, value.target])
    },
    selection: {
      getActiveIndex: () => activeIndex,
      active: () => (activeSelection ? { ...activeSelection } : null),
      normalize: (value, targetLength) => {
        if (!value) return null;
        const start = Math.max(0, Math.min(targetLength, Number(value.start) || 0));
        const end = Math.max(start, Math.min(targetLength, Number(value.end) || start));
        return { start, end };
      },
      focus: (value) => calls.push(["focus", value ? { ...value } : value])
    },
    filters: {
      matches: (value) => {
        calls.push(["matches", value.status]);
        return overrides.matches ? overrides.matches(value) : true;
      }
    },
    mutation: {
      capturePatch: (value) => ({
        target: value.target,
        status: value.status,
        revision: value.revision,
        targetHistory: clone(value.targetHistory)
      }),
      applyTarget: (value, target, status, reason) => {
        calls.push(["applyTarget", target, status, reason]);
        value.targetHistory.push({ reason, target });
        value.target = target;
        value.status = status;
      },
      touch: (value) => {
        calls.push(["touch"]);
        value.revision += 1;
      },
      restorePatch: (value, patch) => {
        calls.push(["restorePatch"]);
        Object.assign(value, clone(patch));
      },
      invalidateFilters: () => calls.push(["invalidateFilters"])
    },
    restoration: {
      restorePatch: (segmentId, patch, context) => {
        calls.push(["restoreCommandPatch", segmentId, patch, context]);
        return Promise.resolve();
      }
    },
    view: {
      renderSegments: (options) => calls.push(["renderSegments", options]),
      renderProgress: (options) => calls.push(["renderProgress", options]),
      renderHistory: () => calls.push(["renderHistory"])
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) }
  });

  return {
    button,
    calls,
    controller,
    created,
    segment,
    setActiveIndex: (index) => {
      activeIndex = index;
    },
    setActiveSelection: (value) => {
      activeSelection = value;
    },
    statuses
  };
}

test("target producer owns Copy Source button lifecycle and finalizes typing before a redacted command", async () => {
  const { createTargetProducerController } = await loadFactory();
  const harness = createHarness(createTargetProducerController);

  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  harness.button.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(harness.segment.target, "Source");
  assert.equal(harness.segment.status, "draft");
  assert.deepEqual(harness.created["copy-source-to-target"].provenance, {
    origin: "user",
    producer: "copy-source"
  });
  assert.deepEqual(harness.created["copy-source-to-target"].beforeSelection, { start: 1, end: 3 });
  assert.equal(harness.created["copy-source-to-target"].beforePatch.target, "Draft");
  assert.deepEqual(harness.statuses.at(-1), ["Source copied to target; Undo is available", "dirty"]);
  assert.deepEqual(harness.calls.slice(0, 3), [
    ["finalize", "s1"],
    ["clearPending", "s1", { finalizeEdit: false }],
    ["matches", "draft"]
  ]);
  assert.ok(harness.calls.some(([name, , target]) => name === "debounce" && target === "Source"));
  assert.ok(
    harness.calls.some(
      ([name, selected]) => name === "focus" && selected.start === "Source".length && selected.end === "Source".length
    )
  );

  await harness.created["copy-source-to-target"].restorePatch(harness.created["copy-source-to-target"].beforePatch, {
    direction: "undo"
  });
  assert.ok(
    harness.calls.some(
      ([name, segmentId, , context]) =>
        name === "restoreCommandPatch" && segmentId === "s1" && context.focusTarget === true
    )
  );

  assert.equal(harness.controller.unmount(), true);
  harness.segment.target = "After unmount";
  harness.button.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(harness.segment.target, "After unmount");
});

test("TM match and concordance producers preserve distinct provenance and default caret placement", async () => {
  const { createTargetProducerController } = await loadFactory();
  const harness = createHarness(createTargetProducerController);

  const matchResult = await harness.controller.insertTmTarget("Memory target", {
    channel: "match",
    resourceId: "tm-entry"
  });
  assert.equal(matchResult.receipt.commandId, "insert-tm-target");
  assert.deepEqual(harness.created["insert-tm-target"].provenance, {
    origin: "translation-memory",
    channel: "match",
    resourceId: "tm-entry"
  });
  assert.deepEqual(harness.statuses.at(-1), ["TM target inserted; Undo is available", "dirty"]);
  assert.deepEqual(matchResult.applied.selection, { start: "Memory target".length, end: "Memory target".length });

  await harness.controller.insertTmTarget("Concordance target", {
    channel: "concordance",
    resourceId: 42
  });
  assert.deepEqual(harness.created["insert-tm-target"].provenance, {
    origin: "translation-memory",
    channel: "concordance",
    resourceId: "42"
  });
  assert.deepEqual(harness.statuses.at(-1), ["Concordance target inserted; Undo is available", "dirty"]);
});

test("approved-term producer inserts at the target selection with termbase provenance", async () => {
  const { createTargetProducerController } = await loadFactory();
  const harness = createHarness(createTargetProducerController, {
    activeSelection: { start: 1, end: 3 }
  });

  const result = await harness.controller.insertTermTarget("Term", {
    resourceId: "term-7",
    sourceTerm: "Source term"
  });

  assert.equal(result.receipt.commandId, "insert-term-target");
  assert.equal(harness.segment.target, "DTermft");
  assert.deepEqual(harness.created["insert-term-target"].provenance, {
    origin: "termbase",
    resourceId: "term-7",
    sourceTerm: "Source term"
  });
  assert.deepEqual(result.applied.selection, { start: 5, end: 5 });
  assert.deepEqual(harness.statuses.at(-1), ["Term inserted; Undo is available", "dirty"]);
});

test("protected-tag producer replaces the active range and restores a collapsed post-insert caret", async () => {
  const { createTargetProducerController } = await loadFactory();
  const harness = createHarness(createTargetProducerController, {
    activeSelection: { start: 1, end: 3 }
  });

  const result = await harness.controller.insertProtectedTag("<b>");

  assert.equal(harness.segment.target, "D<b>ft");
  assert.deepEqual(harness.created["insert-protected-tag"].provenance, {
    origin: "user",
    producer: "protected-tag"
  });
  assert.deepEqual(result.applied.selection, { start: 4, end: 4 });
  assert.deepEqual(harness.statuses.at(-1), ["Protected tag inserted; Undo is available", "dirty"]);
  assert.ok(
    harness.calls.some(
      ([name, target, status, reason]) =>
        name === "applyTarget" && target === "D<b>ft" && status === "draft" && reason === "insert-tag"
    )
  );
});

test("protected-tag producer inserts all requested tags through one reversible command", async () => {
  const { createTargetProducerController } = await loadFactory();
  const harness = createHarness(createTargetProducerController, {
    activeSelection: { start: 5, end: 5 }
  });

  const result = await harness.controller.insertProtectedTags(["<b>", "</b>"]);

  assert.equal(harness.segment.target, "Draft<b></b>");
  assert.deepEqual(harness.created["insert-protected-tag"].provenance, {
    origin: "user",
    producer: "protected-tag",
    count: 2
  });
  assert.deepEqual(result.applied.selection, { start: 12, end: 12 });
});

test("filter membership changes preserve scroll while producer failure restores the exact target patch and caret", async () => {
  const { createTargetProducerController } = await loadFactory();
  const harness = createHarness(createTargetProducerController, {
    executeError: new Error("command persistence failed"),
    matches: (segment) => segment.status === "draft"
  });
  const before = clone(harness.segment);

  assert.equal(await harness.controller.insertTmTarget(""), null);

  assert.deepEqual(harness.segment, before);
  assert.deepEqual(harness.statuses.at(-1), ["command persistence failed; existing work was preserved", "dirty"]);
  assert.ok(harness.calls.some(([name, options]) => name === "renderSegments" && options?.preserveScroll === true));
  assert.ok(harness.calls.some(([name]) => name === "restorePatch"));
  assert.ok(harness.calls.some(([name]) => name === "invalidateFilters"));
  assert.ok(harness.calls.some(([name, selected]) => name === "focus" && selected.start === 1 && selected.end === 3));
  assert.equal(
    harness.calls.some(([name]) => name === "commandsChanged"),
    false
  );
});

test("target producers are inert when no active segment exists", async () => {
  const { createTargetProducerController } = await loadFactory();
  const harness = createHarness(createTargetProducerController);
  harness.setActiveIndex(9);

  assert.equal(await harness.controller.copySourceToTarget(), null);
  assert.equal(await harness.controller.insertProtectedTag("<b>"), null);
  assert.equal(await harness.controller.insertTmTarget("Memory"), null);
  assert.equal(harness.calls.length, 0);
});
