const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/quality/quality-workbench-controller.js")).href);
}

function createHarness(createQualityWorkbenchController, overrides = {}) {
  const calls = [];
  const project = { id: "p1", qualityProfile: { standard: "balanced" } };
  const segments = [
    { id: "s1", documentId: "d1" },
    { id: "s2", documentId: "d2" },
    { id: "s3", documentId: "d2" }
  ];
  const qaChecks = [
    { id: "q1", segmentId: "s1" },
    { id: "q2", segmentId: "s1" },
    { id: "q3", segmentId: "s2" }
  ];
  let activeIndex = overrides.activeIndex ?? 0;
  let currentProject = overrides.noProject ? null : project;
  let riskQueue = overrides.riskQueue === undefined ? null : overrides.riskQueue;
  let selectedDocumentId = overrides.selectedDocumentId || "";
  const builtQueue = overrides.builtQueue || {
    projectId: "p1",
    items: [{ segmentId: "s2", score: 5 }]
  };
  let lastWorkbenchViewModel = null;
  let lastScoreOptions = null;

  const options = {
    session: {
      getProject: () => {
        calls.push(["getProject"]);
        return currentProject;
      },
      getSegments: () => {
        calls.push(["getSegments"]);
        return segments;
      },
      getQaChecks: () => {
        calls.push(["getQaChecks"]);
        return qaChecks;
      },
      getQualityRiskQueue: () => {
        calls.push(["getQualityRiskQueue"]);
        return riskQueue;
      },
      replaceQualityRiskQueue: (queue) => {
        calls.push(["replaceQualityRiskQueue", queue]);
        riskQueue = queue;
      }
    },
    scope: {
      currentSegments: () => {
        calls.push(["currentSegments"]);
        return segments.slice(0, 2);
      }
    },
    selection: {
      getSegment: () => {
        calls.push(["getSegment"]);
        return overrides.noSegment ? null : segments[activeIndex] || null;
      },
      getActiveIndex: () => {
        calls.push(["getActiveIndex"]);
        return activeIndex;
      }
    },
    quality: {
      buildRiskQueue: (buildOptions) => {
        calls.push(["buildRiskQueue", buildOptions]);
        if (overrides.buildError) throw overrides.buildError;
        return builtQueue;
      },
      scoreSegment: (segment, index, scoreOptions) => {
        calls.push(["scoreSegment", segment.id, index, scoreOptions]);
        lastScoreOptions = scoreOptions;
        return overrides.scoredEvidence || { segmentId: segment.id, score: 3 };
      }
    },
    documents: {
      getSelectedId: () => {
        calls.push(["getSelectedDocumentId"]);
        return selectedDocumentId;
      },
      clearSelection: () => {
        calls.push(["clearDocumentSelection"]);
        selectedDocumentId = "";
      }
    },
    filters: {
      matches: (segment) => {
        calls.push(["matches", segment.id]);
        return overrides.hiddenSegmentIds ? !overrides.hiddenSegmentIds.includes(segment.id) : true;
      },
      reset: () => calls.push(["resetFilters"])
    },
    qa: {
      run: () => {
        calls.push(["runQa"]);
        if (overrides.qaError) throw overrides.qaError;
        return overrides.qaResult === undefined ? qaChecks : overrides.qaResult;
      }
    },
    navigation: {
      select: (index) => {
        calls.push(["select", index]);
        if (overrides.navigationError) throw overrides.navigationError;
        activeIndex = index;
      }
    },
    presentation: {
      renderSegments: () => calls.push(["renderSegments"]),
      renderWorkbench: (viewModel) => {
        calls.push(["renderWorkbench", viewModel]);
        lastWorkbenchViewModel = viewModel;
        if (overrides.presentationError) throw overrides.presentationError;
        return overrides.renderResult;
      }
    },
    focus: { target: () => calls.push(["focusTarget"]) },
    status: { set: (message, mode) => calls.push(["status", message, mode]) }
  };
  if (overrides.invalidBoundary === "session") options.session.getProject = null;
  if (overrides.invalidBoundary === "quality") options.quality.scoreSegment = null;
  if (overrides.invalidBoundary === "filters") options.filters.reset = null;
  if (overrides.invalidBoundary === "effects") options.presentation.renderWorkbench = null;

  return {
    calls,
    controller: createQualityWorkbenchController(options),
    getActiveIndex: () => activeIndex,
    getLastScoreOptions: () => lastScoreOptions,
    getLastWorkbenchViewModel: () => lastWorkbenchViewModel,
    getRiskQueue: () => riskQueue,
    project,
    qaChecks,
    segments,
    setProject: (nextProject) => {
      currentProject = nextProject;
    },
    setRiskQueue: (queue) => {
      riskQueue = queue;
    }
  };
}

test("QualityWorkbenchController groups QA checks and builds the exact current-scope risk queue", async () => {
  const { createQualityWorkbenchController } = await loadFactory();
  const harness = createHarness(createQualityWorkbenchController);
  const explicitChecks = [
    { id: "a", segmentId: "s2" },
    { id: "missing" },
    { id: "b", segmentId: "s2" },
    { id: "c", segmentId: "s1" }
  ];
  const grouped = harness.controller.qaBySegment(explicitChecks);
  assert.deepEqual(
    [...grouped],
    [
      ["s2", [explicitChecks[0], explicitChecks[2]]],
      ["s1", [explicitChecks[3]]]
    ]
  );

  const queue = harness.controller.buildQueue(explicitChecks);
  assert.equal(queue, harness.getRiskQueue() || queue);
  const buildOptions = harness.calls.find(([name]) => name === "buildRiskQueue")[1];
  assert.equal(buildOptions.project, harness.project);
  assert.deepEqual(buildOptions.segments, harness.segments.slice(0, 2));
  assert.equal(buildOptions.qaChecks, explicitChecks);
  assert.equal(buildOptions.profile, harness.project.qualityProfile);

  const defaultChecks = createHarness(createQualityWorkbenchController);
  defaultChecks.controller.buildQueue();
  assert.ok(defaultChecks.calls.some(([name]) => name === "getQaChecks"));

  const noProject = createHarness(createQualityWorkbenchController, { noProject: true });
  assert.equal(noProject.controller.buildQueue(explicitChecks), null);
  assert.equal(
    noProject.calls.some(([name]) => name === "buildRiskQueue"),
    false
  );
});

test("QualityWorkbenchController preserves queued evidence precedence and score fallback inputs", async () => {
  const { createQualityWorkbenchController } = await loadFactory();
  const queuedItem = { segmentId: "s1", score: 9 };
  const queued = createHarness(createQualityWorkbenchController);
  assert.equal(queued.controller.evidence({ items: [queuedItem] }), queuedItem);
  assert.equal(
    queued.calls.some(([name]) => name === "scoreSegment"),
    false
  );

  const scoredEvidence = { segmentId: "s1", score: 4 };
  const fallback = createHarness(createQualityWorkbenchController, { scoredEvidence });
  assert.equal(fallback.controller.evidence({ items: [] }), scoredEvidence);
  const scoreCall = fallback.calls.find(([name]) => name === "scoreSegment");
  assert.deepEqual(scoreCall.slice(1, 3), ["s1", 0]);
  assert.equal(fallback.getLastScoreOptions().profile, fallback.project.qualityProfile);
  assert.deepEqual([...fallback.getLastScoreOptions().qaBySegment.keys()], ["s1", "s2"]);

  const noSegment = createHarness(createQualityWorkbenchController, { noSegment: true });
  assert.equal(noSegment.controller.evidence(), null);
  const noProject = createHarness(createQualityWorkbenchController, { noProject: true });
  assert.equal(noProject.controller.evidence(), null);
});

test("QualityWorkbenchController preserves cache validation, replacement timing, and workbench view model", async () => {
  const { createQualityWorkbenchController } = await loadFactory();
  const cachedQueue = { projectId: "p1", items: [{ segmentId: "s1", score: 8 }] };
  const cached = createHarness(createQualityWorkbenchController, {
    renderResult: "rendered",
    riskQueue: cachedQueue
  });
  assert.equal(cached.controller.render(), undefined);
  assert.equal(
    cached.calls.some(([name]) => name === "buildRiskQueue"),
    false
  );
  assert.ok(cached.calls.some(([name, queue]) => name === "replaceQualityRiskQueue" && queue === cachedQueue));
  assert.deepEqual(cached.getLastWorkbenchViewModel(), {
    project: cached.project,
    segment: cached.segments[0],
    activeIndex: 0,
    profile: cached.project.qualityProfile,
    queue: cachedQueue,
    evidence: cachedQueue.items[0]
  });

  const stale = createHarness(createQualityWorkbenchController, {
    riskQueue: { projectId: "old", items: [] }
  });
  stale.controller.render();
  assert.ok(stale.calls.some(([name]) => name === "buildRiskQueue"));
  assert.equal(stale.getRiskQueue().projectId, "p1");

  const noProject = createHarness(createQualityWorkbenchController, { noProject: true });
  noProject.controller.render();
  assert.equal(
    noProject.calls.some(([name]) => name === "replaceQualityRiskQueue"),
    false
  );
  assert.equal(noProject.getLastWorkbenchViewModel().project, null);
  assert.equal(noProject.getLastWorkbenchViewModel().queue, null);
  assert.equal(noProject.getLastWorkbenchViewModel().evidence, null);
});

test("QualityWorkbenchController refresh preserves project and QA early returns, replacement, rendering, and result", async () => {
  const { createQualityWorkbenchController } = await loadFactory();
  const noProject = createHarness(createQualityWorkbenchController, { noProject: true });
  assert.equal(await noProject.controller.refresh(), null);
  assert.equal(
    noProject.calls.some(([name]) => name === "runQa"),
    false
  );

  const noChecks = createHarness(createQualityWorkbenchController, { qaResult: null });
  assert.equal(await noChecks.controller.refresh(), null);
  assert.equal(
    noChecks.calls.some(([name]) => name === "replaceQualityRiskQueue"),
    false
  );

  const success = createHarness(createQualityWorkbenchController);
  assert.equal(await success.controller.refresh(), success.getRiskQueue());
  const names = success.calls.map(([name]) => name);
  assert.ok(names.indexOf("runQa") < names.indexOf("buildRiskQueue"));
  assert.ok(names.indexOf("buildRiskQueue") < names.indexOf("replaceQualityRiskQueue"));
  assert.ok(names.indexOf("replaceQualityRiskQueue") < names.indexOf("renderWorkbench"));
});

test("QualityWorkbenchController opens visible risks after awaited selection, rerender, and focus", async () => {
  const { createQualityWorkbenchController } = await loadFactory();
  const harness = createHarness(createQualityWorkbenchController);
  assert.equal(await harness.controller.openRisk({ segmentId: "s2" }), undefined);
  assert.equal(harness.getActiveIndex(), 1);
  assert.deepEqual(
    harness.calls
      .filter(([name]) => ["matches", "select", "renderSegments", "focusTarget"].includes(name))
      .map(([name]) => name),
    ["matches", "select", "renderSegments", "focusTarget"]
  );

  const missing = createHarness(createQualityWorkbenchController);
  await missing.controller.openRisk({ segmentId: "missing" });
  assert.equal(
    missing.calls.some(([name]) => name === "matches"),
    false
  );
});

test("QualityWorkbenchController restores hidden risk scope before selection and preserves document policy", async () => {
  const { createQualityWorkbenchController } = await loadFactory();
  const hidden = createHarness(createQualityWorkbenchController, {
    hiddenSegmentIds: ["s2"],
    selectedDocumentId: "d1"
  });
  await hidden.controller.openRisk({ segmentId: "s2" });
  assert.deepEqual(
    hidden.calls
      .filter(([name]) =>
        [
          "matches",
          "getSelectedDocumentId",
          "clearDocumentSelection",
          "resetFilters",
          "renderSegments",
          "select",
          "focusTarget"
        ].includes(name)
      )
      .map(([name]) => name),
    [
      "matches",
      "getSelectedDocumentId",
      "getSelectedDocumentId",
      "clearDocumentSelection",
      "resetFilters",
      "renderSegments",
      "select",
      "renderSegments",
      "focusTarget"
    ]
  );

  const sameDocument = createHarness(createQualityWorkbenchController, {
    hiddenSegmentIds: ["s2"],
    selectedDocumentId: "d2"
  });
  await sameDocument.controller.openRisk({ segmentId: "s2" });
  assert.equal(
    sameDocument.calls.some(([name]) => name === "clearDocumentSelection"),
    false
  );
  assert.ok(sameDocument.calls.some(([name]) => name === "resetFilters"));
});

test("QualityWorkbenchController next risk preserves cache rebuild, after-active order, wraparound, and empty status", async () => {
  const { createQualityWorkbenchController } = await loadFactory();
  const afterActive = createHarness(createQualityWorkbenchController, {
    activeIndex: 0,
    riskQueue: {
      projectId: "p1",
      items: [{ segmentId: "s3" }, { segmentId: "missing" }, { segmentId: "s2" }, { segmentId: "s1" }]
    }
  });
  await afterActive.controller.nextRisk();
  assert.equal(afterActive.getActiveIndex(), 1);

  const wrap = createHarness(createQualityWorkbenchController, {
    activeIndex: 2,
    riskQueue: { projectId: "p1", items: [{ segmentId: "s2" }, { segmentId: "s1" }] }
  });
  await wrap.controller.nextRisk();
  assert.equal(wrap.getActiveIndex(), 0);

  const stale = createHarness(createQualityWorkbenchController, {
    riskQueue: { projectId: "old", items: [] }
  });
  await stale.controller.nextRisk();
  assert.ok(stale.calls.some(([name]) => name === "buildRiskQueue"));

  const empty = createHarness(createQualityWorkbenchController, {
    riskQueue: { projectId: "p1", items: [] }
  });
  await empty.controller.nextRisk();
  assert.ok(
    empty.calls.some(
      ([name, message, mode]) => name === "status" && message === "No quality risks in this scope" && mode === "saved"
    )
  );
  assert.equal(
    empty.calls.some(([name]) => name === "select"),
    false
  );

  const noProject = createHarness(createQualityWorkbenchController, { noProject: true });
  assert.equal(await noProject.controller.nextRisk(), undefined);
  assert.equal(
    noProject.calls.some(([name]) => name === "getQualityRiskQueue"),
    false
  );
});

test("QualityWorkbenchController validates boundaries, propagates failures, and exposes an immutable API", async () => {
  const { createQualityWorkbenchController } = await loadFactory();
  for (const invalidBoundary of ["session", "quality", "filters", "effects"]) {
    assert.throws(
      () => createHarness(createQualityWorkbenchController, { invalidBoundary }),
      /QualityWorkbenchController requires/
    );
  }
  assert.equal(Object.isFrozen(createHarness(createQualityWorkbenchController).controller), true);

  const presentationError = new Error("presentation unavailable");
  const failingPresentation = createHarness(createQualityWorkbenchController, {
    presentationError,
    riskQueue: { projectId: "p1", items: [] }
  });
  assert.throws(() => failingPresentation.controller.render(), presentationError);

  const qaError = new Error("QA unavailable");
  const failingQa = createHarness(createQualityWorkbenchController, { qaError });
  await assert.rejects(() => failingQa.controller.refresh(), qaError);

  const navigationError = new Error("navigation unavailable");
  const failingNavigation = createHarness(createQualityWorkbenchController, { navigationError });
  await assert.rejects(() => failingNavigation.controller.openRisk({ segmentId: "s2" }), navigationError);
  assert.equal(
    failingNavigation.calls.some(([name]) => name === "renderSegments"),
    false
  );
  assert.equal(
    failingNavigation.calls.some(([name]) => name === "focusTarget"),
    false
  );
});
