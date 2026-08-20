const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createSegmentTmSaveController, overrides = {}) {
  const calls = [];
  const statuses = [];
  const project =
    overrides.project === undefined
      ? { id: "p1", name: "Project", sourceLang: "en", targetLang: "tr" }
      : overrides.project;
  const segment =
    overrides.segment === undefined ? { id: "s1", source: " Source ", target: " Target " } : overrides.segment;
  const savedEntry = { id: "tm-entry" };
  let projectRead = 0;
  const controller = createSegmentTmSaveController({
    session: {
      getProject() {
        calls.push(["getProject"]);
        const value = overrides.projectReads?.[projectRead] ?? project;
        projectRead += 1;
        return value;
      }
    },
    selection: {
      getActiveSegment() {
        calls.push(["getActiveSegment"]);
        return segment;
      }
    },
    tm: {
      saveEntry(entry) {
        calls.push(["saveEntry", entry]);
        return overrides.saveError ? Promise.reject(overrides.saveError) : Promise.resolve(savedEntry);
      },
      mainName(selectedProject) {
        calls.push(["mainName", selectedProject.id]);
        return "Project TM";
      },
      refreshMatches() {
        calls.push(["refreshMatches"]);
        return overrides.refreshError ? Promise.reject(overrides.refreshError) : Promise.resolve();
      }
    },
    workspace: { markDirty: (projectId) => calls.push(["markDirty", projectId]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    testHooks: {
      beforeSave(candidate) {
        calls.push(["beforeSave", candidate.id]);
        if (overrides.beforeSaveError) throw overrides.beforeSaveError;
      }
    }
  });
  return { calls, controller, project, savedEntry, segment, statuses };
}

test("SegmentTmSaveController returns null before effects for missing or blank segment inputs", async () => {
  const { createSegmentTmSaveController } = await moduleAt("src/features/editor/segment-tm-save-controller.js");
  const harness = createHarness(createSegmentTmSaveController);
  assert.equal(await harness.controller.save(null, harness.project), null);
  assert.equal(await harness.controller.save(harness.segment, null), null);
  assert.equal(await harness.controller.save({ source: " ", target: "Target" }, harness.project), null);
  assert.equal(await harness.controller.save({ source: "Source", target: "\t" }, harness.project), null);
  assert.equal(
    harness.calls.some(([name]) => name === "saveEntry"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    false
  );
});

test("SegmentTmSaveController preserves the exact TM payload, repository result, default project, and dirtiness", async () => {
  const { createSegmentTmSaveController } = await moduleAt("src/features/editor/segment-tm-save-controller.js");
  const harness = createHarness(createSegmentTmSaveController);
  const result = await harness.controller.save(harness.segment);
  assert.equal(result, harness.savedEntry);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveEntry")[1], {
    source: " Source ",
    target: " Target ",
    sourceLang: "en",
    targetLang: "tr",
    projectName: "Project",
    tmName: "Project TM"
  });
  assert.ok(harness.calls.some(([name, projectId]) => name === "markDirty" && projectId === "p1"));
  assert.ok(
    harness.calls.findIndex(([name]) => name === "beforeSave") <
      harness.calls.findIndex(([name]) => name === "saveEntry")
  );
});

test("SegmentTmSaveController saves the active segment, refreshes matches, and reports success by default", async () => {
  const { createSegmentTmSaveController } = await moduleAt("src/features/editor/segment-tm-save-controller.js");
  const harness = createHarness(createSegmentTmSaveController);
  assert.equal(await harness.controller.saveActive(), harness.savedEntry);
  assert.equal(harness.calls.filter(([name]) => name === "getProject").length, 2);
  assert.ok(
    harness.calls.findIndex(([name]) => name === "saveEntry") <
      harness.calls.findIndex(([name]) => name === "refreshMatches")
  );
  assert.deepEqual(harness.statuses, [["Segment saved to TM", "saved"]]);
});

test("SegmentTmSaveController preserves active eligibility and status suppression", async () => {
  const { createSegmentTmSaveController } = await moduleAt("src/features/editor/segment-tm-save-controller.js");
  const missingProject = createHarness(createSegmentTmSaveController, { project: null });
  assert.equal(await missingProject.controller.saveActive(), null);
  assert.equal(
    missingProject.calls.some(([name]) => name === "saveEntry"),
    false
  );

  const blank = createHarness(createSegmentTmSaveController, { segment: { source: "Source", target: " " } });
  assert.equal(await blank.controller.saveActive(), null);
  assert.equal(
    blank.calls.some(([name]) => name === "saveEntry"),
    false
  );

  const silent = createHarness(createSegmentTmSaveController);
  assert.equal(await silent.controller.saveActive({ reportStatus: false }), silent.savedEntry);
  assert.deepEqual(silent.statuses, []);
});

test("SegmentTmSaveController reports primary and post-save refresh failures without throwing", async () => {
  const { createSegmentTmSaveController } = await moduleAt("src/features/editor/segment-tm-save-controller.js");
  const saveError = new Error("TM write failed");
  const failedSave = createHarness(createSegmentTmSaveController, { saveError });
  assert.equal(await failedSave.controller.saveActive(), null);
  assert.deepEqual(failedSave.statuses, [["TM write failed", "dirty"]]);
  assert.equal(
    failedSave.calls.some(([name]) => name === "refreshMatches"),
    false
  );

  const refreshError = new Error("Refresh failed");
  const failedRefresh = createHarness(createSegmentTmSaveController, { refreshError });
  assert.equal(await failedRefresh.controller.saveActive(null), null);
  assert.ok(failedRefresh.calls.some(([name]) => name === "saveEntry"));
  assert.ok(failedRefresh.calls.some(([name]) => name === "markDirty"));
  assert.deepEqual(failedRefresh.statuses, [["Refresh failed", "dirty"]]);
});

test("SegmentTmSaveController propagates silent failures and runs the pre-save hook before the repository", async () => {
  const { createSegmentTmSaveController } = await moduleAt("src/features/editor/segment-tm-save-controller.js");
  const beforeSaveError = new Error("Simulated TM save failure");
  const beforeSave = createHarness(createSegmentTmSaveController, { beforeSaveError });
  await assert.rejects(() => beforeSave.controller.saveActive({ reportStatus: false }), beforeSaveError);
  assert.equal(
    beforeSave.calls.some(([name]) => name === "saveEntry"),
    false
  );
  assert.deepEqual(beforeSave.statuses, []);

  const saveError = new Error("");
  const reported = createHarness(createSegmentTmSaveController, { saveError });
  assert.equal(await reported.controller.saveActive(), null);
  assert.deepEqual(reported.statuses, [["Save to TM failed", "dirty"]]);
});

test("SegmentTmSaveController validates collaborators and exposes an immutable API", async () => {
  const { createSegmentTmSaveController } = await moduleAt("src/features/editor/segment-tm-save-controller.js");
  assert.throws(() => createSegmentTmSaveController({}), /requires session and selection boundaries/);
  const { controller } = createHarness(createSegmentTmSaveController);
  assert.equal(Object.isFrozen(controller), true);
});
