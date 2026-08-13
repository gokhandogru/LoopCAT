const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-pretranslation-controller.js")).href);
}

function waitForTurn() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function capturePatch(segment) {
  return structuredClone({
    target: segment.target,
    status: segment.status,
    revision: segment.revision,
    reviewState: segment.reviewState,
    targetHistory: segment.targetHistory,
    aiPretranslation: segment.aiPretranslation,
    tmPretranslation: segment.tmPretranslation
  });
}

function applyPatch(segment, patch) {
  for (const key of [
    "target",
    "status",
    "revision",
    "reviewState",
    "targetHistory",
    "aiPretranslation",
    "tmPretranslation"
  ]) {
    if (patch[key] === undefined) Reflect.deleteProperty(segment, key);
    else segment[key] = structuredClone(patch[key]);
  }
}

function createHarness(createAiPretranslationController, overrides = {}) {
  const project = {
    id: "p1",
    sourceLang: "en",
    targetLang: "tr",
    aiSettings: { useTmContext: true, useTermbaseContext: true }
  };
  let segments = [
    {
      id: "s1",
      source: "First source",
      target: "",
      status: "empty",
      revision: 3,
      targetHistory: [],
      tmPretranslation: { score: 90 }
    },
    {
      id: "s2",
      source: "Second source",
      target: "Existing",
      status: "draft",
      revision: 5,
      targetHistory: []
    },
    { id: "locked", source: "Locked", target: "", status: "locked", revision: 1 }
  ];
  const configuredSettings = {
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "llama3.2",
    mode: "selected",
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr",
    includeNearbyContext: true,
    overwriteExisting: false,
    ...(overrides.settings || {})
  };
  const provider = { name: "Ollama", translateSegment() {} };
  const calls = [];
  const statuses = [];
  const lifecycleStates = [];
  const warnings = [];
  let createdOptions = null;
  let domainOptions = null;
  let busy = Boolean(overrides.busy);

  const controller = createAiPretranslationController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getSegments: () => segments,
      replaceSegments(nextSegments) {
        calls.push(["replaceSegments", nextSegments.map((segment) => segment.id)]);
        segments = nextSegments;
      }
    },
    settings: {
      persist() {
        calls.push(["persist"]);
        return Promise.resolve(configuredSettings);
      },
      runtimeConfig(settings) {
        calls.push(["runtimeConfig", settings.providerId]);
        if (overrides.runtimeError) throw overrides.runtimeError;
        return { apiKey: "private", baseUrl: settings.baseUrl, model: settings.model };
      },
      assertReady(settings, config, action) {
        calls.push(["assertReady", settings.providerId, config.model, action]);
        if (overrides.readyError) throw overrides.readyError;
      },
      projectDefaults(activeProject) {
        calls.push(["projectDefaults", activeProject.id]);
        return {
          useTmContext: overrides.useTmContext !== false,
          useTermbaseContext: overrides.useTermbaseContext !== false
        };
      }
    },
    providers: {
      get(settings) {
        calls.push(["getProvider", settings.providerId]);
        return overrides.noProvider ? null : provider;
      },
      sharesExternally(settings) {
        calls.push(["sharesExternally", settings.providerId]);
        return Boolean(overrides.external);
      }
    },
    consent: {
      externalShare(details) {
        calls.push(["externalShare", structuredClone(details)]);
        return overrides.externalAccepted !== false;
      },
      overwrite() {
        calls.push(["overwrite"]);
        return overrides.overwriteAccepted !== false;
      }
    },
    scope: {
      getSegments(settings) {
        calls.push(["getScope", settings.mode]);
        return segments;
      },
      getOptions(settings) {
        calls.push(["getScopeOptions", settings.mode]);
        return { selectedSegmentIds: ["s1"], visibleSegmentIds: ["s1", "s2"] };
      }
    },
    domain: {
      selectSegments(scopedSegments, options) {
        calls.push(["selectSegments", scopedSegments.map((segment) => segment.id), options.mode]);
        if (overrides.noCandidates) {
          return { candidates: [], skipped: overrides.noSkipped ? [] : [{ segmentId: "locked", reason: "locked" }] };
        }
        return {
          candidates: overrides.candidates || [scopedSegments[0]],
          skipped: [{ segmentId: "locked", reason: "locked" }]
        };
      },
      pretranslateSegments(options) {
        domainOptions = options;
        calls.push(["pretranslateSegments", options.mode, options.selectedSegmentIds, options.visibleSegmentIds]);
        if (overrides.domainImplementation) return overrides.domainImplementation(options, segments, calls);
        options.onProgress({ total: 1, completed: 0, failed: 0, skipped: 1, updatedSegmentIds: [] });
        segments[0].target = "AI target";
        segments[0].status = "draft";
        segments[0].reviewState = "needs-review";
        segments[0].aiPretranslation = { provider: "Ollama", model: "llama3.2" };
        Reflect.deleteProperty(segments[0], "tmPretranslation");
        options.onProgress({ total: 1, completed: 1, failed: 1, skipped: 1, updatedSegmentIds: ["s1"] });
        return Promise.resolve({
          total: 1,
          completed: 1,
          failed: 1,
          skipped: 1,
          updatedSegmentIds: ["s1"],
          canceled: false
        });
      }
    },
    context: {
      glossaryTermsForSegment: (segment) => [{ sourceTerm: segment.source, targetTerm: "Terim" }],
      tmMatchesForSegment: (segment) => [{ source: segment.source, target: "TM target" }],
      surroundingSegmentsForSegment(segment, options) {
        calls.push(["surrounding", segment.id, options.segments.length]);
        return [{ relation: "Previous", source: "Context" }];
      }
    },
    lifecycle: {
      isBusy: () => busy,
      sync(nextState) {
        busy = nextState.running;
        lifecycleStates.push({
          running: nextState.running,
          hasAbortController: Boolean(nextState.abortController),
          progress: structuredClone(nextState.progress)
        });
      }
    },
    commands: {
      bus: {
        async execute(command) {
          calls.push(["execute"]);
          const result = await command.execute();
          return { result, receipt: { commandId: "ai-pretranslate" } };
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
      flush(projectId) {
        calls.push(["flush", projectId]);
        return overrides.flushError ? Promise.reject(overrides.flushError) : Promise.resolve();
      },
      save(updated) {
        calls.push(["save", updated.map((segment) => segment.id)]);
        return overrides.saveError ? Promise.reject(overrides.saveError) : Promise.resolve();
      },
      load(projectId) {
        calls.push(["load", projectId]);
        if (overrides.loadError) return Promise.reject(overrides.loadError);
        return Promise.resolve(structuredClone(segments));
      }
    },
    mutation: {
      capturePatch,
      applyPatch(segment, patch) {
        calls.push(["applyPatch", segment.id]);
        applyPatch(segment, patch);
      },
      clearPending: (segment) => calls.push(["clearPending", segment.id]),
      recordHistory(segment) {
        calls.push(["recordHistory", segment.id]);
        segment.targetHistory.push({ target: segment.target, status: segment.status, reason: "ai-pretranslate" });
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
      prepareHistories(nextSegments) {
        calls.push(["prepareHistories", nextSegments.map((segment) => segment.id)]);
        return nextSegments;
      }
    },
    restoration: {
      restorePatches(patches, restoreContext) {
        calls.push(["restorePatches", patches, restoreContext]);
        return Promise.resolve();
      }
    },
    selection: { getActiveSegmentId: () => overrides.activeSegmentId || "s2" },
    presentation: {
      invalidateFilters: () => calls.push(["invalidateFilters"]),
      renderAll: () => calls.push(["renderAll"]),
      renderSegments: () => calls.push(["renderSegments"]),
      renderProjectProgress: () => calls.push(["renderProjectProgress"]),
      renderHistory: () => calls.push(["renderHistory"]),
      renderAiProgress: () => calls.push(["renderAiProgress"]),
      renderCommandCentre: () => calls.push(["renderCommandCentre"]),
      refreshSidebar() {
        calls.push(["refreshSidebar"]);
        return overrides.sidebarError ? Promise.reject(overrides.sidebarError) : Promise.resolve();
      }
    },
    activity: {
      log(details) {
        calls.push(["activity", structuredClone(details)]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    testHooks: {
      beforeSave(updated) {
        calls.push(["beforeSave", updated.map((segment) => segment.id)]);
        if (overrides.beforeSaveError) throw overrides.beforeSaveError;
      }
    },
    logger: { warn: (...args) => warnings.push(args) }
  });

  return {
    calls,
    controller,
    getCreatedOptions: () => createdOptions,
    getDomainOptions: () => domainOptions,
    getSegments: () => segments,
    lifecycleStates,
    statuses,
    warnings
  };
}

test("AI pretranslation validates runtime/provider and preserves external and overwrite consent boundaries", async () => {
  const { createAiPretranslationController } = await loadFactory();
  const runtimeFailure = createHarness(createAiPretranslationController, {
    runtimeError: new Error("Missing provider key")
  });
  assert.equal(await runtimeFailure.controller.pretranslate(), undefined);
  assert.deepEqual(runtimeFailure.statuses.at(-1), ["Missing provider key", "dirty"]);
  assert.equal(
    runtimeFailure.calls.some(([name]) => name === "flush"),
    false
  );

  const providerFailure = createHarness(createAiPretranslationController, { noProvider: true });
  assert.equal(await providerFailure.controller.pretranslate(), undefined);
  assert.deepEqual(providerFailure.statuses.at(-1), ["Pre-translation is not available for this provider.", "dirty"]);

  const externalCancel = createHarness(createAiPretranslationController, {
    external: true,
    externalAccepted: false,
    useTmContext: false
  });
  assert.equal(await externalCancel.controller.pretranslate(), undefined);
  const shareCall = externalCancel.calls.find(([name]) => name === "externalShare");
  assert.equal(shareCall[1].provider, "Ollama");
  assert.deepEqual(shareCall[1].contextLabels, [
    "configured provider URL",
    "batch segment text",
    "nearby segment context",
    "termbase hints"
  ]);
  assert.deepEqual(externalCancel.statuses.at(-1), ["AI pre-translation canceled", "dirty"]);
  assert.equal(
    externalCancel.calls.some(([name]) => name === "flush"),
    false
  );

  const overwriteCancel = createHarness(createAiPretranslationController, {
    settings: { overwriteExisting: true },
    overwriteAccepted: false
  });
  assert.equal(await overwriteCancel.controller.pretranslate(), undefined);
  assert.equal(
    overwriteCancel.calls.some(([name]) => name === "overwrite"),
    true
  );
  assert.deepEqual(overwriteCancel.statuses.at(-1), ["Local AI pre-translation canceled", "saved"]);
});

test("AI pretranslation flushes pending saves and reports an empty safeguarded selection", async () => {
  const { createAiPretranslationController } = await loadFactory();
  const harness = createHarness(createAiPretranslationController, { noCandidates: true });

  assert.equal(await harness.controller.pretranslate(), undefined);
  assert.deepEqual(
    harness.calls
      .filter(([name]) => ["flush", "selectSegments", "renderAiProgress"].includes(name))
      .map(([name]) => name),
    ["flush", "selectSegments", "renderAiProgress"]
  );
  assert.deepEqual(harness.lifecycleStates.at(-1), {
    running: false,
    hasAbortController: false,
    progress: { total: 0, completed: 0, failed: 0, skipped: 1 }
  });
  assert.deepEqual(harness.statuses.at(-1), ["No eligible segments for local AI pre-translation.", "saved"]);
  assert.equal(
    harness.calls.some(([name]) => name === "pretranslateSegments"),
    false
  );
});

test("AI pretranslation owns provider progress, context, history, and one redacted atomic command", async () => {
  const { createAiPretranslationController } = await loadFactory();
  const harness = createHarness(createAiPretranslationController);

  const result = await harness.controller.pretranslate();
  const segment = harness.getSegments().find((item) => item.id === "s1");
  const commandOptions = harness.getCreatedOptions();
  const domainOptions = harness.getDomainOptions();

  assert.equal(result.receipt.commandId, "ai-pretranslate");
  assert.equal(result.summary.failed, 1);
  assert.deepEqual(commandOptions.segmentIds, ["s1"]);
  assert.deepEqual(commandOptions.provenance, {
    origin: "ai",
    producer: "pretranslation",
    provider: "Ollama",
    providerId: "ollama",
    model: "llama3.2",
    failedCount: 1,
    skippedCount: 1
  });
  assert.equal(JSON.stringify(commandOptions).includes("AI target"), false);
  assert.deepEqual(domainOptions.selectedSegmentIds, ["s1"]);
  assert.deepEqual(domainOptions.visibleSegmentIds, ["s1", "s2"]);
  assert.equal(domainOptions.signal instanceof AbortSignal, true);
  assert.deepEqual(await domainOptions.glossaryTermsForSegment(segment), [
    { sourceTerm: "First source", targetTerm: "Terim" }
  ]);
  assert.deepEqual(await domainOptions.tmMatchesForSegment(segment), [{ source: "First source", target: "TM target" }]);
  assert.deepEqual(domainOptions.surroundingSegmentsForSegment(segment), [{ relation: "Previous", source: "Context" }]);
  assert.equal(segment.target, "AI target");
  assert.equal(segment.targetHistory.at(-1).reason, "ai-pretranslate");
  assert.equal(segment.revision, 4);
  assert.deepEqual(
    harness.calls
      .filter(([name]) =>
        ["flush", "execute", "save", "activity", "load", "replaceSegments", "refreshSidebar", "markDirty"].includes(
          name
        )
      )
      .map(([name]) => name),
    ["flush", "execute", "save", "activity", "load", "replaceSegments", "refreshSidebar", "markDirty"]
  );
  assert.equal(
    harness.lifecycleStates.some((state) => state.running && state.hasAbortController),
    true
  );
  assert.deepEqual(harness.lifecycleStates.at(-1), {
    running: false,
    hasAbortController: false,
    progress: { total: 1, completed: 1, failed: 1, skipped: 1, updatedSegmentIds: ["s1"] }
  });
  assert.deepEqual(harness.statuses.at(-1), [
    "Local AI pre-translation: 1 segment updated; 1 failed; 1 skipped; Undo is available",
    "dirty"
  ]);
});

test("mid-batch AI pretranslation cancellation restores every candidate patch and records no command", async () => {
  const { createAiPretranslationController } = await loadFactory();
  const harness = createHarness(createAiPretranslationController, {
    domainImplementation(options, segments) {
      segments[0].target = "Partial provider output";
      segments[0].status = "draft";
      segments[0].reviewState = "needs-review";
      segments[0].aiPretranslation = { model: "partial" };
      return new Promise((resolve) => {
        options.signal.addEventListener("abort", () => {
          resolve({ total: 1, completed: 1, failed: 0, skipped: 1, updatedSegmentIds: ["s1"], canceled: true });
        });
      });
    }
  });
  const before = structuredClone(harness.getSegments()[0]);

  const pending = harness.controller.pretranslate();
  await waitForTurn();
  assert.equal(await harness.controller.pretranslate(), undefined);
  assert.equal(harness.controller.cancel(), true);
  assert.equal(harness.controller.cancel(), true);
  assert.equal(await pending, null);

  assert.deepEqual(harness.getSegments()[0], before);
  assert.equal(
    harness.calls.some(([name]) => name === "create"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "save"),
    false
  );
  assert.deepEqual(
    harness.calls
      .filter(([name]) => ["applyPatch", "invalidateFilters", "renderAll"].includes(name))
      .map(([name]) => name),
    ["applyPatch", "invalidateFilters", "renderAll"]
  );
  assert.equal(
    harness.lifecycleStates.some((state) => state.progress.canceled),
    true
  );
  assert.deepEqual(harness.statuses.at(-1), [
    "Local AI pre-translation canceled; no target changes were applied",
    "saved"
  ]);
  assert.equal(harness.controller.cancel(), false);
});

test("primary AI pretranslation persistence failure restores exact snapshots and always releases lifecycle state", async () => {
  const { createAiPretranslationController } = await loadFactory();
  const saveError = new Error("Atomic AI batch save failed");
  const harness = createHarness(createAiPretranslationController, { saveError });
  const before = structuredClone(harness.getSegments()[0]);

  assert.equal(await harness.controller.pretranslate(), null);
  assert.deepEqual(harness.getSegments()[0], before);
  assert.deepEqual(
    harness.calls
      .filter(([name]) =>
        [
          "restore",
          "prepareHistory",
          "invalidateFilters",
          "renderSegments",
          "renderProjectProgress",
          "renderHistory"
        ].includes(name)
      )
      .map(([name]) => name),
    ["restore", "prepareHistory", "invalidateFilters", "renderSegments", "renderProjectProgress", "renderHistory"]
  );
  assert.equal(
    harness.calls.some(([name]) => name === "commandsChanged"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "activity"),
    false
  );
  assert.deepEqual(harness.lifecycleStates.at(-1), {
    running: false,
    hasAbortController: false,
    progress: { total: 1, completed: 1, failed: 1, skipped: 1, updatedSegmentIds: ["s1"] }
  });
  assert.deepEqual(harness.statuses.at(-1), ["Atomic AI batch save failed", "dirty"]);
});

test("secondary AI pretranslation activity and refresh failures preserve the durable command and success status", async () => {
  const { createAiPretranslationController } = await loadFactory();
  const harness = createHarness(createAiPretranslationController, {
    activityError: new Error("Activity unavailable"),
    loadError: new Error("Reload unavailable")
  });

  const result = await harness.controller.pretranslate();
  assert.equal(result.receipt.commandId, "ai-pretranslate");
  assert.equal(harness.warnings.length, 2);
  assert.equal(harness.warnings[0][0], "Local AI pretranslation activity log failed.");
  assert.equal(harness.warnings[1][0], "Local AI pretranslation refresh failed.");
  assert.equal(harness.calls.filter(([name]) => name === "renderAll").length, 1);
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    true
  );
  assert.deepEqual(harness.statuses.at(-1), [
    "Local AI pre-translation: 1 segment updated; 1 failed; 1 skipped; Undo is available",
    "dirty"
  ]);
});
