const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/projects/project-domain-controller.js")).href);
}

function createHarness(createProjectDomainController, overrides = {}) {
  const calls = [];
  const listeners = new Map();
  let project = Object.hasOwn(overrides, "project")
    ? overrides.project
    : { id: "p1", name: "Project", domain: "Original domain" };
  let projects = overrides.projects || [{ id: "p0", domain: "Other" }, project, { id: "p2", domain: "Third" }];
  let inputValue = overrides.inputValue ?? "  New domain  ";
  let replaceProjectCount = 0;
  let replaceProjectsCount = 0;
  let statusCount = 0;
  const classToggles = [];
  const form = {
    classList: {
      toggle(name, force) {
        calls.push(["toggleClass", name, force]);
        classToggles.push([name, force]);
        if (overrides.toggleError) throw overrides.toggleError;
      }
    },
    addEventListener(type, listener) {
      calls.push(["addFormListener", type]);
      listeners.set(`form:${type}`, listener);
    },
    removeEventListener(type, listener) {
      const key = `form:${type}`;
      calls.push(["removeFormListener", type, listeners.get(key) === listener]);
      if (listeners.get(key) === listener) listeners.delete(key);
    }
  };
  const input = {
    get value() {
      calls.push(["readInput", inputValue]);
      if (overrides.inputReadError) throw overrides.inputReadError;
      return inputValue;
    },
    set value(value) {
      inputValue = value;
    },
    addEventListener(type, listener) {
      calls.push(["addInputListener", type]);
      listeners.set(`input:${type}`, listener);
    },
    removeEventListener(type, listener) {
      const key = `input:${type}`;
      calls.push(["removeInputListener", type, listeners.get(key) === listener]);
      if (listeners.get(key) === listener) listeners.delete(key);
    }
  };
  const updatedProject = overrides.updatedProject || {
    id: "p1",
    name: "Project",
    domain: "New domain",
    persisted: true
  };
  const options = {
    elements: { form, input },
    session: {
      getProject() {
        calls.push(["getProject", project?.id, project?.domain]);
        if (overrides.getProjectError) throw overrides.getProjectError;
        return project;
      },
      getProjects() {
        calls.push(["getProjects", projects.map((item) => item.id)]);
        if (overrides.getProjectsError) throw overrides.getProjectsError;
        return projects;
      },
      replaceProject(value) {
        replaceProjectCount += 1;
        calls.push(["replaceProject", value]);
        if (overrides.replaceProjectErrorAt === replaceProjectCount) throw overrides.replaceProjectError;
        project = value;
      },
      replaceProjects(value) {
        replaceProjectsCount += 1;
        calls.push(["replaceProjects", value]);
        if (overrides.replaceProjectsErrorAt === replaceProjectsCount) throw overrides.replaceProjectsError;
        projects = value;
      }
    },
    repository: {
      update(value) {
        calls.push(["updateProject", value]);
        if (overrides.updateError) throw overrides.updateError;
        return overrides.updatePromise || Promise.resolve(updatedProject);
      }
    },
    presentation: {
      refreshSummaries() {
        calls.push(["refreshSummaries"]);
        if (overrides.refreshError) throw overrides.refreshError;
        return overrides.refreshPromise;
      },
      renderAll() {
        calls.push(["renderAll"]);
        if (overrides.renderError) throw overrides.renderError;
      }
    },
    workspace: {
      markDirty() {
        calls.push(["markDirty"]);
        if (overrides.workspaceError) throw overrides.workspaceError;
      }
    },
    status: {
      set(message, mode) {
        statusCount += 1;
        calls.push(["status", message, mode]);
        if (overrides.statusErrorAt === statusCount) throw overrides.statusError;
      }
    },
    clone(value) {
      calls.push(["clone", value.id]);
      if (overrides.cloneError) throw overrides.cloneError;
      return structuredClone(value);
    },
    testHooks: {
      beforeSave() {
        calls.push(["beforeSave"]);
        if (overrides.beforeSaveError) throw overrides.beforeSaveError;
      }
    }
  };
  const controller = createProjectDomainController(options);
  return {
    calls,
    classToggles,
    controller,
    form,
    input,
    listeners,
    options,
    updatedProject,
    getProject: () => project,
    getProjects: () => projects,
    setInput(value) {
      inputValue = value;
    }
  };
}

test("ProjectDomainController preserves the no-project guard and pre-try snapshot, clone, and input order", async () => {
  const { createProjectDomainController } = await loadFactory();
  const missing = createHarness(createProjectDomainController, { project: null, projects: [] });
  assert.equal(await missing.controller.save(), false);
  assert.deepEqual(missing.calls, [["getProject", undefined, undefined]]);

  const cloneError = new Error("clone failed before try");
  const cloning = createHarness(createProjectDomainController, { cloneError });
  await assert.rejects(cloning.controller.save(), cloneError);
  assert.deepEqual(
    cloning.calls.map((call) => call[0]),
    ["getProject", "getProject", "clone"]
  );
});

test("ProjectDomainController preserves exact update, selected-list synchronization, presentation, workspace, and success order", async () => {
  const { createProjectDomainController } = await loadFactory();
  const harness = createHarness(createProjectDomainController);
  const originalProjects = harness.getProjects();

  assert.equal(await harness.controller.save(), true);
  assert.equal(harness.getProject(), harness.updatedProject);
  assert.equal(harness.getProjects()[0], originalProjects[0]);
  assert.equal(harness.getProjects()[1], harness.updatedProject);
  assert.equal(harness.getProjects()[2], originalProjects[2]);
  assert.deepEqual(harness.calls.find((call) => call[0] === "updateProject")[1], {
    id: "p1",
    name: "Project",
    domain: "New domain"
  });
  assert.deepEqual(
    harness.calls.map((call) => call[0]),
    [
      "getProject",
      "getProject",
      "clone",
      "getProjects",
      "clone",
      "clone",
      "clone",
      "readInput",
      "beforeSave",
      "getProject",
      "updateProject",
      "replaceProject",
      "getProjects",
      "getProject",
      "getProject",
      "getProject",
      "getProject",
      "replaceProjects",
      "refreshSummaries",
      "renderAll",
      "getProject",
      "toggleClass",
      "markDirty",
      "status"
    ]
  );
  assert.deepEqual(harness.classToggles, [["hidden", true]]);
  assert.deepEqual(harness.calls.at(-1), ["status", "Project domain saved", "saved"]);
});

test("ProjectDomainController preserves list order and identities when the selected project is absent", async () => {
  const { createProjectDomainController } = await loadFactory();
  const project = { id: "p1", domain: "Old" };
  const projects = [
    { id: "p0", domain: "Other" },
    { id: "p2", domain: "Third" }
  ];
  const harness = createHarness(createProjectDomainController, {
    project,
    projects,
    updatedProject: { id: "p1", domain: "New domain" }
  });

  assert.equal(await harness.controller.save(), true);
  assert.deepEqual(harness.getProjects(), projects);
  assert.equal(harness.getProjects()[0], projects[0]);
  assert.equal(harness.getProjects()[1], projects[1]);
});

test("ProjectDomainController preserves rollback, entered text, clean comparison, and status after primary failures", async () => {
  const { createProjectDomainController } = await loadFactory();
  for (const failure of ["beforeSaveError", "updateError"]) {
    const error = new Error(failure === "beforeSaveError" ? "save blocked" : "");
    const harness = createHarness(createProjectDomainController, {
      inputValue: "  Original domain  ",
      [failure]: error
    });
    const originalProject = structuredClone(harness.getProject());
    const originalProjects = structuredClone(harness.getProjects());

    assert.equal(await harness.controller.save(), false);
    assert.deepEqual(harness.getProject(), originalProject);
    assert.deepEqual(harness.getProjects(), originalProjects);
    assert.equal(harness.input.value, "  Original domain  ");
    assert.deepEqual(harness.classToggles, [["clean", true]]);
    assert.deepEqual(
      harness.calls.findLast((call) => call[0] === "status"),
      ["status", failure === "beforeSaveError" ? "save blocked" : "Project domain save failed", "dirty"]
    );
  }
});

test("ProjectDomainController preserves completed effects and exact rollback after late failures", async () => {
  const { createProjectDomainController } = await loadFactory();
  const renderError = new Error("render failed");
  const renderFailure = createHarness(createProjectDomainController, { renderError });
  const previousProject = structuredClone(renderFailure.getProject());
  const previousProjects = structuredClone(renderFailure.getProjects());

  assert.equal(await renderFailure.controller.save(), false);
  assert.deepEqual(renderFailure.getProject(), previousProject);
  assert.deepEqual(renderFailure.getProjects(), previousProjects);
  assert.equal(
    renderFailure.calls.some((call) => call[0] === "refreshSummaries"),
    true
  );
  assert.equal(
    renderFailure.calls.some((call) => call[0] === "markDirty"),
    false
  );
  assert.deepEqual(renderFailure.classToggles, [["clean", false]]);
  assert.deepEqual(renderFailure.calls.at(-1), ["status", "render failed", "dirty"]);

  const workspaceError = new Error("workspace failed");
  const workspaceFailure = createHarness(createProjectDomainController, { workspaceError });
  assert.equal(await workspaceFailure.controller.save(), false);
  assert.deepEqual(workspaceFailure.classToggles, [
    ["hidden", true],
    ["clean", false]
  ]);
  assert.equal(
    workspaceFailure.calls.some((call) => call[0] === "renderAll"),
    true
  );
  assert.deepEqual(workspaceFailure.calls.at(-1), ["status", "workspace failed", "dirty"]);
});

test("ProjectDomainController preserves the live clean comparison against the untrimmed stored domain", async () => {
  const { createProjectDomainController } = await loadFactory();
  const harness = createHarness(createProjectDomainController, {
    project: { id: "p1", domain: " Stored domain " },
    projects: []
  });
  harness.controller.mount();
  harness.calls.length = 0;

  harness.setInput("Stored domain");
  assert.equal(harness.listeners.get("input:input")(), undefined);
  assert.deepEqual(harness.calls, [
    ["getProject", "p1", " Stored domain "],
    ["readInput", "Stored domain"],
    ["toggleClass", "clean", false]
  ]);

  harness.calls.length = 0;
  harness.setInput("   ");
  harness.setInput("");
  harness.getProject().domain = "";
  harness.listeners.get("input:input")();
  assert.deepEqual(harness.calls.at(-1), ["toggleClass", "clean", true]);
});

test("ProjectDomainController owns idempotent submit and input lifecycle with direct save results", async () => {
  const { createProjectDomainController } = await loadFactory();
  const harness = createHarness(createProjectDomainController);

  assert.equal(harness.controller.mount(), undefined);
  assert.equal(harness.controller.mount(), undefined);
  assert.deepEqual(harness.calls, [
    ["addFormListener", "submit"],
    ["addInputListener", "input"]
  ]);
  let prevented = false;
  assert.equal(
    await harness.listeners.get("form:submit")({
      preventDefault() {
        prevented = true;
        harness.calls.push(["preventDefault"]);
      }
    }),
    undefined
  );
  assert.equal(prevented, true);
  assert.equal(
    harness.calls.findIndex((call) => call[0] === "preventDefault") <
      harness.calls.findIndex((call) => call[0] === "getProject"),
    true
  );
  assert.equal(harness.controller.unmount(), undefined);
  assert.equal(harness.controller.unmount(), undefined);
  assert.deepEqual(harness.calls.slice(-2), [
    ["removeFormListener", "submit", true],
    ["removeInputListener", "input", true]
  ]);
  assert.equal(harness.listeners.size, 0);
});

test("ProjectDomainController validates boundaries, preserves rollback failure timing, and exposes an immutable API", async () => {
  const { createProjectDomainController } = await loadFactory();
  assert.throws(() => createProjectDomainController(), /ProjectDomainController requires form and input elements\./);
  const valid = createHarness(createProjectDomainController);
  assert.throws(
    () => createProjectDomainController({ ...valid.options, session: null }),
    /ProjectDomainController requires project session and repository boundaries\./
  );
  assert.throws(
    () => createProjectDomainController({ ...valid.options, presentation: null }),
    /ProjectDomainController requires presentation, workspace, status, clone, and test-hook boundaries\./
  );
  assert.equal(Object.isFrozen(valid.controller), true);

  const rollbackError = new Error("rollback failed");
  const rollbackFailure = createHarness(createProjectDomainController, {
    renderError: new Error("late failure"),
    replaceProjectErrorAt: 2,
    replaceProjectError: rollbackError
  });
  await assert.rejects(rollbackFailure.controller.save(), rollbackError);
  assert.equal(
    rollbackFailure.calls.some((call) => call[0] === "status"),
    false
  );
});
