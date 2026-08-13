const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-terminology-extraction-controller.js")).href);
}

function waitForTurn() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function createHarness(createController, overrides = {}) {
  const project = { id: "p1", sourceLang: "en", targetLang: "tr" };
  const segments = [
    { id: "s1", source: "Save the file", target: "Dosyayı kaydedin" },
    { id: "s2", source: "Open the folder", target: "" },
    { id: "s3", source: "Delete the item", target: "Öğeyi silin" },
    { id: "empty", source: "", target: "Boş" }
  ];
  let active =
    overrides.activeSegment === null
      ? null
      : segments.find((segment) => segment.id === (overrides.activeSegmentId || "s1"));
  const settings = {
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "term-model",
    mode: "project",
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

  const controller = createController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getSegments: () => segments
    },
    selection: { getActiveSegment: () => active },
    scope: {
      getVisibleSegments: () => overrides.visibleSegments || segments.slice(0, 2),
      getDocumentSegments: () => overrides.documentSegments || segments.slice(0, 3)
    },
    termbase: {
      getSelectedName() {
        calls.push(["getSelectedName"]);
        return "Project terms";
      },
      saveCandidates(terms, termBaseName) {
        calls.push(["saveCandidates", structuredClone(terms), termBaseName]);
        if (overrides.saveError) return Promise.reject(overrides.saveError);
        if (overrides.saveCandidates) return overrides.saveCandidates(terms, termBaseName);
        const savedTerms = terms.map((term) => ({
          sourceTerm: term.sourceTerm,
          targetTerm: term.targetTerm,
          notes: term.note || ""
        }));
        return Promise.resolve({ savedTerms, duplicateCount: 0 });
      }
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
      extractSegmentTerms(options) {
        requests.push(options);
        calls.push(["extractSegmentTerms", options.segment.id, Boolean(options.signal)]);
        if (overrides.extractImplementation) return overrides.extractImplementation(options);
        if (options.segment.id === "s3") {
          return Promise.reject(new Error("provider failed"));
        }
        return Promise.resolve({
          terms: [
            {
              sourceTerm: options.segment.id === "s1" ? "Save" : "Open",
              targetTerm: options.segment.id === "s1" ? "Kaydet" : "Aç",
              note: "UI action"
            }
          ],
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
    presentation: {
      renderCommandCentre: () => calls.push(["renderCommandCentre"]),
      renderAiProgress: () => calls.push(["renderAiProgress"]),
      renderOutput: (text, options) => calls.push(["renderOutput", text, options]),
      refreshProjectTerms() {
        calls.push(["refreshProjectTerms"]);
        return overrides.refreshError ? Promise.reject(overrides.refreshError) : Promise.resolve();
      },
      refreshTerms() {
        calls.push(["refreshTerms"]);
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
    logger: { warn: (...args) => warnings.push(args) }
  });

  return {
    controller,
    calls,
    statuses,
    lifecycleStates,
    warnings,
    requests,
    segments,
    setActive: (segment) => {
      active = segment;
    }
  };
}

test("active AI terminology extraction preserves busy, source, provider, and external-consent safeguards", async () => {
  const { createAiTerminologyExtractionController } = await loadFactory();
  const busy = createHarness(createAiTerminologyExtractionController, { running: true });
  assert.equal(await busy.controller.extractActive(), false);
  assert.deepEqual(busy.calls, []);

  const missing = createHarness(createAiTerminologyExtractionController, { activeSegment: null });
  assert.equal(await missing.controller.extractActive(), false);
  assert.match(missing.statuses.at(-1)[0], /Select a segment/);

  const empty = createHarness(createAiTerminologyExtractionController, { activeSegmentId: "empty" });
  assert.equal(await empty.controller.extractActive(), false);
  assert.match(empty.statuses.at(-1)[0], /no source text/);

  const unavailable = createHarness(createAiTerminologyExtractionController, { noProvider: true });
  assert.equal(await unavailable.controller.extractActive(), false);
  assert.match(unavailable.statuses.at(-1)[0], /not available/);

  const denied = createHarness(createAiTerminologyExtractionController, {
    external: true,
    externalAccepted: false
  });
  assert.equal(await denied.controller.extractActive(), false);
  assert.equal(
    denied.calls.some(([name]) => name === "extractSegmentTerms"),
    false
  );
  assert.match(denied.calls.find(([name]) => name === "externalShare")[1].contextLabels.at(-1), /Project terms/);
});

test("active AI terminology extraction routes provider output through injected deduplication and storage", async () => {
  const { createAiTerminologyExtractionController } = await loadFactory();
  const harness = createHarness(createAiTerminologyExtractionController);

  assert.equal(await harness.controller.extractActive(), true);
  assert.equal(harness.requests[0].segment.id, "s1");
  assert.deepEqual(harness.calls.find(([name]) => name === "saveCandidates").slice(1), [
    [{ sourceTerm: "Save", targetTerm: "Kaydet", note: "UI action" }],
    "Project terms"
  ]);
  assert.deepEqual(harness.calls.find(([name]) => name === "logActive")[1], {
    segmentId: "s1",
    provider: "Ollama",
    model: "term-model",
    termBaseName: "Project terms",
    termCount: 1
  });
  assert.equal(
    harness.calls.some(([name]) => name === "refreshProjectTerms"),
    true
  );
  assert.equal(
    harness.calls.some(([name]) => name === "refreshTerms"),
    true
  );
  assert.deepEqual(harness.statuses.at(-1), ["Saved 1 AI term candidate", "saved"]);
});

test("active AI terminology extraction distinguishes empty and duplicate-only results", async () => {
  const { createAiTerminologyExtractionController } = await loadFactory();
  const empty = createHarness(createAiTerminologyExtractionController, {
    extractImplementation: () => Promise.resolve({ terms: [] })
  });
  assert.equal(await empty.controller.extractActive(), true);
  assert.match(empty.statuses.at(-1)[0], /did not find term candidates/);

  const duplicate = createHarness(createAiTerminologyExtractionController, {
    saveCandidates: () => Promise.resolve({ savedTerms: [], duplicateCount: 1 })
  });
  assert.equal(await duplicate.controller.extractActive(), true);
  assert.match(duplicate.statuses.at(-1)[0], /already exist/);
  assert.equal(
    duplicate.calls.some(([name]) => name === "logActive"),
    false
  );
});

test("active AI terminology extraction keeps saved terms durable through activity and refresh warnings", async () => {
  const { createAiTerminologyExtractionController } = await loadFactory();
  const harness = createHarness(createAiTerminologyExtractionController, {
    activeActivityError: new Error("activity unavailable"),
    refreshError: new Error("refresh unavailable")
  });

  assert.equal(await harness.controller.extractActive(), true);
  assert.equal(
    harness.calls.some(([name]) => name === "saveCandidates"),
    true
  );
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    true
  );
  assert.equal(harness.warnings.length, 2);
  assert.deepEqual(harness.statuses.at(-1)[1], "dirty");
  assert.match(harness.statuses.at(-1)[0], /activity log failed/);
});

test("batch AI terminology extraction preserves mode-specific source selection and aggregated persistence", async () => {
  const { createAiTerminologyExtractionController } = await loadFactory();
  const harness = createHarness(createAiTerminologyExtractionController, {
    settings: { mode: "untranslated" }
  });

  const result = await harness.controller.extractBatch();
  assert.equal(result.savedTerms.length, 1);
  assert.equal(result.failures.length, 0);
  assert.equal(result.duplicateCount, 0);
  assert.equal(result.canceled, false);
  assert.deepEqual(
    harness.requests.map((request) => request.segment.id),
    ["s2"]
  );
  assert.deepEqual(harness.calls.find(([name]) => name === "saveCandidates")[1], [
    { sourceTerm: "Open", targetTerm: "Aç", note: "UI action" }
  ]);
  assert.deepEqual(harness.statuses.at(-1)[1], "saved");
});

test("batch AI terminology extraction contains segment failures and reports aggregate counts", async () => {
  const { createAiTerminologyExtractionController } = await loadFactory();
  const harness = createHarness(createAiTerminologyExtractionController);

  const result = await harness.controller.extractBatch();
  assert.equal(result.savedTerms.length, 2);
  assert.deepEqual(result.failures, [{ segmentId: "s3", error: "provider failed" }]);
  assert.equal(result.canceled, false);
  const activity = harness.calls.find(([name]) => name === "logBatch")[1];
  assert.equal(activity.segmentCount, 3);
  assert.equal(activity.completed, 2);
  assert.equal(activity.failed, 1);
  assert.equal(activity.savedTermCount, 2);
  assert.match(harness.calls.find(([name]) => name === "renderOutput")[1], /Failures:/);
  assert.deepEqual(harness.statuses.at(-1)[1], "dirty");
});

test("mid-batch AI terminology extraction cancellation saves completed candidates and cleans lifecycle", async () => {
  const { createAiTerminologyExtractionController } = await loadFactory();
  let requestCount = 0;
  let secondStarted = false;
  const visibleSegments = [];
  const harness = createHarness(createAiTerminologyExtractionController, {
    visibleSegments,
    settings: { mode: "visible" },
    extractImplementation(options) {
      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve({ terms: [{ sourceTerm: "Save", targetTerm: "Kaydet" }] });
      }
      secondStarted = true;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("canceled")), { once: true });
      });
    }
  });
  visibleSegments.push(harness.segments[0], harness.segments[1]);

  const pending = harness.controller.extractBatch();
  while (!secondStarted) await waitForTurn();
  assert.equal(harness.controller.cancel(), true);
  const result = await pending;

  assert.equal(result.canceled, true);
  assert.equal(result.savedTerms.length, 1);
  assert.equal(harness.lifecycleStates.at(-1).running, false);
  assert.equal(harness.lifecycleStates.at(-1).hasAbortController, false);
  assert.match(harness.statuses.at(-1)[0], /Canceled batch/);
});

test("primary batch AI terminology storage failure returns failure and always releases lifecycle state", async () => {
  const { createAiTerminologyExtractionController } = await loadFactory();
  const harness = createHarness(createAiTerminologyExtractionController, {
    saveError: new Error("term storage failed")
  });

  assert.equal(await harness.controller.extractBatch(), false);
  assert.equal(
    harness.calls.some(([name]) => name === "logBatch"),
    false
  );
  assert.equal(harness.lifecycleStates.at(-1).running, false);
  assert.equal(harness.lifecycleStates.at(-1).promptBusy, false);
  assert.equal(harness.lifecycleStates.at(-1).hasAbortController, false);
  assert.match(harness.statuses.at(-1)[0], /term storage failed/);
});

test("secondary batch AI terminology activity failure keeps saved terms durable and reports dirty", async () => {
  const { createAiTerminologyExtractionController } = await loadFactory();
  const harness = createHarness(createAiTerminologyExtractionController, {
    settings: { mode: "selected" },
    batchActivityError: new Error("activity unavailable")
  });

  const result = await harness.controller.extractBatch();
  assert.equal(result.savedTerms.length, 1);
  assert.equal(
    harness.calls.some(([name]) => name === "saveCandidates"),
    true
  );
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    true
  );
  assert.equal(harness.warnings.length, 1);
  assert.deepEqual(harness.statuses.at(-1)[1], "dirty");
  assert.match(harness.statuses.at(-1)[0], /activity log failed/);
});
