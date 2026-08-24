const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const apiOrder = ["deleteProject", "deleteDocument"];

function controllerOptions() {
  const fn = () => {};
  return {
    session: {
      getProject: fn,
      getProjects: fn,
      getSegments: fn,
      replaceProject: fn,
      replaceProjects: fn,
      replaceSegments: fn
    },
    confirmation: { ask: fn },
    text: { safe: fn },
    autosave: { flush: fn },
    commands: { createProjectDelete: fn, createDocumentDelete: fn, execute: fn },
    commandState: { selectProject: fn },
    workspace: { clear: fn, mark: fn },
    navigation: { openProjects: fn, clearSelection: fn, selectDocument: fn, selectSegment: fn },
    projects: { load: fn },
    segments: { list: fn },
    histories: { prepare: fn },
    activity: { log: fn },
    summaries: { refresh: fn },
    home: { show: fn },
    status: { set: fn },
    history: { render: fn },
    test: { projectDeleteFails: fn, documentDeleteFails: fn, documentActivityFails: fn },
    logger: { warn: fn }
  };
}

function implementation(calls = []) {
  return Object.fromEntries(
    apiOrder.map((method) => [
      method,
      function (...args) {
        calls.push([method, this, args]);
        return { method, args };
      }
    ])
  );
}

test("lazy project deletion validates synchronously and exposes the frozen ordered API without loading", async () => {
  const { createLazyProjectDeletionController } = await moduleAt(
    "src/features/projects/lazy-project-deletion-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyProjectDeletionController(controllerOptions(), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), apiOrder);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(loadCount, 0);
  assert.throws(
    () => createLazyProjectDeletionController({}, { load() {} }),
    /ProjectDeletionController requires project session/
  );
});

test("lazy project deletion shares one concurrent load and preserves options receivers arguments and results", async () => {
  const { createLazyProjectDeletionController } = await moduleAt(
    "src/features/projects/lazy-project-deletion-controller.js"
  );
  const options = controllerOptions();
  const calls = [];
  const installed = implementation(calls);
  let receivedOptions;
  let resolveLoad;
  let loadCount = 0;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const controller = createLazyProjectDeletionController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.deleteProject("project-1");
  const second = controller.deleteDocument({ id: "document-1" });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createProjectDeletionController(value) {
      receivedOptions = value;
      return installed;
    }
  });

  assert.deepEqual(await first, { method: "deleteProject", args: ["project-1"] });
  assert.deepEqual(await second, { method: "deleteDocument", args: [{ id: "document-1" }] });
  assert.equal(receivedOptions, options);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === installed, args]),
    [
      ["deleteProject", true, ["project-1"]],
      ["deleteDocument", true, [{ id: "document-1" }]]
    ]
  );
});

test("lazy project deletion redacts load failure preserves its cause and retries deletion", async () => {
  const { createLazyProjectDeletionController } = await moduleAt(
    "src/features/projects/lazy-project-deletion-controller.js"
  );
  const expectedError = new Error("C:\\Users\\person\\private-project-deletion-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyProjectDeletionController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createProjectDeletionController: () => implementation() };
    }
  });

  await assert.rejects(controller.deleteProject(), (error) => {
    assert.equal(error.message, "Project deletion implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.deepEqual(await controller.deleteProject("retry"), { method: "deleteProject", args: ["retry"] });
  assert.equal(loadCount, 2);
});

test("lazy project deletion rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyProjectDeletionController } = await moduleAt(
    "src/features/projects/lazy-project-deletion-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyProjectDeletionController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createProjectDeletionController: () => (loadCount === 1 ? { deleteProject() {} } : implementation())
      };
    }
  });

  await assert.rejects(controller.deleteDocument(), /Project deletion implementation could not be loaded/);
  assert.deepEqual(await controller.deleteDocument("repaired"), {
    method: "deleteDocument",
    args: ["repaired"]
  });
  assert.equal(loadCount, 2);
});

test("lazy project deletion preserves implementation failure identity without reloading", async () => {
  const { createLazyProjectDeletionController } = await moduleAt(
    "src/features/projects/lazy-project-deletion-controller.js"
  );
  const expectedError = new Error("project deletion failed");
  let loadCount = 0;
  const installed = implementation();
  installed.deleteDocument = () => {
    throw expectedError;
  };
  const controller = createLazyProjectDeletionController(controllerOptions(), {
    load() {
      loadCount += 1;
      return { createProjectDeletionController: () => installed };
    }
  });

  await assert.rejects(controller.deleteDocument(), (error) => error === expectedError);
  assert.deepEqual(await controller.deleteProject(), { method: "deleteProject", args: [] });
  assert.equal(loadCount, 1);
});

test("lazy project deletion validates loader configuration", async () => {
  const { createLazyProjectDeletionController } = await moduleAt(
    "src/features/projects/lazy-project-deletion-controller.js"
  );
  assert.throws(
    () => createLazyProjectDeletionController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
