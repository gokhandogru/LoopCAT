const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeDocument() {
  const document = {
    activeElement: null,
    createElement(tagName) {
      return fakeElement(document, tagName);
    }
  };
  return document;
}

function fakeElement(ownerDocument, tagName = "div") {
  const listeners = new Map();
  const classes = new Set();
  let ownText = "";
  const element = {
    ownerDocument,
    tagName: tagName.toUpperCase(),
    children: [],
    parentElement: null,
    value: "",
    checked: false,
    disabled: false,
    hidden: false,
    open: false,
    label: "",
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, force) {
        if (force === true || (force === undefined && !classes.has(name))) classes.add(name);
        else classes.delete(name);
      }
    },
    addEventListener(type, listener) {
      const values = listeners.get(type) || [];
      values.push(listener);
      listeners.set(type, values);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) || []).filter((value) => value !== listener)
      );
    },
    dispatch(type, event = {}) {
      const dispatched = { type, target: element, ...event };
      for (const listener of [...(listeners.get(type) || [])]) listener(dispatched);
      return dispatched;
    },
    click() {
      element.dispatch("click");
    },
    append(...nodes) {
      nodes.filter(Boolean).forEach((node) => {
        node.parentElement = element;
        element.children.push(node);
      });
    },
    prepend(...nodes) {
      nodes
        .filter(Boolean)
        .reverse()
        .forEach((node) => {
          node.parentElement = element;
          element.children.unshift(node);
        });
    },
    replaceChildren(...nodes) {
      element.children.forEach((child) => {
        child.parentElement = null;
      });
      element.children = [];
      ownText = "";
      element.append(...nodes);
    },
    focus() {
      ownerDocument.activeElement = element;
    },
    querySelector(selector) {
      const tag = selector.toUpperCase();
      for (const child of element.children) {
        if (child.tagName === tag) return child;
        const nested = child.querySelector?.(selector);
        if (nested) return nested;
      }
      return null;
    },
    querySelectorAll(selector) {
      const results = [];
      const tag = selector.toUpperCase();
      for (const child of element.children) {
        if (child.tagName === tag) results.push(child);
        results.push(...(child.querySelectorAll?.(selector) || []));
      }
      return results;
    }
  };
  Object.defineProperty(element, "className", {
    get: () => [...classes].join(" "),
    set(value) {
      classes.clear();
      String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .forEach((name) => classes.add(name));
    }
  });
  Object.defineProperty(element, "textContent", {
    get: () => ownText + element.children.map((child) => child.textContent || "").join(""),
    set(value) {
      ownText = String(value ?? "");
      element.children = [];
    }
  });
  Object.defineProperty(element, "options", {
    get: () => element.querySelectorAll("option")
  });
  return element;
}

const names = [
  "providerPresetSelect",
  "providerSelect",
  "baseUrlInput",
  "modelSelect",
  "modelInput",
  "status",
  "statusText",
  "privacyNote",
  "providerSummary",
  "progress",
  "promptModeSelect",
  "promptPreview",
  "sourceLanguageInput",
  "sourceCodeInput",
  "targetLanguageInput",
  "targetCodeInput",
  "modeSelect",
  "variantModeSelect",
  "adaptModeSelect",
  "concurrencyInput",
  "timeoutInput",
  "overwriteInput",
  "includeContextInput",
  "preserveConfirmedInput",
  "sampleInput",
  "aiEnabledInput",
  "aiProviderInput",
  "aiModelInput",
  "openAiApiKeyInput",
  "rememberOpenAiKeyInput",
  "aiConnectionStatus",
  "aiSendSourceInput",
  "aiUseTmInput",
  "aiUseTbInput",
  "aiStyleGuideInput",
  "localAiApiKeyInput",
  "rememberLocalAiKeyInput",
  "hostedKeyControls",
  "pullModelWrap",
  "outputDrawer",
  "promptOutput",
  "saveSettingsButton",
  "contextualTranslateButton",
  "contextualReviewButton",
  "contextualRepairButton",
  "contextualPolishButton",
  "contextualVariantsButton",
  "contextualApplyTermsButton",
  "contextualOpenAiButton",
  "contextualCancelButton",
  "openAiSuggestionButton",
  "testConnectionButton",
  "startLmStudioButton",
  "refreshModelsButton",
  "pullModelButton",
  "promptTestButton",
  "reviewSegmentButton",
  "reviewBatchButton",
  "repairSegmentButton",
  "repairBatchButton",
  "polishSegmentButton",
  "polishBatchButton",
  "adaptSegmentButton",
  "adaptBatchButton",
  "variantsSegmentButton",
  "variantsBatchButton",
  "applyTermsSegmentButton",
  "applyTermsBatchButton",
  "extractTermsSegmentButton",
  "extractTermsBatchButton",
  "pretranslateButton",
  "cancelButton",
  "projectBriefButton",
  "localCloudPresetButton",
  "cloudPresetButton",
  "clearLocalAiKeyButton",
  "clearOpenAiKeyButton"
];

function elements(ownerDocument) {
  return Object.fromEntries(
    names.map((name) => {
      const tag = name.endsWith("Select") ? "select" : name.endsWith("Button") ? "button" : "input";
      return [name, fakeElement(ownerDocument, tag)];
    })
  );
}

test("AiAdministrationController owns provider and command action lifecycle without owning AI effects", async () => {
  const { createAiAdministrationController } = await moduleAt("src/features/ai/ai-administration-controller.js");
  const ownerDocument = fakeDocument();
  const els = elements(ownerDocument);
  const calls = [];
  const controller = createAiAdministrationController({
    elements: els,
    actions: {
      saveSettings: () => calls.push("save"),
      presetChange: (id) => calls.push(`preset:${id}`),
      providerChange: (id) => calls.push(`provider:${id}`),
      contextualTranslate: () => calls.push("translate"),
      reviewSegment: () => calls.push("review"),
      refreshModels: () => calls.push("models"),
      languageChanged: (field, value, type) => calls.push(`language:${field}:${value}:${type}`),
      formChanged: ({ providerChanged } = {}) => calls.push(`form:${Boolean(providerChanged)}`)
    }
  });
  assert.equal(controller.mount(), true);
  controller.render({ projectId: "p1", availability: { hasProject: true, hasSegment: true } });
  els.saveSettingsButton.click();
  els.providerPresetSelect.value = "gemini";
  els.providerPresetSelect.dispatch("change");
  els.providerSelect.value = "openai";
  els.providerSelect.dispatch("change");
  els.contextualTranslateButton.click();
  els.contextualReviewButton.click();
  els.refreshModelsButton.click();
  els.sourceLanguageInput.value = "French";
  els.sourceLanguageInput.dispatch("blur");
  els.modelInput.dispatch("input");
  await Promise.resolve();
  assert.equal(els.modeSelect.value, "selected");
  assert.deepEqual(calls, [
    "save",
    "preset:gemini",
    "provider:openai",
    "translate",
    "review",
    "models",
    "language:sourceLanguage:French:blur",
    "form:true"
  ]);
  assert.equal(controller.unmount(), true);
  els.saveSettingsButton.click();
  assert.equal(calls.length, 8);
});

test("AiAdministrationController owns form values and secret fields without storing credentials", async () => {
  const { createAiAdministrationController } = await moduleAt("src/features/ai/ai-administration-controller.js");
  const ownerDocument = fakeDocument();
  const els = elements(ownerDocument);
  els.providerSelect.value = "ollama";
  els.providerPresetSelect.value = "ollama-local";
  els.baseUrlInput.value = "http://localhost:11434";
  els.modelInput.value = "translategemma";
  els.sourceLanguageInput.value = "English";
  els.sourceCodeInput.value = "en";
  els.targetLanguageInput.value = "Turkish";
  els.targetCodeInput.value = "tr";
  els.includeContextInput.checked = true;
  els.preserveConfirmedInput.checked = true;
  els.aiEnabledInput.checked = true;
  els.aiProviderInput.value = "OpenAI";
  els.aiModelInput.value = "gpt-5";
  els.openAiApiKeyInput.value = "secret-openai";
  els.rememberOpenAiKeyInput.checked = true;
  els.localAiApiKeyInput.value = "secret-local";
  const controller = createAiAdministrationController({ elements: els });
  assert.deepEqual(controller.readLocalForm(), {
    providerId: "ollama",
    presetId: "ollama-local",
    baseUrl: "http://localhost:11434",
    model: "translategemma",
    sourceLanguage: "English",
    sourceCode: "en",
    targetLanguage: "Turkish",
    targetCode: "tr",
    mode: "",
    variantMode: "",
    adaptMode: "",
    concurrency: "",
    timeoutMs: "",
    overwriteExisting: false,
    includeNearbyContext: true,
    preserveConfirmedLocked: true
  });
  assert.equal(controller.readGlobalForm().provider, "OpenAI");
  assert.deepEqual(controller.readSecrets(), {
    openAiKey: "secret-openai",
    rememberOpenAiKey: true,
    localAiKey: "secret-local",
    rememberLocalAiKey: false
  });
  controller.clearOpenAiSecret();
  controller.clearLocalAiSecret();
  assert.equal(els.openAiApiKeyInput.value, "");
  assert.equal(els.localAiApiKeyInput.value, "");
  controller.setLanguageFields({ sourceLanguage: "German", sourceCode: "de" });
  assert.equal(els.sourceLanguageInput.value, "German");
  assert.equal(els.sourceCodeInput.value, "de");
  controller.renderGlobalSettings({
    settings: {
      enabled: true,
      provider: "OpenAI",
      model: "gpt-5.4",
      sendSourceToAi: true,
      useTmContext: false,
      useTermbaseContext: true,
      styleGuide: "Keep labels concise."
    },
    storedKey: "remembered-key",
    rememberKey: true,
    storageText: "OpenAI key: Saved"
  });
  assert.equal(els.aiModelInput.value, "gpt-5.4");
  assert.equal(els.aiUseTmInput.checked, false);
  assert.equal(els.aiConnectionStatus.textContent, "OpenAI key: Saved");
});

test("AiAdministrationController renders provider details with safe DOM construction", async () => {
  const { createAiAdministrationController } = await moduleAt("src/features/ai/ai-administration-controller.js");
  const ownerDocument = fakeDocument();
  const els = elements(ownerDocument);
  const controller = createAiAdministrationController({ elements: els });
  controller.renderPresets({
    currentPresetId: "hosted",
    groups: [{ label: "Hosted", options: [{ id: "hosted", label: "Hosted provider" }] }]
  });
  controller.renderModels({ models: [{ name: "model-one" }], currentModel: "manual-model" });
  controller.renderProvider({
    privacyText: "Provider privacy",
    needsKey: true,
    canPull: false,
    pullLabel: "Pull unavailable",
    storedLocalKey: "secret",
    summary: {
      name: "<img src=x onerror=alert(1)>",
      model: "model",
      badges: ["Hosted"],
      guidance: "Inspect before sending",
      baseLabel: "Base",
      baseUrl: "https://example.invalid/v1",
      toolsLabel: "Tools",
      capabilities: "Connection test",
      modelsLabel: "Models",
      modelsEndpoint: "GET /models",
      translateLabel: "Translate",
      translateEndpoint: "POST /responses"
    }
  });
  assert.equal(els.providerPresetSelect.value, "hosted");
  assert.equal(els.modelSelect.options.length, 2);
  assert.match(els.providerSummary.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(els.providerSummary.querySelector("img"), null);
  assert.equal(els.hostedKeyControls.classList.contains("hidden"), false);
  assert.equal(els.localAiApiKeyInput.value, "secret");
});

test("AiAdministrationController routes every contextual action through the visible scope", async () => {
  const { createAiAdministrationController } = await moduleAt("src/features/ai/ai-administration-controller.js");
  const els = elements(fakeDocument());
  const calls = [];
  const actions = { contextualTranslate: () => calls.push(`translate:${els.modeSelect.value}`) };
  for (const action of ["review", "repair", "polish", "variants", "applyTerms"]) {
    actions[`${action}Segment`] = () => calls.push(`${action}:selected`);
    actions[`${action}Batch`] = () => calls.push(`${action}:${els.modeSelect.value}`);
  }
  const controller = createAiAdministrationController({ elements: els, actions });
  controller.mount();
  const view = { projectId: "p1", availability: { hasProject: true, hasSegment: true } };
  controller.render(view);
  for (const mode of ["selected", "document", "project", "visible", "untranslated"]) {
    els.modeSelect.value = mode;
    els.modeSelect.dispatch("change");
    controller.render(view);
    assert.equal(els.modeSelect.value, mode, "scope survives editor rerenders");
    calls.length = 0;
    for (const button of ["Translate", "Review", "Repair", "Polish", "Variants", "ApplyTerms"]) {
      els[`contextual${button}Button`].click();
    }
    assert.deepEqual(
      calls,
      ["translate", "review", "repair", "polish", "variants", "applyTerms"].map((action) => `${action}:${mode}`)
    );
  }
  controller.render({ ...view, projectId: "p2" });
  assert.equal(els.modeSelect.value, "selected", "a different project starts safely on one segment");
  controller.renderAvailability({ hasProject: true, hasSegment: true, running: true });
  assert.equal(els.modeSelect.disabled, true, "scope is fixed while a batch runs");
  assert.equal(els.contextualTranslateButton.disabled, true);
  controller.renderAvailability({ hasProject: true, hasSegment: false });
  assert.equal(els.contextualReviewButton.disabled, true);
  els.modeSelect.value = "project";
  els.modeSelect.dispatch("change");
  assert.equal(els.contextualReviewButton.disabled, false, "project actions do not need a selected segment");
});

test("AiAdministrationController renders busy status, progress, availability, and output disclosure", async () => {
  const { createAiAdministrationController } = await moduleAt("src/features/ai/ai-administration-controller.js");
  const ownerDocument = fakeDocument();
  const els = elements(ownerDocument);
  let observerCallback = null;
  let disconnected = false;
  const controller = createAiAdministrationController({
    elements: els,
    createObserver: (callback) => {
      observerCallback = callback;
      return {
        observe() {},
        disconnect() {
          disconnected = true;
        }
      };
    }
  });
  controller.mount();
  controller.renderStatus({ connectionStatus: "checking", text: "Checking provider" });
  controller.renderProgress({
    running: true,
    value: { completed: 2, total: 5, failed: 1, skipped: 1, canceled: false }
  });
  controller.renderAvailability({ hasProject: true, hasSegment: false, running: true, promptBusy: false });
  assert.equal(els.status.classList.contains("checking"), true);
  assert.equal(els.progress.textContent, "2/5 completed - 1 failed - 1 skipped");
  assert.equal(els.pretranslateButton.disabled, true);
  assert.equal(els.contextualReviewButton.disabled, true);
  controller.renderAvailability({ hasProject: true, hasSegment: false, running: false, promptBusy: false });
  assert.equal(els.extractTermsSegmentButton.disabled, true);
  assert.equal(els.extractTermsBatchButton.disabled, false);
  controller.renderOutput("Useful result", { muted: false });
  controller.renderGlobalConnectionStatus("OpenAI key: Not saved");
  observerCallback();
  assert.equal(els.outputDrawer.open, true);
  assert.equal(els.promptOutput.textContent, "Useful result");
  assert.equal(els.aiConnectionStatus.textContent, "OpenAI key: Not saved");
  controller.unmount();
  assert.equal(disconnected, true);
});
