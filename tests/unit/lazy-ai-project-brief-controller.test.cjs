const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function controllerOptions() {
  const fn = () => {};
  return {
    editorSessionStore: { getProject: fn, getProjects: fn, replaceProject: fn, replaceProjects: fn },
    settings: { persist: fn, runtimeConfig: fn, assertReady: fn, normalizeProjectAiSettings: fn },
    providers: { get: fn, sharesExternally: fn },
    consent: { externalShare: fn },
    context: { getSampleSegments: fn, getDocuments: fn, getTerms: fn },
    domain: { generateProjectBrief: fn },
    lifecycle: { isRunning: fn, isPromptBusy: fn, sync: fn },
    persistence: { updateProject: fn },
    administration: { setStyleGuide: fn },
    presentation: { renderCommandCentre: fn, renderOutput: fn },
    activity: { log: fn },
    workspace: { markDirty: fn },
    status: { set: fn }
  };
}

function implementation(calls = []) {
  return {
    generate(...args) {
      calls.push([this, args]);
      return { args };
    }
  };
}

test("lazy AI project brief validates synchronously and exposes the frozen API without loading", async () => {
  const { createLazyAiProjectBriefController } = await moduleAt("src/features/ai/lazy-ai-project-brief-controller.js");
  let loadCount = 0;
  const controller = createLazyAiProjectBriefController(controllerOptions(), {
    load() {
      loadCount += 1;
    }
  });

  assert.deepEqual(Object.keys(controller), ["generate"]);
  assert.equal(Object.isFrozen(controller), true);
  assert.equal(loadCount, 0);
  assert.throws(
    () => createLazyAiProjectBriefController({}, { load() {} }),
    /AiProjectBriefController requires EditorSessionStore/
  );
});

test("lazy AI project brief shares one concurrent load and preserves options receiver arguments and results", async () => {
  const { createLazyAiProjectBriefController } = await moduleAt("src/features/ai/lazy-ai-project-brief-controller.js");
  const options = controllerOptions();
  const calls = [];
  const installed = implementation(calls);
  let receivedOptions;
  let resolveLoad;
  let loadCount = 0;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const controller = createLazyAiProjectBriefController(options, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const first = controller.generate("first");
  const second = controller.generate({ request: "second" });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad({
    createAiProjectBriefController(value) {
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

test("lazy AI project brief redacts load failure preserves its cause and retries generation", async () => {
  const { createLazyAiProjectBriefController } = await moduleAt("src/features/ai/lazy-ai-project-brief-controller.js");
  const expectedError = new Error("C:\\Users\\person\\private-ai-project-brief-chunk.js failed");
  let loadCount = 0;
  const controller = createLazyAiProjectBriefController(controllerOptions(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return { createAiProjectBriefController: () => implementation() };
    }
  });

  await assert.rejects(controller.generate(), (error) => {
    assert.equal(error.message, "AI project brief implementation could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.deepEqual(await controller.generate("retry"), { args: ["retry"] });
  assert.equal(loadCount, 2);
});

test("lazy AI project brief rejects incomplete implementation and permits a repaired retry", async () => {
  const { createLazyAiProjectBriefController } = await moduleAt("src/features/ai/lazy-ai-project-brief-controller.js");
  let loadCount = 0;
  const controller = createLazyAiProjectBriefController(controllerOptions(), {
    load() {
      loadCount += 1;
      return {
        createAiProjectBriefController: () => (loadCount === 1 ? {} : implementation())
      };
    }
  });

  await assert.rejects(controller.generate(), /AI project brief implementation could not be loaded/);
  assert.deepEqual(await controller.generate("repaired"), { args: ["repaired"] });
  assert.equal(loadCount, 2);
});

test("lazy AI project brief preserves implementation failure identity without reloading", async () => {
  const { createLazyAiProjectBriefController } = await moduleAt("src/features/ai/lazy-ai-project-brief-controller.js");
  const expectedError = new Error("AI project brief failed");
  let loadCount = 0;
  const installed = {
    generate() {
      throw expectedError;
    }
  };
  const controller = createLazyAiProjectBriefController(controllerOptions(), {
    load() {
      loadCount += 1;
      return { createAiProjectBriefController: () => installed };
    }
  });

  await assert.rejects(controller.generate(), (error) => error === expectedError);
  await assert.rejects(controller.generate(), (error) => error === expectedError);
  assert.equal(loadCount, 1);
});

test("lazy AI project brief validates loader configuration", async () => {
  const { createLazyAiProjectBriefController } = await moduleAt("src/features/ai/lazy-ai-project-brief-controller.js");
  assert.throws(
    () => createLazyAiProjectBriefController(controllerOptions(), { load: false }),
    /requires a load function/
  );
});
