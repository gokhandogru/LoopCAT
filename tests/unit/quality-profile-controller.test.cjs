const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/quality/quality-profile-controller.js")).href);
}

function createHarness(createQualityProfileController, overrides = {}) {
  let project = {
    id: "p1",
    name: "Active project",
    qualityProfile: { standard: "iso-17100", reviewDepth: "bilingual" }
  };
  let projects = [
    project,
    { id: "p2", name: "Other project", qualityProfile: { standard: "general", reviewDepth: "standard" } }
  ];
  let riskQueue = { projectId: "p1", profileStandard: "iso-17100" };
  const calls = [];
  const statuses = [];
  const normalizedProfile = {
    standard: "agency-delivery",
    reviewDepth: "lqa",
    riskTolerance: "strict",
    terminologyStrictness: "strict",
    aiDisclosure: "client-approved",
    audience: "Client reviewers",
    tone: "Formal"
  };
  const rebuiltQueue = { projectId: "p1", profileStandard: "agency-delivery" };

  const controller = createQualityProfileController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getProjects: () => projects,
      replaceProject(value) {
        calls.push(["replaceProject", structuredClone(value)]);
        project = value;
      },
      replaceProjects(value) {
        calls.push(["replaceProjects", structuredClone(value)]);
        projects = value;
      },
      replaceQualityRiskQueue(value) {
        calls.push(["replaceQualityRiskQueue", value]);
        riskQueue = value;
      }
    },
    profile: {
      normalize(values) {
        calls.push(["normalize", values]);
        return normalizedProfile;
      },
      buildRiskQueue() {
        calls.push(["buildRiskQueue", project.qualityProfile.standard]);
        return rebuiltQueue;
      }
    },
    persistence: {
      saveProject(value) {
        calls.push(["saveProject", structuredClone(value)]);
        if (overrides.saveError) return Promise.reject(overrides.saveError);
        return Promise.resolve({ ...value, repositoryStamp: "stored" });
      },
      refreshSummaries() {
        calls.push(["refreshSummaries"]);
        return overrides.summaryError ? Promise.reject(overrides.summaryError) : Promise.resolve();
      }
    },
    activity: {
      log(value) {
        calls.push(["activity", value]);
        return Promise.resolve(overrides.activityLogged !== false);
      }
    },
    presentation: { renderWorkbench: () => calls.push(["renderWorkbench"]) },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) }
  });

  return {
    calls,
    controller,
    getProject: () => project,
    getProjects: () => projects,
    getRiskQueue: () => riskQueue,
    normalizedProfile,
    rebuiltQueue,
    statuses
  };
}

test("quality profile normalizes, persists, synchronizes the selected project, and refreshes derived state", async () => {
  const { createQualityProfileController } = await loadFactory();
  const harness = createHarness(createQualityProfileController);
  const values = { standard: "AGENCY-DELIVERY", reviewDepth: "LQA" };

  assert.equal(await harness.controller.save(values), true);

  assert.deepEqual(harness.getProject().qualityProfile, harness.normalizedProfile);
  assert.equal(harness.getProject().repositoryStamp, "stored");
  assert.equal(harness.getProjects()[0], harness.getProject());
  assert.equal(harness.getProjects()[1].id, "p2");
  assert.equal(harness.getRiskQueue(), harness.rebuiltQueue);
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    [
      "normalize",
      "saveProject",
      "replaceProject",
      "replaceProjects",
      "buildRiskQueue",
      "replaceQualityRiskQueue",
      "refreshSummaries",
      "markDirty",
      "renderWorkbench",
      "activity"
    ]
  );
  assert.deepEqual(harness.statuses.at(-1), ["Quality profile saved", "saved"]);
});

test("primary quality profile persistence failure restores the exact project and project-list snapshots", async () => {
  const { createQualityProfileController } = await loadFactory();
  const harness = createHarness(createQualityProfileController, {
    saveError: new Error("project storage unavailable")
  });
  const beforeProject = structuredClone(harness.getProject());
  const beforeProjects = structuredClone(harness.getProjects());

  assert.equal(await harness.controller.save({ standard: "agency-delivery" }), false);

  assert.deepEqual(harness.getProject(), beforeProject);
  assert.deepEqual(harness.getProjects(), beforeProjects);
  assert.deepEqual(harness.statuses.at(-1), ["project storage unavailable", "dirty"]);
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ["normalize", "saveProject", "replaceProject", "replaceProjects", "renderWorkbench"]
  );
});

test("summary refresh failure rolls back project records after the existing risk replacement boundary", async () => {
  const { createQualityProfileController } = await loadFactory();
  const harness = createHarness(createQualityProfileController, {
    summaryError: new Error("summary refresh unavailable")
  });
  const beforeProject = structuredClone(harness.getProject());
  const beforeProjects = structuredClone(harness.getProjects());

  assert.equal(await harness.controller.save({ standard: "agency-delivery" }), false);

  assert.deepEqual(harness.getProject(), beforeProject);
  assert.deepEqual(harness.getProjects(), beforeProjects);
  assert.equal(harness.getRiskQueue(), harness.rebuiltQueue);
  assert.equal(harness.calls.filter(([name]) => name === "renderWorkbench").length, 1);
  assert.deepEqual(harness.statuses.at(-1), ["summary refresh unavailable", "dirty"]);
});

test("secondary quality profile activity failure keeps the saved profile and reports a dirty warning", async () => {
  const { createQualityProfileController } = await loadFactory();
  const harness = createHarness(createQualityProfileController, { activityLogged: false });

  assert.equal(await harness.controller.save({ standard: "agency-delivery" }), true);

  assert.deepEqual(harness.getProject().qualityProfile, harness.normalizedProfile);
  assert.deepEqual(harness.statuses.at(-1), ["Quality profile saved; activity log failed", "dirty"]);
  assert.equal(harness.calls.filter(([name]) => name === "replaceProject").length, 1);
});

test("quality profile save is inert without an active project", async () => {
  const { createQualityProfileController } = await loadFactory();
  const harness = createHarness(createQualityProfileController, { noProject: true });

  assert.equal(await harness.controller.save({ standard: "agency-delivery" }), false);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.statuses, []);
});
