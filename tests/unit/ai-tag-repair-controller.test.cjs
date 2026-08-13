const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-tag-repair-controller.js")).href);
}

function waitForTurn() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function createHarness(createAiTagRepairController, overrides = {}) {
  const project = { id: "p1", sourceLang: "en", targetLang: "tr" };
  let segments = [
    {
      id: "s1",
      source: "Source <0>{name}</0>",
      target: "Target {name}",
      status: "draft",
      revision: 2,
      tags: [{ text: "<0>" }, { text: "{name}" }, { text: "</0>" }],
      missing: [
        { text: "<0>", label: "opening tag" },
        { text: "</0>", label: "closing tag" }
      ],
      aiSuggestions: []
    },
    {
      id: "unchanged",
      source: "Source <1>{count}</1>",
      target: "Target {count}",
      status: "draft",
      revision: 3,
      tags: [{ text: "<1>" }, { text: "{count}" }, { text: "</1>" }],
      missing: [{ text: "<1>" }, { text: "</1>" }],
      aiSuggestions: []
    },
    {
      id: "failed",
      source: "Failure <2>{count}</2>",
      target: "Failure {count}",
      status: "draft",
      revision: 4,
      tags: [{ text: "<2>" }, { text: "{count}" }, { text: "</2>" }],
      missing: [{ text: "<2>" }, { text: "</2>" }],
      aiSuggestions: []
    },
    {
      id: "locked",
      source: "Locked <0>x</0>",
      target: "Locked x",
      status: "draft",
      locked: true,
      tags: [{ text: "<0>" }],
      missing: [{ text: "<0>" }]
    },
    {
      id: "confirmed",
      source: "Confirmed <0>x</0>",
      target: "Confirmed x",
      status: "confirmed",
      tags: [{ text: "<0>" }],
      missing: [{ text: "<0>" }]
    },
    { id: "no-tags", source: "Plain source", target: "Plain target", status: "draft", tags: [], missing: [] },
    {
      id: "complete",
      source: "Complete <0>x</0>",
      target: "Complete <0>x</0>",
      status: "draft",
      tags: [{ text: "<0>" }],
      missing: []
    }
  ];
  let active = overrides.activeSegment === null ? null : segments[0];
  const settings = {
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "repair-model",
    mode: "visible",
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr",
    ...(overrides.settings || {})
  };
  const provider = overrides.noProvider ? null : { name: "Ollama", completePrompt() {} };
  const calls = [];
  const statuses = [];
  const lifecycleStates = [];
  const warnings = [];
  let running = Boolean(overrides.running);
  let promptBusy = Boolean(overrides.promptBusy);
  let requestOptions = null;

  const controller = createAiTagRepairController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getSegments: () => segments,
      replaceSegments(next) {
        calls.push(["replaceSegments", next.map((segment) => segment.id)]);
        segments = next;
        active = segments.find((segment) => segment.id === active?.id) || null;
      }
    },
    selection: { getActiveSegment: () => active },
    scope: {
      getVisibleSegments: () => overrides.visibleSegments || segments,
      getDocumentSegments: () => overrides.documentSegments || segments.slice(0, 3),
      isLocked: (segment) => Boolean(segment.locked),
      getTags: (segment) => segment.tags || [],
      getMissingTags: (segment) => segment.missing || [],
      tagText: (tag) => tag.label || tag.text || ""
    },
    settings: {
      persist() {
        calls.push(["persist"]);
        return Promise.resolve(settings);
      },
      runtimeConfig(value) {
        calls.push(["runtimeConfig", value.providerId]);
        if (overrides.runtimeError) throw overrides.runtimeError;
        return { model: value.model, apiKey: "private" };
      },
      assertReady(value, config, action) {
        calls.push(["assertReady", value.providerId, config.model, action]);
      }
    },
    providers: {
      get: () => provider,
      sharesExternally: () => Boolean(overrides.external)
    },
    consent: {
      externalShare(details) {
        calls.push(["externalShare", structuredClone(details)]);
        return overrides.externalAccepted !== false;
      }
    },
    domain: {
      repairSegmentTags(options) {
        requestOptions = options;
        calls.push(["repairSegmentTags", options.segment.id, Boolean(options.signal)]);
        if (overrides.repairImplementation) return overrides.repairImplementation(options);
        return Promise.resolve({
          suggestedTarget: "Target <0>{name}</0>",
          protectedTokens: options.protectedTokens,
          warnings: [],
          provider: "Ollama",
          model: "repair-model"
        });
      }
    },
    lifecycle: {
      isRunning: () => running,
      isPromptBusy: () => promptBusy,
      sync(state) {
        running = state.running;
        promptBusy = state.promptBusy;
        lifecycleStates.push({
          running: state.running,
          promptBusy: state.promptBusy,
          hasAbortController: Boolean(state.abortController),
          progress: structuredClone(state.progress)
        });
      }
    },
    suggestions: {
      append(segment, suggestion) {
        calls.push(["append", segment.id, structuredClone(suggestion)]);
        if (overrides.appendResult === false) return Promise.resolve(false);
        segment.aiSuggestions = [...(segment.aiSuggestions || []), structuredClone(suggestion)];
        return Promise.resolve({ ok: true, activityLogged: overrides.activeActivityLogged !== false });
      },
      normalize(suggestion) {
        calls.push(["normalize", suggestion.segmentId]);
        return { ...structuredClone(suggestion), normalized: true };
      },
      nextId: () => "ai-suggestion-stable"
    },
    persistence: {
      flush(projectId) {
        calls.push(["flush", projectId]);
        return overrides.flushError ? Promise.reject(overrides.flushError) : Promise.resolve();
      },
      saveMany(updated) {
        calls.push(["saveMany", updated.map((segment) => segment.id)]);
        return overrides.saveError ? Promise.reject(overrides.saveError) : Promise.resolve();
      },
      load(projectId) {
        calls.push(["load", projectId]);
        return Promise.resolve(structuredClone(segments));
      }
    },
    mutation: {
      touch(segment) {
        calls.push(["touch", segment.id]);
        segment.revision = Number(segment.revision || 0) + 1;
      },
      clearPending: (segment) => calls.push(["clearPending", segment.id]),
      restore(segment, snapshot) {
        calls.push(["restore", segment.id]);
        Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
        Object.assign(segment, structuredClone(snapshot));
      },
      prepareHistory: (segment) => calls.push(["prepareHistory", segment.id]),
      prepareHistories(next) {
        calls.push(["prepareHistories", next.map((segment) => segment.id)]);
        return next;
      }
    },
    presentation: {
      renderCommandCentre: () => calls.push(["renderCommandCentre"]),
      renderAiProgress: () => calls.push(["renderAiProgress"]),
      renderOutput: (text, options) => calls.push(["renderOutput", text, options]),
      renderAll: () => calls.push(["renderAll"]),
      refreshSidebar: () => {
        calls.push(["refreshSidebar"]);
        return Promise.resolve();
      }
    },
    activity: {
      logBatch(details) {
        calls.push(["logBatch", structuredClone(details)]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    redact: (value) => String(value || "").replace(/secret\S*/gi, "[REDACTED]"),
    logger: { warn: (...args) => warnings.push(args) }
  });

  return {
    calls,
    controller,
    getRequestOptions: () => requestOptions,
    getSegments: () => segments,
    lifecycleStates,
    statuses,
    warnings
  };
}

test("active AI tag repair preserves busy, source, target, provider, and external-consent safeguards", async () => {
  const { createAiTagRepairController } = await loadFactory();
  const busy = createHarness(createAiTagRepairController, { running: true });
  assert.equal(await busy.controller.repairActive(), false);
  assert.equal(busy.calls.length, 0);

  const missing = createHarness(createAiTagRepairController, { activeSegment: null });
  assert.equal(await missing.controller.repairActive(), false);
  assert.deepEqual(missing.statuses.at(-1), ["Select a segment before requesting AI tag repair.", "dirty"]);

  const blankSource = createHarness(createAiTagRepairController);
  blankSource.getSegments()[0].source = "";
  assert.equal(await blankSource.controller.repairActive(), false);
  assert.deepEqual(blankSource.statuses.at(-1), ["The active segment has no source text.", "dirty"]);

  const blankTarget = createHarness(createAiTagRepairController);
  blankTarget.getSegments()[0].target = "";
  assert.equal(await blankTarget.controller.repairActive(), false);
  assert.deepEqual(blankTarget.statuses.at(-1), ["The active segment has no target text to repair.", "dirty"]);

  const noProvider = createHarness(createAiTagRepairController, { noProvider: true });
  assert.equal(await noProvider.controller.repairActive(), false);
  assert.deepEqual(noProvider.statuses.at(-1), ["AI tag repair is not available for this provider.", "dirty"]);

  const consent = createHarness(createAiTagRepairController, { external: true, externalAccepted: false });
  assert.equal(await consent.controller.repairActive(), false);
  assert.deepEqual(consent.calls.find(([name]) => name === "externalShare")[1].contextLabels, [
    "target text",
    "protected tags and placeholders",
    "configured provider URL"
  ]);
  assert.deepEqual(consent.statuses.at(-1), ["AI tag repair canceled", "dirty"]);
});

test("active AI tag repair routes protected tokens and saves a non-overwriting review suggestion", async () => {
  const { createAiTagRepairController } = await loadFactory();
  const harness = createHarness(createAiTagRepairController);
  const originalTarget = harness.getSegments()[0].target;

  assert.equal(await harness.controller.repairActive(), true);
  assert.equal(harness.getSegments()[0].target, originalTarget);
  assert.deepEqual(harness.getRequestOptions().protectedTokens, ["<0>", "{name}", "</0>"]);
  assert.equal(harness.getRequestOptions().signal, undefined);
  const suggestion = harness.calls.find(([name]) => name === "append")[2];
  assert.equal(suggestion.id, "ai-suggestion-stable");
  assert.equal(suggestion.suggestedTarget, "Target <0>{name}</0>");
  assert.equal(suggestion.confidence, 80);
  assert.equal(suggestion.explanation[1], "Protected tokens considered: <0>, {name}, </0>");
  assert.deepEqual(harness.statuses.at(-1), ["AI tag repair suggestion ready for review", "saved"]);
  assert.deepEqual(harness.lifecycleStates.at(-1), {
    running: false,
    promptBusy: false,
    hasAbortController: false,
    progress: undefined
  });
});

test("active AI tag repair reports unchanged and suggestion-storage warning results without mutating target", async () => {
  const { createAiTagRepairController } = await loadFactory();
  const unchanged = createHarness(createAiTagRepairController, {
    repairImplementation(options) {
      return Promise.resolve({
        suggestedTarget: options.segment.target,
        protectedTokens: options.protectedTokens,
        warnings: []
      });
    }
  });
  assert.equal(await unchanged.controller.repairActive(), true);
  assert.equal(
    unchanged.calls.some(([name]) => name === "append"),
    false
  );
  assert.deepEqual(unchanged.statuses.at(-1), ["AI did not propose a different tag repair.", "saved"]);

  const warning = createHarness(createAiTagRepairController, { activeActivityLogged: false });
  assert.equal(await warning.controller.repairActive(), true);
  assert.deepEqual(warning.statuses.at(-1), ["AI tag repair suggestion ready; activity log failed", "dirty"]);
});

test("batch AI tag repair selects only translated unlocked mismatches and returns deterministic empty summaries", async () => {
  const { createAiTagRepairController } = await loadFactory();
  const harness = createHarness(createAiTagRepairController);
  harness
    .getSegments()
    .slice(0, 3)
    .forEach((segment) => {
      segment.missing = [];
    });

  const summary = await harness.controller.repairBatch();
  assert.equal(summary.total, 0);
  assert.equal(summary.skipped, 7);
  assert.equal(summary.suggested, 0);
  assert.equal(
    harness.calls.some(([name]) => name === "flush"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "repairSegmentTags"),
    false
  );
  assert.deepEqual(harness.statuses.at(-1), ["No protected tag mismatches are eligible for batch AI repair.", "saved"]);
});

test("batch AI tag repair saves normalized suggestions, contains failures, skips protected segments, and never overwrites targets", async () => {
  const { createAiTagRepairController } = await loadFactory();
  const harness = createHarness(createAiTagRepairController, {
    repairImplementation(options) {
      if (options.segment.id === "failed") throw new Error("secret-token repair failure");
      if (options.segment.id === "unchanged") {
        return Promise.resolve({
          suggestedTarget: options.segment.target,
          protectedTokens: options.protectedTokens,
          warnings: []
        });
      }
      return Promise.resolve({
        suggestedTarget: "Target <0>{name}</0>",
        protectedTokens: options.protectedTokens,
        warnings: [],
        provider: "Ollama",
        model: "repair-model"
      });
    }
  });
  const beforeTargets = harness.getSegments().map((segment) => segment.target);

  const summary = await harness.controller.repairBatch();
  assert.equal(summary.total, 3);
  assert.equal(summary.completed, 2);
  assert.equal(summary.suggested, 1);
  assert.equal(summary.unchanged, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.skipped, 4);
  assert.deepEqual(summary.updatedSegmentIds, ["s1"]);
  assert.deepEqual(
    harness.getSegments().map((segment) => segment.target),
    beforeTargets
  );
  const saved = harness.getSegments()[0].aiSuggestions.at(-1);
  assert.equal(saved.normalized, true);
  assert.equal(saved.explanation.includes("Missing tokens detected: opening tag, closing tag"), true);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveMany")[1], ["s1"]);
  assert.deepEqual(
    harness.calls
      .filter(([name]) =>
        ["logBatch", "load", "replaceSegments", "renderAll", "refreshSidebar", "markDirty"].includes(name)
      )
      .map(([name]) => name),
    ["logBatch", "load", "replaceSegments", "renderAll", "refreshSidebar", "markDirty"]
  );
  assert.equal(
    harness.calls
      .filter(([name]) => name === "renderOutput")
      .at(-1)[1]
      .includes("[REDACTED] repair failure"),
    true
  );
  assert.deepEqual(harness.statuses.at(-1), [
    "Batch AI tag repair: 1 suggestion saved; 1 unchanged; 1 failed; 4 skipped",
    "dirty"
  ]);
});

test("mid-batch AI tag repair cancellation preserves completed suggestions and saves the partial result", async () => {
  const { createAiTagRepairController } = await loadFactory();
  const harness = createHarness(createAiTagRepairController, {
    repairImplementation(options) {
      if (options.segment.id === "s1") {
        return Promise.resolve({
          suggestedTarget: "Target <0>{name}</0>",
          protectedTokens: options.protectedTokens,
          warnings: []
        });
      }
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("canceled")));
      });
    }
  });

  const pending = harness.controller.repairBatch();
  await waitForTurn();
  await waitForTurn();
  assert.equal(harness.controller.cancel(), true);
  const summary = await pending;
  assert.equal(summary.canceled, true);
  assert.equal(summary.suggested, 1);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveMany")[1], ["s1"]);
  assert.equal(harness.getSegments()[0].aiSuggestions.length, 1);
  assert.equal(harness.getSegments()[1].aiSuggestions.length, 0);
  assert.equal(harness.controller.cancel(), false);
});

test("primary batch AI tag repair persistence failure restores every candidate and always cleans lifecycle state", async () => {
  const { createAiTagRepairController } = await loadFactory();
  const harness = createHarness(createAiTagRepairController, {
    saveError: new Error("Atomic tag suggestion save failed")
  });
  const before = structuredClone(harness.getSegments().slice(0, 3));

  assert.equal(await harness.controller.repairBatch(), false);
  assert.deepEqual(harness.getSegments().slice(0, 3), before);
  assert.deepEqual(
    harness.calls.filter(([name]) => ["restore", "prepareHistory"].includes(name)).map(([name, id]) => [name, id]),
    [
      ["restore", "s1"],
      ["prepareHistory", "s1"],
      ["restore", "unchanged"],
      ["prepareHistory", "unchanged"],
      ["restore", "failed"],
      ["prepareHistory", "failed"]
    ]
  );
  assert.deepEqual(harness.statuses.at(-1), ["Atomic tag suggestion save failed", "dirty"]);
  assert.equal(harness.lifecycleStates.at(-1).running, false);
  assert.equal(harness.lifecycleStates.at(-1).promptBusy, false);
});

test("secondary batch AI tag repair activity failure keeps saved suggestions durable and reports a dirty warning", async () => {
  const { createAiTagRepairController } = await loadFactory();
  const harness = createHarness(createAiTagRepairController, { activityError: new Error("Activity unavailable") });

  const summary = await harness.controller.repairBatch();
  assert.equal(summary.suggested, 3);
  assert.equal(harness.warnings[0][0], "Batch AI tag repair activity log failed.");
  assert.equal(harness.calls.filter(([name]) => name === "markDirty").length, 2);
  assert.equal(harness.statuses.at(-1)[0].includes("activity log failed"), true);
  assert.equal(harness.statuses.at(-1)[1], "dirty");
});
