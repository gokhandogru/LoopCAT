const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const pretranslationOrder = [
  "isLockedSegment",
  "segmentSkipReason",
  "selectSegments",
  "applyAiPretranslation",
  "pretranslateSegments"
];
const commandOrder = [
  "buildAiReviewPrompt",
  "buildTagRepairPrompt",
  "buildTargetVariantsPrompt",
  "buildStylePolishPrompt",
  "buildDraftAdaptationPrompt",
  "buildTerminologyExtractionPrompt",
  "buildTerminologyApplicationPrompt",
  "parseAiReviewRisk",
  "normalizeAiReviewRiskLevel",
  "extractSegmentTerms",
  "applyTerminology",
  "generateProjectBrief",
  "adaptSegmentDraft",
  "polishSegmentStyle",
  "repairSegmentTags",
  "suggestSegmentVariants",
  "reviewSegment"
];
const syncCommandCount = 9;

function compatibilityModule() {
  const preTranslationService = Object.fromEntries(
    pretranslationOrder.map((method) => [method, (...args) => [method, args]])
  );
  const aiCommandService = Object.fromEntries(commandOrder.map((method) => [method, (...args) => [method, args]]));
  return {
    openAiSuggestion: (...args) => ["openAiSuggestion", args],
    preTranslationService,
    aiCommandService
  };
}

function implementation(calls = []) {
  const preTranslationService = Object.fromEntries(
    pretranslationOrder.map((method) => [
      method,
      function (...args) {
        calls.push([method, this, args]);
        return { method, args };
      }
    ])
  );
  const aiCommandService = Object.fromEntries(
    commandOrder.map((method) => [
      method,
      function (...args) {
        calls.push([method, this, args]);
        return { method, args };
      }
    ])
  );
  const module = {
    openAiSuggestion(...args) {
      calls.push(["openAiSuggestion", this, args]);
      return { method: "openAiSuggestion", args };
    },
    preTranslationService,
    aiCommandService
  };
  return module;
}

test("lazy AI command domain preserves synchronous contracts and installs ordered mutable facades without loading", async () => {
  const { installLazyAiCommandDomain } = await moduleAt("src/ai/install-lazy-ai-command-domain.js");
  const original = compatibilityModule();
  const browserWindow = { CatHan: { ai: original } };
  let loadCount = 0;
  const installation = installLazyAiCommandDomain(browserWindow, {
    load() {
      loadCount += 1;
    }
  });

  assert.equal(browserWindow.CatHan.ai.openAiSuggestion, installation.openAiSuggestion);
  assert.equal(browserWindow.CatHan.ai.preTranslationService, installation.preTranslationService);
  assert.equal(browserWindow.CatHan.ai.aiCommandService, installation.aiCommandService);
  assert.deepEqual(Object.keys(installation.preTranslationService), pretranslationOrder);
  assert.deepEqual(Object.keys(installation.aiCommandService), commandOrder);
  for (const method of pretranslationOrder.slice(0, -1)) {
    assert.equal(installation.preTranslationService[method], original.preTranslationService[method]);
  }
  for (const method of commandOrder.slice(0, syncCommandCount)) {
    assert.equal(installation.aiCommandService[method], original.aiCommandService[method]);
  }
  assert.equal(loadCount, 0);
  assert.equal(Object.isFrozen(installation.preTranslationService), false);
  assert.equal(Object.isFrozen(installation.aiCommandService), false);
  assert.equal(Object.isFrozen(installation), true);
});

test("lazy AI command domain shares one concurrent load and preserves service receivers arguments and results", async () => {
  const { installLazyAiCommandDomain } = await moduleAt("src/ai/install-lazy-ai-command-domain.js");
  const browserWindow = { CatHan: { ai: compatibilityModule() } };
  let resolveLoad;
  let loadCount = 0;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const installation = installLazyAiCommandDomain(browserWindow, {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const calls = [];
  const installed = implementation(calls);
  const openAiResult = installation.openAiSuggestion({ segment: { id: "seg-1" } });
  const pretranslationResult = installation.preTranslationService.pretranslateSegments(["one"]);
  const reviewResult = installation.aiCommandService.reviewSegment({ targetText: "Target" });
  const termsResult = installation.aiCommandService.extractSegmentTerms({ sourceText: "Source" });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  Object.assign(browserWindow.CatHan.ai, installed);
  resolveLoad();

  assert.deepEqual(await openAiResult, { method: "openAiSuggestion", args: [{ segment: { id: "seg-1" } }] });
  assert.deepEqual(await pretranslationResult, { method: "pretranslateSegments", args: [["one"]] });
  assert.deepEqual(await reviewResult, { method: "reviewSegment", args: [{ targetText: "Target" }] });
  assert.deepEqual(await termsResult, { method: "extractSegmentTerms", args: [{ sourceText: "Source" }] });
  assert.deepEqual(
    calls.map(([method, receiver]) => [
      method,
      receiver === browserWindow.CatHan.ai ||
        receiver === installed.preTranslationService ||
        receiver === installed.aiCommandService
    ]),
    [
      ["openAiSuggestion", true],
      ["pretranslateSegments", true],
      ["reviewSegment", true],
      ["extractSegmentTerms", true]
    ]
  );
  assert.equal(loadCount, 1);
});

test("lazy AI command domain redacts load failure preserves its cause restores facades and retries", async () => {
  const { installLazyAiCommandDomain } = await moduleAt("src/ai/install-lazy-ai-command-domain.js");
  const browserWindow = { CatHan: { ai: compatibilityModule() } };
  const expectedError = new Error("C:\\Users\\person\\secret-ai-command-domain.js failed");
  let loadCount = 0;
  const installation = installLazyAiCommandDomain(browserWindow, {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      Object.assign(browserWindow.CatHan.ai, implementation());
    }
  });

  await assert.rejects(installation.aiCommandService.reviewSegment({}), (error) => {
    assert.equal(error.message, "AI command domain could not be loaded. Try again.");
    assert.equal(error.cause, expectedError);
    assert.equal(error.message.includes("person"), false);
    return true;
  });
  assert.equal(browserWindow.CatHan.ai.openAiSuggestion, installation.openAiSuggestion);
  assert.equal(browserWindow.CatHan.ai.preTranslationService, installation.preTranslationService);
  assert.equal(browserWindow.CatHan.ai.aiCommandService, installation.aiCommandService);
  assert.deepEqual(await installation.aiCommandService.reviewSegment({ retry: true }), {
    method: "reviewSegment",
    args: [{ retry: true }]
  });
  assert.equal(loadCount, 2);
});

test("lazy AI command domain rejects incomplete installation and permits a repaired retry", async () => {
  const { installLazyAiCommandDomain } = await moduleAt("src/ai/install-lazy-ai-command-domain.js");
  const browserWindow = { CatHan: { ai: compatibilityModule() } };
  let loadCount = 0;
  const installation = installLazyAiCommandDomain(browserWindow, {
    load() {
      loadCount += 1;
      if (loadCount === 1) {
        browserWindow.CatHan.ai.openAiSuggestion = () => "incomplete";
        browserWindow.CatHan.ai.preTranslationService = { isLockedSegment() {} };
        browserWindow.CatHan.ai.aiCommandService = { reviewSegment() {} };
      } else {
        Object.assign(browserWindow.CatHan.ai, implementation());
      }
    }
  });

  await assert.rejects(
    installation.preTranslationService.pretranslateSegments({}),
    /AI command domain could not be loaded/
  );
  assert.deepEqual(await installation.preTranslationService.pretranslateSegments({ repaired: true }), {
    method: "pretranslateSegments",
    args: [{ repaired: true }]
  });
  assert.equal(loadCount, 2);
});

test("lazy AI command domain propagates implementation failures without rewriting them", async () => {
  const { installLazyAiCommandDomain } = await moduleAt("src/ai/install-lazy-ai-command-domain.js");
  const browserWindow = { CatHan: { ai: compatibilityModule() } };
  const expectedError = new Error("Provider command failed safely");
  const installed = implementation();
  installed.aiCommandService.applyTerminology = () => {
    throw expectedError;
  };
  const installation = installLazyAiCommandDomain(browserWindow, {
    load() {
      Object.assign(browserWindow.CatHan.ai, installed);
    }
  });

  await assert.rejects(installation.aiCommandService.applyTerminology({}), (error) => error === expectedError);
});

test("lazy AI command domain validates compatibility and loader boundaries", async () => {
  const { installLazyAiCommandDomain } = await moduleAt("src/ai/install-lazy-ai-command-domain.js");
  assert.throws(() => installLazyAiCommandDomain({}), /requires the LoopCAT AI compatibility module/);
  assert.throws(
    () => installLazyAiCommandDomain({ CatHan: { ai: {} } }),
    /requires complete synchronous compatibility contracts/
  );
  assert.throws(
    () => installLazyAiCommandDomain({ CatHan: { ai: compatibilityModule() } }, { load: false }),
    /requires a load function/
  );
});
