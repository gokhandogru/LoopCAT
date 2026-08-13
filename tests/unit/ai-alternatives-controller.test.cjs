const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-alternatives-controller.js")).href);
}

function waitForTurn() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function createHarness(createAiAlternativesController, overrides = {}) {
  const project = { id: "p1", sourceLang: "en", targetLang: "tr" };
  let segments = [
    {
      id: "s1",
      source: "Source <0>{name}</0>",
      target: "Current target",
      status: "draft",
      revision: 2,
      tags: [{ text: "<0>" }, { text: "{name}" }, { text: "</0>" }],
      aiSuggestions: []
    },
    {
      id: "unchanged",
      source: "Unchanged source",
      target: "Same target",
      status: "draft",
      revision: 3,
      tags: [],
      aiSuggestions: []
    },
    {
      id: "failed",
      source: "Failure source",
      target: "Failure target",
      status: "draft",
      revision: 4,
      tags: [{ label: "{count}" }],
      aiSuggestions: []
    },
    {
      id: "locked",
      source: "Locked source",
      target: "Locked target",
      status: "draft",
      locked: true,
      tags: [],
      aiSuggestions: []
    },
    {
      id: "confirmed",
      source: "Confirmed source",
      target: "Confirmed target",
      status: "confirmed",
      tags: [],
      aiSuggestions: []
    },
    { id: "empty-source", source: "", target: "Target", status: "draft", tags: [] },
    { id: "empty-target", source: "Source", target: "", status: "draft", tags: [] }
  ];
  let active =
    overrides.activeSegment === null
      ? null
      : segments.find((segment) => segment.id === (overrides.activeSegmentId || "s1"));
  const settings = {
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "variant-model",
    mode: "visible",
    variantMode: "formal",
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
  const requests = [];
  let running = Boolean(overrides.running);
  let promptBusy = Boolean(overrides.promptBusy);
  let id = 0;

  const controller = createAiAlternativesController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getSegments: () => segments,
      replaceSegments(next) {
        calls.push(["replaceSegments", next.map((segment) => segment.id)]);
        segments = next;
        active = segments.find((segment) => segment.id === active?.id) || null;
      }
    },
    selection: {
      getActiveSegment: () => active,
      getActiveIndex: () => segments.findIndex((segment) => segment.id === active?.id)
    },
    scope: {
      getVisibleSegments: () => overrides.visibleSegments || segments,
      getDocumentSegments: () => overrides.documentSegments || segments.slice(0, 3),
      isLocked: (segment) => Boolean(segment.locked),
      getTags: (segment) => segment.tags || []
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
    context: {
      activeTerms(contextProject, segment) {
        calls.push(["activeTerms", contextProject.id, segment.id]);
        if (overrides.activeTermsError) return Promise.reject(overrides.activeTermsError);
        return Promise.resolve([{ source: "name", target: "ad" }]);
      },
      batchTerms(segment) {
        calls.push(["batchTerms", segment.id]);
        return Promise.resolve([{ source: "term", target: "terim" }]);
      }
    },
    domain: {
      suggestSegmentVariants(options) {
        requests.push(options);
        calls.push(["suggestSegmentVariants", options.segment.id, Boolean(options.signal)]);
        if (overrides.suggestImplementation) return overrides.suggestImplementation(options);
        if (options.segment.id === "failed") return Promise.reject(new Error("secret-token provider failure"));
        if (options.segment.id === "unchanged") {
          return Promise.resolve({ variants: [{ suggestedTarget: "Same target" }] });
        }
        return Promise.resolve({
          variants: [
            { label: "Formal", suggestedTarget: "Formal alternative", warnings: [] },
            { label: "Natural", suggestedTarget: "Natural alternative", warnings: ["Check tone"] }
          ],
          protectedTokens: options.protectedTokens,
          provider: "Ollama",
          model: "variant-model"
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
      normalize(suggestion) {
        calls.push(["normalize", suggestion.segmentId, suggestion.suggestedTarget]);
        return { ...structuredClone(suggestion), normalized: true };
      },
      nextId: () => `ai-suggestion-${++id}`
    },
    persistence: {
      flush(projectId) {
        calls.push(["flush", projectId]);
        return overrides.flushError ? Promise.reject(overrides.flushError) : Promise.resolve();
      },
      saveOne(segment) {
        calls.push(["saveOne", segment.id]);
        return overrides.saveOneError ? Promise.reject(overrides.saveOneError) : Promise.resolve();
      },
      saveMany(updated) {
        calls.push(["saveMany", updated.map((segment) => segment.id)]);
        return overrides.saveManyError ? Promise.reject(overrides.saveManyError) : Promise.resolve();
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
      renderSuggestions: () => calls.push(["renderSuggestions"]),
      updateRow: (index) => calls.push(["updateRow", index]),
      renderAll: () => calls.push(["renderAll"]),
      refreshSidebar: () => {
        calls.push(["refreshSidebar"]);
        return Promise.resolve();
      }
    },
    activity: {
      logActive(details) {
        calls.push(["logActive", structuredClone(details)]);
        return overrides.activeActivityError ? Promise.reject(overrides.activeActivityError) : Promise.resolve();
      },
      logBatch(details) {
        calls.push(["logBatch", structuredClone(details)]);
        return overrides.batchActivityError ? Promise.reject(overrides.batchActivityError) : Promise.resolve();
      }
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    redact: (value) => String(value || "").replace(/secret\S*/gi, "[REDACTED]"),
    logger: { warn: (...args) => warnings.push(args) }
  });

  return {
    controller,
    calls,
    statuses,
    lifecycleStates,
    warnings,
    requests,
    getSegments: () => segments,
    getActive: () => active
  };
}

test("active AI alternatives preserve busy, source, provider, and external-consent safeguards", async () => {
  const { createAiAlternativesController } = await loadFactory();
  const busy = createHarness(createAiAlternativesController, { running: true });
  assert.equal(await busy.controller.suggestActive(), false);
  assert.deepEqual(busy.calls, []);

  const missing = createHarness(createAiAlternativesController, { activeSegment: null });
  assert.equal(await missing.controller.suggestActive(), false);
  assert.match(missing.statuses.at(-1)[0], /Select a segment/);

  const empty = createHarness(createAiAlternativesController, { activeSegmentId: "empty-source" });
  assert.equal(await empty.controller.suggestActive(), false);
  assert.match(empty.statuses.at(-1)[0], /no source text/);

  const unavailable = createHarness(createAiAlternativesController, { noProvider: true });
  assert.equal(await unavailable.controller.suggestActive(), false);
  assert.match(unavailable.statuses.at(-1)[0], /not available/);

  const denied = createHarness(createAiAlternativesController, {
    external: true,
    externalAccepted: false
  });
  assert.equal(await denied.controller.suggestActive(), false);
  assert.match(denied.statuses.at(-1)[0], /canceled/);
  assert.equal(
    denied.calls.some(([name]) => name === "suggestSegmentVariants"),
    false
  );
});

test("active AI alternatives route glossary and protected tokens, filter current duplicates, and save multiple review suggestions", async () => {
  const { createAiAlternativesController } = await loadFactory();
  const harness = createHarness(createAiAlternativesController, {
    suggestImplementation(options) {
      return Promise.resolve({
        variants: [
          { suggestedTarget: "  " },
          { suggestedTarget: "Current target" },
          { label: "Formal", suggestedTarget: "Formal alternative", warnings: [] },
          { label: "Natural", suggestedTarget: "Natural alternative", warnings: ["Check tone"] }
        ],
        protectedTokens: options.protectedTokens,
        provider: "Ollama",
        model: "variant-model"
      });
    }
  });
  const originalTarget = harness.getActive().target;

  assert.equal(await harness.controller.suggestActive(), true);
  assert.equal(harness.getActive().target, originalTarget);
  assert.equal(harness.getActive().aiSuggestions.length, 2);
  assert.deepEqual(
    harness
      .getActive()
      .aiSuggestions.map((suggestion) => [suggestion.suggestedTarget, suggestion.confidence, suggestion.normalized]),
    [
      ["Formal alternative", 75, true],
      ["Natural alternative", 65, true]
    ]
  );
  assert.deepEqual(harness.requests[0].protectedTokens, ["<0>", "{name}", "</0>"]);
  assert.deepEqual(harness.requests[0].glossaryTerms, [{ source: "name", target: "ad" }]);
  assert.equal(harness.requests[0].variantMode, "formal");
  assert.equal(
    harness.calls.some(([name]) => name === "saveOne"),
    true
  );
  assert.deepEqual(harness.calls.find(([name]) => name === "logActive")[1], {
    segmentId: "s1",
    provider: "Ollama",
    model: "variant-model",
    suggestionCount: 2,
    variantMode: "formal"
  });
  assert.deepEqual(harness.statuses.at(-1), ["AI alternatives ready for review", "saved"]);
});

test("active AI alternatives report unchanged output and restore exact state after primary persistence failure", async () => {
  const { createAiAlternativesController } = await loadFactory();
  const unchanged = createHarness(createAiAlternativesController, { activeSegmentId: "unchanged" });
  const beforeUnchanged = structuredClone(unchanged.getActive());
  assert.equal(await unchanged.controller.suggestActive(), true);
  assert.deepEqual(unchanged.getActive(), beforeUnchanged);
  assert.match(unchanged.statuses.at(-1)[0], /did not propose different/);

  const failed = createHarness(createAiAlternativesController, {
    saveOneError: new Error("write failed")
  });
  const beforeFailed = structuredClone(failed.getActive());
  assert.equal(await failed.controller.suggestActive(), false);
  assert.deepEqual(failed.getActive(), beforeFailed);
  assert.equal(
    failed.calls.some(([name]) => name === "prepareHistory"),
    true
  );
  assert.deepEqual(failed.lifecycleStates.at(-1), {
    running: false,
    promptBusy: false,
    hasAbortController: false,
    progress: undefined
  });
});

test("batch AI alternatives select only translated unlocked drafts and return deterministic empty summaries", async () => {
  const { createAiAlternativesController } = await loadFactory();
  const visibleSegments = [];
  const harness = createHarness(createAiAlternativesController, { visibleSegments });
  visibleSegments.push(...harness.getSegments().slice(3));

  const result = await harness.controller.suggestBatch();
  assert.deepEqual(result, {
    total: 0,
    completed: 0,
    suggested: 0,
    unchanged: 0,
    failed: 0,
    skipped: 4,
    failures: [],
    skippedSegments: [
      { segmentId: "locked", reason: "locked" },
      { segmentId: "confirmed", reason: "confirmed" },
      { segmentId: "empty-source", reason: "empty-source" },
      { segmentId: "empty-target", reason: "empty-target" }
    ],
    updatedSegmentIds: [],
    canceled: false
  });
  assert.equal(
    harness.calls.some(([name]) => name === "flush"),
    false
  );
  assert.match(harness.statuses.at(-1)[0], /No eligible translated draft segments/);
});

test("batch AI alternatives save normalized variants, contain failures, skip protected segments, and never overwrite targets", async () => {
  const { createAiAlternativesController } = await loadFactory();
  const harness = createHarness(createAiAlternativesController);
  const originalTargets = new Map(harness.getSegments().map((segment) => [segment.id, segment.target]));

  const result = await harness.controller.suggestBatch();
  assert.equal(result.total, 3);
  assert.equal(result.completed, 2);
  assert.equal(result.suggested, 2);
  assert.equal(result.unchanged, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.skipped, 4);
  assert.deepEqual(result.updatedSegmentIds, ["s1"]);
  assert.equal(result.failures[0].message.includes("secret-token"), false);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveMany")[1], ["s1"]);
  assert.equal(harness.getSegments().find((segment) => segment.id === "s1").aiSuggestions.length, 2);
  assert.equal(
    harness.getSegments().every((segment) => segment.target === originalTargets.get(segment.id)),
    true
  );
  assert.equal(
    harness.requests.every((request) => request.variantMode === "formal" && request.glossaryTerms.length === 1),
    true
  );
  assert.equal(
    harness.requests.some((request) => request.segment.id === "locked"),
    false
  );
  assert.deepEqual(harness.statuses.at(-1)[1], "dirty");
});

test("mid-batch AI alternatives cancellation preserves completed suggestions and saves the partial result", async () => {
  const { createAiAlternativesController } = await loadFactory();
  let requestCount = 0;
  let secondStarted = false;
  const visibleSegments = [];
  const harness = createHarness(createAiAlternativesController, {
    visibleSegments,
    suggestImplementation(options) {
      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve({
          variants: [{ label: "First", suggestedTarget: "First alternative", warnings: [] }],
          protectedTokens: options.protectedTokens
        });
      }
      secondStarted = true;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("canceled")), { once: true });
      });
    }
  });
  visibleSegments.push(...harness.getSegments().slice(0, 2));

  const pending = harness.controller.suggestBatch();
  while (!secondStarted) await waitForTurn();
  assert.equal(harness.controller.cancel(), true);
  const result = await pending;

  assert.equal(result.canceled, true);
  assert.equal(result.completed, 1);
  assert.equal(result.suggested, 1);
  assert.deepEqual(result.updatedSegmentIds, ["s1"]);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveMany")[1], ["s1"]);
  assert.equal(harness.getSegments().find((segment) => segment.id === "s1").aiSuggestions.length, 1);
  assert.deepEqual(harness.lifecycleStates.at(-1).hasAbortController, false);
  assert.match(harness.statuses.at(-1)[0], /canceled/);
});

test("primary batch AI alternatives persistence failure restores every candidate and always cleans lifecycle state", async () => {
  const { createAiAlternativesController } = await loadFactory();
  const harness = createHarness(createAiAlternativesController, {
    saveManyError: new Error("batch write failed"),
    suggestImplementation(options) {
      return Promise.resolve({
        variants: [{ suggestedTarget: `${options.segment.target} alternative`, warnings: [] }],
        protectedTokens: options.protectedTokens
      });
    }
  });
  const before = structuredClone(harness.getSegments());

  assert.equal(await harness.controller.suggestBatch(), false);
  assert.deepEqual(harness.getSegments(), before);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "restore").map(([, segmentId]) => segmentId),
    ["s1", "unchanged", "failed"]
  );
  assert.deepEqual(harness.lifecycleStates.at(-1), {
    running: false,
    promptBusy: false,
    hasAbortController: false,
    progress: {
      total: 3,
      completed: 3,
      suggested: 3,
      unchanged: 0,
      failed: 0,
      skipped: 4,
      failures: [],
      skippedSegments: [
        { segmentId: "locked", reason: "locked" },
        { segmentId: "confirmed", reason: "confirmed" },
        { segmentId: "empty-source", reason: "empty-source" },
        { segmentId: "empty-target", reason: "empty-target" }
      ],
      updatedSegmentIds: ["s1", "unchanged", "failed"],
      canceled: false
    }
  });
  assert.match(harness.statuses.at(-1)[0], /batch write failed/);
});

test("secondary batch AI alternatives activity failure keeps saved suggestions durable and reports a dirty warning", async () => {
  const { createAiAlternativesController } = await loadFactory();
  const visibleSegments = [];
  const harness = createHarness(createAiAlternativesController, {
    visibleSegments,
    batchActivityError: new Error("activity unavailable")
  });
  visibleSegments.push(harness.getSegments()[0]);

  const result = await harness.controller.suggestBatch();
  assert.equal(result.suggested, 2);
  assert.equal(harness.getSegments()[0].aiSuggestions.length, 2);
  assert.equal(
    harness.calls.some(([name]) => name === "saveMany"),
    true
  );
  assert.equal(
    harness.calls.some(([name]) => name === "replaceSegments"),
    true
  );
  assert.equal(harness.calls.filter(([name]) => name === "markDirty").length >= 2, true);
  assert.equal(harness.warnings.length, 1);
  assert.deepEqual(harness.statuses.at(-1)[1], "dirty");
  assert.match(harness.statuses.at(-1)[0], /activity log failed/);
});
