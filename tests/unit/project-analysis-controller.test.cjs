const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-analysis-controller.js")).href);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function defaultAnalysis() {
  return {
    generatedAt: "2026-08-21T12:00:00.000Z",
    totals: {
      confirmedPercent: 75,
      untranslated: 2,
      repetitions: 3,
      segments: 20,
      confirmed: 15,
      files: 4,
      words: 900
    },
    leverage: { exact: 6, fuzzy95: 4, fuzzy85: 5 },
    ai: { drafts: 7, suggestionSegments: 8, highRisk: 9 }
  };
}

function createHarness(createProjectAnalysisController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "analysis"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  let project = Object.hasOwn(overrides, "project")
    ? overrides.project
    : { id: "project-1", sourceLang: "en", targetLang: "tr" };
  let segments = overrides.segments || [{ id: "segment-1" }];
  let view = overrides.view ?? "project";
  let hasRoot = overrides.hasRoot ?? true;
  const tmEntries = overrides.tmEntries || [];
  const analysisResult = overrides.analysisResult || defaultAnalysis();
  const presentationState = { meta: undefined, html: undefined };
  const session = {
    getProject() {
      calls.push(["session.getProject", project]);
      fail("session.getProject");
      return project;
    },
    getSegments() {
      calls.push(["session.getSegments", segments]);
      fail("session.getSegments");
      return segments;
    }
  };
  const navigation = {
    getView() {
      calls.push(["navigation.getView", view]);
      fail("navigation.getView");
      return view;
    }
  };
  const tm = {
    listByIndex(store, index, key) {
      calls.push(["tm.listByIndex", store, index, key]);
      fail("tm.listByIndex");
      return overrides.tmPromise || tmEntries;
    }
  };
  const resources = {
    tmNames(value) {
      calls.push(["resources.tmNames", value]);
      fail("resources.tmNames");
      return overrides.tmNames || [];
    }
  };
  const analysis = {
    build(projectValue, segmentValues, tmValues) {
      calls.push(["analysis.build", projectValue, segmentValues, tmValues]);
      fail("analysis.build");
      return analysisResult;
    }
  };
  const date = {
    format(value) {
      calls.push(["date.format", value]);
      fail("date.format");
      return overrides.formattedDate || "21 Aug 2026";
    }
  };
  const localization = {
    label(key, values) {
      calls.push(["localization.label", key, values]);
      fail(`localization.label:${key}`);
      return values ? `label:${key}:${values.date}` : `label:${key}`;
    },
    labelHtml(key) {
      calls.push(["localization.labelHtml", key]);
      fail(`localization.labelHtml:${key}`);
      return `label-html:${key}`;
    },
    sourceHtml(value) {
      calls.push(["localization.sourceHtml", value]);
      fail(`localization.sourceHtml:${value}`);
      return `source-html:${value}`;
    }
  };
  const presentation = {
    hasRoot() {
      calls.push(["presentation.hasRoot", hasRoot]);
      fail("presentation.hasRoot");
      return hasRoot;
    },
    setMeta(value) {
      calls.push(["presentation.setMeta", value]);
      fail("presentation.setMeta");
      presentationState.meta = value;
    },
    replace(value) {
      calls.push(["presentation.replace", value]);
      fail("presentation.replace");
      presentationState.html = value;
    }
  };
  const options = { session, navigation, tm, resources, analysis, date, localization, presentation };
  const controller = createProjectAnalysisController(options);
  return {
    calls,
    controller,
    failure,
    options,
    presentationState,
    setHasRoot(value) {
      hasRoot = value;
    },
    setProject(value) {
      project = value;
    },
    setSegments(value) {
      segments = value;
    },
    setView(value) {
      view = value;
    }
  };
}

test("ProjectAnalysisController preserves no-project, view, and root guard order", async () => {
  const { createProjectAnalysisController } = await loadFactory();
  const noProject = createHarness(createProjectAnalysisController, { project: null });
  assert.equal(await noProject.controller.render(), undefined);
  assert.deepEqual(noProject.calls, [["session.getProject", null]]);

  const wrongView = createHarness(createProjectAnalysisController, { view: "resources" });
  await wrongView.controller.render();
  assert.deepEqual(
    wrongView.calls.map(([name]) => name),
    ["session.getProject", "navigation.getView"]
  );

  const missingRoot = createHarness(createProjectAnalysisController, { hasRoot: false });
  await missingRoot.controller.render();
  assert.deepEqual(
    missingRoot.calls.map(([name]) => name),
    ["session.getProject", "navigation.getView", "presentation.hasRoot"]
  );
});

test("ProjectAnalysisController captures segments and performs the exact language-pair TM query", async () => {
  const { createProjectAnalysisController } = await loadFactory();
  const pending = deferred();
  const project = { id: "project-query", sourceLang: "de-DE", targetLang: "ca-ES" };
  const segments = [{ id: "captured-segment" }];
  const harness = createHarness(createProjectAnalysisController, {
    project,
    segments,
    tmPromise: pending.promise
  });
  const result = harness.controller.render();
  assert.deepEqual(harness.calls, [
    ["session.getProject", project],
    ["navigation.getView", "project"],
    ["presentation.hasRoot", true],
    ["session.getSegments", segments],
    ["tm.listByIndex", "tmEntries", "languagePair", "de-DE::ca-ES"]
  ]);
  pending.resolve([]);
  await result;
});

test("ProjectAnalysisController invalidates a pending render before every early guard", async () => {
  const { createProjectAnalysisController } = await loadFactory();
  const pending = deferred();
  const harness = createHarness(createProjectAnalysisController, { tmPromise: pending.promise });
  const first = harness.controller.render();
  harness.setProject(null);
  await harness.controller.render();
  const callCount = harness.calls.length;
  pending.resolve([]);
  await first;
  assert.equal(harness.calls.length, callCount);
  assert.equal(
    harness.calls.some(([name]) => name === "analysis.build"),
    false
  );
});

test("ProjectAnalysisController suppresses post-query view and strict project identity drift", async () => {
  const { createProjectAnalysisController } = await loadFactory();
  const viewPending = deferred();
  const viewDrift = createHarness(createProjectAnalysisController, { tmPromise: viewPending.promise });
  const first = viewDrift.controller.render();
  viewDrift.setView("projects");
  viewPending.resolve([]);
  await first;
  assert.equal(viewDrift.calls.filter(([name]) => name === "session.getProject").length, 1);
  assert.equal(
    viewDrift.calls.some(([name]) => name === "resources.tmNames"),
    false
  );

  const idPending = deferred();
  const original = { id: 1, sourceLang: "en", targetLang: "tr" };
  const idDrift = createHarness(createProjectAnalysisController, { project: original, tmPromise: idPending.promise });
  const second = idDrift.controller.render();
  idDrift.setProject({ ...original, id: "1" });
  idPending.resolve([]);
  await second;
  assert.equal(idDrift.calls.filter(([name]) => name === "navigation.getView").length, 2);
  assert.equal(idDrift.calls.filter(([name]) => name === "session.getProject").length, 2);
  assert.equal(
    idDrift.calls.some(([name]) => name === "analysis.build"),
    false
  );
});

test("ProjectAnalysisController preserves linked-TM filtering and captured input identities", async () => {
  const { createProjectAnalysisController } = await loadFactory();
  const project = { id: "project-filter", sourceLang: "en", targetLang: "tr" };
  const segments = [{ id: "segment-filter" }];
  const first = { id: "tm-1", tmName: "Main" };
  const excluded = { id: "tm-2", tmName: "Other" };
  const duplicate = { id: "tm-3", tmName: "Main" };
  const harness = createHarness(createProjectAnalysisController, {
    project,
    segments,
    tmEntries: [first, excluded, duplicate],
    tmNames: ["Main", "Main"]
  });
  await harness.controller.render();
  const buildCall = harness.calls.find(([name]) => name === "analysis.build");
  assert.equal(buildCall[1], project);
  assert.equal(buildCall[2], segments);
  assert.deepEqual(buildCall[3], [first, duplicate]);
  assert.equal(buildCall[3][0], first);
  assert.equal(buildCall[3][1], duplicate);
});

test("ProjectAnalysisController composes the exact localized analysis metrics", async () => {
  const { createProjectAnalysisController } = await loadFactory();
  const harness = createHarness(createProjectAnalysisController);
  assert.equal(await harness.controller.render(), undefined);
  assert.equal(harness.presentationState.meta, "label:generatedAt:21 Aug 2026");
  assert.equal(
    harness.presentationState.html,
    `
    <div><strong>75%</strong><span>label-html:confirmed</span></div>
    <div><strong>2</strong><span>source-html:empty targets</span></div>
    <div><strong>3</strong><span>label-html:repetitions</span></div>
    <div><strong>6</strong><span>label-html:exactTm</span></div>
    <div><strong>9</strong><span>label-html:strongFuzzy</span></div>
    <div><strong>5</strong><span>label-html:openSegments</span></div>
    <div><strong>4</strong><span>label-html:files</span></div>
    <div><strong>900</strong><span>label-html:sourceWords</span></div>
    <div><strong>7</strong><span>source-html:AI initiated</span></div>
    <div><strong>8</strong><span>label-html:aiSuggestionRows</span></div>
    <div><strong>9</strong><span>label-html:highAiRisk</span></div>
  `
  );
  assert.deepEqual(
    harness.calls.filter(([name]) => name.startsWith("localization.")).map((call) => call.slice(0, 2)),
    [
      ["localization.label", "generatedAt"],
      ["localization.labelHtml", "confirmed"],
      ["localization.sourceHtml", "empty targets"],
      ["localization.labelHtml", "repetitions"],
      ["localization.labelHtml", "exactTm"],
      ["localization.labelHtml", "strongFuzzy"],
      ["localization.labelHtml", "openSegments"],
      ["localization.labelHtml", "files"],
      ["localization.labelHtml", "sourceWords"],
      ["localization.sourceHtml", "AI initiated"],
      ["localization.labelHtml", "aiSuggestionRows"],
      ["localization.labelHtml", "highAiRisk"]
    ]
  );
});

test("ProjectAnalysisController preserves absent and falsy AI metric fallbacks", async () => {
  const { createProjectAnalysisController } = await loadFactory();
  const result = defaultAnalysis();
  Reflect.deleteProperty(result, "ai");
  const harness = createHarness(createProjectAnalysisController, { analysisResult: result });
  await harness.controller.render();
  assert.match(harness.presentationState.html, /<strong>0<\/strong><span>source-html:AI initiated/);
  assert.match(harness.presentationState.html, /<strong>0<\/strong><span>label-html:aiSuggestionRows/);
  assert.match(harness.presentationState.html, /<strong>0<\/strong><span>label-html:highAiRisk/);
});

test("ProjectAnalysisController preserves query rejection and pre-analysis failure timing", async () => {
  const { createProjectAnalysisController } = await loadFactory();
  for (const failAt of [
    "session.getProject",
    "navigation.getView",
    "presentation.hasRoot",
    "session.getSegments",
    "tm.listByIndex"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createProjectAnalysisController, { failAt, failure });
    await assert.rejects(harness.controller.render(), failure);
    assert.equal(
      harness.calls.some(([name]) => name === "analysis.build"),
      false
    );
  }

  const rejection = new Error("TM lookup rejected");
  const harness = createHarness(createProjectAnalysisController, { tmPromise: Promise.reject(rejection) });
  await assert.rejects(harness.controller.render(), rejection);
  assert.equal(harness.calls.filter(([name]) => name === "navigation.getView").length, 1);
});

test("ProjectAnalysisController preserves post-query analysis and presentation failure timing", async () => {
  const { createProjectAnalysisController } = await loadFactory();
  for (const failAt of [
    "resources.tmNames",
    "analysis.build",
    "date.format",
    "localization.label:generatedAt",
    "presentation.setMeta",
    "localization.labelHtml:confirmed",
    "presentation.replace"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createProjectAnalysisController, { failAt, failure });
    await assert.rejects(harness.controller.render(), failure);
    const replaceCalls = harness.calls.filter(([name]) => name === "presentation.replace").length;
    assert.equal(replaceCalls, failAt === "presentation.replace" ? 1 : 0);
  }
});

test("ProjectAnalysisController validates every boundary and exposes an immutable API", async () => {
  const { createProjectAnalysisController } = await loadFactory();
  const valid = createHarness(createProjectAnalysisController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["render"]);
  const invalid = [
    undefined,
    {},
    { ...valid.options, session: { ...valid.options.session, getProject: null } },
    { ...valid.options, session: { ...valid.options.session, getSegments: null } },
    { ...valid.options, navigation: { getView: null } },
    { ...valid.options, tm: { listByIndex: null } },
    { ...valid.options, resources: { tmNames: null } },
    { ...valid.options, analysis: { build: null } },
    { ...valid.options, date: { format: null } },
    { ...valid.options, localization: { ...valid.options.localization, label: null } },
    { ...valid.options, localization: { ...valid.options.localization, labelHtml: null } },
    { ...valid.options, localization: { ...valid.options.localization, sourceHtml: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, hasRoot: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, setMeta: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, replace: null } }
  ];
  invalid.forEach((options) => {
    assert.throws(() => createProjectAnalysisController(options), /ProjectAnalysisController requires/);
  });
});
