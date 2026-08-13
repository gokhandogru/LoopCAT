const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/tm-pretranslation-controller.js")).href);
}

function fakeButton() {
  const listeners = new Map();
  const attributes = new Map();
  return {
    disabled: false,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    getAttribute: (name) => attributes.get(name),
    dispatch(type) {
      listeners.get(type)?.forEach((listener) => listener({ type, target: this }));
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createHarness(createTmPretranslationController, overrides = {}) {
  const project = { id: "p1", sourceLang: "en", targetLang: "tr" };
  const segments = [
    { id: "s1", source: "Repeated", target: "", status: "empty", revision: 1, aiPretranslation: { model: "old" } },
    { id: "s2", source: "Repeated", target: "", status: "empty", revision: 2 },
    { id: "s3", source: "Unique", target: "", status: "empty", revision: 3 },
    { id: "filled", source: "Filled", target: "Existing", status: "draft", revision: 1 },
    { id: "confirmed", source: "Confirmed", target: "", status: "confirmed", revision: 1 },
    { id: "locked", source: "Locked", target: "", status: "empty", revision: 1, locked: true },
    { id: "empty-source", source: "", target: "", status: "empty", revision: 1 }
  ];
  const button = fakeButton();
  const calls = [];
  const statuses = [];
  const warnings = [];
  let createdOptions = null;
  let thresholdCalls = 0;

  const controller = createTmPretranslationController({
    pretranslateButton: button,
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getSegments: () => segments
    },
    segments: {
      getDocumentSegments: () => overrides.documentSegments || segments,
      isLocked: (segment) => Boolean(segment.locked)
    },
    threshold: {
      request() {
        thresholdCalls += 1;
        calls.push(["requestThreshold"]);
        if (overrides.thresholdDeferred) return overrides.thresholdDeferred.promise;
        return Promise.resolve(Object.hasOwn(overrides, "threshold") ? overrides.threshold : "80");
      }
    },
    tm: {
      getNames: (activeProject) => {
        calls.push(["getNames", activeProject.id]);
        return ["Main TM", "Reference TM"];
      },
      findMatchesBatch(matchOptions) {
        calls.push(["findMatchesBatch", structuredClone(matchOptions)]);
        if (overrides.lookupDeferred) return overrides.lookupDeferred.promise;
        if (overrides.lookupError) return Promise.reject(overrides.lookupError);
        return Promise.resolve(
          matchOptions.map(({ source }) => {
            if (overrides.noMatches) return [];
            return [
              {
                id: `  match-${source}  `,
                source,
                target: `Target ${source}`,
                score: source === "Repeated" ? 101 : 92,
                tmName: "  Main TM  "
              }
            ];
          })
        );
      }
    },
    commands: {
      bus: {
        async execute(command) {
          calls.push(["execute"]);
          const result = await command.execute();
          return { result, receipt: { commandId: "tm-pretranslate" } };
        }
      },
      create(options) {
        calls.push(["create"]);
        createdOptions = options;
        return { execute: options.applyFirst };
      },
      changed: () => calls.push(["commandsChanged"])
    },
    persistence: {
      flush: (projectId) => {
        calls.push(["flush", projectId]);
        return overrides.flushError ? Promise.reject(overrides.flushError) : Promise.resolve();
      },
      save: (updated) => {
        calls.push(["save", updated.map((segment) => segment.id)]);
        return overrides.saveError ? Promise.reject(overrides.saveError) : Promise.resolve();
      }
    },
    mutation: {
      capturePatch: (segment) => ({
        target: segment.target,
        status: segment.status,
        revision: segment.revision,
        tmPretranslation: segment.tmPretranslation,
        aiPretranslation: segment.aiPretranslation
      }),
      applyTarget(segment, target, status, reason) {
        calls.push(["applyTarget", segment.id, target, status, reason]);
        segment.target = target;
        segment.status = status;
      },
      touch(segment) {
        calls.push(["touch", segment.id]);
        segment.revision += 1;
      },
      restore(segment, snapshot) {
        calls.push(["restore", segment.id]);
        Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
        Object.assign(segment, structuredClone(snapshot));
      },
      prepareHistory: (segment) => calls.push(["prepareHistory", segment.id])
    },
    restoration: {
      restorePatches: (patches, context) => {
        calls.push(["restorePatches", patches, context]);
        return Promise.resolve();
      }
    },
    selection: {
      getActiveSegmentId: () => overrides.activeSegmentId || "s2",
      focusTarget: () => calls.push(["focusTarget"])
    },
    presentation: {
      yieldToUi: () => {
        calls.push(["yieldToUi"]);
        return Promise.resolve();
      },
      renderSegments: (options) => calls.push(["renderSegments", options]),
      renderProgress: () => calls.push(["renderProgress"]),
      renderHistory: () => calls.push(["renderHistory"]),
      refreshSidebar: () => {
        calls.push(["refreshSidebar"]);
        return overrides.sidebarError ? Promise.reject(overrides.sidebarError) : Promise.resolve();
      }
    },
    activity: {
      log(details) {
        calls.push(["activity", details]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    batchSize: overrides.batchSize || 1,
    clock: { now: () => "2026-08-13T15:00:00.000Z" },
    testHooks: { beforeSave: (updated) => calls.push(["beforeSave", updated.map((segment) => segment.id)]) },
    logger: { warn: (...args) => warnings.push(args) }
  });

  return {
    button,
    calls,
    controller,
    getCreatedOptions: () => createdOptions,
    getThresholdCalls: () => thresholdCalls,
    segments,
    statuses,
    warnings
  };
}

test("TM pretranslation owns button lifecycle, prevents threshold re-entry, and cleans busy state after cancellation", async () => {
  const { createTmPretranslationController } = await loadFactory();
  const thresholdDeferred = deferred();
  const harness = createHarness(createTmPretranslationController, { thresholdDeferred });

  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  harness.button.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(harness.getThresholdCalls(), 1);
  assert.equal(await harness.controller.pretranslate(), null);
  assert.equal(harness.getThresholdCalls(), 1);

  thresholdDeferred.resolve(null);
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(harness.button.disabled, false);
  assert.equal(harness.button.getAttribute("aria-busy"), "false");

  assert.equal(harness.controller.unmount(), true);
  harness.button.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(harness.getThresholdCalls(), 1);
});

test("TM pretranslation deduplicates batched lookups and saves one atomic command with normalized provenance", async () => {
  const { createTmPretranslationController } = await loadFactory();
  const harness = createHarness(createTmPretranslationController, { batchSize: 1 });

  const execution = await harness.controller.pretranslate();

  assert.equal(execution.receipt.commandId, "tm-pretranslate");
  assert.deepEqual(harness.getCreatedOptions().segmentIds, ["s1", "s2", "s3"]);
  assert.deepEqual(harness.getCreatedOptions().provenance, {
    origin: "translation-memory",
    producer: "pretranslation",
    threshold: 80,
    matchCount: 3
  });
  const lookupCalls = harness.calls.filter(([name]) => name === "findMatchesBatch");
  assert.equal(lookupCalls.length, 2);
  assert.deepEqual(
    lookupCalls.map(([, matchOptions]) => matchOptions[0].source),
    ["Repeated", "Unique"]
  );
  assert.deepEqual(lookupCalls[0][1][0], {
    source: "Repeated",
    sourceLang: "en",
    targetLang: "tr",
    tmNames: ["Main TM", "Reference TM"],
    limit: 1
  });
  assert.deepEqual(harness.segments[0].tmPretranslation, {
    score: 100,
    tmName: "Main TM",
    matchId: "match-Repeated",
    appliedAt: "2026-08-13T15:00:00.000Z"
  });
  assert.equal(Object.hasOwn(harness.segments[0], "aiPretranslation"), false);
  assert.deepEqual(harness.statuses.at(-1), ["Pretranslated 3 segments at 80%+; Undo is available", "saved"]);
  assert.equal(harness.calls.filter(([name]) => name === "yieldToUi").length, 3);
  assert.ok(harness.calls.some(([name]) => name === "commandsChanged"));
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));

  await harness.getCreatedOptions().restorePatches(harness.getCreatedOptions().beforePatches, { direction: "undo" });
  assert.ok(
    harness.calls.some(
      ([name, , context]) =>
        name === "restorePatches" && context.activeSegmentId === "s2" && context.direction === "undo"
    )
  );
});

test("eligible TM lookup exposes busy presentation until the batch settles", async () => {
  const { createTmPretranslationController } = await loadFactory();
  const lookupDeferred = deferred();
  const harness = createHarness(createTmPretranslationController, { batchSize: 10, lookupDeferred });
  const pending = harness.controller.pretranslate();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(harness.button.disabled, true);
  assert.equal(harness.button.getAttribute("aria-busy"), "true");
  assert.ok(harness.statuses.some(([message]) => message === "Pretranslating..."));

  lookupDeferred.resolve([
    [{ id: "repeated", target: "Target Repeated", score: 100, tmName: "Main TM" }],
    [{ id: "unique", target: "Target Unique", score: 100, tmName: "Main TM" }]
  ]);
  await pending;

  assert.equal(harness.button.disabled, false);
  assert.equal(harness.button.getAttribute("aria-busy"), "false");
});

test("TM pretranslation validation and candidate safeguards stop before lookup or persistence", async () => {
  const { createTmPretranslationController } = await loadFactory();
  const invalid = createHarness(createTmPretranslationController, { threshold: "101" });
  assert.equal(await invalid.controller.pretranslate(), null);
  assert.deepEqual(invalid.statuses.at(-1), ["Enter a match percentage between 0 and 100.", "dirty"]);
  assert.equal(
    invalid.calls.some(([name]) => name === "findMatchesBatch"),
    false
  );

  const none = createHarness(createTmPretranslationController, {
    documentSegments: [
      { id: "filled", source: "Source", target: "Existing", status: "draft" },
      { id: "confirmed", source: "Source", target: "", status: "confirmed" },
      { id: "locked", source: "Source", target: "", status: "empty", locked: true },
      { id: "empty-source", source: "", target: "", status: "empty" }
    ]
  });
  assert.equal(await none.controller.pretranslate(), null);
  assert.deepEqual(none.statuses.at(-1), ["No empty segments to pretranslate.", "saved"]);
  assert.equal(
    none.calls.some(([name]) => name === "findMatchesBatch"),
    false
  );

  const unmatched = createHarness(createTmPretranslationController, { noMatches: true });
  assert.equal(await unmatched.controller.pretranslate(), null);
  assert.deepEqual(unmatched.statuses.at(-1), ["No TM matches at 80% or higher.", "saved"]);
  assert.equal(
    unmatched.calls.some(([name]) => name === "flush"),
    false
  );

  const projectless = createHarness(createTmPretranslationController, { noProject: true });
  assert.equal(await projectless.controller.pretranslate(), null);
  assert.deepEqual(projectless.calls, []);
});

test("primary TM pretranslation persistence failure restores exact snapshots and always releases busy presentation", async () => {
  const { createTmPretranslationController } = await loadFactory();
  const harness = createHarness(createTmPretranslationController, {
    saveError: new Error("TM batch storage unavailable")
  });
  const before = structuredClone(harness.segments);

  assert.equal(await harness.controller.pretranslate(), null);

  assert.deepEqual(harness.segments, before);
  assert.deepEqual(harness.statuses.at(-1), ["TM batch storage unavailable", "dirty"]);
  for (const name of [
    "restore",
    "prepareHistory",
    "renderSegments",
    "renderProgress",
    "renderHistory",
    "focusTarget"
  ]) {
    assert.ok(
      harness.calls.some(([callName]) => callName === name),
      `${name} should run`
    );
  }
  assert.equal(harness.button.disabled, false);
  assert.equal(harness.button.getAttribute("aria-busy"), "false");
  assert.equal(
    harness.calls.some(([name]) => name === "commandsChanged"),
    false
  );
});

test("secondary activity and sidebar failures preserve the TM command, workspace update, and success status", async () => {
  const { createTmPretranslationController } = await loadFactory();
  const activityError = new Error("activity unavailable");
  const sidebarError = new Error("sidebar unavailable");
  const harness = createHarness(createTmPretranslationController, { activityError, sidebarError });

  const execution = await harness.controller.pretranslate();

  assert.equal(execution.receipt.commandId, "tm-pretranslate");
  assert.equal(harness.segments[0].target, "Target Repeated");
  assert.deepEqual(harness.statuses.at(-1), ["Pretranslated 3 segments at 80%+; Undo is available", "saved"]);
  assert.deepEqual(harness.warnings, [
    ["Pretranslation activity log failed.", activityError],
    ["TM pretranslation sidebar refresh failed.", sidebarError]
  ]);
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));
  assert.equal(
    harness.calls.some(([name]) => name === "restore"),
    false
  );
});
