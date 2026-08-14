/**
 * Owns local/hosted provider connection testing, desktop LM Studio start and
 * retry, OPUS-CAT discovery/help, model refresh, and model pull orchestration.
 * Providers, settings/runtime policy, desktop bridge, model state,
 * administration presentation, and status remain injected.
 *
 * @param {{
 *   project: { exists: () => boolean },
 *   settings: { persist: () => Promise<any>, runtimeConfig: (settings: any) => any, assertReady: (settings: any, config: any, action: string) => void, normalizeBaseUrl: (providerId: string, baseUrl: string) => string },
 *   providers: { get: (settings: any) => any, sharesExternally: (settings: any) => boolean, canPullModel: (settings: any, provider: any) => boolean },
 *   desktop: { getBridge: () => any },
 *   administration: { setBaseUrl: (value: string) => void, readModel: () => string },
 *   modelState: { get: () => any[], replace: (models: any[]) => void },
 *   presentation: { renderPresets: (settings: any) => void, renderProvider: (settings: any) => void, renderPrompt: () => void, renderModels: (settings: any) => void },
 *   help: { setVisible: (visible: boolean) => void, open: () => unknown },
 *   status: { setConnection: (state: string, message: string) => void, setSave: (message: string, mode?: string) => void },
 *   defaults: { model: string }
 * }} options
 */
export function createAiProviderAdministrationOperationsController(options) {
  const project = options?.project;
  const settingsBoundary = options?.settings;
  const providers = options?.providers;
  const desktop = options?.desktop;
  const administration = options?.administration;
  const modelState = options?.modelState;
  const presentation = options?.presentation;
  const help = options?.help;
  const status = options?.status;
  if (typeof project?.exists !== "function") {
    throw new TypeError("AiProviderAdministrationOperationsController requires a project boundary.");
  }
  if (
    typeof settingsBoundary?.persist !== "function" ||
    typeof settingsBoundary?.runtimeConfig !== "function" ||
    typeof settingsBoundary?.assertReady !== "function" ||
    typeof settingsBoundary?.normalizeBaseUrl !== "function" ||
    typeof providers?.get !== "function" ||
    typeof providers?.sharesExternally !== "function" ||
    typeof providers?.canPullModel !== "function"
  ) {
    throw new TypeError("AiProviderAdministrationOperationsController requires settings and provider boundaries.");
  }
  if (
    typeof desktop?.getBridge !== "function" ||
    typeof administration?.setBaseUrl !== "function" ||
    typeof administration?.readModel !== "function" ||
    typeof modelState?.get !== "function" ||
    typeof modelState?.replace !== "function"
  ) {
    throw new TypeError(
      "AiProviderAdministrationOperationsController requires desktop, administration, and model-state boundaries."
    );
  }
  for (const boundary of ["renderPresets", "renderProvider", "renderPrompt", "renderModels"]) {
    if (typeof presentation?.[boundary] !== "function") {
      throw new TypeError(`AiProviderAdministrationOperationsController requires ${boundary} presentation.`);
    }
  }
  if (
    typeof help?.setVisible !== "function" ||
    typeof help?.open !== "function" ||
    typeof status?.setConnection !== "function" ||
    typeof status?.setSave !== "function" ||
    !String(options?.defaults?.model || "").trim()
  ) {
    throw new TypeError("AiProviderAdministrationOperationsController requires help, status, and defaults.");
  }

  function canStartServer(settings) {
    return Boolean(
      desktop.getBridge() && settings?.providerId === "openai-compatible" && !providers.sharesExternally(settings)
    );
  }

  function connectionErrorLooksStartable(error) {
    return /not reachable|failed to fetch|unable to connect|connection refused/i.test(String(error?.message || ""));
  }

  async function finishConnection(settings, provider, result, saveMessage = "AI provider connection works") {
    const discoveredBaseUrl = String(result?.baseUrl || "").trim();
    if (
      settings.providerId === "opus-cat" &&
      discoveredBaseUrl &&
      settingsBoundary.normalizeBaseUrl("opus-cat", discoveredBaseUrl) !==
        settingsBoundary.normalizeBaseUrl("opus-cat", settings.baseUrl)
    ) {
      administration.setBaseUrl(discoveredBaseUrl);
      const rememberedSettings = await settingsBoundary.persist();
      presentation.renderPresets(rememberedSettings);
      presentation.renderProvider(rememberedSettings);
      presentation.renderPrompt();
    }
    const version = result?.version ? ` ${result.version}` : "";
    const route = result?.connectionMode ? ` via ${result.connectionMode}` : "";
    help.setVisible(false);
    status.setConnection("connected", `${result?.provider || provider.name}${version} connected${route}`);
    status.setSave(
      result?.autoDiscovered && discoveredBaseUrl
        ? `OPUS-CAT connection found and saved at ${discoveredBaseUrl}`
        : saveMessage,
      "saved"
    );
  }

  async function startServer(settings) {
    const bridge = desktop.getBridge();
    if (!bridge || !canStartServer(settings)) {
      throw new Error(
        "Automatic LM Studio server start is available only in the LoopCAT desktop app with the LM Studio local provider selected."
      );
    }
    status.setConnection("checking", "Starting LM Studio server...");
    status.setSave("Starting LM Studio server...");
    const result = await bridge.startLmStudioServer();
    if (!result?.ok) throw new Error(result?.message || "Could not start the LM Studio server.");
    status.setConnection("checking", result.message || "LM Studio server started. Checking connection...");
    return result;
  }

  async function testConnection(testOptions = {}) {
    if (!project.exists()) return undefined;
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "testing this provider");
    } catch (error) {
      const message = error.message || "Local AI key setup failed.";
      status.setConnection("error", message);
      status.setSave(message, "dirty");
      return undefined;
    }
    const provider = providers.get(settings);
    if (!provider) {
      const message = "This AI provider is not available.";
      status.setConnection("error", message);
      status.setSave(message, "dirty");
      return undefined;
    }
    help.setVisible(false);
    status.setConnection("checking", "Checking AI provider...");
    try {
      const result = await provider.testConnection(config);
      await finishConnection(settings, provider, result);
    } catch (error) {
      if (!testOptions.skipLmStudioAutoStart && canStartServer(settings) && connectionErrorLooksStartable(error)) {
        try {
          await startServer(settings);
          const result = await provider.testConnection(config);
          await finishConnection(settings, provider, result, "LM Studio server started; AI provider connection works");
          return undefined;
        } catch (startError) {
          const message = startError.message || error.message || "AI provider connection failed.";
          status.setConnection("error", message);
          status.setSave(message, "dirty");
          return undefined;
        }
      }
      const message = error.message || "AI provider connection failed.";
      status.setConnection("error", message);
      status.setSave(message, "dirty");
      if (settings.providerId === "opus-cat") help.open();
    }
    return undefined;
  }

  async function startServerAndTest() {
    if (!project.exists()) return undefined;
    const settings = await settingsBoundary.persist();
    try {
      await startServer(settings);
      await testConnection({ skipLmStudioAutoStart: true });
    } catch (error) {
      const message = error.message || "Could not start LM Studio server.";
      status.setConnection("error", message);
      status.setSave(message, "dirty");
    }
    return undefined;
  }

  async function refreshModels() {
    if (!project.exists()) return undefined;
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, "refreshing models");
    } catch (error) {
      const message = error.message || "Local AI key setup failed.";
      status.setConnection("error", message);
      status.setSave(message, "dirty");
      return undefined;
    }
    const provider = providers.get(settings);
    if (!provider) {
      const message = "Model refresh is not available for this provider.";
      status.setConnection("error", message);
      status.setSave(message, "dirty");
      return undefined;
    }
    status.setConnection("checking", "Refreshing models...");
    try {
      const result = await provider.listModels(config);
      modelState.replace(result.models || []);
      presentation.renderModels(settings);
      const models = modelState.get();
      const hasModel = models.some((model) => model.name === settings.model);
      const canPull = providers.canPullModel(settings, provider);
      status.setConnection("connected", `${models.length} model${models.length === 1 ? "" : "s"} found`);
      status.setSave(
        hasModel || !settings.model
          ? "AI models refreshed"
          : canPull
            ? `Model ${settings.model} is not installed. Pull it from the AI Command Centre.`
            : `Model ${settings.model} was not returned by this provider. Check the model name or refresh models.`,
        hasModel || !settings.model ? "saved" : "dirty"
      );
    } catch (error) {
      const message = error.message || "AI model refresh failed.";
      status.setConnection("error", message);
      status.setSave(message, "dirty");
    }
    return undefined;
  }

  async function pullModel() {
    if (!project.exists()) return undefined;
    const settings = await settingsBoundary.persist();
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
    } catch (error) {
      const message = error.message || "Local AI key setup failed.";
      status.setConnection("error", message);
      status.setSave(message, "dirty");
      return undefined;
    }
    const provider = providers.get(settings);
    const model =
      (administration.readModel() || settings.model || options.defaults.model).trim() || options.defaults.model;
    if (!provider?.pullModel) {
      status.setSave("Model pull is available for Ollama in this build.", "dirty");
      return undefined;
    }
    status.setConnection("checking", `Pulling ${model}...`);
    try {
      await provider.pullModel(config, model, (progress) => {
        if (progress?.status) status.setConnection("checking", `Pulling ${model}: ${progress.status}`);
      });
      status.setConnection("connected", `${model} is installed`);
      await refreshModels();
      status.setSave(`${model} pulled`, "saved");
    } catch (error) {
      const message = error.message || `Could not pull ${model}.`;
      status.setConnection("error", message);
      status.setSave(message, "dirty");
    }
    return undefined;
  }

  return Object.freeze({ canStartServer, pullModel, refreshModels, startServerAndTest, testConnection });
}
