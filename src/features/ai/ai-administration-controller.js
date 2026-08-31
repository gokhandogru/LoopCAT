function requireElement(value, name) {
  if (!value?.addEventListener) throw new TypeError(`AiAdministrationController requires ${name}.`);
  return value;
}

function createElement(ownerDocument, tagName, { className = "", text = "" } = {}) {
  const element = ownerDocument.createElement(tagName);
  if (className) element.className = className;
  element.textContent = String(text ?? "");
  return element;
}

/**
 * Owns provider-administration and AI Command Centre form state, safe rendering,
 * static event lifecycles, output disclosure, and cleanup. Provider policy,
 * credentials, network calls, prompts, consent, jobs, commands, persistence,
 * provenance, and status decisions remain behind injected application actions.
 *
 * @param {{
 *   elements: Record<string, any>,
 *   actions?: Record<string, (...args: any[]) => unknown>,
 *   source?: (text: string, values?: Record<string, unknown>) => string,
 *   scheduleFrame?: (callback: () => void) => unknown,
 *   createObserver?: (callback: () => void) => { observe: (target: any, options: any) => void, disconnect: () => void } | null,
 *   onError?: (error: unknown, context: { phase: string }) => void
 * }} options
 */
export function createAiAdministrationController(options) {
  const elements = /** @type {any} */ (options?.elements || {});
  const actions = options?.actions || {};
  const providerPresetSelect = requireElement(elements.providerPresetSelect, "the provider-preset select");
  const providerSelect = requireElement(elements.providerSelect, "the provider select");
  const baseUrlInput = requireElement(elements.baseUrlInput, "the provider base-URL input");
  const modelSelect = requireElement(elements.modelSelect, "the installed-model select");
  const modelInput = requireElement(elements.modelInput, "the model-name input");
  const status = requireElement(elements.status, "the provider status container");
  const statusText = requireElement(elements.statusText, "the provider status text");
  const privacyNote = requireElement(elements.privacyNote, "the provider privacy note");
  const providerSummary = requireElement(elements.providerSummary, "the provider summary");
  const progress = requireElement(elements.progress, "the AI progress region");
  const promptModeSelect = requireElement(elements.promptModeSelect, "the prompt-mode select");
  const promptPreview = requireElement(elements.promptPreview, "the prompt preview");
  const ownerDocument = providerSummary.ownerDocument || globalThis.document;
  const source =
    typeof options?.source === "function"
      ? options.source
      : (text, values = {}) =>
          String(text || "").replace(/\{([^}]+)\}/g, (match, key) =>
            Object.hasOwn(values, key) ? String(values[key] ?? "") : match
          );
  const reportError = typeof options?.onError === "function" ? options.onError : () => {};
  const listeners = [];
  let outputObserver = null;
  let mounted = false;
  let scopeMode = "selected";
  let scopeProjectId = null;
  let availability = {};

  function listen(target, eventType, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(eventType, listener);
    listeners.push({ target, eventType, listener });
  }

  function runAction(phase, action, ...args) {
    try {
      return Promise.resolve(action?.(...args)).catch((error) => reportError(error, { phase }));
    } catch (error) {
      reportError(error, { phase });
      return Promise.resolve();
    }
  }

  function readLocalForm() {
    return Object.freeze({
      providerId: String(providerSelect.value || ""),
      presetId: String(providerPresetSelect.value || "custom"),
      baseUrl: String(baseUrlInput.value || ""),
      model: String(modelInput.value || modelSelect.value || ""),
      sourceLanguage: String(elements.sourceLanguageInput?.value || ""),
      sourceCode: String(elements.sourceCodeInput?.value || ""),
      targetLanguage: String(elements.targetLanguageInput?.value || ""),
      targetCode: String(elements.targetCodeInput?.value || ""),
      mode: String(elements.modeSelect?.value || ""),
      variantMode: String(elements.variantModeSelect?.value || ""),
      adaptMode: String(elements.adaptModeSelect?.value || ""),
      concurrency: String(elements.concurrencyInput?.value || ""),
      timeoutMs: String(elements.timeoutInput?.value || ""),
      overwriteExisting: Boolean(elements.overwriteInput?.checked),
      includeNearbyContext: elements.includeContextInput?.checked !== false,
      preserveConfirmedLocked: elements.preserveConfirmedInput?.checked !== false
    });
  }

  function readGlobalForm() {
    return Object.freeze({
      enabled: Boolean(elements.aiEnabledInput?.checked),
      provider: String(elements.aiProviderInput?.value || "").trim(),
      model: String(elements.aiModelInput?.value || "").trim(),
      sendSourceToAi: Boolean(elements.aiSendSourceInput?.checked),
      useTmContext: elements.aiUseTmInput?.checked !== false,
      useTermbaseContext: elements.aiUseTbInput?.checked !== false,
      styleGuide: String(elements.aiStyleGuideInput?.value || "").trim()
    });
  }

  function readSecrets() {
    return Object.freeze({
      openAiKey: String(elements.openAiApiKeyInput?.value || ""),
      rememberOpenAiKey: Boolean(elements.rememberOpenAiKeyInput?.checked),
      localAiKey: String(elements.localAiApiKeyInput?.value || ""),
      rememberLocalAiKey: Boolean(elements.rememberLocalAiKeyInput?.checked)
    });
  }

  function readPromptState() {
    return Object.freeze({
      mode: String(promptModeSelect.value || "pretranslate"),
      sample: String(elements.sampleInput?.value || "")
    });
  }

  /** @param {{ providerId?: string, baseUrl?: string, model?: string }} fields */
  function setProviderFields({ providerId, baseUrl, model } = {}) {
    if (providerId !== undefined) providerSelect.value = String(providerId || "");
    if (baseUrl !== undefined) baseUrlInput.value = String(baseUrl || "");
    if (model !== undefined) modelInput.value = String(model || "");
  }

  function setBaseUrl(value) {
    baseUrlInput.value = String(value || "");
  }

  /**
   * @param {{ sourceLanguage?: string, sourceCode?: string, targetLanguage?: string, targetCode?: string }} fields
   */
  function setLanguageFields({ sourceLanguage, sourceCode, targetLanguage, targetCode } = {}) {
    if (sourceLanguage !== undefined && elements.sourceLanguageInput) {
      elements.sourceLanguageInput.value = String(sourceLanguage || "");
    }
    if (sourceCode !== undefined && elements.sourceCodeInput) {
      elements.sourceCodeInput.value = String(sourceCode || "");
    }
    if (targetLanguage !== undefined && elements.targetLanguageInput) {
      elements.targetLanguageInput.value = String(targetLanguage || "");
    }
    if (targetCode !== undefined && elements.targetCodeInput) {
      elements.targetCodeInput.value = String(targetCode || "");
    }
  }

  function setGlobalStyleGuide(value) {
    if (elements.aiStyleGuideInput) elements.aiStyleGuideInput.value = String(value || "");
  }

  function clearOpenAiSecret() {
    if (elements.openAiApiKeyInput) elements.openAiApiKeyInput.value = "";
    if (elements.rememberOpenAiKeyInput) elements.rememberOpenAiKeyInput.checked = false;
  }

  function clearLocalAiSecret() {
    if (elements.localAiApiKeyInput) elements.localAiApiKeyInput.value = "";
  }

  /**
   * @param {{
   *   settings?: { enabled?: boolean, provider?: string, model?: string, sendSourceToAi?: boolean, useTmContext?: boolean, useTermbaseContext?: boolean, styleGuide?: string },
   *   storedKey?: string,
   *   rememberKey?: boolean,
   *   storageText?: string
   * }} view
   */
  function renderGlobalSettings({ settings = {}, storedKey = "", rememberKey = false, storageText = "" } = {}) {
    if (elements.aiEnabledInput) elements.aiEnabledInput.checked = Boolean(settings.enabled);
    if (elements.aiProviderInput) elements.aiProviderInput.value = settings.provider || "";
    if (elements.aiModelInput) elements.aiModelInput.value = settings.model || "";
    if (elements.openAiApiKeyInput && ownerDocument.activeElement !== elements.openAiApiKeyInput) {
      elements.openAiApiKeyInput.value = storedKey;
    }
    if (elements.rememberOpenAiKeyInput) elements.rememberOpenAiKeyInput.checked = Boolean(rememberKey);
    if (elements.aiConnectionStatus) elements.aiConnectionStatus.textContent = storageText;
    if (elements.aiSendSourceInput) elements.aiSendSourceInput.checked = Boolean(settings.sendSourceToAi);
    if (elements.aiUseTmInput) elements.aiUseTmInput.checked = settings.useTmContext !== false;
    if (elements.aiUseTbInput) elements.aiUseTbInput.checked = settings.useTermbaseContext !== false;
    if (elements.aiStyleGuideInput) elements.aiStyleGuideInput.value = settings.styleGuide || "";
  }

  function renderStatus({ connectionStatus = "disconnected", text = "Disconnected" } = {}) {
    status.className = `local-ai-status ${connectionStatus || "disconnected"}`;
    statusText.textContent = source(text || "Disconnected");
  }

  function renderGlobalConnectionStatus(text) {
    if (elements.aiConnectionStatus) elements.aiConnectionStatus.textContent = String(text || "");
  }

  function renderProgress({ running = false, value = null } = {}) {
    progress.classList.toggle("running", Boolean(running));
    if (!value) {
      progress.textContent = running ? source("Starting local AI batch...") : source("No local AI batch running.");
      return;
    }
    const pieces = [
      source("{value1}/{value2} completed", {
        value1: value.completed || 0,
        value2: value.total || 0
      }),
      source("{value1} failed", { value1: value.failed || 0 }),
      source("{value1} skipped", { value1: value.skipped || 0 })
    ];
    if (value.canceled) pieces.push(source("canceled"));
    progress.textContent = pieces.join(" - ");
  }

  function renderPromptPreview(value) {
    promptPreview.value = String(value || "");
  }

  function renderOutput(value, { muted = !value } = {}) {
    if (!elements.promptOutput) return;
    elements.promptOutput.textContent = String(value || "");
    elements.promptOutput.classList.toggle("muted", Boolean(muted));
    revealOutputWhenUseful();
  }

  /**
   * @param {{
   *   models?: Array<{ name: string }>,
   *   currentModel?: string,
   *   emptyLabel?: string,
   *   manualLabel?: string
   * }} view
   */
  function renderModels({ models = [], currentModel = "", emptyLabel = "Refresh models", manualLabel } = {}) {
    modelSelect.replaceChildren();
    if (!models.length) {
      const option = createElement(ownerDocument, "option", { text: source(emptyLabel) });
      option.value = "";
      modelSelect.append(option);
    }
    models.forEach((model) => {
      const option = createElement(ownerDocument, "option", { text: model.name });
      option.value = model.name;
      modelSelect.append(option);
    });
    if (currentModel && !models.some((model) => model.name === currentModel)) {
      const option = createElement(ownerDocument, "option", {
        text: manualLabel || source("{value1} (manual)", { value1: currentModel })
      });
      option.value = currentModel;
      modelSelect.prepend(option);
    }
    modelSelect.value =
      currentModel && Array.from(modelSelect.options || []).some((option) => option.value === currentModel)
        ? currentModel
        : "";
  }

  function renderPresets({ groups = [], currentPresetId = "custom", customLabel = "Custom provider" } = {}) {
    providerPresetSelect.replaceChildren();
    const customOption = createElement(ownerDocument, "option", { text: source(customLabel) });
    customOption.value = "custom";
    providerPresetSelect.append(customOption);
    groups.forEach((groupInfo) => {
      const group = ownerDocument.createElement("optgroup");
      group.label = groupInfo.label;
      groupInfo.options.forEach((preset) => {
        const option = createElement(ownerDocument, "option", { text: preset.label });
        option.value = preset.id;
        group.append(option);
      });
      providerPresetSelect.append(group);
    });
    providerPresetSelect.value = currentPresetId || "custom";
  }

  function renderProviderSummary(summary = {}) {
    const head = createElement(ownerDocument, "div", { className: "local-ai-provider-summary-head" });
    head.append(
      createElement(ownerDocument, "strong", { text: summary.name || "AI provider" }),
      createElement(ownerDocument, "span", { text: summary.model || "" })
    );
    const badges = createElement(ownerDocument, "div", { className: "local-ai-provider-badges" });
    (summary.badges || []).forEach((badge) => badges.append(createElement(ownerDocument, "span", { text: badge })));
    const guidance = createElement(ownerDocument, "p", {
      className: "local-ai-provider-guidance",
      text: summary.guidance || ""
    });
    const details = ownerDocument.createElement("dl");
    [
      [summary.baseLabel || "Base", summary.baseUrl || ""],
      [summary.toolsLabel || "Tools", summary.capabilities || ""],
      [summary.modelsLabel || "Models", summary.modelsEndpoint || ""],
      [summary.translateLabel || "Translate", summary.translateEndpoint || ""]
    ].forEach(([label, value]) => {
      const row = ownerDocument.createElement("div");
      row.append(
        createElement(ownerDocument, "dt", { text: label }),
        createElement(ownerDocument, "dd", { text: value })
      );
      details.append(row);
    });
    providerSummary.replaceChildren(head, badges, guidance, details);
  }

  function renderProvider(view = {}) {
    privacyNote.textContent = source(view.privacyText || "");
    renderProviderSummary(view.summary || {});
    if (elements.pullModelButton) {
      elements.pullModelButton.disabled = Boolean(view.running) || !view.canPull;
      elements.pullModelButton.textContent = view.pullLabel || source("Pull unavailable");
    }
    elements.pullModelWrap?.classList.toggle("hidden", !view.canPull);
    if (elements.startLmStudioButton) {
      elements.startLmStudioButton.classList.toggle("hidden", !view.canStartServer);
      elements.startLmStudioButton.disabled = Boolean(view.running) || Boolean(view.promptBusy) || !view.canStartServer;
    }
    elements.hostedKeyControls?.classList.toggle("hidden", !view.needsKey);
    if (elements.rememberLocalAiKeyInput) {
      elements.rememberLocalAiKeyInput.checked = Boolean(view.rememberLocalKey);
    }
    if (elements.localAiApiKeyInput && ownerDocument.activeElement !== elements.localAiApiKeyInput) {
      elements.localAiApiKeyInput.value = view.storedLocalKey || "";
    }
  }

  function renderAvailability({ hasProject = false, hasSegment = false, running = false, promptBusy = false } = {}) {
    availability = { hasProject, hasSegment, running, promptBusy };
    const busy = Boolean(running || promptBusy);
    if (elements.pretranslateButton) elements.pretranslateButton.disabled = running || !hasProject;
    if (elements.cancelButton) elements.cancelButton.disabled = !running;
    if (elements.promptTestButton) elements.promptTestButton.disabled = busy || !hasProject;
    const segmentActions = [
      elements.reviewSegmentButton,
      elements.repairSegmentButton,
      elements.polishSegmentButton,
      elements.adaptSegmentButton,
      elements.variantsSegmentButton,
      elements.applyTermsSegmentButton,
      elements.extractTermsSegmentButton
    ];
    segmentActions.filter(Boolean).forEach((button) => {
      button.disabled = busy || !hasProject || !hasSegment;
    });
    const projectActions = [
      elements.reviewBatchButton,
      elements.repairBatchButton,
      elements.polishBatchButton,
      elements.adaptBatchButton,
      elements.variantsBatchButton,
      elements.applyTermsBatchButton,
      elements.extractTermsBatchButton,
      elements.projectBriefButton
    ];
    projectActions.filter(Boolean).forEach((button) => {
      button.disabled = busy || !hasProject;
    });
    if (elements.adaptModeSelect) elements.adaptModeSelect.disabled = busy || !hasProject;
    const needsSegment = scopeMode === "selected" || scopeMode === "document";
    const contextualBusy = busy || !hasProject || (needsSegment && !hasSegment);
    if (elements.modeSelect) elements.modeSelect.disabled = busy || !hasProject;
    if (elements.contextualTranslateButton) {
      elements.contextualTranslateButton.disabled = contextualBusy;
      const labels = {
        selected: "Translate selected",
        document: "Translate document",
        project: "Translate project",
        visible: "Translate filtered",
        untranslated: "Translate untranslated"
      };
      elements.contextualTranslateButton.textContent = source(labels[scopeMode]);
    }
    [
      elements.contextualReviewButton,
      elements.contextualRepairButton,
      elements.contextualPolishButton,
      elements.contextualVariantsButton,
      elements.contextualApplyTermsButton
    ]
      .filter(Boolean)
      .forEach((button) => {
        button.disabled = contextualBusy;
      });
    if (elements.contextualCancelButton) elements.contextualCancelButton.disabled = !running;
  }

  function render(view = {}) {
    if (scopeProjectId !== view.projectId) {
      scopeProjectId = view.projectId;
      scopeMode = "selected";
    }
    const settings = view.settings || {};
    renderPresets(view.presets || {});
    setProviderFields(settings);
    if (elements.sourceLanguageInput) elements.sourceLanguageInput.value = settings.sourceLanguage || "";
    if (elements.sourceCodeInput) elements.sourceCodeInput.value = settings.sourceCode || "";
    if (elements.targetLanguageInput) elements.targetLanguageInput.value = settings.targetLanguage || "";
    if (elements.targetCodeInput) elements.targetCodeInput.value = settings.targetCode || "";
    if (elements.modeSelect) elements.modeSelect.value = scopeMode;
    if (elements.concurrencyInput) elements.concurrencyInput.value = String(settings.concurrency ?? "");
    if (elements.timeoutInput) elements.timeoutInput.value = String(settings.timeoutMs ?? "");
    if (elements.overwriteInput) elements.overwriteInput.checked = Boolean(settings.overwriteExisting);
    if (elements.variantModeSelect) elements.variantModeSelect.value = settings.variantMode || "standard";
    if (elements.adaptModeSelect) elements.adaptModeSelect.value = settings.adaptMode || "simplify";
    if (elements.includeContextInput) elements.includeContextInput.checked = settings.includeNearbyContext !== false;
    if (elements.preserveConfirmedInput) {
      elements.preserveConfirmedInput.checked = settings.preserveConfirmedLocked !== false;
    }
    renderModels(view.models || {});
    renderProvider(view.provider || {});
    renderStatus(view.status || {});
    renderProgress(view.progress || {});
    renderPromptPreview(view.promptPreview || "");
    renderAvailability(view.availability || {});
  }

  function revealOutputWhenUseful() {
    if (!elements.outputDrawer || !elements.promptOutput) return;
    const useful =
      Boolean(String(elements.promptOutput.textContent || "").trim()) &&
      !elements.promptOutput.classList.contains("muted");
    if (useful) elements.outputDrawer.open = true;
  }

  function bindOutputObserver() {
    if (!elements.outputDrawer || !elements.promptOutput) return;
    const factory =
      options?.createObserver ||
      ((callback) => {
        if (typeof MutationObserver === "undefined") return null;
        return new MutationObserver(callback);
      });
    outputObserver = factory(revealOutputWhenUseful);
    outputObserver?.observe?.(elements.promptOutput, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      characterData: true,
      subtree: true
    });
    revealOutputWhenUseful();
  }

  function mount() {
    if (mounted) return false;
    listen(elements.saveSettingsButton, "click", () => void runAction("save-settings", actions.saveSettings));
    listen(elements.contextualTranslateButton, "click", () => {
      void runAction("contextual-translate", actions.contextualTranslate);
    });
    listen(elements.modeSelect, "change", () => {
      scopeMode = elements.modeSelect.value || "selected";
      renderAvailability(availability);
      void runAction("scope-change", actions.formChanged);
    });
    [
      [elements.contextualReviewButton, "contextual-review", actions.reviewSegment, actions.reviewBatch],
      [elements.contextualRepairButton, "contextual-repair", actions.repairSegment, actions.repairBatch],
      [elements.contextualPolishButton, "contextual-polish", actions.polishSegment, actions.polishBatch],
      [elements.contextualVariantsButton, "contextual-variants", actions.variantsSegment, actions.variantsBatch],
      [
        elements.contextualApplyTermsButton,
        "contextual-apply-terms",
        actions.applyTermsSegment,
        actions.applyTermsBatch
      ]
    ].forEach(([button, phase, segmentAction, batchAction]) => {
      listen(button, "click", () => {
        const action = scopeMode === "selected" ? segmentAction : batchAction;
        void runAction(phase, action);
      });
    });
    [
      [elements.contextualCancelButton, "contextual-cancel", actions.cancel],
      [elements.openAiSuggestionButton, "openai-suggestion", actions.openAiSuggestion],
      [elements.testConnectionButton, "test-connection", actions.testConnection],
      [elements.startLmStudioButton, "start-lm-studio", actions.startLmStudio],
      [elements.refreshModelsButton, "refresh-models", actions.refreshModels],
      [elements.pullModelButton, "pull-model", actions.pullModel],
      [elements.promptTestButton, "prompt-test", actions.promptTest],
      [elements.reviewSegmentButton, "review-segment", actions.reviewSegment],
      [elements.reviewBatchButton, "review-batch", actions.reviewBatch],
      [elements.repairSegmentButton, "repair-segment", actions.repairSegment],
      [elements.repairBatchButton, "repair-batch", actions.repairBatch],
      [elements.polishSegmentButton, "polish-segment", actions.polishSegment],
      [elements.polishBatchButton, "polish-batch", actions.polishBatch],
      [elements.adaptSegmentButton, "adapt-segment", actions.adaptSegment],
      [elements.adaptBatchButton, "adapt-batch", actions.adaptBatch],
      [elements.variantsSegmentButton, "variants-segment", actions.variantsSegment],
      [elements.variantsBatchButton, "variants-batch", actions.variantsBatch],
      [elements.applyTermsSegmentButton, "apply-terms-segment", actions.applyTermsSegment],
      [elements.applyTermsBatchButton, "apply-terms-batch", actions.applyTermsBatch],
      [elements.extractTermsSegmentButton, "extract-terms-segment", actions.extractTermsSegment],
      [elements.extractTermsBatchButton, "extract-terms-batch", actions.extractTermsBatch],
      [elements.pretranslateButton, "pretranslate", actions.pretranslate],
      [elements.cancelButton, "cancel", actions.cancel],
      [elements.projectBriefButton, "project-brief", actions.projectBrief]
    ].forEach(([button, phase, action]) => listen(button, "click", () => void runAction(phase, action)));

    listen(providerPresetSelect, "change", () => {
      const presetId = providerPresetSelect.value || "custom";
      void runAction("preset-change", actions.presetChange, presetId);
    });
    listen(
      providerSelect,
      "change",
      () => void runAction("provider-change", actions.providerChange, providerSelect.value)
    );
    listen(baseUrlInput, "input", () => void runAction("base-url-input", actions.baseUrlInput));
    listen(
      elements.localCloudPresetButton,
      "click",
      () => void runAction("preset-local-cloud", actions.presetChange, "ollama-local-cloud")
    );
    listen(
      elements.cloudPresetButton,
      "click",
      () => void runAction("preset-cloud", actions.presetChange, "ollama-cloud")
    );
    listen(elements.clearLocalAiKeyButton, "click", () => void runAction("clear-local-key", actions.clearLocalKey));
    listen(elements.clearOpenAiKeyButton, "click", () => void runAction("clear-openai-key", actions.clearOpenAiKey));
    listen(modelSelect, "change", () => {
      if (modelSelect.value) modelInput.value = modelSelect.value;
      void runAction("model-select", actions.formChanged, { providerChanged: true });
    });
    [modelInput, elements.sampleInput].filter(Boolean).forEach((input) => {
      listen(
        input,
        "input",
        () =>
          void runAction("prompt-input", actions.formChanged, {
            providerChanged: input === modelInput
          })
      );
    });
    [
      [elements.sourceLanguageInput, "sourceLanguage"],
      [elements.sourceCodeInput, "sourceCode"],
      [elements.targetLanguageInput, "targetLanguage"],
      [elements.targetCodeInput, "targetCode"]
    ]
      .filter(([input]) => Boolean(input))
      .forEach(([input, field]) => {
        ["input", "change", "blur"].forEach((eventType) => {
          listen(
            input,
            eventType,
            () =>
              void runAction("language-change", actions.languageChanged, field, String(input.value || ""), eventType)
          );
        });
      });
    [
      promptModeSelect,
      elements.concurrencyInput,
      elements.timeoutInput,
      elements.overwriteInput,
      elements.includeContextInput,
      elements.preserveConfirmedInput,
      elements.adaptModeSelect,
      elements.variantModeSelect
    ]
      .filter(Boolean)
      .forEach((input) => {
        listen(input, "change", () => void runAction("form-change", actions.formChanged));
      });
    bindOutputObserver();
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    listeners.splice(0).forEach(({ target, eventType, listener }) => target.removeEventListener(eventType, listener));
    outputObserver?.disconnect?.();
    outputObserver = null;
    mounted = false;
    return true;
  }

  return Object.freeze({
    clearLocalAiSecret,
    clearOpenAiSecret,
    mount,
    readGlobalForm,
    readLocalForm,
    readPromptState,
    readSecrets,
    render,
    renderAvailability,
    renderGlobalConnectionStatus,
    renderGlobalSettings,
    renderModels,
    renderOutput,
    renderPresets,
    renderProgress,
    renderPromptPreview,
    renderProvider,
    renderStatus,
    setBaseUrl,
    setGlobalStyleGuide,
    setLanguageFields,
    setProviderFields,
    unmount
  });
}
