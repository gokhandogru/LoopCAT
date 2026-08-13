const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-draft-editing-controller.js")).href);
}

function waitForTurn() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function createHarness(createAiDraftEditingController, overrides = {}) {
  const project = {
    id: "p1",
    sourceLang: "en",
    targetLang: "tr",
    aiSettings: { styleGuide: "Use concise formal Turkish." }
  };
  let segments = [
    {
      id: "s1",
      source: "Save the <0>{file}</0>",
      target: "Dosyayı kaydedin",
      status: "draft",
      revision: 2,
      tags: [{ text: "<0>" }, { text: "{file}" }, { text: "</0>" }],
      aiSuggestions: []
    },
    {
      id: "unchanged",
      source: "Open the file",
      target: "Dosyayı açın",
      status: "draft",
      revision: 3,
      tags: [],
      aiSuggestions: []
    },
    {
      id: "failed",
      source: "Delete the file",
      target: "Dosyayı silin",
      status: "draft",
      revision: 4,
      tags: [{ label: "{file}" }],
      aiSuggestions: []
    },
    { id: "locked", source: "Locked", target: "Kilitli", status: "draft", locked: true },
    { id: "confirmed", source: "Done", target: "Bitti", status: "confirmed" },
    { id: "empty-source", source: "", target: "Hedef", status: "draft" },
    { id: "empty-target", source: "Source", target: "", status: "draft" }
  ];
  let active =
    overrides.activeSegment === null
      ? null
      : segments.find((segment) => segment.id === (overrides.activeSegmentId || "s1"));
  const settings = {
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "draft-model",
    mode: "visible",
    adaptMode: "simplify",
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
  const requests = { polish: [], adapt: [] };
  let running = Boolean(overrides.running);
  let promptBusy = Boolean(overrides.promptBusy);
  let suggestionId = 0;

  function domainResult(operation, options) {
    requests[operation].push(options);
    calls.push([operation, options.segment.id, Boolean(options.signal)]);
    if (overrides[`${operation}Implementation`]) {
      return overrides[`${operation}Implementation`](options);
    }
    if (options.segment.id === "failed") {
      return Promise.reject(new Error("secret-token provider failure"));
    }
    if (options.segment.id === "unchanged") {
      return Promise.resolve({ suggestedTarget: "Dosyayı açın", warnings: [] });
    }
    return Promise.resolve({
      suggestedTarget: operation === "adapt" ? "<0>{file}</0> kaydedilsin" : "<0>{file}</0> öğesini kaydedin",
      protectedTokens: options.protectedTokens,
      warnings: [],
      adaptMode: operation === "adapt" ? options.adaptMode : undefined,
      provider: "Ollama",
      model: "draft-model"
    });
  }

  const controller = createAiDraftEditingController({
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
      termsForSegment(segment) {
        calls.push(["termsForSegment", segment.id]);
        return Promise.resolve([{ source: "Save", target: "Kaydet" }]);
      },
      tmMatchesForSegment(segment) {
        calls.push(["tmMatchesForSegment", segment.id]);
        return Promise.resolve([{ target: "Dosyayı kaydedin", score: 98 }]);
      }
    },
    domain: {
      polish: (options) => domainResult("polish", options),
      adapt: (options) => domainResult("adapt", options)
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
      append(operation, segment, suggestion) {
        calls.push(["append", operation, segment.id, structuredClone(suggestion)]);
        if (overrides.appendResult === false) return Promise.resolve(false);
        segment.aiSuggestions = [...(segment.aiSuggestions || []), structuredClone(suggestion)];
        return Promise.resolve({ ok: true, activityLogged: overrides.activeActivityLogged !== false });
      },
      normalize(suggestion) {
        calls.push(["normalize", suggestion.segmentId]);
        return { ...structuredClone(suggestion), normalized: true };
      },
      nextId: () => `ai-suggestion-${++suggestionId}`
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
      logBatch(operation, details) {
        calls.push(["logBatch", operation, structuredClone(details)]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
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

test("active AI draft editing preserves shared busy, source, target, provider, and consent safeguards", async () => {
  const { createAiDraftEditingController } = await loadFactory();
  const busy = createHarness(createAiDraftEditingController, { running: true });
  assert.equal(await busy.controller.polishActive(), false);
  assert.equal(await busy.controller.adaptActive(), false);
  assert.deepEqual(busy.calls, []);

  for (const [options, method, expected] of [
    [{ activeSegment: null }, "polishActive", /Select a segment/],
    [{ activeSegmentId: "empty-source" }, "adaptActive", /no source text/],
    [{ activeSegmentId: "empty-target" }, "polishActive", /no target draft to polish/],
    [{ noProvider: true }, "adaptActive", /not available/]
  ]) {
    const harness = createHarness(createAiDraftEditingController, options);
    assert.equal(await harness.controller[method](), false);
    assert.match(harness.statuses.at(-1)[0], expected);
  }

  const denied = createHarness(createAiDraftEditingController, {
    external: true,
    externalAccepted: false
  });
  assert.equal(await denied.controller.adaptActive(), false);
  assert.equal(
    denied.calls.some(([name]) => name === "adapt"),
    false
  );
  assert.deepEqual(denied.calls.find(([name]) => name === "externalShare")[1].contextLabels, [
    "current target draft",
    "adaptation mode",
    "project style instructions",
    "TM matches",
    "termbase hints",
    "configured provider URL"
  ]);
});

test("active AI polish routes TM, termbase, style, and protected tokens into a non-overwriting suggestion", async () => {
  const { createAiDraftEditingController } = await loadFactory();
  const harness = createHarness(createAiDraftEditingController);
  const originalTarget = harness.getActive().target;

  assert.equal(await harness.controller.polishActive(), true);
  assert.equal(harness.getActive().target, originalTarget);
  assert.equal(harness.getActive().aiSuggestions.length, 1);
  assert.match(harness.getActive().aiSuggestions[0].explanation.join(" "), /TM matches considered: 1/);
  assert.match(harness.getActive().aiSuggestions[0].explanation.join(" "), /Termbase hints considered: 1/);
  assert.deepEqual(harness.requests.polish[0].protectedTokens, ["<0>", "{file}", "</0>"]);
  assert.equal(harness.requests.polish[0].styleGuide, "Use concise formal Turkish.");
  assert.equal(harness.requests.polish[0].adaptMode, undefined);
  assert.deepEqual(harness.statuses.at(-1), ["AI polish suggestion ready for review", "saved"]);
});

test("active AI adaptation propagates adaptation mode and preserves warning confidence", async () => {
  const { createAiDraftEditingController } = await loadFactory();
  const harness = createHarness(createAiDraftEditingController, {
    adaptImplementation(options) {
      return Promise.resolve({
        suggestedTarget: "Uyarlanmış hedef",
        adaptMode: "marketing",
        protectedTokens: options.protectedTokens,
        warnings: ["Check register"]
      });
    }
  });

  assert.equal(await harness.controller.adaptActive(), true);
  assert.equal(harness.requests.adapt[0].adaptMode, "simplify");
  assert.equal(harness.getActive().aiSuggestions[0].confidence, 65);
  assert.match(harness.getActive().aiSuggestions[0].explanation[0], /marketing/);
  assert.deepEqual(harness.calls.find(([name]) => name === "append").slice(1, 3), ["adapt", "s1"]);
});

test("active AI draft editing reports unchanged and suggestion-storage warning outcomes", async () => {
  const { createAiDraftEditingController } = await loadFactory();
  const unchanged = createHarness(createAiDraftEditingController, { activeSegmentId: "unchanged" });
  assert.equal(await unchanged.controller.polishActive(), true);
  assert.match(unchanged.statuses.at(-1)[0], /different polish/);
  assert.equal(
    unchanged.calls.some(([name]) => name === "append"),
    false
  );

  const warning = createHarness(createAiDraftEditingController, { activeActivityLogged: false });
  assert.equal(await warning.controller.adaptActive(), true);
  assert.deepEqual(warning.statuses.at(-1), ["AI adaptation suggestion ready; activity log failed", "dirty"]);
});

test("batch AI draft editing selects only translated unlocked drafts and returns deterministic empty summaries", async () => {
  const { createAiDraftEditingController } = await loadFactory();
  const visibleSegments = [];
  const harness = createHarness(createAiDraftEditingController, { visibleSegments });
  visibleSegments.push(...harness.getSegments().slice(3));

  const result = await harness.controller.polishBatch();
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
});

test("batch AI polish saves normalized suggestions, contains failures, and never overwrites targets", async () => {
  const { createAiDraftEditingController } = await loadFactory();
  const harness = createHarness(createAiDraftEditingController);
  const targets = new Map(harness.getSegments().map((segment) => [segment.id, segment.target]));

  const result = await harness.controller.polishBatch();
  assert.equal(result.total, 3);
  assert.equal(result.completed, 2);
  assert.equal(result.suggested, 1);
  assert.equal(result.unchanged, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.updatedSegmentIds, ["s1"]);
  assert.equal(result.failures[0].message.includes("secret-token"), false);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveMany")[1], ["s1"]);
  assert.equal(harness.getSegments()[0].aiSuggestions[0].normalized, true);
  assert.equal(
    harness.getSegments().every((segment) => segment.target === targets.get(segment.id)),
    true
  );
});

test("batch AI adaptation preserves adaptation mode in provider and activity boundaries", async () => {
  const { createAiDraftEditingController } = await loadFactory();
  const visibleSegments = [];
  const harness = createHarness(createAiDraftEditingController, { visibleSegments });
  visibleSegments.push(harness.getSegments()[0]);

  const result = await harness.controller.adaptBatch();
  assert.equal(result.suggested, 1);
  assert.equal(harness.requests.adapt[0].adaptMode, "simplify");
  const activityCall = harness.calls.find(([name]) => name === "logBatch");
  assert.equal(activityCall[1], "adapt");
  assert.equal(activityCall[2].adaptMode, "simplify");
  assert.equal(activityCall[2].adaptedCount, 1);
  assert.match(harness.getSegments()[0].aiSuggestions[0].explanation[0], /simplify/);
});

test("mid-batch AI draft editing cancellation preserves completed suggestions and saves partial output", async () => {
  const { createAiDraftEditingController } = await loadFactory();
  let requestCount = 0;
  let secondStarted = false;
  const visibleSegments = [];
  const harness = createHarness(createAiDraftEditingController, {
    visibleSegments,
    polishImplementation(options) {
      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve({ suggestedTarget: "First polish", warnings: [] });
      }
      secondStarted = true;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("canceled")), { once: true });
      });
    }
  });
  visibleSegments.push(harness.getSegments()[0], harness.getSegments()[1]);

  const pending = harness.controller.polishBatch();
  while (!secondStarted) await waitForTurn();
  assert.equal(harness.controller.cancel(), true);
  const result = await pending;

  assert.equal(result.canceled, true);
  assert.equal(result.completed, 1);
  assert.equal(result.suggested, 1);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveMany")[1], ["s1"]);
  assert.equal(harness.lifecycleStates.at(-1).hasAbortController, false);
});

test("primary batch AI draft editing persistence failure restores every candidate and cleans lifecycle", async () => {
  const { createAiDraftEditingController } = await loadFactory();
  const harness = createHarness(createAiDraftEditingController, {
    saveError: new Error("batch write failed"),
    adaptImplementation(options) {
      return Promise.resolve({
        suggestedTarget: `${options.segment.target} adapted`,
        warnings: [],
        adaptMode: options.adaptMode
      });
    }
  });
  const before = structuredClone(harness.getSegments());

  assert.equal(await harness.controller.adaptBatch(), false);
  assert.deepEqual(harness.getSegments(), before);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "restore").map(([, id]) => id),
    ["s1", "unchanged", "failed"]
  );
  assert.equal(harness.lifecycleStates.at(-1).running, false);
  assert.equal(harness.lifecycleStates.at(-1).promptBusy, false);
});

test("secondary batch AI draft editing activity failure keeps durable suggestions and reports dirty", async () => {
  const { createAiDraftEditingController } = await loadFactory();
  const visibleSegments = [];
  const harness = createHarness(createAiDraftEditingController, {
    visibleSegments,
    activityError: new Error("activity unavailable")
  });
  visibleSegments.push(harness.getSegments()[0]);

  const result = await harness.controller.polishBatch();
  assert.equal(result.suggested, 1);
  assert.equal(
    harness.calls.some(([name]) => name === "saveMany"),
    true
  );
  assert.equal(
    harness.calls.some(([name]) => name === "replaceSegments"),
    true
  );
  assert.equal(harness.warnings.length, 1);
  assert.deepEqual(harness.statuses.at(-1)[1], "dirty");
  assert.match(harness.statuses.at(-1)[0], /activity log failed/);
});
