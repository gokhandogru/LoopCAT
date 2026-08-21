const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-document-open-controller.js")).href);
}

function createHarness(createProjectDocumentOpenController, overrides = {}) {
  const calls = [];
  let projectReadIndex = 0;
  let segmentReadIndex = 0;
  const fail = (name) => {
    if (overrides[`${name}Error`]) throw overrides[`${name}Error`];
  };
  const options = {
    session: {
      getProject() {
        calls.push(["session.getProject"]);
        fail("project");
        if (Array.isArray(overrides.projectReads)) {
          const index = Math.min(projectReadIndex, overrides.projectReads.length - 1);
          projectReadIndex += 1;
          return overrides.projectReads[index];
        }
        return overrides.project === undefined ? { id: "project" } : overrides.project;
      },
      getSegments() {
        calls.push(["session.getSegments"]);
        fail(segmentReadIndex === 0 ? "firstSegments" : "secondSegments");
        if (Array.isArray(overrides.segmentReads)) {
          const index = Math.min(segmentReadIndex, overrides.segmentReads.length - 1);
          segmentReadIndex += 1;
          return overrides.segmentReads[index];
        }
        segmentReadIndex += 1;
        return overrides.segments === undefined ? [] : overrides.segments;
      }
    },
    navigation: {
      openEditor(selection) {
        calls.push(["navigation.openEditor", selection]);
        fail("navigation");
        return overrides.navigationResult;
      }
    },
    presentation: {
      renderAll() {
        calls.push(["presentation.renderAll"]);
        fail("presentation");
        return overrides.presentationResult;
      }
    },
    context: {
      refreshEditor() {
        calls.push(["context.refreshEditor"]);
        fail("context");
        return overrides.contextResult;
      }
    }
  };

  return { calls, options, controller: createProjectDocumentOpenController(options) };
}

test("ProjectDocumentOpenController preserves the absent-project guard", async () => {
  const { createProjectDocumentOpenController } = await loadFactory();
  for (const project of [null, undefined, false, 0, ""]) {
    const harness = createHarness(createProjectDocumentOpenController, {
      projectReads: [project],
      firstSegmentsError: new Error("segments must not be read"),
      navigationError: new Error("navigation must not run"),
      presentationError: new Error("presentation must not run"),
      contextError: new Error("context must not run")
    });
    assert.equal(await harness.controller.open("document"), undefined);
    assert.deepEqual(harness.calls, [["session.getProject"]]);
  }
});

test("ProjectDocumentOpenController preserves the first matching segment and live navigation reads", async () => {
  const { createProjectDocumentOpenController } = await loadFactory();
  const guardedProject = { id: "guarded-project" };
  const navigationProject = { id: "navigation-project" };
  const firstMatch = { id: "first-segment", documentId: "document" };
  const duplicate = { id: "duplicate", documentId: "document" };
  const liveSegment = { id: "live-segment", documentId: "other" };
  const harness = createHarness(createProjectDocumentOpenController, {
    projectReads: [guardedProject, navigationProject],
    segmentReads: [
      [{ id: "before", documentId: "other" }, firstMatch, duplicate],
      [{ id: "new-before" }, liveSegment]
    ],
    contextResult: Promise.resolve("refreshed")
  });

  assert.equal(await harness.controller.open("document"), undefined);
  assert.deepEqual(harness.calls, [
    ["session.getProject"],
    ["session.getSegments"],
    ["session.getProject"],
    ["session.getSegments"],
    [
      "navigation.openEditor",
      {
        projectId: "navigation-project",
        documentId: "document",
        segmentId: "live-segment",
        activeIndex: 1
      }
    ],
    ["presentation.renderAll"],
    ["context.refreshEditor"]
  ]);
});

test("ProjectDocumentOpenController preserves strict lookup, missing-document index, and empty segment identity", async () => {
  const { createProjectDocumentOpenController } = await loadFactory();
  const strict = createHarness(createProjectDocumentOpenController, {
    segments: [
      { id: "numeric", documentId: 7 },
      { id: "string", documentId: "7" }
    ]
  });
  await strict.controller.open("7");
  assert.deepEqual(strict.calls.find(([name]) => name === "navigation.openEditor")[1], {
    projectId: "project",
    documentId: "7",
    segmentId: "string",
    activeIndex: 1
  });

  const missing = createHarness(createProjectDocumentOpenController, {
    segmentReads: [[{ id: "other", documentId: "other" }], [{ id: "ignored" }]]
  });
  await missing.controller.open("missing");
  assert.deepEqual(missing.calls.find(([name]) => name === "navigation.openEditor")[1], {
    projectId: "project",
    documentId: "missing",
    segmentId: "",
    activeIndex: -1
  });

  const falsyId = createHarness(createProjectDocumentOpenController, {
    segments: [{ id: 0, documentId: "document" }]
  });
  await falsyId.controller.open("document");
  assert.equal(falsyId.calls.find(([name]) => name === "navigation.openEditor")[1].segmentId, "");
});

test("ProjectDocumentOpenController does not await navigation and awaits context after presentation", async () => {
  const { createProjectDocumentOpenController } = await loadFactory();
  let resolveContext;
  const neverSettles = new Promise(() => {});
  const contextResult = new Promise((resolve) => {
    resolveContext = resolve;
  });
  const harness = createHarness(createProjectDocumentOpenController, {
    segments: [{ id: "segment", documentId: "document" }],
    navigationResult: neverSettles,
    contextResult
  });

  const openPromise = harness.controller.open("document");
  await Promise.resolve();
  assert.deepEqual(harness.calls.slice(-3), [
    ["navigation.openEditor", { projectId: "project", documentId: "document", segmentId: "segment", activeIndex: 0 }],
    ["presentation.renderAll"],
    ["context.refreshEditor"]
  ]);
  let settled = false;
  void openPromise.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  resolveContext("refreshed");
  assert.equal(await openPromise, undefined);
});

test("ProjectDocumentOpenController preserves malformed collections and live-project drift failures", async () => {
  const { createProjectDocumentOpenController } = await loadFactory();
  for (const segments of [null, [null]]) {
    const malformed = createHarness(createProjectDocumentOpenController, { segments });
    await assert.rejects(malformed.controller.open("document"), TypeError);
    assert.equal(malformed.calls.at(-1)[0], "session.getSegments");
  }

  const drift = createHarness(createProjectDocumentOpenController, {
    projectReads: [{ id: "project" }, null],
    segments: []
  });
  await assert.rejects(drift.controller.open("document"), TypeError);
  assert.equal(drift.calls.at(-1)[0], "session.getProject");

  const secondSegments = createHarness(createProjectDocumentOpenController, {
    segmentReads: [[], null]
  });
  await assert.rejects(secondSegments.controller.open("document"), TypeError);
  assert.equal(secondSegments.calls.at(-1)[0], "session.getSegments");
});

test("ProjectDocumentOpenController preserves every injected dependency failure boundary", async () => {
  const { createProjectDocumentOpenController } = await loadFactory();
  const stages = [
    [{ projectError: new Error("project failed") }, "projectError", "session.getProject"],
    [{ firstSegmentsError: new Error("first segments failed") }, "firstSegmentsError", "session.getSegments"],
    [{ secondSegmentsError: new Error("second segments failed") }, "secondSegmentsError", "session.getSegments"],
    [{ navigationError: new Error("navigation failed") }, "navigationError", "navigation.openEditor"],
    [{ presentationError: new Error("presentation failed") }, "presentationError", "presentation.renderAll"],
    [{ contextError: new Error("context failed") }, "contextError", "context.refreshEditor"]
  ];

  for (const [overrides, errorName, expectedLastCall] of stages) {
    const harness = createHarness(createProjectDocumentOpenController, overrides);
    await assert.rejects(harness.controller.open("document"), overrides[errorName]);
    assert.equal(harness.calls.at(-1)[0], expectedLastCall);
  }

  const rejectedContext = new Error("async context failed");
  const asynchronous = createHarness(createProjectDocumentOpenController, {
    contextResult: Promise.reject(rejectedContext)
  });
  await assert.rejects(asynchronous.controller.open("document"), rejectedContext);
  assert.equal(asynchronous.calls.at(-1)[0], "context.refreshEditor");
});

test("ProjectDocumentOpenController validates every boundary and exposes an immutable API", async () => {
  const { createProjectDocumentOpenController } = await loadFactory();
  const valid = createHarness(createProjectDocumentOpenController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["open"]);

  for (const options of [
    undefined,
    {},
    { ...valid.options, session: { ...valid.options.session, getProject: null } },
    { ...valid.options, session: { ...valid.options.session, getSegments: null } },
    { ...valid.options, navigation: { openEditor: null } },
    { ...valid.options, presentation: { renderAll: null } },
    { ...valid.options, context: { refreshEditor: null } }
  ]) {
    assert.throws(() => createProjectDocumentOpenController(options), /ProjectDocumentOpenController requires/);
  }
});
