const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-prompt-preview-controller.js")).href);
}

function createHarness(createController, overrides = {}) {
  const project = {
    id: "project-1",
    aiSettings: { styleGuide: "Use concise project style." }
  };
  const activeSegment = overrides.noSegment
    ? null
    : {
        id: "segment-1",
        source: "House and cat",
        target: "Ev ve kedi",
        status: "draft"
      };
  const settings = {
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr",
    variantMode: "formal",
    adaptMode: "shorter",
    includeNearbyContext: overrides.includeNearbyContext !== false
  };
  const promptState = {
    mode: overrides.mode || "review",
    sample: overrides.sample === undefined ? "Custom sample source" : overrides.sample
  };
  const terms = overrides.terms || [
    { sourceTerm: "house", targetTerm: "ev" },
    { sourceTerm: "unmatched", targetTerm: "eşleşmeyen" }
  ];
  const calls = [];
  const builderRequests = new Map();
  const builders = Object.fromEntries(
    [
      "translate",
      "review",
      "tagRepair",
      "polish",
      "adapt",
      "variants",
      "applyTerms",
      "extractTerms",
      "projectBrief"
    ].map((name) => [
      name,
      (request) => {
        calls.push(["builder", name]);
        builderRequests.set(name, structuredClone(request));
        return `${name} prompt`;
      }
    ])
  );
  const controller = createController({
    administration: {
      readPromptState: () => ({ ...promptState }),
      renderPromptPreview: (prompt) => calls.push(["renderPrompt", prompt])
    },
    settings: { read: () => ({ ...settings }) },
    project: {
      get: () => project,
      getActiveSegment: () => activeSegment,
      getTerms: () => terms,
      getDocuments: () => [{ id: "doc-1", name: "source.docx" }],
      getSampleSegments: () => [{ source: "Sample", target: "Örnek" }],
      getSurroundingSegments: (segment, options) => {
        calls.push(["surrounding", segment.id, options.settings.model]);
        return [{ source: "Nearby source", target: "Yakın hedef" }];
      },
      getTags: () => [{ text: "<b>" }, { label: "{name}" }, { text: "", label: "" }]
    },
    builders,
    normalize: { stableLower: (value) => String(value || "").toLowerCase() }
  });
  return {
    activeSegment,
    builderRequests,
    calls,
    controller,
    project,
    promptState,
    settings,
    terms
  };
}

test("AI prompt preview preserves every mode label, system instruction, and consent-context mapping", async () => {
  const { createAiPromptPreviewController } = await loadFactory();
  const harness = createHarness(createAiPromptPreviewController);
  const expectations = {
    pretranslate: ["pre-translation", ["sample source text", "configured provider URL"]],
    review: [
      "review / QA",
      ["sample source text", "current target draft", "project glossary hints", "configured provider URL"]
    ],
    "tag-repair": [
      "tag repair",
      [
        "sample source text",
        "current target draft",
        "project style instructions",
        "project glossary hints",
        "configured provider URL"
      ]
    ],
    polish: [
      "draft polish",
      [
        "sample source text",
        "current target draft",
        "project style instructions",
        "project glossary hints",
        "configured provider URL"
      ]
    ],
    adapt: [
      "draft adaptation",
      [
        "sample source text",
        "current target draft",
        "project style instructions",
        "project glossary hints",
        "configured provider URL"
      ]
    ],
    variants: [
      "alternatives",
      [
        "sample source text",
        "current target draft",
        "project style instructions",
        "project glossary hints",
        "configured provider URL"
      ]
    ],
    "apply-terms": [
      "terminology application",
      ["sample source text", "current target draft", "project terminology hints", "configured provider URL"]
    ],
    "extract-terms": [
      "terminology extraction",
      ["sample source text", "current target draft", "configured provider URL"]
    ],
    "project-brief": [
      "project brief",
      ["project metadata", "document names", "sample segments", "termbase hints", "configured provider URL"]
    ]
  };
  for (const [mode, [label, contexts]] of Object.entries(expectations)) {
    assert.equal(harness.controller.getModeLabel(mode), label);
    assert.deepEqual(harness.controller.getContextLabels(mode), contexts);
    if (mode !== "pretranslate") {
      assert.notEqual(harness.controller.getSystem(mode), harness.controller.getSystem("unknown"));
    }
  }
  assert.equal(harness.controller.getModeLabel("unknown"), "prompt");
  assert.equal(
    harness.controller.getSystem("unknown"),
    "You are a professional CAT-tool translation assistant. Return only the requested output."
  );
});

test("AI prompt preview synthesizes sample, segment, term, token, style, and nearby context before mode routing", async () => {
  const { createAiPromptPreviewController } = await loadFactory();
  const harness = createHarness(createAiPromptPreviewController);
  const request = harness.controller.createRequest({ ...harness.settings, model: "model-1" }, "review");
  assert.equal(request.prompt, "review prompt");
  assert.equal(request.label, "review / QA");
  assert.equal(request.sourceText, "Custom sample source");
  assert.deepEqual(request.glossaryTerms, [{ sourceTerm: "house", targetTerm: "ev" }]);
  assert.deepEqual(request.segment, {
    ...harness.activeSegment,
    source: "Custom sample source",
    target: "Ev ve kedi",
    tags: [{ text: "<b>" }, { label: "{name}" }, { text: "", label: "" }]
  });
  const common = harness.builderRequests.get("review");
  assert.equal(common.project.id, "project-1");
  assert.equal(common.sourceText, "Custom sample source");
  assert.equal(common.targetText, "Ev ve kedi");
  assert.deepEqual(common.protectedTokens, ["<b>", "{name}"]);
  assert.deepEqual(common.tmMatches, []);
  assert.equal(common.styleGuide, "Use concise project style.");
  assert.equal(common.variantMode, "formal");
  assert.equal(common.adaptMode, "shorter");
  assert.deepEqual(common.surroundingSegments, [{ source: "Nearby source", target: "Yakın hedef" }]);
});

test("AI prompt preview falls back to active source and bounded project terms for translation", async () => {
  const { createAiPromptPreviewController } = await loadFactory();
  const terms = Array.from({ length: 15 }, (_, index) => ({
    sourceTerm: `term-${index}`,
    targetTerm: `terim-${index}`
  }));
  const harness = createHarness(createAiPromptPreviewController, {
    mode: "pretranslate",
    sample: "",
    terms,
    includeNearbyContext: false
  });
  const request = harness.controller.createRequest(undefined, "pretranslate");
  assert.equal(request.sourceText, "House and cat");
  assert.equal(request.glossaryTerms.length, 12);
  assert.equal(request.prompt, "translate prompt");
  const common = harness.builderRequests.get("translate");
  assert.equal(common.text, "House and cat");
  assert.deepEqual(common.surroundingSegments, []);
  assert.equal(
    harness.calls.some(([name]) => name === "surrounding"),
    false
  );
});

test("AI project-brief preview adds bounded document, sample, and term context", async () => {
  const { createAiPromptPreviewController } = await loadFactory();
  const terms = Array.from({ length: 15 }, (_, index) => ({ sourceTerm: `s${index}`, targetTerm: `t${index}` }));
  const harness = createHarness(createAiPromptPreviewController, {
    mode: "project-brief",
    terms
  });
  const request = harness.controller.createRequest(undefined, "project-brief");
  assert.equal(request.prompt, "projectBrief prompt");
  const common = harness.builderRequests.get("projectBrief");
  assert.deepEqual(common.documents, [{ id: "doc-1", name: "source.docx" }]);
  assert.deepEqual(common.sampleSegments, [{ source: "Sample", target: "Örnek" }]);
  assert.equal(common.terms.length, 12);
});

test("AI prompt preview rendering reads current settings and presents the routed prompt", async () => {
  const { createAiPromptPreviewController } = await loadFactory();
  const harness = createHarness(createAiPromptPreviewController, { mode: "polish" });
  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(harness.calls.at(-1), ["renderPrompt", "polish prompt"]);
});
