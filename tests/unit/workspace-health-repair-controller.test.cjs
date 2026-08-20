const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(
    pathToFileURL(path.join(rootPath, "src/features/workspace/workspace-health-repair-controller.js")).href
  );
}

function createHarness(createWorkspaceHealthRepairController, overrides = {}) {
  const calls = [];
  const repairResult = overrides.repairResult || { recoveredProjectCount: 0 };
  const workspaceStatus = overrides.workspaceStatus || { connected: true, warnings: [] };
  const projects = overrides.projects || [{ id: "project-1" }];
  const tmEntries = overrides.tmEntries || [{ id: "tm-1" }];
  const terms = overrides.terms || [{ id: "term-1" }];
  const dirtyProjectIds = overrides.dirtyProjectIds || ["project-1"];
  const report = overrides.report || { ok: true, preserved: ["Existing evidence"] };
  let storedWorkspaceStatus = null;
  const options = {
    connection: {
      isConnected() {
        calls.push(["isConnected"]);
        return overrides.connected ?? true;
      }
    },
    storage: {
      repairManifest() {
        calls.push(["repairManifest"]);
        if (overrides.repairError) return Promise.reject(overrides.repairError);
        return Promise.resolve(repairResult);
      },
      getStatus() {
        calls.push(["getWorkspaceStatus"]);
        if (overrides.getStatusError) return Promise.reject(overrides.getStatusError);
        return Promise.resolve(workspaceStatus);
      },
      buildHealthReport(input) {
        calls.push(["buildHealthReport", input]);
        if (overrides.healthError) return Promise.reject(overrides.healthError);
        return Promise.resolve(report);
      }
    },
    workspace: {
      setStatus(value) {
        calls.push(["setWorkspaceStatus", value]);
        if (overrides.setWorkspaceError) throw overrides.setWorkspaceError;
        storedWorkspaceStatus = value;
      }
    },
    resources: {
      listTmEntries() {
        calls.push(["listTmEntries"]);
        if (overrides.tmPromise) return overrides.tmPromise;
        if (overrides.tmError) return Promise.reject(overrides.tmError);
        return Promise.resolve(tmEntries);
      },
      listTerms() {
        calls.push(["listTerms"]);
        if (overrides.termsPromise) return overrides.termsPromise;
        if (overrides.termsError) return Promise.reject(overrides.termsError);
        return Promise.resolve(terms);
      }
    },
    session: {
      getProjects() {
        calls.push(["getProjects"]);
        return projects;
      }
    },
    dirty: {
      ids() {
        calls.push(["dirtyIds"]);
        return dirtyProjectIds;
      }
    },
    presentation: {
      renderValidation(value) {
        calls.push(["renderValidation", value]);
        if (overrides.renderValidationError) throw overrides.renderValidationError;
      },
      renderWorkspaceStatus() {
        calls.push(["renderWorkspaceStatus"]);
        if (overrides.renderWorkspaceError) throw overrides.renderWorkspaceError;
      }
    },
    status: {
      set(message, mode) {
        calls.push(["setStatus", message, mode]);
        if (overrides.statusError) throw overrides.statusError;
      }
    }
  };
  for (const [name, boundary] of Object.entries(overrides.boundaries || {})) {
    options[name] = { ...options[name], ...boundary };
  }
  const controller = createWorkspaceHealthRepairController(options);
  return {
    calls,
    controller,
    dirtyProjectIds,
    getStoredWorkspaceStatus: () => storedWorkspaceStatus,
    projects,
    repairResult,
    report,
    terms,
    tmEntries,
    workspaceStatus
  };
}

test("WorkspaceHealthRepairController preserves the disconnected no-op before manifest repair", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  const harness = createHarness(createWorkspaceHealthRepairController, { connected: false });

  assert.equal(await harness.controller.repair(), undefined);
  assert.deepEqual(harness.calls, [["isConnected"]]);
});

test("WorkspaceHealthRepairController preserves exact healthy repair and presentation sequencing", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  const harness = createHarness(createWorkspaceHealthRepairController);

  assert.equal(await harness.controller.repair(), undefined);
  const expectedInput = {
    projects: harness.projects,
    tmEntries: harness.tmEntries,
    terms: harness.terms,
    dirtyProjectIds: harness.dirtyProjectIds
  };
  assert.deepEqual(harness.calls, [
    ["isConnected"],
    ["repairManifest"],
    ["getWorkspaceStatus"],
    ["setWorkspaceStatus", harness.workspaceStatus],
    ["listTmEntries"],
    ["listTerms"],
    ["getProjects"],
    ["dirtyIds"],
    ["buildHealthReport", expectedInput],
    ["renderValidation", harness.report],
    ["renderWorkspaceStatus"],
    ["setStatus", "Workspace health checked", "saved"]
  ]);
  assert.equal(harness.getStoredWorkspaceStatus(), harness.workspaceStatus);
  assert.equal(harness.calls[8][1].projects, harness.projects);
  assert.equal(harness.calls[8][1].tmEntries, harness.tmEntries);
  assert.equal(harness.calls[8][1].terms, harness.terms);
  assert.equal(harness.calls[8][1].dirtyProjectIds, harness.dirtyProjectIds);
});

test("WorkspaceHealthRepairController starts both resource reads before awaiting either", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  let resolveTm;
  let resolveTerms;
  const tmPromise = new Promise((resolve) => {
    resolveTm = resolve;
  });
  const termsPromise = new Promise((resolve) => {
    resolveTerms = resolve;
  });
  const harness = createHarness(createWorkspaceHealthRepairController, { tmPromise, termsPromise });

  const operation = harness.controller.repair();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(harness.calls.slice(-2), [["listTmEntries"], ["listTerms"]]);
  assert.equal(
    harness.calls.some(([name]) => name === "buildHealthReport"),
    false
  );
  resolveTm(harness.tmEntries);
  resolveTerms(harness.terms);
  await operation;
});

test("WorkspaceHealthRepairController preserves zero and singular recovered-package grammar", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  const zeroHarness = createHarness(createWorkspaceHealthRepairController, {
    repairResult: { recoveredProjectCount: 0 },
    report: { ok: true, preserved: ["Existing"] }
  });
  await zeroHarness.controller.repair();
  assert.deepEqual(zeroHarness.report.preserved, ["0 project packages verified in the workspace folder.", "Existing"]);

  const singularHarness = createHarness(createWorkspaceHealthRepairController, {
    repairResult: { recoveredProjectCount: 1 },
    report: { ok: true, preserved: [] }
  });
  await singularHarness.controller.repair();
  assert.deepEqual(singularHarness.report.preserved, ["1 project package verified in the workspace folder."]);
});

test("WorkspaceHealthRepairController preserves plural copy and unhealthy status", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  const harness = createHarness(createWorkspaceHealthRepairController, {
    repairResult: { recoveredProjectCount: 3 },
    report: { ok: false, preserved: [] }
  });

  await harness.controller.repair();

  assert.deepEqual(harness.report.preserved, ["3 project packages verified in the workspace folder."]);
  assert.deepEqual(harness.calls.at(-1), ["setStatus", "Workspace needs attention", "dirty"]);
});

test("WorkspaceHealthRepairController propagates primary repair failure before later effects", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  const repairError = new Error("repair failed");
  const harness = createHarness(createWorkspaceHealthRepairController, { repairError });

  await assert.rejects(harness.controller.repair(), repairError);
  assert.deepEqual(harness.calls, [["isConnected"], ["repairManifest"]]);
});

test("WorkspaceHealthRepairController preserves completed repair before workspace-status failure", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  const getStatusError = new Error("status failed");
  const harness = createHarness(createWorkspaceHealthRepairController, { getStatusError });

  await assert.rejects(harness.controller.repair(), getStatusError);
  assert.deepEqual(harness.calls, [["isConnected"], ["repairManifest"], ["getWorkspaceStatus"]]);
});

test("WorkspaceHealthRepairController starts both resource reads and propagates either rejection", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  const tmError = new Error("TM read failed");
  const harness = createHarness(createWorkspaceHealthRepairController, { tmError });

  await assert.rejects(harness.controller.repair(), tmError);
  assert.equal(
    harness.calls.some(([name]) => name === "listTmEntries"),
    true
  );
  assert.equal(
    harness.calls.some(([name]) => name === "listTerms"),
    true
  );
  assert.equal(
    harness.calls.some(([name]) => name === "buildHealthReport"),
    false
  );
});

test("WorkspaceHealthRepairController preserves resource reads and input reads before health-report failure", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  const healthError = new Error("health failed");
  const harness = createHarness(createWorkspaceHealthRepairController, { healthError });

  await assert.rejects(harness.controller.repair(), healthError);
  assert.deepEqual(
    harness.calls.slice(-3).map(([name]) => name),
    ["getProjects", "dirtyIds", "buildHealthReport"]
  );
  assert.equal(
    harness.calls.some(([name]) => name === "renderValidation"),
    false
  );
});

test("WorkspaceHealthRepairController preserves render and status failure timing", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  const renderError = new Error("validation render failed");
  const renderHarness = createHarness(createWorkspaceHealthRepairController, { renderValidationError: renderError });
  await assert.rejects(renderHarness.controller.repair(), renderError);
  assert.deepEqual(renderHarness.calls.slice(-2), [
    [
      "buildHealthReport",
      {
        projects: renderHarness.projects,
        tmEntries: renderHarness.tmEntries,
        terms: renderHarness.terms,
        dirtyProjectIds: renderHarness.dirtyProjectIds
      }
    ],
    ["renderValidation", renderHarness.report]
  ]);

  const statusError = new Error("status presentation failed");
  const statusHarness = createHarness(createWorkspaceHealthRepairController, { statusError });
  await assert.rejects(statusHarness.controller.repair(), statusError);
  assert.deepEqual(statusHarness.calls.slice(-3), [
    ["renderValidation", statusHarness.report],
    ["renderWorkspaceStatus"],
    ["setStatus", "Workspace health checked", "saved"]
  ]);
});

test("WorkspaceHealthRepairController validates boundaries and exposes an immutable API", async () => {
  const { createWorkspaceHealthRepairController } = await loadFactory();
  assert.throws(
    () => createWorkspaceHealthRepairController({}),
    new TypeError(
      "WorkspaceHealthRepairController requires connection, storage, workspace, resource, session, dirty, presentation, and status boundaries."
    )
  );
  const harness = createHarness(createWorkspaceHealthRepairController);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.deepEqual(Object.keys(harness.controller), ["repair"]);
});
