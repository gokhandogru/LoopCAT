const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("lazy AI command controller validates synchronously and exposes the frozen ordered API without loading", async () => {
  const { createLazyAiCommandController } = await moduleAt("src/features/ai/lazy-ai-command-controller-factories.js");
  const options = { boundary: true };
  const validations = [];
  let loadCount = 0;
  const controller = createLazyAiCommandController({
    options,
    validate(value) {
      validations.push(value);
    },
    factoryName: "createExampleController",
    apiOrder: ["runActive", "runBatch", "cancel"],
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(validations, [options]);
  assert.deepEqual(Object.keys(controller), ["runActive", "runBatch", "cancel"]);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(controller.cancel(), false);
  assert.equal(loadCount, 0);
});

test("lazy AI command controller shares one concurrent load and preserves factory options, receivers, arguments, and results", async () => {
  const { createLazyAiCommandController } = await moduleAt("src/features/ai/lazy-ai-command-controller-factories.js");
  const options = { boundary: true };
  let loadCount = 0;
  let factoryCount = 0;
  let resolveLoad;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const calls = [];
  const activeResult = { mode: "active" };
  const batchResult = { mode: "batch" };
  const implementation = {
    runActive(...args) {
      calls.push(["runActive", this, args]);
      return activeResult;
    },
    runBatch(...args) {
      calls.push(["runBatch", this, args]);
      return batchResult;
    },
    cancel() {
      return false;
    }
  };
  const controller = createLazyAiCommandController({
    options,
    validate() {},
    factoryName: "createExampleController",
    apiOrder: ["runActive", "runBatch", "cancel"],
    load() {
      loadCount += 1;
      return loadGate;
    }
  });

  const active = controller.runActive("active argument");
  const batch = controller.runBatch("batch argument", 2);
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createExampleController(receivedOptions) {
      factoryCount += 1;
      assert.equal(receivedOptions, options);
      return implementation;
    }
  });

  assert.equal(await active, activeResult);
  assert.equal(await batch, batchResult);
  assert.equal(factoryCount, 1);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === implementation, args]),
    [
      ["runActive", true, ["active argument"]],
      ["runBatch", true, ["batch argument", 2]]
    ]
  );
});

test("lazy AI command controller redacts load failure, preserves its cause, and retries the next command", async () => {
  const { createLazyAiCommandController } = await moduleAt("src/features/ai/lazy-ai-command-controller-factories.js");
  const expectedError = new Error("C:\\private\\ai-command-secret.js could not load");
  let loadCount = 0;
  const controller = createLazyAiCommandController({
    options: {},
    validate() {},
    factoryName: "createExampleController",
    apiOrder: ["run", "cancel"],
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return {
        createExampleController: () => ({ run: () => "ready", cancel: () => false })
      };
    }
  });

  await assert.rejects(controller.run(), (error) => {
    assert.equal(error.message, "AI command implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("private"), false);
    return true;
  });
  assert.equal(await controller.run(), "ready");
  assert.equal(loadCount, 2);
});

test("lazy AI command controller rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyAiCommandController } = await moduleAt("src/features/ai/lazy-ai-command-controller-factories.js");
  let loadCount = 0;
  const controller = createLazyAiCommandController({
    options: {},
    validate() {},
    factoryName: "createExampleController",
    apiOrder: ["run", "cancel"],
    load() {
      loadCount += 1;
      return {
        createExampleController: () => (loadCount === 1 ? { run() {} } : { run: () => "ready", cancel: () => false })
      };
    }
  });

  await assert.rejects(controller.run(), /AI command implementation could not be loaded/);
  assert.equal(await controller.run(), "ready");
  assert.equal(loadCount, 2);
});

test("lazy AI command controller forwards cancellation requested during first-use loading", async () => {
  const { createLazyAiCommandController } = await moduleAt("src/features/ai/lazy-ai-command-controller-factories.js");
  let resolveLoad;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const calls = [];
  const implementation = {
    run() {
      calls.push("run");
      return "started";
    },
    cancel() {
      calls.push("cancel");
      return true;
    }
  };
  const controller = createLazyAiCommandController({
    options: {},
    validate() {},
    factoryName: "createExampleController",
    apiOrder: ["run", "cancel"],
    load: () => loadGate
  });

  const pending = controller.run();
  await Promise.resolve();
  assert.equal(controller.cancel(), true);
  resolveLoad({ createExampleController: () => implementation });

  assert.equal(await pending, "started");
  assert.deepEqual(calls, ["run", "cancel"]);
  assert.equal(controller.cancel(), true);
  assert.deepEqual(calls, ["run", "cancel", "cancel"]);
});

test("lazy AI command factories preserve every controller's first synchronous validation checkpoint", async () => {
  const factories = await moduleAt("src/features/ai/lazy-ai-command-controller-factories.js");
  const expectations = [
    [factories.createAiDraftEditingController, /requires EditorSessionStore and selection boundaries/],
    [factories.createAiReviewController, /requires EditorSessionStore and selection boundaries/],
    [factories.createAiAlternativesController, /requires EditorSessionStore and selection boundaries/],
    [factories.createAiTerminologyApplicationController, /requires EditorSessionStore and selection boundaries/],
    [factories.createAiTagRepairController, /requires EditorSessionStore and selection boundaries/],
    [factories.createAiPretranslationController, /requires EditorSessionStore boundaries/],
    [factories.createAiTerminologyExtractionController, /requires EditorSessionStore, selection, and scope boundaries/]
  ];

  expectations.forEach(([factory, message]) => assert.throws(() => factory({}), message));
});

test("lazy AI command controller validates loader and API configuration", async () => {
  const { createLazyAiCommandController } = await moduleAt("src/features/ai/lazy-ai-command-controller-factories.js");
  assert.throws(
    () =>
      createLazyAiCommandController({
        options: {},
        validate: false,
        factoryName: "createExampleController",
        apiOrder: ["run", "cancel"]
      }),
    /requires validation and loading boundaries/
  );
  assert.throws(
    () =>
      createLazyAiCommandController({
        options: {},
        validate() {},
        factoryName: "",
        apiOrder: ["run"]
      }),
    /requires a factory name and API order including cancel/
  );
});
