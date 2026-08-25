const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-command-catalog-service.js")).href);
}

const ACTION_NAMES = [
  "confirm",
  "nextOpen",
  "previousOpen",
  "toggleFocus",
  "copySource",
  "saveToTm",
  "openProjectDialog",
  "runQa",
  "exportQualityPassport",
  "nextQualityRisk",
  "openConcordance",
  "openQuickInsert",
  "focusSearch",
  "openReplace",
  "openReviewComment",
  "applyFilterPreset",
  "exportProjectReport",
  "exportAnonymizedReport",
  "aiPretranslate",
  "aiReviewActive",
  "aiReviewBatch",
  "aiTagRepairActive",
  "aiTagRepairBatch",
  "aiPolishActive",
  "aiPolishBatch",
  "aiAdaptActive",
  "aiAdaptBatch",
  "aiVariantsActive",
  "aiVariantsBatch",
  "aiApplyTermsActive",
  "aiApplyTermsBatch",
  "aiExtractTermsActive",
  "aiExtractTermsBatch",
  "aiProjectBrief",
  "openAiSuggestion"
];

function createHarness(createApplicationCommandCatalogService, overrides = {}) {
  const calls = [];
  const model = {
    commandProjectId: overrides.commandProjectId ?? "",
    project: Object.hasOwn(overrides, "project") ? overrides.project : { id: "project-1" },
    segments: Object.hasOwn(overrides, "segments") ? overrides.segments : [{ id: "segment-1" }],
    applicationState: overrides.applicationState || {
      interface: { focusMode: false },
      navigation: { view: "editor" }
    },
    activeSegment: Object.hasOwn(overrides, "activeSegment")
      ? overrides.activeSegment
      : { id: "segment-1", target: " translated " },
    aiState: overrides.aiState || { running: false, promptBusy: false },
    trashAvailable: overrides.trashAvailable ?? true,
    canUndo: overrides.canUndo ?? true,
    canRedo: overrides.canRedo ?? true,
    canSplit: overrides.canSplit ?? true,
    canMerge: overrides.canMerge ?? true,
    nextSegment: overrides.nextSegment || { id: "segment-2" },
    quickInsertAvailable: overrides.quickInsertAvailable ?? true
  };
  const action =
    (name) =>
    (...args) => {
      calls.push(["run", name, ...args]);
      return `result:${name}`;
    };
  const actions = Object.fromEntries(ACTION_NAMES.map((name) => [name, action(name)]));
  const dependencies = {
    command: {
      getProjectId() {
        calls.push(["getCommandProjectId"]);
        if (overrides.commandProjectError) throw overrides.commandProjectError;
        return model.commandProjectId;
      }
    },
    history: {
      undo: action("undo"),
      redo: action("redo"),
      canUndo(projectId) {
        calls.push(["canUndo", projectId]);
        if (overrides.canUndoError) throw overrides.canUndoError;
        return model.canUndo;
      },
      canRedo(projectId) {
        calls.push(["canRedo", projectId]);
        if (overrides.canRedoError) throw overrides.canRedoError;
        return model.canRedo;
      }
    },
    trash: {
      open: action("trash"),
      isAvailable() {
        calls.push(["trashAvailable"]);
        return model.trashAvailable;
      }
    },
    session: {
      getProject() {
        calls.push(["getProject"]);
        return model.project;
      },
      getSegments() {
        calls.push(["getSegments"]);
        return model.segments;
      }
    },
    application: {
      getState() {
        calls.push(["getApplicationState"]);
        return model.applicationState;
      }
    },
    selection: {
      getActiveSegment() {
        calls.push(["getActiveSegment"]);
        if (overrides.activeSegmentError) throw overrides.activeSegmentError;
        return model.activeSegment;
      }
    },
    ai: {
      getState() {
        calls.push(["getAiState"]);
        return model.aiState;
      }
    },
    structural: {
      split: action("split"),
      merge: action("merge"),
      canSplit(segment) {
        calls.push(["canSplit", segment]);
        if (overrides.canSplitError) throw overrides.canSplitError;
        return model.canSplit;
      },
      canMerge(segment, nextSegment) {
        calls.push(["canMerge", segment, nextSegment]);
        return model.canMerge;
      },
      nextForMerge(segment) {
        calls.push(["nextForMerge", segment]);
        return model.nextSegment;
      }
    },
    actions
  };
  dependencies.features = {
    history: dependencies.history,
    trash: dependencies.trash,
    confirmation: { confirm: actions.confirm },
    navigation: { nextOpen: actions.nextOpen, previousOpen: actions.previousOpen },
    focus: { toggle: actions.toggleFocus },
    targetProducer: { copySourceToTarget: actions.copySource },
    structural: dependencies.structural,
    tm: { saveActive: actions.saveToTm },
    projectDialog: actions.openProjectDialog,
    qa: { run: actions.runQa },
    reports: {
      exportQualityPassport: actions.exportQualityPassport,
      exportProjectReport: actions.exportProjectReport,
      exportAnonymizedReport: actions.exportAnonymizedReport
    },
    quality: { nextRisk: actions.nextQualityRisk },
    concordance: { open: actions.openConcordance },
    quickInsert: { open: actions.openQuickInsert, hasSuggestions: () => model.quickInsertAvailable },
    search: { focus: actions.focusSearch },
    replacement: { open: actions.openReplace },
    review: { openComment: actions.openReviewComment },
    filterPreset: { apply: actions.applyFilterPreset },
    aiPretranslation: { pretranslate: actions.aiPretranslate },
    aiReview: { reviewActive: actions.aiReviewActive, reviewBatch: actions.aiReviewBatch },
    aiTagRepair: { repairActive: actions.aiTagRepairActive, repairBatch: actions.aiTagRepairBatch },
    aiDraftEditing: {
      polishActive: actions.aiPolishActive,
      polishBatch: actions.aiPolishBatch,
      adaptActive: actions.aiAdaptActive,
      adaptBatch: actions.aiAdaptBatch
    },
    aiAlternatives: { suggestActive: actions.aiVariantsActive, suggestBatch: actions.aiVariantsBatch },
    aiTerminologyApplication: {
      applyActive: actions.aiApplyTermsActive,
      applyBatch: actions.aiApplyTermsBatch
    },
    aiTerminologyExtraction: {
      extractActive: actions.aiExtractTermsActive,
      extractBatch: actions.aiExtractTermsBatch
    },
    aiProjectBrief: { generate: actions.aiProjectBrief },
    aiOpenAiSuggestion: { create: actions.openAiSuggestion }
  };
  return {
    actions,
    calls,
    dependencies,
    model,
    service: createApplicationCommandCatalogService(dependencies)
  };
}

const EXPECTED_METADATA = [
  ["undo", "Undo last action", "", undefined],
  ["redo", "Redo last action", "", undefined],
  ["trash", "Open Trash", "", undefined],
  ["confirm", "Confirm segment", "", undefined],
  ["next-open", "Next open segment", "", undefined],
  ["previous-open", "Previous open segment", "", undefined],
  ["focus-mode", "Enter Focus view", "", undefined],
  ["copy-source", "Copy source", "", undefined],
  ["split-segment", "Split segment", "Segment", ["divide", "cursor", "structure"]],
  ["merge-segments", "Merge with next segment", "Segment", ["join", "combine", "structure"]],
  ["save-tm", "Save segment to TM", "", undefined],
  ["project-settings", "Project settings", "", undefined],
  ["qa", "Run QA checks", "", undefined],
  ["quality-passport", "Export Quality Passport", "", undefined],
  ["next-quality-risk", "Next quality risk", "", undefined],
  ["concordance", "Open concordance", "", undefined],
  ["quick-insert", "Open Quick Insert suggestions", "", ["TM", "termbase", "term", "AI", "suggestions"]],
  ["find-segments", "Find in source or target", "", undefined],
  ["replace-target", "Find and replace target text", "", undefined],
  ["review-comment", "Add review comment", "", undefined],
  ["preset-translate", "Use Translate filter preset", "Filters", ["open", "segments", "matches"]],
  ["preset-review", "Use Review filter preset", "Filters", ["needs review", "comments"]],
  ["preset-qa-fixes", "Use QA fixes filter preset", "Filters", ["quality", "blocked", "fixes"]],
  ["preset-ai-review", "Use AI review filter preset", "Filters", ["AI", "risk", "suggestions"]],
  ["project-report", "Export project report", "", undefined],
  ["anonymized-report", "Export anonymized report", "", undefined],
  ["local-ai-pretranslate", "Local AI pre-translate", "", undefined],
  ["local-ai-review", "AI review active segment", "", undefined],
  ["local-ai-review-batch", "AI QA batch", "", undefined],
  ["local-ai-tag-repair", "Suggest AI tag repair", "", undefined],
  ["local-ai-tag-repair-batch", "Repair AI tags batch", "", undefined],
  ["local-ai-polish-draft", "Polish active draft with AI", "", undefined],
  ["local-ai-polish-batch", "Polish AI drafts batch", "", undefined],
  ["local-ai-adapt-draft", "Adapt active draft with AI", "", undefined],
  ["local-ai-adapt-batch", "Adapt AI drafts batch", "", undefined],
  ["local-ai-variants", "Suggest AI alternatives", "", undefined],
  ["local-ai-variants-batch", "Suggest AI alternatives batch", "", undefined],
  ["local-ai-apply-terms", "Apply AI terminology", "", undefined],
  ["local-ai-apply-terms-batch", "Apply AI terminology batch", "", undefined],
  ["local-ai-terms", "Extract AI terms", "", undefined],
  ["local-ai-terms-batch", "Extract AI terms batch", "", undefined],
  ["local-ai-project-brief", "Generate AI project brief", "", undefined],
  ["openai-ai", "Create OpenAI suggestion", "", undefined]
];

test("ApplicationCommandCatalogService preserves all 43 command records in exact order", async () => {
  const { createApplicationCommandCatalogService } = await loadFactory();
  const { service } = createHarness(createApplicationCommandCatalogService);
  const commands = service.list();
  assert.equal(commands.length, 43);
  assert.deepEqual(
    commands.map(({ id, label, group = "", keywords }) => [id, label, group, keywords]),
    EXPECTED_METADATA
  );
  assert.deepEqual(
    Object.fromEntries(commands.filter((entry) => entry.shortcut).map((entry) => [entry.id, entry.shortcut])),
    {
      undo: "Ctrl/Cmd+Z",
      redo: "Ctrl/Cmd+Shift+Z",
      confirm: "Ctrl/Cmd+Enter",
      "next-open": "Alt+Enter",
      "previous-open": "Alt+Shift+Enter",
      "focus-mode": "Ctrl/Cmd+Shift+F",
      "copy-source": "Ctrl/Cmd+Shift+S",
      "split-segment": "Ctrl/Cmd+Shift+E",
      "merge-segments": "Ctrl/Cmd+Shift+L",
      qa: "Shift+F9",
      "next-quality-risk": "F9",
      concordance: "F4",
      "quick-insert": "Tab",
      "find-segments": "Ctrl/Cmd+F",
      "replace-target": "Ctrl/Cmd+Shift+H",
      "review-comment": "Shift+F4"
    }
  );
  assert.equal(
    commands.every((entry) => entry.enabled === true && entry.disabledReason === ""),
    true
  );
});

test("ApplicationCommandCatalogService preserves direct action identities and wrapper arguments", async () => {
  const { createApplicationCommandCatalogService } = await loadFactory();
  const { actions, calls, dependencies, service } = createHarness(createApplicationCommandCatalogService);
  const commands = new Map(service.list().map((entry) => [entry.id, entry]));
  const directActions = {
    undo: dependencies.history.undo,
    redo: dependencies.history.redo,
    trash: dependencies.trash.open,
    confirm: actions.confirm,
    "next-open": actions.nextOpen,
    "previous-open": actions.previousOpen,
    "focus-mode": actions.toggleFocus,
    "copy-source": actions.copySource,
    "split-segment": dependencies.structural.split,
    "merge-segments": dependencies.structural.merge,
    "save-tm": actions.saveToTm,
    qa: actions.runQa,
    "quality-passport": actions.exportQualityPassport,
    "next-quality-risk": actions.nextQualityRisk,
    concordance: actions.openConcordance,
    "quick-insert": actions.openQuickInsert,
    "find-segments": actions.focusSearch,
    "replace-target": actions.openReplace,
    "review-comment": actions.openReviewComment,
    "project-report": actions.exportProjectReport,
    "anonymized-report": actions.exportAnonymizedReport,
    "local-ai-pretranslate": actions.aiPretranslate,
    "local-ai-review": actions.aiReviewActive,
    "local-ai-review-batch": actions.aiReviewBatch,
    "local-ai-tag-repair": actions.aiTagRepairActive,
    "local-ai-tag-repair-batch": actions.aiTagRepairBatch,
    "local-ai-polish-draft": actions.aiPolishActive,
    "local-ai-polish-batch": actions.aiPolishBatch,
    "local-ai-adapt-draft": actions.aiAdaptActive,
    "local-ai-adapt-batch": actions.aiAdaptBatch,
    "local-ai-variants": actions.aiVariantsActive,
    "local-ai-variants-batch": actions.aiVariantsBatch,
    "local-ai-apply-terms": actions.aiApplyTermsActive,
    "local-ai-apply-terms-batch": actions.aiApplyTermsBatch,
    "local-ai-terms": actions.aiExtractTermsActive,
    "local-ai-terms-batch": actions.aiExtractTermsBatch,
    "local-ai-project-brief": actions.aiProjectBrief,
    "openai-ai": actions.openAiSuggestion
  };
  for (const [id, run] of Object.entries(directActions)) assert.equal(commands.get(id).run, run, id);

  calls.length = 0;
  assert.equal(commands.get("project-settings").run(), "result:openProjectDialog");
  for (const [id, preset] of [
    ["preset-translate", "translate"],
    ["preset-review", "review"],
    ["preset-qa-fixes", "qa-fixes"],
    ["preset-ai-review", "ai-review"]
  ]) {
    assert.equal(commands.get(id).run(), "result:applyFilterPreset");
    assert.deepEqual(calls.at(-1), ["run", "applyFilterPreset", preset]);
  }
  assert.deepEqual(calls[0], ["run", "openProjectDialog", "edit"]);
});

test("ApplicationCommandCatalogService preserves command-project fallback and capability query order", async () => {
  const { createApplicationCommandCatalogService } = await loadFactory();
  const fallback = createHarness(createApplicationCommandCatalogService);
  fallback.service.list();
  assert.deepEqual(fallback.calls.slice(0, 4), [
    ["getCommandProjectId"],
    ["getProject"],
    ["canUndo", "project-1"],
    ["canRedo", "project-1"]
  ]);

  const override = createHarness(createApplicationCommandCatalogService, { commandProjectId: "override" });
  override.service.list();
  assert.deepEqual(override.calls.slice(0, 3), [
    ["getCommandProjectId"],
    ["canUndo", "override"],
    ["canRedo", "override"]
  ]);

  const absent = createHarness(createApplicationCommandCatalogService, { project: null });
  absent.service.list();
  assert.deepEqual(absent.calls.slice(0, 4), [
    ["getCommandProjectId"],
    ["getProject"],
    ["canUndo", null],
    ["canRedo", null]
  ]);
});

test("ApplicationCommandCatalogService preserves repeated active-segment structural reads and short circuits", async () => {
  const { createApplicationCommandCatalogService } = await loadFactory();
  const active = createHarness(createApplicationCommandCatalogService);
  active.service.list();
  assert.equal(active.calls.filter(([name]) => name === "getActiveSegment").length, 18);
  assert.deepEqual(
    active.calls.find(([name]) => name === "canSplit"),
    ["canSplit", active.model.activeSegment]
  );
  assert.deepEqual(
    active.calls.find(([name]) => name === "nextForMerge"),
    ["nextForMerge", active.model.activeSegment]
  );
  assert.deepEqual(
    active.calls.find(([name]) => name === "canMerge"),
    ["canMerge", active.model.activeSegment, active.model.nextSegment]
  );

  const absent = createHarness(createApplicationCommandCatalogService, { activeSegment: null });
  const commands = absent.service.list();
  assert.equal(absent.calls.filter(([name]) => name === "getActiveSegment").length, 15);
  assert.equal(
    absent.calls.some(([name]) => name === "canSplit"),
    false
  );
  assert.equal(
    absent.calls.some(([name]) => name === "nextForMerge"),
    false
  );
  assert.equal(
    absent.calls.some(([name]) => name === "canMerge"),
    false
  );
  assert.equal(commands.find((entry) => entry.id === "openai-ai").enabled, false);
});

test("ApplicationCommandCatalogService derives live focus, project, and AI enablement", async () => {
  const { createApplicationCommandCatalogService } = await loadFactory();
  const harness = createHarness(createApplicationCommandCatalogService);
  harness.model.applicationState = { interface: { focusMode: true }, navigation: { view: "projects" } };
  harness.model.aiState = { running: false, promptBusy: true };
  let commands = new Map(harness.service.list().map((entry) => [entry.id, entry]));
  assert.equal(commands.get("focus-mode").label, "Exit Focus view");
  assert.equal(commands.get("focus-mode").enabled, false);
  assert.equal(commands.get("local-ai-pretranslate").enabled, true);
  assert.equal(commands.get("local-ai-review").enabled, false);
  assert.equal(commands.get("local-ai-review-batch").enabled, false);
  assert.equal(commands.get("openai-ai").enabled, true);
  assert.equal(commands.get("local-ai-review").disabledReason, "Unavailable in the current context.");

  harness.model.project = null;
  harness.model.applicationState = { interface: { focusMode: false }, navigation: { view: "editor" } };
  harness.model.aiState = { running: false, promptBusy: false };
  commands = new Map(harness.service.list().map((entry) => [entry.id, entry]));
  assert.equal(commands.get("project-settings").enabled, false);
  assert.equal(commands.get("local-ai-review").enabled, true);
  assert.equal(commands.get("local-ai-review-batch").enabled, false);
  assert.equal(commands.get("openai-ai").enabled, true);
});

test("ApplicationCommandCatalogService returns fresh records while retaining direct actions", async () => {
  const { createApplicationCommandCatalogService } = await loadFactory();
  const { service } = createHarness(createApplicationCommandCatalogService);
  const first = service.list();
  const second = service.list();
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  assert.equal(first[0].run, second[0].run);
  const firstSplit = first.find((entry) => entry.id === "split-segment");
  const secondSplit = second.find((entry) => entry.id === "split-segment");
  const firstSettings = first.find((entry) => entry.id === "project-settings");
  const secondSettings = second.find((entry) => entry.id === "project-settings");
  assert.notEqual(firstSplit.keywords, secondSplit.keywords);
  assert.notEqual(firstSettings.run, secondSettings.run);
  first[0].label = "changed";
  firstSplit.keywords.push("changed");
  assert.equal(second[0].label, "Undo last action");
  assert.deepEqual(secondSplit.keywords, ["divide", "cursor", "structure"]);
});

test("ApplicationCommandCatalogService preserves lookup and capability failure timing", async () => {
  const { createApplicationCommandCatalogService } = await loadFactory();
  const commandError = new Error("command project failed");
  const commandFailure = createHarness(createApplicationCommandCatalogService, { commandProjectError: commandError });
  assert.throws(() => commandFailure.service.list(), commandError);
  assert.deepEqual(commandFailure.calls, [["getCommandProjectId"]]);

  const undoError = new Error("undo capability failed");
  const undoFailure = createHarness(createApplicationCommandCatalogService, {
    commandProjectId: "project",
    canUndoError: undoError
  });
  assert.throws(() => undoFailure.service.list(), undoError);
  assert.deepEqual(undoFailure.calls, [["getCommandProjectId"], ["canUndo", "project"]]);

  const activeError = new Error("active segment failed");
  const activeFailure = createHarness(createApplicationCommandCatalogService, {
    commandProjectId: "project",
    activeSegmentError: activeError
  });
  assert.throws(() => activeFailure.service.list(), activeError);
  assert.deepEqual(activeFailure.calls.slice(-2), [["trashAvailable"], ["getActiveSegment"]]);
});

test("ApplicationCommandCatalogService validates boundaries and exposes an immutable API", async () => {
  const { createApplicationCommandCatalogService } = await loadFactory();
  const harness = createHarness(createApplicationCommandCatalogService);
  assert.equal(Object.isFrozen(harness.service), true);
  assert.deepEqual(Object.keys(harness.service), ["list"]);
  for (const dependencies of [
    { ...harness.dependencies, command: { getProjectId: null } },
    {
      ...harness.dependencies,
      features: {
        ...harness.dependencies.features,
        structural: { ...harness.dependencies.features.structural, canMerge: null }
      }
    },
    {
      ...harness.dependencies,
      features: {
        ...harness.dependencies.features,
        aiProjectBrief: { generate: null }
      }
    }
  ]) {
    assert.throws(
      () => createApplicationCommandCatalogService(dependencies),
      /checked state, capability, and action boundaries/
    );
  }
});
