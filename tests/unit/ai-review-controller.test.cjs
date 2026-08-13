const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-review-controller.js")).href);
}

function waitForTurn() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function createHarness(createAiReviewController, overrides = {}) {
  const project = { id: "p1", sourceLang: "en", targetLang: "tr" };
  let segments = [
    {
      id: "s1",
      source: "First source 42",
      target: "First target 24",
      status: "draft",
      revision: 3,
      comments: []
    },
    {
      id: "no-issues",
      source: "Good source",
      target: "Good target",
      status: "draft",
      revision: 2,
      comments: []
    },
    {
      id: "failed",
      source: "Failure source",
      target: "Failure target",
      status: "draft",
      revision: 4,
      comments: []
    },
    { id: "locked", source: "Locked source", target: "Locked target", status: "draft", locked: true },
    { id: "confirmed", source: "Confirmed source", target: "Confirmed target", status: "confirmed" },
    { id: "empty-source", source: "", target: "Target", status: "draft" },
    { id: "empty-target", source: "Source", target: "", status: "draft" }
  ];
  let activeSegment = overrides.activeSegment === null ? null : segments[overrides.activeIndex || 0];
  const configuredSettings = {
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "review-model",
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
  let domainOptions = null;

  const controller = createAiReviewController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getSegments: () => segments,
      replaceSegments(nextSegments) {
        calls.push(["replaceSegments", nextSegments.map((segment) => segment.id)]);
        segments = nextSegments;
        activeSegment = segments.find((segment) => segment.id === activeSegment?.id) || null;
      }
    },
    selection: {
      getActiveSegment: () => activeSegment,
      getActiveIndex: () => segments.findIndex((segment) => segment.id === activeSegment?.id)
    },
    scope: {
      getVisibleSegments: () => overrides.visibleSegments || segments,
      getDocumentSegments: () => overrides.documentSegments || segments.slice(0, 3),
      isLocked: (segment) => Boolean(segment.locked)
    },
    settings: {
      persist() {
        calls.push(["persist"]);
        return Promise.resolve(configuredSettings);
      },
      runtimeConfig(settings) {
        calls.push(["runtimeConfig", settings.providerId]);
        if (overrides.runtimeError) throw overrides.runtimeError;
        return { model: settings.model, apiKey: "private" };
      },
      assertReady(settings, config, action) {
        calls.push(["assertReady", settings.providerId, config.model, action]);
        if (overrides.readyError) throw overrides.readyError;
      }
    },
    providers: {
      get(settings) {
        calls.push(["getProvider", settings.providerId]);
        return provider;
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
      }
    },
    context: {
      findTerms(options) {
        calls.push(["findTerms", structuredClone(options)]);
        if (overrides.termError) return Promise.reject(overrides.termError);
        return Promise.resolve([{ sourceTerm: "source", targetTerm: "hedef" }]);
      },
      getTermBaseNames: () => ["Main Terms"]
    },
    domain: {
      reviewSegment(options) {
        domainOptions = options;
        calls.push(["reviewSegment", options.segment.id, Boolean(options.signal)]);
        if (overrides.reviewImplementation) return overrides.reviewImplementation(options, calls);
        return Promise.resolve({
          reviewText: "Medium | Number check | Preserve 42.",
          reviewRisk: { level: "medium", score: 51.6, issueCount: 2 },
          provider: "Ollama key=secret",
          model: "review-model"
        });
      },
      parseRisk(text) {
        calls.push(["parseRisk", text]);
        const clean = String(text || "").toLowerCase();
        if (clean.includes("no issues found")) return { level: "none", score: 0, issueCount: 0 };
        if (clean.includes("high")) return { level: "high", score: 75, issueCount: 1 };
        if (clean.includes("medium")) return { level: "medium", score: 50, issueCount: 1 };
        return { level: "low", score: 25, issueCount: 1 };
      }
    },
    lifecycle: {
      isRunning: () => running,
      isPromptBusy: () => promptBusy,
      sync(nextState) {
        running = nextState.running;
        promptBusy = nextState.promptBusy;
        lifecycleStates.push({
          running: nextState.running,
          promptBusy: nextState.promptBusy,
          hasAbortController: Boolean(nextState.abortController),
          progress: structuredClone(nextState.progress)
        });
      }
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
        if (overrides.loadError) return Promise.reject(overrides.loadError);
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
      prepareHistories(nextSegments) {
        calls.push(["prepareHistories", nextSegments.map((segment) => segment.id)]);
        return nextSegments;
      }
    },
    presentation: {
      renderCommandCentre: () => calls.push(["renderCommandCentre"]),
      renderAiProgress: () => calls.push(["renderAiProgress"]),
      renderOutput: (text, options) => calls.push(["renderOutput", text, options]),
      renderReview: () => calls.push(["renderReview"]),
      updateRow: (index) => calls.push(["updateRow", index]),
      renderAll: () => calls.push(["renderAll"]),
      refreshSidebar() {
        calls.push(["refreshSidebar"]);
        return overrides.sidebarError ? Promise.reject(overrides.sidebarError) : Promise.resolve();
      },
      renderSegments: () => calls.push(["renderSegments"]),
      renderProjectProgress: () => calls.push(["renderProjectProgress"]),
      renderHistory: () => calls.push(["renderHistory"])
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
    labels: { risk: (level) => `${level[0].toUpperCase()}${level.slice(1)} risk` },
    redact: (value) => String(value || "").replace(/key=\S+/g, "[REDACTED]"),
    ids: { next: () => "stable-review-id" },
    clock: { now: () => "2026-08-13T20:00:00.000Z" },
    logger: { warn: (...args) => warnings.push(args) }
  });

  return {
    calls,
    controller,
    getDomainOptions: () => domainOptions,
    getSegments: () => segments,
    lifecycleStates,
    statuses,
    warnings
  };
}

test("AI review active validation preserves busy, source, target, provider, and external-consent safeguards", async () => {
  const { createAiReviewController } = await loadFactory();
  const busy = createHarness(createAiReviewController, { running: true });
  assert.equal(await busy.controller.reviewActive(), false);
  assert.equal(busy.calls.length, 0);

  const missing = createHarness(createAiReviewController, { activeSegment: null });
  assert.equal(await missing.controller.reviewActive(), false);
  assert.deepEqual(missing.statuses.at(-1), ["Select a segment before running AI review.", "dirty"]);

  const blankSource = createHarness(createAiReviewController);
  blankSource.getSegments()[0].source = "";
  assert.equal(await blankSource.controller.reviewActive(), false);
  assert.deepEqual(blankSource.statuses.at(-1), ["The active segment has no source text.", "dirty"]);

  const blankTarget = createHarness(createAiReviewController);
  blankTarget.getSegments()[0].target = "";
  assert.equal(await blankTarget.controller.reviewActive(), false);
  assert.deepEqual(blankTarget.statuses.at(-1), ["The active segment has no target text to review.", "dirty"]);

  const runtimeFailure = createHarness(createAiReviewController, { runtimeError: new Error("Missing review key") });
  assert.equal(await runtimeFailure.controller.reviewActive(), false);
  assert.deepEqual(runtimeFailure.statuses.at(-1), ["Missing review key", "dirty"]);

  const noProvider = createHarness(createAiReviewController, { noProvider: true });
  assert.equal(await noProvider.controller.reviewActive(), false);
  assert.deepEqual(noProvider.statuses.at(-1), ["AI review is not available for this provider.", "dirty"]);

  const consentCancel = createHarness(createAiReviewController, { external: true, externalAccepted: false });
  assert.equal(await consentCancel.controller.reviewActive(), false);
  assert.deepEqual(consentCancel.calls.find(([name]) => name === "externalShare")[1].contextLabels, [
    "target text",
    "configured provider URL",
    "project glossary hints"
  ]);
  assert.deepEqual(consentCancel.statuses.at(-1), ["AI review canceled", "dirty"]);
});

test("active AI review owns glossary routing, normalized risk comments, persistence, activity, and presentation", async () => {
  const { createAiReviewController } = await loadFactory();
  const harness = createHarness(createAiReviewController);

  assert.equal(await harness.controller.reviewActive(), true);
  const segment = harness.getSegments()[0];
  const comment = segment.comments.at(-1);
  assert.equal(segment.reviewState, "needs-review");
  assert.deepEqual(segment.aiReviewRisk, { level: "medium", score: 52, issueCount: 2, label: "Medium risk" });
  assert.equal(comment.id, "comment-stable-review-id");
  assert.equal(comment.createdAt, "2026-08-13T20:00:00.000Z");
  assert.equal(comment.body.includes("AI review by Ollama [REDACTED] (review-model)"), true);
  assert.equal(comment.body.includes("Risk: Medium (52/100, 2 issues)"), true);
  assert.equal(segment.revision, 4);
  assert.deepEqual(harness.calls.find(([name]) => name === "findTerms")[1], {
    source: "First source 42",
    sourceLang: "en",
    targetLang: "tr",
    termBaseNames: ["Main Terms"]
  });
  assert.equal(harness.getDomainOptions().signal, undefined);
  assert.deepEqual(
    harness.calls
      .filter(([name]) =>
        [
          "reviewSegment",
          "touch",
          "clearPending",
          "saveOne",
          "logActive",
          "renderReview",
          "updateRow",
          "markDirty"
        ].includes(name)
      )
      .map(([name]) => name),
    ["reviewSegment", "touch", "clearPending", "saveOne", "logActive", "renderReview", "updateRow", "markDirty"]
  );
  assert.equal(harness.calls.find(([name]) => name === "renderOutput")[1].includes("Risk: Medium"), true);
  assert.deepEqual(harness.statuses.at(-1), ["AI review added to the active segment", "saved"]);
  assert.deepEqual(harness.lifecycleStates.at(-1), {
    running: false,
    promptBusy: false,
    hasAbortController: false,
    progress: undefined
  });
});

test("primary active AI review persistence failure restores the exact segment and releases prompt lifecycle", async () => {
  const { createAiReviewController } = await loadFactory();
  const error = new Error("Review save failed");
  const harness = createHarness(createAiReviewController, { saveOneError: error });
  const before = structuredClone(harness.getSegments()[0]);

  assert.equal(await harness.controller.reviewActive(), false);
  assert.deepEqual(harness.getSegments()[0], before);
  assert.deepEqual(
    harness.calls
      .filter(([name]) => ["restore", "prepareHistory", "renderReview", "updateRow"].includes(name))
      .map(([name]) => name),
    ["restore", "prepareHistory", "renderReview", "updateRow"]
  );
  assert.equal(harness.calls.find(([name]) => name === "renderOutput")[1], "Review save failed");
  assert.deepEqual(harness.statuses.at(-1), ["Review save failed", "dirty"]);
  assert.equal(harness.lifecycleStates.at(-1).promptBusy, false);
});

test("batch AI review owns visible-scope eligibility and deterministic empty summaries", async () => {
  const { createAiReviewController } = await loadFactory();
  const harness = createHarness(createAiReviewController);
  harness
    .getSegments()
    .slice(0, 3)
    .forEach((segment) => {
      segment.locked = true;
    });

  const summary = await harness.controller.reviewBatch();
  assert.equal(summary.total, 0);
  assert.equal(summary.skipped, 7);
  assert.equal(summary.commented, 0);
  assert.equal(summary.canceled, false);
  assert.equal(
    harness.calls.some(([name]) => name === "reviewSegment"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "saveMany"),
    false
  );
  assert.deepEqual(harness.statuses.at(-1), ["No eligible translated draft segments for batch AI QA.", "saved"]);
  assert.deepEqual(harness.lifecycleStates.at(-1).progress, { total: 0, completed: 0, failed: 0, skipped: 7 });
});

test("batch AI review saves risk-ranked comments, no-issue results, skips protected segments, and contains failures", async () => {
  const { createAiReviewController } = await loadFactory();
  const harness = createHarness(createAiReviewController, {
    reviewImplementation(options) {
      if (options.segment.id === "failed") throw new Error("secret-token batch failure");
      if (options.segment.id === "no-issues") {
        return Promise.resolve({ reviewText: "No issues found.", provider: "Ollama", model: "review-model" });
      }
      return Promise.resolve({
        reviewText: "High | Number mismatch | Keep 42.",
        reviewRisk: { level: "high", score: 81, issueCount: 1 },
        provider: "Ollama",
        model: "review-model"
      });
    }
  });

  const summary = await harness.controller.reviewBatch();
  assert.equal(summary.total, 3);
  assert.equal(summary.completed, 2);
  assert.equal(summary.commented, 1);
  assert.equal(summary.noIssue, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.skipped, 4);
  assert.equal(summary.riskCounts.high, 1);
  assert.equal(summary.highestRisk, "high");
  assert.deepEqual(summary.updatedSegmentIds, ["s1"]);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveMany")[1], ["s1"]);
  assert.deepEqual(
    harness.calls
      .filter(([name]) =>
        ["logBatch", "load", "replaceSegments", "renderAll", "refreshSidebar", "markDirty"].includes(name)
      )
      .map(([name]) => name),
    ["logBatch", "load", "replaceSegments", "renderAll", "refreshSidebar", "markDirty"]
  );
  const output = harness.calls.filter(([name]) => name === "renderOutput").at(-1)[1];
  assert.equal(output.includes("High risk: 1"), true);
  assert.equal(output.includes("secret-token batch failure"), true);
  assert.deepEqual(harness.statuses.at(-1), [
    "Batch AI QA: 1 review comment saved; highest risk high; 1 no issues found; 1 failed; 4 skipped",
    "dirty"
  ]);
  assert.deepEqual(harness.lifecycleStates.at(-1).progress, summary);
  assert.equal(harness.lifecycleStates.at(-1).running, false);
  assert.equal(harness.lifecycleStates.at(-1).promptBusy, false);
});

test("mid-batch AI review cancellation preserves completed comments, stops new work, and saves the partial summary", async () => {
  const { createAiReviewController } = await loadFactory();
  const harness = createHarness(createAiReviewController, {
    reviewImplementation(options) {
      if (options.segment.id === "s1") {
        return Promise.resolve({ reviewText: "High | First issue", provider: "Ollama", model: "review-model" });
      }
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("canceled")));
      });
    }
  });

  const pending = harness.controller.reviewBatch();
  await waitForTurn();
  await waitForTurn();
  assert.equal(harness.controller.cancel(), true);
  const summary = await pending;
  assert.equal(summary.canceled, true);
  assert.equal(summary.commented, 1);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveMany")[1], ["s1"]);
  assert.equal(harness.getSegments()[0].comments.length, 1);
  assert.equal(harness.getSegments()[1].comments.length, 0);
  assert.equal(
    harness.lifecycleStates.some((state) => state.progress?.canceled),
    true
  );
  assert.equal(harness.controller.cancel(), false);
});

test("primary batch AI review persistence failure restores every candidate snapshot and always cleans lifecycle state", async () => {
  const { createAiReviewController } = await loadFactory();
  const saveError = new Error("Atomic review save failed");
  const harness = createHarness(createAiReviewController, {
    saveManyError: saveError,
    reviewImplementation(options) {
      return Promise.resolve({
        reviewText: `High | Issue in ${options.segment.id}`,
        provider: "Ollama",
        model: "review-model"
      });
    }
  });
  const before = structuredClone(harness.getSegments().slice(0, 3));

  assert.equal(await harness.controller.reviewBatch(), false);
  assert.deepEqual(harness.getSegments().slice(0, 3), before);
  assert.deepEqual(
    harness.calls.filter(([name]) => ["restore", "prepareHistory"].includes(name)).map(([name, id]) => [name, id]),
    [
      ["restore", "s1"],
      ["prepareHistory", "s1"],
      ["restore", "no-issues"],
      ["prepareHistory", "no-issues"],
      ["restore", "failed"],
      ["prepareHistory", "failed"]
    ]
  );
  assert.deepEqual(
    harness.calls
      .filter(([name]) => ["renderSegments", "renderProjectProgress", "renderHistory", "renderReview"].includes(name))
      .map(([name]) => name),
    ["renderSegments", "renderProjectProgress", "renderHistory", "renderReview"]
  );
  assert.deepEqual(harness.statuses.at(-1), ["Atomic review save failed", "dirty"]);
  assert.equal(harness.lifecycleStates.at(-1).running, false);
  assert.equal(harness.lifecycleStates.at(-1).promptBusy, false);
});

test("secondary AI review activity failure keeps the saved review durable and visible", async () => {
  const { createAiReviewController } = await loadFactory();
  const harness = createHarness(createAiReviewController, {
    activeActivityError: new Error("Activity unavailable")
  });

  assert.equal(await harness.controller.reviewActive(), true);
  assert.equal(harness.getSegments()[0].comments.length, 1);
  assert.equal(harness.warnings.length, 1);
  assert.equal(harness.warnings[0][0], "AI review activity log failed.");
  assert.equal(harness.calls.filter(([name]) => name === "markDirty").length, 2);
  assert.deepEqual(harness.statuses.at(-1), ["AI review added to the active segment", "saved"]);
});
