const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const apiOrder = ["saveTmEntry", "saveTerm", "deleteTmEntry", "deleteTerm", "deleteResource"];

function controllerOptions() {
  const fn = () => {};
  return {
    session: { getProjectId: fn },
    repositories: { updateTmEntry: fn, updateTerm: fn },
    resources: {
      markProjectsUsingDirty: fn,
      refresh: fn,
      refreshProjectTerms: fn,
      labelFromKey: fn,
      items: fn
    },
    commands: {
      execute: fn,
      createDeleteEntry: fn,
      createDeleteResource: fn,
      setProjectId: fn
    },
    trash: { entryFromCommandResult: fn, synchronize: fn },
    presentation: { renderUndo: fn },
    status: { set: fn }
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

test("lazy resource mutation validates synchronously and exposes the frozen ordered API without loading", async () => {
  const { createLazyResourceMutationController } = await moduleAt(
    "src/features/resources/lazy-resource-mutation-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyResourceMutationController(controllerOptions(), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), apiOrder);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(loadCount, 0);
  assert.throws(
    () => createLazyResourceMutationController({}, { load() {} }),
    /ResourceMutationController requires session/
  );
});

test("lazy resource mutation shares one concurrent load and preserves options receivers arguments and results", async () => {
  const { createLazyResourceMutationController } = await moduleAt(
    "src/features/resources/lazy-resource-mutation-controller.js"
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
  const controller = createLazyResourceMutationController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.saveTmEntry({ id: "tm-1" }, { source: "a", target: "b" });
  const second = controller.deleteTerm({ id: "term-1" }, { refreshSuggestions: true });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createResourceMutationController(value) {
      receivedOptions = value;
      return installed;
    }
  });

  assert.deepEqual(await first, {
    method: "saveTmEntry",
    args: [{ id: "tm-1" }, { source: "a", target: "b" }]
  });
  assert.deepEqual(await second, {
    method: "deleteTerm",
    args: [{ id: "term-1" }, { refreshSuggestions: true }]
  });
  assert.equal(receivedOptions, options);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === installed, args]),
    [
      ["saveTmEntry", true, [{ id: "tm-1" }, { source: "a", target: "b" }]],
      ["deleteTerm", true, [{ id: "term-1" }, { refreshSuggestions: true }]]
    ]
  );
});

test("lazy resource mutation redacts load failure preserves its cause and retries the next action", async () => {
  const { createLazyResourceMutationController } = await moduleAt(
    "src/features/resources/lazy-resource-mutation-controller.js"
  );
  const expectedError = new Error("C:\\Users\\person\\private-resource-mutation-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyResourceMutationController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createResourceMutationController: () => implementation() };
    }
  });

  await assert.rejects(controller.deleteResource("tm", "Private::en::tr"), (error) => {
    assert.equal(error.message, "Resource mutation implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.deepEqual(await controller.deleteResource("tm", "retry"), {
    method: "deleteResource",
    args: ["tm", "retry"]
  });
  assert.equal(loadCount, 2);
});

test("lazy resource mutation rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyResourceMutationController } = await moduleAt(
    "src/features/resources/lazy-resource-mutation-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyResourceMutationController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createResourceMutationController: () => (loadCount === 1 ? { saveTmEntry() {} } : implementation())
      };
    }
  });

  await assert.rejects(controller.saveTerm(), /Resource mutation implementation could not be loaded/);
  assert.deepEqual(await controller.saveTerm("repaired"), {
    method: "saveTerm",
    args: ["repaired"]
  });
  assert.equal(loadCount, 2);
});

test("lazy resource mutation preserves implementation failure identity without reloading", async () => {
  const { createLazyResourceMutationController } = await moduleAt(
    "src/features/resources/lazy-resource-mutation-controller.js"
  );
  const expectedError = new Error("resource mutation failed");
  let loadCount = 0;
  const installed = implementation();
  installed.deleteTmEntry = () => {
    throw expectedError;
  };
  const controller = createLazyResourceMutationController(controllerOptions(), {
    load() {
      loadCount += 1;
      return { createResourceMutationController: () => installed };
    }
  });

  await assert.rejects(controller.deleteTmEntry(), (error) => error === expectedError);
  assert.deepEqual(await controller.saveTerm(), { method: "saveTerm", args: [] });
  assert.equal(loadCount, 1);
});

test("lazy resource mutation validates loader configuration", async () => {
  const { createLazyResourceMutationController } = await moduleAt(
    "src/features/resources/lazy-resource-mutation-controller.js"
  );
  assert.throws(
    () => createLazyResourceMutationController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
