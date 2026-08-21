const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-summary-controller.js")).href);
}

function createHarness(createProjectSummaryController, overrides = {}) {
  const calls = [];
  let replaced;
  const fail = (name) => {
    if (overrides[`${name}Error`]) throw overrides[`${name}Error`];
  };
  const options = {
    session: {
      getProject() {
        calls.push(["getProject"]);
        fail("current");
        return overrides.current === undefined ? null : overrides.current;
      },
      getProjects() {
        calls.push(["getProjects"]);
        fail("projects");
        return overrides.projects === undefined ? [] : overrides.projects;
      },
      getProjectSummaries() {
        calls.push(["getProjectSummaries"]);
        fail("summaries");
        return overrides.summaries === undefined ? [] : overrides.summaries;
      },
      getProjectSummaryRevision(projectId) {
        calls.push(["getProjectSummaryRevision", projectId]);
        fail("revision");
        if (typeof overrides.getRevision === "function") return overrides.getRevision(projectId);
        return overrides.revisions?.[projectId] ?? overrides.revision ?? 0;
      },
      getSegments() {
        calls.push(["getSegments"]);
        fail("sessionSegments");
        return overrides.sessionSegments === undefined ? [] : overrides.sessionSegments;
      },
      replaceProjectSummaries(projectSummaries) {
        calls.push(["replaceProjectSummaries", projectSummaries]);
        fail("replace");
        replaced = projectSummaries;
        return overrides.replaceResult;
      }
    },
    segments: {
      list(projectId) {
        calls.push(["listSegments", projectId]);
        fail("listSegments");
        if (typeof overrides.listSegments === "function") return overrides.listSegments(projectId);
        return overrides.segmentLists?.[projectId] ?? [];
      }
    },
    progress: {
      project(projectSegments) {
        calls.push(["projectProgress", projectSegments]);
        fail("progress");
        if (typeof overrides.projectProgress === "function") return overrides.projectProgress(projectSegments);
        return (
          overrides.progressResult ?? {
            total: projectSegments.length,
            confirmed: 0,
            draft: 0,
            words: projectSegments.length * 10,
            percent: 0
          }
        );
      }
    },
    search: {
      build(project) {
        calls.push(["buildSearch", project]);
        fail("search");
        return typeof overrides.buildSearch === "function"
          ? overrides.buildSearch(project)
          : `search:${project.name || project.id}`;
      }
    },
    language: {
      key(project) {
        calls.push(["languageKey", project]);
        fail("language");
        return typeof overrides.languageKey === "function" ? overrides.languageKey(project) : `pair:${project.id}`;
      }
    },
    presentation: {
      renderLanguageFilter() {
        calls.push(["renderLanguageFilter"]);
        fail("renderLanguageFilter");
        return overrides.languageRenderResult;
      },
      renderProjects() {
        calls.push(["renderProjects"]);
        fail("renderProjects");
        return overrides.projectsRenderResult;
      }
    }
  };

  return {
    calls,
    options,
    getReplaced: () => replaced,
    controller: createProjectSummaryController(options)
  };
}

test("ProjectSummaryController builds a fresh copied record with exact policy order and precedence", async () => {
  const { createProjectSummaryController } = await loadFactory();
  const projectSegments = [{ id: "segment-1" }];
  const projectProgress = { total: 1, confirmed: 0, draft: 1, words: 17, percent: 0 };
  const project = {
    id: "project-1",
    name: "Project",
    progress: "project-progress",
    wordCount: -1,
    searchText: "project-search",
    languagePairKey: "project-pair",
    summaryRevision: -1
  };
  const harness = createHarness(createProjectSummaryController, {
    revision: 7,
    progressResult: projectProgress,
    buildSearch: () => "fresh-search",
    languageKey: () => "en::tr"
  });

  const summary = harness.controller.build(project, projectSegments);

  assert.notEqual(summary, project);
  assert.deepEqual(project, {
    id: "project-1",
    name: "Project",
    progress: "project-progress",
    wordCount: -1,
    searchText: "project-search",
    languagePairKey: "project-pair",
    summaryRevision: -1
  });
  assert.deepEqual(summary, {
    id: "project-1",
    name: "Project",
    progress: projectProgress,
    wordCount: 17,
    searchText: "fresh-search",
    languagePairKey: "en::tr",
    summaryRevision: 7
  });
  assert.deepEqual(harness.calls, [
    ["getProjectSummaryRevision", "project-1"],
    ["projectProgress", projectSegments],
    ["buildSearch", project],
    ["languageKey", project]
  ]);

  harness.calls.length = 0;
  assert.equal(harness.controller.build(project, projectSegments, 11).summaryRevision, 11);
  assert.deepEqual(harness.calls, [
    ["projectProgress", projectSegments],
    ["buildSearch", project],
    ["languageKey", project]
  ]);
});

test("ProjectSummaryController summarizes supplied arrays and asynchronously falls back for every non-array", async () => {
  const { createProjectSummaryController } = await loadFactory();
  const project = { id: "project-1", name: "Project" };
  const supplied = [{ id: "supplied" }];
  const stored = [{ id: "stored" }];
  const harness = createHarness(createProjectSummaryController, {
    revision: 3,
    segmentLists: { "project-1": stored }
  });

  const suppliedSummary = await harness.controller.summarize(project, supplied);
  assert.equal(suppliedSummary.summaryRevision, 3);
  assert.equal(suppliedSummary.progress.total, 1);
  assert.deepEqual(harness.calls, [
    ["getProjectSummaryRevision", "project-1"],
    ["projectProgress", supplied],
    ["buildSearch", project],
    ["languageKey", project]
  ]);

  harness.calls.length = 0;
  const storedSummary = await harness.controller.summarize(project, { not: "an array" }, 9);
  assert.equal(storedSummary.summaryRevision, 9);
  assert.deepEqual(harness.calls, [
    ["listSegments", "project-1"],
    ["projectProgress", stored],
    ["buildSearch", project],
    ["languageKey", project]
  ]);
});

test("ProjectSummaryController reuses the last valid duplicate cache record and retains cached progress", async () => {
  const { createProjectSummaryController } = await loadFactory();
  const oldProgress = { total: 99 };
  const cachedProgress = { total: 4, confirmed: 2, words: 88 };
  const project = {
    id: "project-1",
    name: "Live name",
    updatedAt: "same",
    progress: "live-progress",
    wordCount: -1,
    searchText: "live-search",
    languagePairKey: "live-pair",
    summaryRevision: -1,
    liveOnly: true
  };
  const lastCached = {
    id: "project-1",
    name: "Cached name",
    updatedAt: "same",
    progress: cachedProgress,
    wordCount: 88,
    searchText: "cached-search",
    languagePairKey: "cached-pair",
    summaryRevision: 4,
    cachedOnly: true
  };
  const harness = createHarness(createProjectSummaryController, {
    projects: [project],
    summaries: [{ ...lastCached, progress: oldProgress, wordCount: 1 }, lastCached],
    revisions: { "project-1": 4 },
    currentError: new Error("current project must not be read"),
    progressError: new Error("progress must not be rebuilt"),
    listSegmentsError: new Error("segments must not be loaded"),
    buildSearch: () => "fresh-search",
    languageKey: () => "fresh-pair"
  });

  assert.equal(await harness.controller.refresh(), undefined);
  const [summary] = harness.getReplaced();
  assert.equal(summary.name, "Live name");
  assert.equal(summary.progress, cachedProgress);
  assert.equal(summary.wordCount, 88);
  assert.equal(summary.searchText, "fresh-search");
  assert.equal(summary.languagePairKey, "fresh-pair");
  assert.equal(summary.summaryRevision, 4);
  assert.equal(summary.cachedOnly, true);
  assert.equal(summary.liveOnly, true);
  assert.deepEqual(harness.calls, [
    ["getProjectSummaries"],
    ["getProjects"],
    ["getProjectSummaryRevision", "project-1"],
    ["buildSearch", project],
    ["languageKey", project],
    ["replaceProjectSummaries", harness.getReplaced()],
    ["renderLanguageFilter"],
    ["renderProjects"]
  ]);
});

test("ProjectSummaryController uses strict updatedAt and revision cache checks", async () => {
  const { createProjectSummaryController } = await loadFactory();

  for (const [project, cached, revision] of [
    [
      { id: "project-1", name: "Project", updatedAt: 7 },
      { id: "project-1", updatedAt: "7", summaryRevision: 2, progress: { total: 99 }, wordCount: 99 },
      2
    ],
    [
      { id: "project-1", name: "Project", updatedAt: "same" },
      { id: "project-1", updatedAt: "same", summaryRevision: "2", progress: { total: 99 }, wordCount: 99 },
      2
    ]
  ]) {
    const sessionSegments = [{ id: "live" }];
    const harness = createHarness(createProjectSummaryController, {
      projects: [project],
      summaries: [cached],
      revision,
      current: { id: "project-1" },
      sessionSegments
    });

    await harness.controller.refresh();
    assert.equal(harness.getReplaced()[0].progress.total, 1);
    assert.equal(harness.getReplaced()[0].wordCount, 10);
    assert.deepEqual(
      harness.calls.filter(([name]) => ["getProject", "getSegments", "listSegments"].includes(name)),
      [["getProject"], ["getSegments"]]
    );
  }
});

test("ProjectSummaryController starts repository fallbacks concurrently and preserves project order", async () => {
  const { createProjectSummaryController } = await loadFactory();
  let resolveFirst;
  let resolveSecond;
  const firstSegments = [{ id: "first-segment" }];
  const secondSegments = [{ id: "second-segment" }, { id: "second-segment-2" }];
  const pending = {
    first: new Promise((resolve) => {
      resolveFirst = resolve;
    }),
    second: new Promise((resolve) => {
      resolveSecond = resolve;
    })
  };
  const projects = [
    { id: "first", name: "First" },
    { id: "second", name: "Second" }
  ];
  const harness = createHarness(createProjectSummaryController, {
    projects,
    listSegments: (projectId) => pending[projectId]
  });

  const refreshPromise = harness.controller.refresh();
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "listSegments"),
    [
      ["listSegments", "first"],
      ["listSegments", "second"]
    ]
  );
  assert.equal(harness.getReplaced(), undefined);

  resolveSecond(secondSegments);
  await Promise.resolve();
  assert.equal(harness.getReplaced(), undefined);
  resolveFirst(firstSegments);
  await refreshPromise;

  assert.deepEqual(
    harness.getReplaced().map((summary) => summary.id),
    ["first", "second"]
  );
  assert.deepEqual(
    harness.getReplaced().map((summary) => summary.progress.total),
    [1, 2]
  );
  assert.deepEqual(harness.calls.slice(-3), [
    ["replaceProjectSummaries", harness.getReplaced()],
    ["renderLanguageFilter"],
    ["renderProjects"]
  ]);
});

test("ProjectSummaryController replaces an empty list before ordered presentation and returns undefined", async () => {
  const { createProjectSummaryController } = await loadFactory();
  const harness = createHarness(createProjectSummaryController);

  assert.equal(await harness.controller.refresh(), undefined);
  assert.deepEqual(harness.getReplaced(), []);
  assert.deepEqual(harness.calls, [
    ["getProjectSummaries"],
    ["getProjects"],
    ["replaceProjectSummaries", harness.getReplaced()],
    ["renderLanguageFilter"],
    ["renderProjects"]
  ]);
});

test("ProjectSummaryController preserves default-argument getter timing", async () => {
  const { createProjectSummaryController } = await loadFactory();
  const idFailure = new Error("project ID failed");
  const calls = [];
  const project = { name: "Project" };
  Object.defineProperty(project, "id", {
    enumerable: true,
    get() {
      calls.push("id");
      throw idFailure;
    }
  });
  const harness = createHarness(createProjectSummaryController, {
    projectProgress: () => {
      calls.push("progress");
      return { words: 1 };
    },
    buildSearch: () => {
      calls.push("search");
      return "search";
    },
    languageKey: () => {
      calls.push("language");
      return "pair";
    }
  });

  assert.throws(() => harness.controller.build(project, []), idFailure);
  assert.deepEqual(calls, ["id"]);
  assert.deepEqual(harness.calls, []);

  calls.length = 0;
  assert.throws(() => harness.controller.build(project, [], 4), idFailure);
  assert.deepEqual(calls, ["progress", "search", "id"]);

  calls.length = 0;
  harness.calls.length = 0;
  await assert.rejects(harness.controller.summarize(project, []), idFailure);
  assert.deepEqual(calls, ["id"]);
  assert.deepEqual(harness.calls, []);
});

test("ProjectSummaryController preserves dependency and presentation failure timing", async () => {
  const { createProjectSummaryController } = await loadFactory();
  const project = { id: "project-1", name: "Project" };
  const stages = [
    ["summaries", { summariesError: new Error("summaries failed") }, [["getProjectSummaries"]]],
    ["projects", { projectsError: new Error("projects failed") }, [["getProjectSummaries"], ["getProjects"]]],
    [
      "revision",
      { projects: [project], revisionError: new Error("revision failed") },
      [["getProjectSummaries"], ["getProjects"], ["getProjectSummaryRevision", "project-1"]]
    ],
    [
      "listSegments",
      { projects: [project], listSegmentsError: new Error("segments failed") },
      [
        ["getProjectSummaries"],
        ["getProjects"],
        ["getProjectSummaryRevision", "project-1"],
        ["getProject"],
        ["listSegments", "project-1"]
      ]
    ]
  ];

  for (const [failureName, overrides, expectedCalls] of stages) {
    const harness = createHarness(createProjectSummaryController, overrides);
    await assert.rejects(harness.controller.refresh(), overrides[`${failureName}Error`]);
    assert.deepEqual(harness.calls, expectedCalls);
    assert.equal(harness.getReplaced(), undefined);
  }

  const presentationStages = [
    ["replace", { replaceError: new Error("replace failed") }, []],
    [
      "renderLanguageFilter",
      { renderLanguageFilterError: new Error("language render failed") },
      ["replaceProjectSummaries"]
    ],
    [
      "renderProjects",
      { renderProjectsError: new Error("projects render failed") },
      ["replaceProjectSummaries", "renderLanguageFilter"]
    ]
  ];
  for (const [failureName, overrides, completedCalls] of presentationStages) {
    const harness = createHarness(createProjectSummaryController, overrides);
    await assert.rejects(harness.controller.refresh(), overrides[`${failureName}Error`]);
    assert.deepEqual(
      harness.calls
        .map(([name]) => name)
        .filter((name) => ["replaceProjectSummaries", "renderLanguageFilter", "renderProjects"].includes(name))
        .slice(0, -1),
      completedCalls
    );
    assert.equal(harness.calls.at(-1)[0], failureName === "replace" ? "replaceProjectSummaries" : failureName);
  }
});

test("ProjectSummaryController preserves direct malformed collection and record failures", async () => {
  const { createProjectSummaryController } = await loadFactory();
  for (const [overrides, expectedCalls] of [
    [{ summaries: null }, [["getProjectSummaries"]]],
    [{ summaries: [null] }, [["getProjectSummaries"]]],
    [{ projects: null }, [["getProjectSummaries"], ["getProjects"]]],
    [{ projects: [null] }, [["getProjectSummaries"], ["getProjects"]]]
  ]) {
    const harness = createHarness(createProjectSummaryController, overrides);
    await assert.rejects(harness.controller.refresh(), TypeError);
    assert.deepEqual(harness.calls, expectedCalls);
  }
});

test("ProjectSummaryController validates every boundary and exposes an immutable API", async () => {
  const { createProjectSummaryController } = await loadFactory();
  const valid = createHarness(createProjectSummaryController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["build", "summarize", "refresh"]);

  const invalidOptions = [
    undefined,
    {},
    { ...valid.options, session: { ...valid.options.session, getProject: null } },
    { ...valid.options, session: { ...valid.options.session, getProjects: null } },
    { ...valid.options, session: { ...valid.options.session, getProjectSummaries: null } },
    { ...valid.options, session: { ...valid.options.session, getProjectSummaryRevision: null } },
    { ...valid.options, session: { ...valid.options.session, getSegments: null } },
    { ...valid.options, session: { ...valid.options.session, replaceProjectSummaries: null } },
    { ...valid.options, segments: { list: null } },
    { ...valid.options, progress: { project: null } },
    { ...valid.options, search: { build: null } },
    { ...valid.options, language: { key: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, renderLanguageFilter: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, renderProjects: null } }
  ];
  invalidOptions.forEach((options) => {
    assert.throws(() => createProjectSummaryController(options), /ProjectSummaryController requires/);
  });
});
