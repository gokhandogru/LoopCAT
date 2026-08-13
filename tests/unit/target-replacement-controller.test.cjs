const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/target-replacement-controller.js")).href);
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

function createHarness(createTargetReplacementController, overrides = {}) {
  const project = { id: "p1" };
  const segments = [
    { id: "s1", target: "Hello one", status: "draft", revision: 1, targetHistory: [] },
    { id: "s2", target: "Hello two", status: "draft", revision: 2, targetHistory: [], tagIssue: true }
  ];
  const visibleButton = fakeButton();
  const allButton = fakeButton();
  const calls = [];
  const findInput = { value: "Hello", focus: () => calls.push(["focusFind"]) };
  const replacementInput = { value: "Hi" };
  const statuses = [];
  const warnings = [];
  let createdOptions = null;

  const controller = createTargetReplacementController({
    elements: { findInput, replacementInput, visibleButton, allButton },
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getSegments: () => segments
    },
    filters: {
      getOptions: () => {
        calls.push(["getOptions"]);
        return { regex: Boolean(overrides.regex), caseSensitive: overrides.caseSensitive !== false };
      },
      getIndexes: (scope) => {
        calls.push(["getIndexes", scope]);
        return scope === "all" ? [0, 1] : [0];
      }
    },
    transform: {
      replace(target, findText, replacement, options) {
        calls.push(["replace", target, findText, replacement, options]);
        if (overrides.transformError) throw overrides.transformError;
        if (overrides.noMatches) return { text: target, count: 0 };
        return { text: target.replace(findText, replacement), count: target.includes(findText) ? 1 : 0 };
      }
    },
    commands: {
      bus: {
        execute(command) {
          calls.push(["execute"]);
          return command.execute();
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
      clearPending: (segment) => calls.push(["clearPending", segment.id]),
      save: (updated) => {
        calls.push(["save", updated.map((segment) => segment.id)]);
        return overrides.saveError ? Promise.reject(overrides.saveError) : Promise.resolve();
      }
    },
    mutation: {
      applyTarget(segment, target, status, reason) {
        calls.push(["applyTarget", segment.id, target, status, reason]);
        segment.targetHistory.push({ target, reason });
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
      prepareHistory: (segment) => calls.push(["prepareHistory", segment.id]),
      hasTagIssue: (segment) => Boolean(segment.tagIssue)
    },
    restoration: {
      restoreSnapshots: (snapshots, options) => {
        calls.push(["restoreSnapshots", snapshots, options]);
        return Promise.resolve();
      }
    },
    selection: {
      getActiveSegmentId: () => overrides.activeSegmentId || "s1",
      focusTarget: () => calls.push(["focusTarget"])
    },
    presentation: {
      renderSegments: (options) => calls.push(["renderSegments", options]),
      renderProgress: () => calls.push(["renderProgress"]),
      refreshSidebar: () => {
        calls.push(["refreshSidebar"]);
        return Promise.resolve();
      },
      renderHistory: () => calls.push(["renderHistory"])
    },
    activity: {
      log(details) {
        calls.push(["activity", details]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    testHooks: {
      beforeSave(updated) {
        calls.push(["beforeSave", updated.map((segment) => segment.id)]);
      }
    },
    logger: { warn: (...args) => warnings.push(args) }
  });

  return {
    allButton,
    calls,
    controller,
    findInput,
    getCreatedOptions: () => createdOptions,
    replacementInput,
    segments,
    statuses,
    visibleButton,
    warnings
  };
}

test("target replacement owns visible/all button lifecycle and sequences one atomic ReplaceTargets command", async () => {
  const { createTargetReplacementController } = await loadFactory();
  const harness = createHarness(createTargetReplacementController);

  assert.equal(harness.controller.mount(), true);
  assert.equal(harness.controller.mount(), false);
  harness.visibleButton.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(harness.segments[0].target, "Hi one");
  assert.equal(harness.segments[0].revision, 2);
  assert.equal(harness.segments[1].target, "Hello two");
  assert.deepEqual(harness.getCreatedOptions().segmentIds, ["s1"]);
  assert.equal(harness.getCreatedOptions().beforeSnapshots[0].target, "Hello one");
  assert.deepEqual(harness.statuses.at(-1), ["Replaced 1 match in 1 target segment. Undo is available.", "saved"]);
  assert.ok(harness.calls.find(([name, scope]) => name === "getIndexes" && scope === "visible"));
  assert.ok(harness.calls.find(([name, projectId]) => name === "flush" && projectId === "p1"));
  assert.ok(harness.calls.find(([name]) => name === "commandsChanged"));

  await harness.getCreatedOptions().restoreSnapshots(harness.getCreatedOptions().beforeSnapshots);
  assert.ok(harness.calls.find(([name, , options]) => name === "restoreSnapshots" && options.activeSegmentId === "s1"));

  assert.equal(harness.controller.unmount(), true);
  harness.segments[0].target = "After unmount";
  harness.visibleButton.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(harness.segments[0].target, "After unmount");
});

test("project-wide replacement preserves counts, filter options, and tag-QA warning status", async () => {
  const { createTargetReplacementController } = await loadFactory();
  const harness = createHarness(createTargetReplacementController, { regex: true, caseSensitive: false });

  assert.deepEqual(await harness.controller.replace("all"), { segmentCount: 2, replacementCount: 2 });

  assert.equal(harness.segments[0].target, "Hi one");
  assert.equal(harness.segments[1].target, "Hi two");
  assert.deepEqual(harness.statuses.at(-1), [
    "Replaced 2 matches in 2 target segments. 1 segment still need tag QA. Undo is available.",
    "dirty"
  ]);
  assert.deepEqual(harness.calls.find(([name]) => name === "activity")[1], {
    scope: "all",
    segmentCount: 2,
    replacementCount: 2,
    regex: true,
    caseSensitive: false
  });
});

test("empty, unmatched, invalid, and projectless replacements stop before persistence", async () => {
  const { createTargetReplacementController } = await loadFactory();
  const empty = createHarness(createTargetReplacementController);
  empty.findInput.value = "";
  assert.deepEqual(await empty.controller.replace(), { segmentCount: 0, replacementCount: 0 });
  assert.deepEqual(empty.statuses.at(-1), ["Enter target text to replace.", "dirty"]);
  assert.ok(empty.calls.some(([name]) => name === "focusFind"));

  const unmatched = createHarness(createTargetReplacementController, { noMatches: true });
  assert.deepEqual(await unmatched.controller.replace("all"), { segmentCount: 0, replacementCount: 0 });
  assert.deepEqual(unmatched.statuses.at(-1), ["No target matches in the project.", "saved"]);

  const invalid = createHarness(createTargetReplacementController, { transformError: new Error("Invalid regex") });
  assert.deepEqual(await invalid.controller.replace(), { segmentCount: 0, replacementCount: 0 });
  assert.deepEqual(invalid.statuses.at(-1), ["Invalid regex", "dirty"]);
  assert.equal(
    invalid.calls.some(([name]) => name === "flush"),
    false
  );

  const projectless = createHarness(createTargetReplacementController, { noProject: true });
  assert.deepEqual(await projectless.controller.replace(), { segmentCount: 0, replacementCount: 0 });
  assert.deepEqual(projectless.calls, []);
});

test("primary target replacement persistence failure restores exact snapshots, presentation, history, and focus", async () => {
  const { createTargetReplacementController } = await loadFactory();
  const harness = createHarness(createTargetReplacementController, {
    saveError: new Error("batch storage unavailable")
  });
  const before = structuredClone(harness.segments);

  assert.deepEqual(await harness.controller.replace("all"), { segmentCount: 0, replacementCount: 0 });

  assert.deepEqual(harness.segments, before);
  assert.deepEqual(harness.statuses.at(-1), ["batch storage unavailable", "dirty"]);
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
  assert.equal(
    harness.calls.some(([name]) => name === "commandsChanged"),
    false
  );
});

test("secondary replacement activity failure keeps the saved command and original success status", async () => {
  const { createTargetReplacementController } = await loadFactory();
  const activityError = new Error("activity unavailable");
  const harness = createHarness(createTargetReplacementController, { activityError });

  assert.deepEqual(await harness.controller.replace(), { segmentCount: 1, replacementCount: 1 });

  assert.equal(harness.segments[0].target, "Hi one");
  assert.deepEqual(harness.statuses.at(-1), ["Replaced 1 match in 1 target segment. Undo is available.", "saved"]);
  assert.equal(harness.warnings.length, 1);
  assert.deepEqual(harness.warnings[0], ["Replace activity log failed.", activityError]);
  assert.equal(
    harness.calls.some(([name]) => name === "restore"),
    false
  );
});
