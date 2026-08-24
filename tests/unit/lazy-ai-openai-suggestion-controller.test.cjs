const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function controllerOptions() {
  const fn = () => {};
  return {
    editorSessionStore: {
      getProject: fn,
      getProjects: fn,
      getSegments: fn,
      replaceProject: fn,
      replaceProjects: fn
    },
    selection: { getActiveIndex: fn },
    administration: { readGlobalForm: fn, readSecrets: fn },
    settings: { normalize: fn },
    provider: { isOpenAi: fn, appearsOffline: fn, request: fn },
    keys: { readStored: fn, snapshot: fn, save: fn, restore: fn },
    consent: { externalShare: fn },
    persistence: { updateProject: fn },
    context: { forSegment: fn },
    suggestions: { append: fn },
    presentation: { renderEditor: fn },
    workspace: { markDirty: fn, markRollbackDirty: fn },
    status: { set: fn },
    defaults: { model: "gpt-test" }
  };
}

function implementation(calls = []) {
  return {
    create(...args) {
      calls.push([this, args]);
      return { args };
    }
  };
}

test("lazy direct OpenAI suggestion validates synchronously and exposes the frozen API without loading", async () => {
  const { createLazyAiOpenAiSuggestionController } = await moduleAt(
    "src/features/ai/lazy-ai-openai-suggestion-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyAiOpenAiSuggestionController(controllerOptions(), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), ["create"]);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(loadCount, 0);
  assert.throws(
    () => createLazyAiOpenAiSuggestionController({}, { load() {} }),
    /AiOpenAiSuggestionController requires EditorSessionStore/
  );
});

test("lazy direct OpenAI suggestion shares one concurrent load and preserves options receiver arguments and results", async () => {
  const { createLazyAiOpenAiSuggestionController } = await moduleAt(
    "src/features/ai/lazy-ai-openai-suggestion-controller.js"
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
  const controller = createLazyAiOpenAiSuggestionController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.create("first");
  const second = controller.create({ request: "second" });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createAiOpenAiSuggestionController(value) {
      receivedOptions = value;
      return installed;
    }
  });

  assert.deepEqual(await first, { args: ["first"] });
  assert.deepEqual(await second, { args: [{ request: "second" }] });
  assert.equal(receivedOptions, options);
  assert.deepEqual(
    calls.map(([receiver, args]) => [receiver === installed, args]),
    [
      [true, ["first"]],
      [true, [{ request: "second" }]]
    ]
  );
});

test("lazy direct OpenAI suggestion redacts load failure preserves its cause and retries creation", async () => {
  const { createLazyAiOpenAiSuggestionController } = await moduleAt(
    "src/features/ai/lazy-ai-openai-suggestion-controller.js"
  );
  const expectedError = new Error("C:\\Users\\person\\private-openai-suggestion-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyAiOpenAiSuggestionController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createAiOpenAiSuggestionController: () => implementation() };
    }
  });

  await assert.rejects(controller.create(), (error) => {
    assert.equal(error.message, "Direct OpenAI suggestion implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.deepEqual(await controller.create("retry"), { args: ["retry"] });
  assert.equal(loadCount, 2);
});

test("lazy direct OpenAI suggestion rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyAiOpenAiSuggestionController } = await moduleAt(
    "src/features/ai/lazy-ai-openai-suggestion-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyAiOpenAiSuggestionController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createAiOpenAiSuggestionController: () => (loadCount === 1 ? {} : implementation())
      };
    }
  });

  await assert.rejects(controller.create(), /Direct OpenAI suggestion implementation could not be loaded/);
  assert.deepEqual(await controller.create("repaired"), { args: ["repaired"] });
  assert.equal(loadCount, 2);
});

test("lazy direct OpenAI suggestion preserves implementation failure identity without reloading", async () => {
  const { createLazyAiOpenAiSuggestionController } = await moduleAt(
    "src/features/ai/lazy-ai-openai-suggestion-controller.js"
  );
  const expectedError = new Error("direct OpenAI suggestion failed");
  let loadCount = 0;
  const installed = {
    create() {
      throw expectedError;
    }
  };
  const controller = createLazyAiOpenAiSuggestionController(controllerOptions(), {
    load() {
      loadCount += 1;
      return { createAiOpenAiSuggestionController: () => installed };
    }
  });

  await assert.rejects(controller.create(), (error) => error === expectedError);
  await assert.rejects(controller.create(), (error) => error === expectedError);
  assert.equal(loadCount, 1);
});

test("lazy direct OpenAI suggestion validates loader configuration", async () => {
  const { createLazyAiOpenAiSuggestionController } = await moduleAt(
    "src/features/ai/lazy-ai-openai-suggestion-controller.js"
  );
  assert.throws(
    () => createLazyAiOpenAiSuggestionController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
