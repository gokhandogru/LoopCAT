const ROUTER_PRESET_IDS = new Set(["groq", "together", "openrouter", "huggingface", "deepinfra", "fireworks"]);

/**
 * Owns local-provider form transitions and checked administration view-model
 * composition. Provider/runtime/credential policy, administration DOM, state
 * storage, project persistence, status stores, OPUS-CAT help, and AI effects
 * remain injected.
 *
 * @param {{
 *   administration: Record<string, Function>,
 *   settings: {
 *     readForm: () => any,
 *     readProject: (project: any) => any
 *   },
 *   project: { get: () => any, getSegment: () => any },
 *   providers: {
 *     get: (providerId: string) => any,
 *     presets: any[],
 *     getPreset: (presetId: string) => any,
 *     presetForSettings: (settings: any) => any,
 *     needsApiKey: (providerId: string, baseUrl: string) => boolean
 *   },
 *   presentation: {
 *     canPullModel: (settings: any, provider: any) => boolean,
 *     privacyText: (settings: any) => string,
 *     summaryView: (settings: any) => any
 *   },
 *   credentials: {
 *     localSnapshot: (settings: any) => any,
 *     readLocal: (settings: any) => string
 *   },
 *   runtime: { canStartServer: (settings: any) => boolean },
 *   languages: {
 *     normalizeInput: (value: any) => string,
 *     nameForUi: (value: any) => string,
 *     shouldLiveSync: (details: any) => boolean
 *   },
 *   prompt: { render: () => any, previewRequest: (settings: any) => any },
 *   help: { hideOpusCat: () => void },
 *   keys: { clearLocal: () => boolean, clearOpenAi: () => boolean },
 *   state: {
 *     read: () => any,
 *     clearModels: () => void,
 *     setStatus: (details: { connectionStatus: string, statusText: string }) => void
 *   },
 *   status: { setSave: (text: string, state: string) => void },
 *   localization: { label: (key: string) => string, source: (text: string, values?: any) => string },
 *   redact: (value: any) => string,
 *   defaults: {
 *     localBaseUrl: string,
 *     localModel: string,
 *     openAiModel: string,
 *     geminiModel: string
 *   }
 * }} options
 */
export function createAiProviderFormController(options) {
  const administration = options?.administration;
  const settingsBoundary = options?.settings;
  const projectBoundary = options?.project;
  const providers = options?.providers;
  const presentation = options?.presentation;
  const credentials = options?.credentials;
  const runtime = options?.runtime;
  const languages = options?.languages;
  const prompt = options?.prompt;
  const help = options?.help;
  const keys = options?.keys;
  const stateBoundary = options?.state;
  const status = options?.status;
  const localization = options?.localization;
  const redact = options?.redact;
  const defaults = options?.defaults;
  if (
    typeof administration?.readLocalForm !== "function" ||
    typeof administration?.setLanguageFields !== "function" ||
    typeof administration?.setProviderFields !== "function" ||
    typeof administration?.render !== "function" ||
    typeof settingsBoundary?.readForm !== "function" ||
    typeof settingsBoundary?.readProject !== "function" ||
    typeof projectBoundary?.get !== "function" ||
    typeof projectBoundary?.getSegment !== "function" ||
    typeof providers?.get !== "function" ||
    !Array.isArray(providers?.presets) ||
    typeof providers?.getPreset !== "function" ||
    typeof providers?.presetForSettings !== "function" ||
    typeof providers?.needsApiKey !== "function" ||
    typeof presentation?.canPullModel !== "function" ||
    typeof presentation?.privacyText !== "function" ||
    typeof presentation?.summaryView !== "function" ||
    typeof credentials?.localSnapshot !== "function" ||
    typeof credentials?.readLocal !== "function" ||
    typeof runtime?.canStartServer !== "function" ||
    typeof languages?.normalizeInput !== "function" ||
    typeof languages?.nameForUi !== "function" ||
    typeof languages?.shouldLiveSync !== "function" ||
    typeof prompt?.render !== "function" ||
    typeof prompt?.previewRequest !== "function" ||
    typeof help?.hideOpusCat !== "function" ||
    typeof keys?.clearLocal !== "function" ||
    typeof keys?.clearOpenAi !== "function" ||
    typeof stateBoundary?.read !== "function" ||
    typeof stateBoundary?.clearModels !== "function" ||
    typeof stateBoundary?.setStatus !== "function" ||
    typeof status?.setSave !== "function" ||
    typeof localization?.label !== "function" ||
    typeof localization?.source !== "function" ||
    typeof redact !== "function" ||
    !defaults?.localBaseUrl ||
    !defaults?.localModel ||
    !defaults?.openAiModel ||
    !defaults?.geminiModel
  ) {
    throw new TypeError(
      "AiProviderFormController requires administration, settings, project, provider, presentation, credential, runtime, language, prompt, help, key, state, status, localization, redaction, and default boundaries."
    );
  }

  function currentState() {
    return stateBoundary.read() || {};
  }

  function setStatus(connectionStatus, text) {
    const nextStatus = connectionStatus || "disconnected";
    const statusText = redact(text || "");
    stateBoundary.setStatus({ connectionStatus: nextStatus, statusText });
    administration.renderStatus?.({
      connectionStatus: nextStatus,
      text: statusText || "Disconnected"
    });
  }

  function modelView(settings) {
    const currentModel = settings.model || defaults.localModel;
    return {
      models: currentState().models || [],
      currentModel,
      emptyLabel: "Refresh models",
      manualLabel: localization.source("{value1} (manual)", { value1: currentModel })
    };
  }

  function renderModels(settings) {
    administration.renderModels?.(modelView(settings));
  }

  function renderProgress() {
    const state = currentState();
    administration.renderProgress?.({ running: state.running, value: state.progress });
  }

  function renderOutput(value, renderOptions) {
    administration.renderOutput?.(value, renderOptions);
  }

  function providerView(settings) {
    const state = currentState();
    const provider = providers.get(settings.providerId);
    const canPull = presentation.canPullModel(settings, provider);
    return {
      privacyText: presentation.privacyText(settings),
      summary: presentation.summaryView(settings),
      running: state.running,
      promptBusy: state.promptBusy,
      canPull,
      pullLabel: canPull
        ? localization.source("Pull {value1}", {
            value1: settings.model || defaults.localModel
          })
        : localization.source("Pull unavailable"),
      canStartServer: runtime.canStartServer(settings),
      needsKey: providers.needsApiKey(settings.providerId, settings.baseUrl),
      rememberLocalKey: Boolean(credentials.localSnapshot(settings).local),
      storedLocalKey: credentials.readLocal(settings)
    };
  }

  function renderProvider(settings) {
    administration.renderProvider?.(providerView(settings));
  }

  function presetGroupLabel(preset) {
    if (!preset) return localization.label("hostedProviders");
    if (["ollama-local", "lm-studio", "opus-cat"].includes(preset.id)) {
      return localization.label("localRuntimes");
    }
    if (["ollama-local-cloud", "ollama-cloud"].includes(preset.id)) {
      return localization.label("ollamaHostedCloud");
    }
    if (preset.id === "azure-openai") return localization.label("managedDeployments");
    if (ROUTER_PRESET_IDS.has(preset.id)) return localization.source("Hosted routers");
    return localization.label("hostedProviders");
  }

  function presetGroups() {
    const groups = new Map();
    providers.presets.forEach((preset) => {
      const groupLabel = presetGroupLabel(preset);
      const group = groups.get(groupLabel) || [];
      group.push({ id: preset.id, label: preset.label });
      groups.set(groupLabel, group);
    });
    return Array.from(groups, ([label, presetOptions]) => ({
      label,
      options: presetOptions
    }));
  }

  function presetView(settings) {
    return {
      groups: presetGroups(),
      currentPresetId: providers.presetForSettings(settings)?.id || "custom",
      customLabel: "Custom provider"
    };
  }

  function renderPresets(settings) {
    administration.renderPresets?.(presetView(settings));
  }

  function applyPreset(presetId) {
    const preset = providers.getPreset(presetId);
    if (!preset) return;
    administration.setProviderFields({
      providerId: preset.providerId,
      baseUrl: preset.baseUrl,
      model: preset.model
    });
    stateBoundary.clearModels();
    help.hideOpusCat();
    setStatus("disconnected", `${preset.label} selected`);
    const settings = settingsBoundary.readForm();
    renderPresets(settings);
    renderProvider(settings);
    renderModels(settings);
    prompt.render();
  }

  function handlePresetChange(presetId) {
    if (presetId !== "custom") {
      applyPreset(presetId);
      return;
    }
    renderProvider(settingsBoundary.readForm());
    prompt.render();
  }

  function handleProviderChange(providerId) {
    const provider = providers.get(providerId);
    administration.setProviderFields({
      providerId,
      baseUrl: provider?.defaultBaseUrl || defaults.localBaseUrl,
      model:
        provider?.defaultModel ||
        (providerId === "openai"
          ? defaults.openAiModel
          : providerId === "gemini"
            ? defaults.geminiModel
            : defaults.localModel)
    });
    stateBoundary.clearModels();
    help.hideOpusCat();
    setStatus("disconnected", "Disconnected");
    const settings = settingsBoundary.readForm();
    renderPresets(settings);
    renderProvider(settings);
    renderModels(settings);
    prompt.render();
  }

  function handleBaseUrlInput() {
    help.hideOpusCat();
    setStatus("disconnected", "Disconnected");
    const settings = settingsBoundary.readForm();
    renderPresets(settings);
    renderProvider(settings);
  }

  function handleClearLocalKey() {
    if (keys.clearLocal()) {
      status.setSave("Local AI key cleared from this browser", "saved");
    }
  }

  function handleClearOpenAiKey() {
    if (keys.clearOpenAi()) {
      status.setSave("OpenAI key cleared from this browser", "saved");
    }
  }

  function handleFormChanged({ providerChanged = false } = {}) {
    if (providerChanged) renderProvider(settingsBoundary.readForm());
    prompt.render();
  }

  function syncLanguageFields(changedField = "") {
    const form = administration.readLocalForm() || {};
    const project = projectBoundary.get();
    const sourceCode = languages.normalizeInput(
      changedField === "sourceLanguage"
        ? form.sourceLanguage || project?.sourceLang || ""
        : form.sourceCode || form.sourceLanguage || project?.sourceLang || ""
    );
    const targetCode = languages.normalizeInput(
      changedField === "targetLanguage"
        ? form.targetLanguage || project?.targetLang || ""
        : form.targetCode || form.targetLanguage || project?.targetLang || ""
    );
    const fields = {};
    if (sourceCode) {
      if (changedField !== "sourceLanguage") {
        fields.sourceLanguage = languages.nameForUi(sourceCode);
      }
      if (changedField !== "sourceCode") fields.sourceCode = sourceCode;
    }
    if (targetCode) {
      if (changedField !== "targetLanguage") {
        fields.targetLanguage = languages.nameForUi(targetCode);
      }
      if (changedField !== "targetCode") fields.targetCode = targetCode;
    }
    administration.setLanguageFields(fields);
  }

  function handleLanguageChanged(field, value, eventType) {
    if (eventType !== "input" || languages.shouldLiveSync({ value })) {
      syncLanguageFields(field);
    }
    prompt.render();
  }

  function renderCommandCentre() {
    const project = projectBoundary.get();
    const settings = settingsBoundary.readProject(project);
    const state = currentState();
    administration.render({
      projectId: project?.id || null,
      settings: {
        ...settings,
        sourceLanguage: settings.sourceLanguage || languages.nameForUi(settings.sourceCode || project?.sourceLang),
        sourceCode: languages.normalizeInput(settings.sourceCode || project?.sourceLang),
        targetLanguage: settings.targetLanguage || languages.nameForUi(settings.targetCode || project?.targetLang),
        targetCode: languages.normalizeInput(settings.targetCode || project?.targetLang)
      },
      presets: presetView(settings),
      models: modelView(settings),
      provider: providerView(settings),
      status: {
        connectionStatus: state.connectionStatus,
        text: state.statusText || "Disconnected"
      },
      progress: { running: state.running, value: state.progress },
      promptPreview: prompt.previewRequest(settings).prompt,
      availability: {
        hasProject: Boolean(project),
        hasSegment: Boolean(projectBoundary.getSegment()),
        running: state.running,
        promptBusy: state.promptBusy
      }
    });
  }

  return Object.freeze({
    handleBaseUrlInput,
    handleClearLocalKey,
    handleClearOpenAiKey,
    handleFormChanged,
    handleLanguageChanged,
    handlePresetChange,
    handleProviderChange,
    renderCommandCentre,
    renderModels,
    renderOutput,
    renderPresets,
    renderProgress,
    renderProvider,
    setStatus,
    syncLanguageFields
  });
}
