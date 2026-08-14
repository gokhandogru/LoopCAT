const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-prompt-test-controller.js")).href);
}

function createHarness(createController, overrides = {}) {
  const project = { id: "project-1", name: "Prompt project" };
  const settings = {
    providerId: "provider-1",
    model: "model-1",
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr"
  };
  const mode = overrides.mode || "pretranslate";
  const calls = [];
  const statuses = [];
  const lifecycleStates = [];
  const consentDetails = [];
  let sharedPromptBusy = Boolean(overrides.promptBusy);
  let output = "";
  const provider = overrides.noProvider
    ? null
    : {
        name: "Prompt provider",
        translateSegment: (config, request) => {
          calls.push(["translate", config, request]);
          return overrides.providerError
            ? Promise.reject(overrides.providerError)
            : Promise.resolve(
                overrides.result || {
                  rawOutput: "raw translation",
                  translatedText: "normalized translation"
                }
              );
        },
        ...(overrides.noComplete
          ? {}
          : {
              completePrompt: (config, request) => {
                calls.push(["complete", config, request]);
                return overrides.providerError
                  ? Promise.reject(overrides.providerError)
                  : Promise.resolve(overrides.result || { text: "generic completion" });
              }
            })
      };
  const controller = createController({
    project: { get: () => (overrides.noProject ? null : project) },
    settings: {
      persist: () => {
        calls.push(["persist"]);
        return Promise.resolve(settings);
      },
      runtimeConfig: () => {
        calls.push(["runtimeConfig"]);
        if (overrides.runtimeError) throw overrides.runtimeError;
        return { api: "config" };
      },
      assertReady: (value, config, action) => {
        calls.push(["assertReady", value.providerId, config.api, action]);
        if (overrides.readyError) throw overrides.readyError;
      }
    },
    prompt: {
      getMode: () => mode,
      getSampleText: () => (overrides.sample === undefined ? "Sample source" : overrides.sample),
      createRequest: (value, promptMode) => {
        calls.push(["createRequest", value.providerId, promptMode]);
        return {
          label: overrides.label || (promptMode === "pretranslate" ? "pre-translation" : "review / QA"),
          sourceText: "Request source",
          segment: { id: "segment-1", target: "Draft" },
          glossaryTerms: [{ sourceTerm: "term", targetTerm: "terim" }],
          prompt: "Built prompt",
          system: "Built system"
        };
      },
      getModeLabel: (promptMode) => (promptMode === "review" ? "review / QA" : promptMode),
      getContextLabels: (promptMode) => [`${promptMode} context`, "configured provider URL"],
      hasProjectBriefSamples: () => Boolean(overrides.projectBriefSamples)
    },
    providers: {
      get: () => {
        calls.push(["getProvider"]);
        return provider;
      },
      sharesExternally: () => Boolean(overrides.sharesExternally)
    },
    consent: {
      externalShare: (details) => {
        consentDetails.push(details);
        return overrides.consent !== false;
      }
    },
    lifecycle: {
      isRunning: () => Boolean(overrides.running),
      isPromptBusy: () => sharedPromptBusy,
      sync: ({ promptBusy }) => {
        sharedPromptBusy = promptBusy;
        lifecycleStates.push({ promptBusy });
      }
    },
    output: {
      set: (value) => {
        output = value;
        calls.push(["setOutput", value]);
      }
    },
    presentation: {
      renderCommandCentre: () => calls.push(["renderCommandCentre", sharedPromptBusy]),
      renderOutput: (value, options) => calls.push(["renderOutput", value, options])
    },
    status: { set: (message, statusMode) => statuses.push([message, statusMode]) }
  });
  return {
    calls,
    consentDetails,
    controller,
    lifecycleStates,
    output: () => output,
    project,
    settings,
    statuses
  };
}

test("AI prompt testing preserves project, shared-running, busy, and sample-source safeguards", async () => {
  const { createAiPromptTestController } = await loadFactory();
  for (const overrides of [{ noProject: true }, { running: true }, { promptBusy: true }]) {
    const harness = createHarness(createAiPromptTestController, overrides);
    assert.equal(await harness.controller.testPrompt(), undefined);
    assert.deepEqual(harness.calls, []);
  }
  const empty = createHarness(createAiPromptTestController, { sample: "" });
  assert.equal(await empty.controller.testPrompt(), undefined);
  assert.deepEqual(empty.statuses.at(-1), ["Enter sample source text or select a segment first.", "dirty"]);
  assert.equal(
    empty.calls.some(([name]) => name === "persist"),
    false
  );
});

test("AI prompt testing preserves runtime, provider, and mode-capability validation", async () => {
  const { createAiPromptTestController } = await loadFactory();
  const invalid = createHarness(createAiPromptTestController, {
    readyError: new Error("provider key unavailable")
  });
  assert.equal(await invalid.controller.testPrompt(), undefined);
  assert.deepEqual(invalid.statuses.at(-1), ["provider key unavailable", "dirty"]);
  const missing = createHarness(createAiPromptTestController, { noProvider: true });
  assert.equal(await missing.controller.testPrompt(), undefined);
  assert.deepEqual(missing.statuses.at(-1), ["Prompt testing is not available for this provider.", "dirty"]);
  const unsupported = createHarness(createAiPromptTestController, {
    mode: "review",
    noComplete: true
  });
  assert.equal(await unsupported.controller.testPrompt(), undefined);
  assert.deepEqual(unsupported.statuses.at(-1), [
    "review / QA prompt testing is not available for this provider.",
    "dirty"
  ]);
});

test("AI prompt testing discloses mode-aware external context and cancels before provider invocation", async () => {
  const { createAiPromptTestController } = await loadFactory();
  const harness = createHarness(createAiPromptTestController, {
    mode: "project-brief",
    sample: "",
    sharesExternally: true,
    projectBriefSamples: false,
    consent: false
  });
  assert.equal(await harness.controller.testPrompt(), undefined);
  assert.deepEqual(harness.consentDetails, [
    {
      provider: "Prompt provider",
      includesSourceText: false,
      contextLabels: ["project-brief context", "configured provider URL"]
    }
  ]);
  assert.equal(
    harness.calls.some(([name]) => name === "complete"),
    false
  );
  assert.deepEqual(harness.statuses.at(-1), ["AI prompt test canceled", "dirty"]);
});

test("pre-translation prompt testing routes the exact translation request and normalizes output", async () => {
  const { createAiPromptTestController } = await loadFactory();
  const harness = createHarness(createAiPromptTestController);
  assert.equal(await harness.controller.testPrompt(), true);
  const [, config, request] = harness.calls.find(([name]) => name === "translate");
  assert.deepEqual(config, { api: "config" });
  assert.deepEqual(request, {
    project: harness.project,
    text: "Request source",
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr",
    segment: { id: "segment-1", target: "Draft" },
    glossaryTerms: [{ sourceTerm: "term", targetTerm: "terim" }],
    prompt: "Built prompt"
  });
  assert.equal(harness.output(), "raw translation");
  assert.deepEqual(harness.lifecycleStates, [{ promptBusy: true }, { promptBusy: false }]);
  assert.deepEqual(harness.statuses.at(-1), ["pre-translation prompt returned output", "saved"]);
});

test("generic prompt testing routes project, prompt, system, and selected model", async () => {
  const { createAiPromptTestController } = await loadFactory();
  const harness = createHarness(createAiPromptTestController, { mode: "review" });
  assert.equal(await harness.controller.testPrompt(), true);
  const [, config, request] = harness.calls.find(([name]) => name === "complete");
  assert.deepEqual(config, { api: "config" });
  assert.deepEqual(request, {
    project: harness.project,
    prompt: "Built prompt",
    system: "Built system",
    model: "model-1"
  });
  assert.equal(harness.output(), "generic completion");
  assert.equal(harness.calls.filter(([name]) => name === "renderCommandCentre").length, 2);
});

test("AI prompt provider failure remains visible and always releases prompt-busy presentation", async () => {
  const { createAiPromptTestController } = await loadFactory();
  const harness = createHarness(createAiPromptTestController, {
    providerError: new Error("prompt provider unavailable")
  });
  assert.equal(await harness.controller.testPrompt(), false);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "renderOutput"),
    ["renderOutput", "prompt provider unavailable", { muted: false }]
  );
  assert.deepEqual(harness.statuses.at(-1), ["prompt provider unavailable", "dirty"]);
  assert.deepEqual(harness.lifecycleStates.at(-1), { promptBusy: false });
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "renderCommandCentre"),
    [
      ["renderCommandCentre", true],
      ["renderCommandCentre", false]
    ]
  );
});
