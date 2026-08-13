const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-terminology-application-controller.js")).href);
}

function waitForTurn() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function createHarness(createController, overrides = {}) {
  const project = { id: "p1", sourceLang: "en", targetLang: "tr" };
  let segments = [
    {
      id: "s1",
      source: "Save the <0>{file}</0>",
      target: "Dosyayı kaydedin",
      status: "draft",
      revision: 2,
      tags: [{ text: "<0>" }, { text: "{file}" }, { text: "</0>" }],
      terms: [{ source: "Save", target: "Kaydet" }],
      aiSuggestions: []
    },
    {
      id: "unchanged",
      source: "Open the file",
      target: "Dosyayı açın",
      status: "draft",
      revision: 3,
      tags: [],
      terms: [{ source: "Open", target: "Aç" }],
      aiSuggestions: []
    },
    {
      id: "no-terms",
      source: "Plain source",
      target: "Düz hedef",
      status: "draft",
      revision: 4,
      tags: [],
      terms: [],
      aiSuggestions: []
    },
    {
      id: "failed",
      source: "Delete the file",
      target: "Dosyayı silin",
      status: "draft",
      revision: 5,
      tags: [{ label: "{file}" }],
      terms: [{ source: "Delete", target: "Sil" }],
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
    model: "term-model",
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
  const requests = [];
  let running = Boolean(overrides.running);
  let promptBusy = Boolean(overrides.promptBusy);
  let suggestionId = 0;

  const controller = createController({
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
      getDocumentSegments: () => overrides.documentSegments || segments.slice(0, 4),
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
        if (overrides.termsError && segment.id === (overrides.termsErrorSegment || "s1")) {
          return Promise.reject(overrides.termsError);
        }
        return Promise.resolve(structuredClone(segment.terms || []));
      }
    },
    domain: {
      applyTerminology(options) {
        requests.push(options);
        calls.push(["applyTerminology", options.segment.id, Boolean(options.signal)]);
        if (overrides.applyImplementation) return overrides.applyImplementation(options);
        if (options.segment.id === "failed") {
          return Promise.reject(new Error("secret-token provider failure"));
        }
        if (options.segment.id === "unchanged") {
          return Promise.resolve({ suggestedTarget: "Dosyayı açın", warnings: [] });
        }
        return Promise.resolve({
          suggestedTarget: "<0>{file}</0> öğesini kaydedin",
          protectedTokens: options.protectedTokens,
          warnings: [],
          provider: "Ollama",
          model: "term-model"
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
        if (overrides.appendError) return Promise.reject(overrides.appendError);
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
      renderSuggestions: () => calls.push(["renderSuggestions"]),
      updateRow: (index) => calls.push(["updateRow", index]),
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

test("active AI terminology application preserves busy, source, target, provider, and consent safeguards", async () => {
  const { createAiTerminologyApplicationController } = await loadFactory();
  const busy = createHarness(createAiTerminologyApplicationController, { running: true });
  assert.equal(await busy.controller.applyActive(), false);
  assert.deepEqual(busy.calls, []);

  for (const [options, message] of [
    [{ activeSegment: null }, /Select a segment/],
    [{ activeSegmentId: "empty-source" }, /no source text/],
    [{ activeSegmentId: "empty-target" }, /no target draft/],
    [{ noProvider: true }, /not available/]
  ]) {
    const harness = createHarness(createAiTerminologyApplicationController, options);
    assert.equal(await harness.controller.applyActive(), false);
    assert.match(harness.statuses.at(-1)[0], message);
  }

  const denied = createHarness(createAiTerminologyApplicationController, {
    external: true,
    externalAccepted: false
  });
  assert.equal(await denied.controller.applyActive(), false);
  assert.equal(
    denied.calls.some(([name]) => name === "applyTerminology"),
    false
  );
});

test("active AI terminology application stops cleanly when no matching termbase hints exist", async () => {
  const { createAiTerminologyApplicationController } = await loadFactory();
  const harness = createHarness(createAiTerminologyApplicationController, {
    activeSegmentId: "no-terms",
    external: true
  });

  assert.equal(await harness.controller.applyActive(), true);
  assert.equal(
    harness.calls.some(([name]) => name === "externalShare"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "applyTerminology"),
    false
  );
  assert.match(harness.statuses.at(-1)[0], /No matching project terminology/);
});

test("active AI terminology application routes glossary and protected tokens and saves a non-overwriting suggestion", async () => {
  const { createAiTerminologyApplicationController } = await loadFactory();
  const harness = createHarness(createAiTerminologyApplicationController);
  const originalTarget = harness.getActive().target;

  assert.equal(await harness.controller.applyActive(), true);
  assert.equal(harness.getActive().target, originalTarget);
  assert.equal(harness.getActive().aiSuggestions.length, 1);
  assert.equal(harness.getActive().aiSuggestions[0].confidence, 82);
  assert.match(harness.getActive().aiSuggestions[0].explanation[1], /Termbase hits considered: 1/);
  assert.deepEqual(harness.requests[0].protectedTokens, ["<0>", "{file}", "</0>"]);
  assert.deepEqual(harness.requests[0].glossaryTerms, [{ source: "Save", target: "Kaydet" }]);
  assert.deepEqual(harness.statuses.at(-1), ["AI terminology suggestion ready for review", "saved"]);
});

test("active AI terminology application restores exact state after suggestion persistence failure", async () => {
  const { createAiTerminologyApplicationController } = await loadFactory();
  const harness = createHarness(createAiTerminologyApplicationController, {
    appendError: new Error("suggestion write failed")
  });
  const before = structuredClone(harness.getActive());

  assert.equal(await harness.controller.applyActive(), false);
  assert.deepEqual(harness.getActive(), before);
  assert.equal(
    harness.calls.some(([name]) => name === "prepareHistory"),
    true
  );
  assert.equal(harness.lifecycleStates.at(-1).promptBusy, false);
});

test("batch AI terminology application selects translated unlocked drafts and reports no-term candidates", async () => {
  const { createAiTerminologyApplicationController } = await loadFactory();
  const harness = createHarness(createAiTerminologyApplicationController);
  const targets = new Map(harness.getSegments().map((segment) => [segment.id, segment.target]));

  const result = await harness.controller.applyBatch();
  assert.equal(result.total, 4);
  assert.equal(result.completed, 3);
  assert.equal(result.suggested, 1);
  assert.equal(result.unchanged, 1);
  assert.equal(result.noTerms, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.skipped, 4);
  assert.deepEqual(result.updatedSegmentIds, ["s1"]);
  assert.equal(result.failures[0].message.includes("secret-token"), false);
  assert.equal(
    harness.requests.some((request) => request.segment.id === "no-terms"),
    false
  );
  assert.equal(
    harness.getSegments().every((segment) => segment.target === targets.get(segment.id)),
    true
  );
});

test("mid-batch AI terminology cancellation preserves completed suggestions and saves the partial result", async () => {
  const { createAiTerminologyApplicationController } = await loadFactory();
  let requestCount = 0;
  let secondStarted = false;
  const visibleSegments = [];
  const harness = createHarness(createAiTerminologyApplicationController, {
    visibleSegments,
    applyImplementation(options) {
      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve({ suggestedTarget: "First terminology suggestion", warnings: [] });
      }
      secondStarted = true;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("canceled")), { once: true });
      });
    }
  });
  visibleSegments.push(harness.getSegments()[0], harness.getSegments()[1]);

  const pending = harness.controller.applyBatch();
  while (!secondStarted) await waitForTurn();
  assert.equal(harness.controller.cancel(), true);
  const result = await pending;

  assert.equal(result.canceled, true);
  assert.equal(result.completed, 1);
  assert.equal(result.suggested, 1);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveMany")[1], ["s1"]);
  assert.equal(harness.lifecycleStates.at(-1).hasAbortController, false);
});

test("primary batch AI terminology persistence failure restores every candidate and cleans lifecycle state", async () => {
  const { createAiTerminologyApplicationController } = await loadFactory();
  const harness = createHarness(createAiTerminologyApplicationController, {
    saveError: new Error("batch write failed"),
    applyImplementation(options) {
      return Promise.resolve({ suggestedTarget: `${options.segment.target} revised`, warnings: [] });
    }
  });
  const before = structuredClone(harness.getSegments());

  assert.equal(await harness.controller.applyBatch(), false);
  assert.deepEqual(harness.getSegments(), before);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "restore").map(([, id]) => id),
    ["s1", "unchanged", "no-terms", "failed"]
  );
  assert.equal(harness.lifecycleStates.at(-1).running, false);
  assert.equal(harness.lifecycleStates.at(-1).promptBusy, false);
  assert.match(harness.statuses.at(-1)[0], /batch write failed/);
});

test("secondary batch AI terminology activity failure keeps saved suggestions durable and reports a dirty warning", async () => {
  const { createAiTerminologyApplicationController } = await loadFactory();
  const visibleSegments = [];
  const harness = createHarness(createAiTerminologyApplicationController, {
    visibleSegments,
    activityError: new Error("activity unavailable")
  });
  visibleSegments.push(harness.getSegments()[0]);

  const result = await harness.controller.applyBatch();
  assert.equal(result.suggested, 1);
  assert.equal(harness.getSegments()[0].aiSuggestions.length, 1);
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
