const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-project-brief-controller.js")).href);
}

function createHarness(createAiProjectBriefController, overrides = {}) {
  let project = {
    id: "p1",
    name: "Project One",
    sourceLang: "en",
    targetLang: "tr",
    aiSettings: { styleGuide: "Keep UI labels concise.", concurrency: 2 }
  };
  let projects = [project, { id: "p2", name: "Other project", aiSettings: {} }];
  const settings = {
    providerId: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "brief-model",
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr"
  };
  const provider = overrides.noProvider ? null : { name: "Ollama", completePrompt() {} };
  const sampleSegments = overrides.sampleSegments || [{ source: "Save the file", target: "Dosyayı kaydedin" }];
  const documents = [{ id: "d1", name: "messages.json" }];
  const terms = Array.from({ length: 14 }, (_, index) => ({
    sourceTerm: `Source ${index}`,
    targetTerm: `Target ${index}`
  }));
  const calls = [];
  const statuses = [];
  const lifecycleStates = [];
  const warnings = [];
  let promptBusy = Boolean(overrides.promptBusy);

  const controller = createAiProjectBriefController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getProjects: () => projects,
      replaceProject(next) {
        calls.push(["replaceProject", structuredClone(next)]);
        project = next;
      },
      replaceProjects(next) {
        calls.push(["replaceProjects", next.map((item) => structuredClone(item))]);
        projects = next;
      }
    },
    settings: {
      persist() {
        calls.push(["persist"]);
        return Promise.resolve(settings);
      },
      runtimeConfig(value) {
        calls.push(["runtimeConfig", value.providerId]);
        if (overrides.runtimeError) throw overrides.runtimeError;
        return { model: value.model, apiKey: "private" };
      },
      assertReady(value, config, action) {
        calls.push(["assertReady", value.providerId, config.model, action]);
      },
      normalizeProjectAiSettings(value) {
        calls.push(["normalizeProjectAiSettings", structuredClone(value)]);
        return { concurrency: 2, ...structuredClone(value), normalized: true };
      }
    },
    providers: {
      get: () => provider,
      sharesExternally: () => Boolean(overrides.external)
    },
    consent: {
      externalShare(details) {
        calls.push(["externalShare", structuredClone(details)]);
        return overrides.externalAccepted !== false;
      }
    },
    context: {
      getSampleSegments() {
        calls.push(["getSampleSegments"]);
        return structuredClone(sampleSegments);
      },
      getDocuments() {
        calls.push(["getDocuments"]);
        return structuredClone(documents);
      },
      getTerms(contextProject) {
        calls.push(["getTerms", contextProject.id]);
        return Promise.resolve(structuredClone(terms));
      }
    },
    domain: {
      generateProjectBrief(options) {
        calls.push(["generateProjectBrief", options]);
        if (overrides.generateError) return Promise.reject(overrides.generateError);
        return Promise.resolve({
          brief: "  Prefer concise, formal UI language.  ",
          provider: "Ollama",
          model: "brief-model"
        });
      }
    },
    lifecycle: {
      isRunning: () => Boolean(overrides.running),
      isPromptBusy: () => promptBusy,
      sync(state) {
        promptBusy = state.promptBusy;
        lifecycleStates.push(structuredClone(state));
      }
    },
    persistence: {
      updateProject(next) {
        calls.push(["updateProject", structuredClone(next)]);
        if (overrides.updateError) return Promise.reject(overrides.updateError);
        return Promise.resolve({ ...structuredClone(next), persisted: true });
      }
    },
    administration: {
      setStyleGuide(value) {
        calls.push(["setStyleGuide", value]);
        if (overrides.administrationError && value.includes("AI project brief")) {
          throw overrides.administrationError;
        }
      }
    },
    presentation: {
      renderCommandCentre: () => calls.push(["renderCommandCentre"]),
      renderOutput: (text, options) => calls.push(["renderOutput", text, options])
    },
    activity: {
      log(details) {
        calls.push(["log", structuredClone(details)]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    logger: { warn: (...args) => warnings.push(args) }
  });

  return {
    controller,
    calls,
    statuses,
    lifecycleStates,
    warnings,
    getProject: () => project,
    getProjects: () => projects
  };
}

test("AI project brief preserves project, busy, runtime, provider, and external-consent safeguards", async () => {
  const { createAiProjectBriefController } = await loadFactory();
  const noProject = createHarness(createAiProjectBriefController, { noProject: true });
  assert.equal(await noProject.controller.generate(), false);
  assert.deepEqual(noProject.calls, []);

  const busy = createHarness(createAiProjectBriefController, { running: true });
  assert.equal(await busy.controller.generate(), false);
  assert.deepEqual(busy.calls, []);

  const runtime = createHarness(createAiProjectBriefController, {
    runtimeError: new Error("key required")
  });
  assert.equal(await runtime.controller.generate(), false);
  assert.match(runtime.statuses.at(-1)[0], /key required/);

  const unavailable = createHarness(createAiProjectBriefController, { noProvider: true });
  assert.equal(await unavailable.controller.generate(), false);
  assert.match(unavailable.statuses.at(-1)[0], /not available/);

  const denied = createHarness(createAiProjectBriefController, {
    external: true,
    externalAccepted: false,
    sampleSegments: []
  });
  assert.equal(await denied.controller.generate(), false);
  assert.equal(
    denied.calls.some(([name]) => name === "generateProjectBrief"),
    false
  );
  assert.equal(denied.calls.find(([name]) => name === "externalShare")[1].includesSourceText, false);
});

test("AI project brief routes bounded context and appends normalized style instructions", async () => {
  const { createAiProjectBriefController } = await loadFactory();
  const harness = createHarness(createAiProjectBriefController);

  assert.equal(await harness.controller.generate(), true);
  const request = harness.calls.find(([name]) => name === "generateProjectBrief")[1];
  assert.equal(request.documents.length, 1);
  assert.equal(request.sampleSegments.length, 1);
  assert.equal(request.terms.length, 12);
  assert.match(harness.getProject().aiSettings.styleGuide, /^Keep UI labels concise\./);
  assert.match(harness.getProject().aiSettings.styleGuide, /AI project brief:\nPrefer concise, formal UI language\.$/);
  assert.equal(harness.getProject().aiSettings.normalized, true);
  assert.equal(harness.getProject().persisted, true);
  assert.equal(
    harness.getProjects().find((project) => project.id === "p1"),
    harness.getProject()
  );
  assert.deepEqual(harness.calls.find(([name]) => name === "log")[1], {
    provider: "Ollama",
    model: "brief-model",
    sampleCount: 1,
    termCount: 12
  });
  assert.deepEqual(harness.statuses.at(-1), ["AI project brief saved to style instructions", "saved"]);
});

test("AI project brief creates a first style block when no existing guide is present", async () => {
  const { createAiProjectBriefController } = await loadFactory();
  const harness = createHarness(createAiProjectBriefController);
  harness.getProject().aiSettings.styleGuide = "  ";

  assert.equal(await harness.controller.generate(), true);
  assert.equal(harness.getProject().aiSettings.styleGuide, "AI project brief:\nPrefer concise, formal UI language.");
});

test("primary AI project brief persistence failure restores exact project and project-list state", async () => {
  const { createAiProjectBriefController } = await loadFactory();
  const harness = createHarness(createAiProjectBriefController, {
    updateError: new Error("project write failed")
  });
  const beforeProject = structuredClone(harness.getProject());
  const beforeOther = structuredClone(harness.getProjects()[1]);

  assert.equal(await harness.controller.generate(), false);
  assert.deepEqual(harness.getProject(), beforeProject);
  assert.deepEqual(harness.getProjects()[0], beforeProject);
  assert.deepEqual(harness.getProjects()[1], beforeOther);
  assert.equal(
    harness.calls.some(([name]) => name === "log"),
    false
  );
  assert.equal(harness.lifecycleStates.at(-1).promptBusy, false);
  assert.match(harness.statuses.at(-1)[0], /project write failed/);
});

test("post-save AI administration failure restores in-memory project state and visible style input", async () => {
  const { createAiProjectBriefController } = await loadFactory();
  const harness = createHarness(createAiProjectBriefController, {
    administrationError: new Error("form refresh failed")
  });
  const before = structuredClone(harness.getProject());

  assert.equal(await harness.controller.generate(), false);
  assert.deepEqual(harness.getProject(), before);
  assert.deepEqual(harness.getProjects()[0], before);
  assert.deepEqual(harness.calls.filter(([name]) => name === "setStyleGuide").at(-1), [
    "setStyleGuide",
    "Keep UI labels concise."
  ]);
  assert.match(harness.statuses.at(-1)[0], /form refresh failed/);
});

test("secondary AI project brief activity failure keeps persisted guidance durable and reports dirty", async () => {
  const { createAiProjectBriefController } = await loadFactory();
  const harness = createHarness(createAiProjectBriefController, {
    activityError: new Error("activity unavailable")
  });

  assert.equal(await harness.controller.generate(), true);
  assert.match(harness.getProject().aiSettings.styleGuide, /AI project brief/);
  assert.equal(harness.calls.filter(([name]) => name === "markDirty").length, 2);
  assert.equal(harness.warnings.length, 1);
  assert.deepEqual(harness.statuses.at(-1), ["AI project brief saved; activity log failed", "dirty"]);
});
