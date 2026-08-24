const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function controllerOptions() {
  const fn = () => {};
  return {
    editorSessionStore: { getProject: fn, getSegments: fn, replaceSegmentAt: fn },
    commands: { bus: { execute: fn }, create: fn, changed: fn },
    selection: { getActiveIndex: fn, goToNextOpen: fn },
    mutation: {
      applyTarget: fn,
      touch: fn,
      restoreInPlace: fn,
      prepareHistory: fn,
      prepareRestoreSnapshot: fn
    },
    persistence: { flush: fn, clearPending: fn, save: fn },
    activity: { log: fn },
    presentation: {
      renderSegments: fn,
      renderProgress: fn,
      renderHistory: fn,
      renderSuggestions: fn,
      refreshSidebar: fn,
      renderAll: fn,
      focusTarget: fn
    },
    workspace: { markDirty: fn, markActivityWarningDirty: fn },
    status: { set: fn }
  };
}

function implementation(calls = []) {
  return {
    apply(...args) {
      calls.push([this, args]);
      return { args };
    }
  };
}

test("lazy AI suggestion application validates synchronously and exposes the frozen API without loading", async () => {
  const { createLazyAiSuggestionApplicationController } = await moduleAt(
    "src/features/ai/lazy-ai-suggestion-application-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyAiSuggestionApplicationController(controllerOptions(), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), ["apply"]);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(loadCount, 0);
  assert.throws(
    () => createLazyAiSuggestionApplicationController({}, { load() {} }),
    /AiSuggestionApplicationController requires EditorSessionStore/
  );
});

test("lazy AI suggestion application shares one concurrent load and preserves options receiver arguments and results", async () => {
  const { createLazyAiSuggestionApplicationController } = await moduleAt(
    "src/features/ai/lazy-ai-suggestion-application-controller.js"
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
  const controller = createLazyAiSuggestionApplicationController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.apply("suggestion-1");
  const second = controller.apply("suggestion-2", { andNext: true });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createAiSuggestionApplicationController(value) {
      receivedOptions = value;
      return installed;
    }
  });

  assert.deepEqual(await first, { args: ["suggestion-1"] });
  assert.deepEqual(await second, { args: ["suggestion-2", { andNext: true }] });
  assert.equal(receivedOptions, options);
  assert.deepEqual(
    calls.map(([receiver, args]) => [receiver === installed, args]),
    [
      [true, ["suggestion-1"]],
      [true, ["suggestion-2", { andNext: true }]]
    ]
  );
});

test("lazy AI suggestion application redacts load failure preserves its cause and retries application", async () => {
  const { createLazyAiSuggestionApplicationController } = await moduleAt(
    "src/features/ai/lazy-ai-suggestion-application-controller.js"
  );
  const expectedError = new Error("C:\\Users\\person\\private-ai-suggestion-application-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyAiSuggestionApplicationController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createAiSuggestionApplicationController: () => implementation() };
    }
  });

  await assert.rejects(controller.apply("suggestion-1"), (error) => {
    assert.equal(error.message, "AI suggestion application implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.deepEqual(await controller.apply("retry"), { args: ["retry"] });
  assert.equal(loadCount, 2);
});

test("lazy AI suggestion application rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyAiSuggestionApplicationController } = await moduleAt(
    "src/features/ai/lazy-ai-suggestion-application-controller.js"
  );
  let loadCount = 0;
  const controller = createLazyAiSuggestionApplicationController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createAiSuggestionApplicationController: () => (loadCount === 1 ? {} : implementation())
      };
    }
  });

  await assert.rejects(controller.apply(), /AI suggestion application implementation could not be loaded/);
  assert.deepEqual(await controller.apply("repaired"), { args: ["repaired"] });
  assert.equal(loadCount, 2);
});

test("lazy AI suggestion application preserves implementation failure identity without reloading", async () => {
  const { createLazyAiSuggestionApplicationController } = await moduleAt(
    "src/features/ai/lazy-ai-suggestion-application-controller.js"
  );
  const expectedError = new Error("AI suggestion application failed");
  let loadCount = 0;
  const installed = {
    apply() {
      throw expectedError;
    }
  };
  const controller = createLazyAiSuggestionApplicationController(controllerOptions(), {
    load() {
      loadCount += 1;
      return { createAiSuggestionApplicationController: () => installed };
    }
  });

  await assert.rejects(controller.apply(), (error) => error === expectedError);
  await assert.rejects(controller.apply(), (error) => error === expectedError);
  assert.equal(loadCount, 1);
});

test("lazy AI suggestion application validates loader configuration", async () => {
  const { createLazyAiSuggestionApplicationController } = await moduleAt(
    "src/features/ai/lazy-ai-suggestion-application-controller.js"
  );
  assert.throws(
    () => createLazyAiSuggestionApplicationController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
