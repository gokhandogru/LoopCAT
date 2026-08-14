/**
 * Owns single-prompt test eligibility, runtime/provider validation, external
 * consent, provider routing, prompt-busy lifecycle, output normalization,
 * presentation, and status decisions. Prompt construction, provider adapters,
 * settings policy, project context, and UI state remain injected.
 *
 * @param {{
 *   project: { get: () => any },
 *   settings: { persist: () => Promise<any>, runtimeConfig: (settings: any) => any, assertReady: (settings: any, config: any, action: string) => void },
 *   prompt: { getMode: () => string, getSampleText: () => string, createRequest: (settings: any, mode: string) => any, getModeLabel: (mode: string) => string, getContextLabels: (mode: string) => string[], hasProjectBriefSamples: () => boolean },
 *   providers: { get: (settings: any) => any, sharesExternally: (settings: any) => boolean },
 *   consent: { externalShare: (details: object) => boolean },
 *   lifecycle: { isRunning: () => boolean, isPromptBusy: () => boolean, sync: (state: { promptBusy: boolean }) => void },
 *   output: { set: (value: string) => void },
 *   presentation: { renderCommandCentre: () => void, renderOutput: (text: string, options?: object) => void },
 *   status: { set: (message: string, mode?: string) => void }
 * }} options
 */
export function createAiPromptTestController(options) {
  const project = options?.project;
  const settingsBoundary = options?.settings;
  const prompt = options?.prompt;
  const providers = options?.providers;
  const consent = options?.consent;
  const lifecycle = options?.lifecycle;
  const output = options?.output;
  const presentation = options?.presentation;
  const status = options?.status;

  if (
    typeof project?.get !== "function" ||
    typeof settingsBoundary?.persist !== "function" ||
    typeof settingsBoundary?.runtimeConfig !== "function" ||
    typeof settingsBoundary?.assertReady !== "function"
  ) {
    throw new TypeError("AiPromptTestController requires project and settings boundaries.");
  }
  for (const boundary of [
    "getMode",
    "getSampleText",
    "createRequest",
    "getModeLabel",
    "getContextLabels",
    "hasProjectBriefSamples"
  ]) {
    if (typeof prompt?.[boundary] !== "function") {
      throw new TypeError(`AiPromptTestController requires ${boundary} prompt context.`);
    }
  }
  if (
    typeof providers?.get !== "function" ||
    typeof providers?.sharesExternally !== "function" ||
    typeof consent?.externalShare !== "function" ||
    typeof lifecycle?.isRunning !== "function" ||
    typeof lifecycle?.isPromptBusy !== "function" ||
    typeof lifecycle?.sync !== "function" ||
    typeof output?.set !== "function" ||
    typeof presentation?.renderCommandCentre !== "function" ||
    typeof presentation?.renderOutput !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "AiPromptTestController requires provider, consent, lifecycle, output, presentation, and status boundaries."
    );
  }

  let promptBusy = false;

  function syncLifecycle() {
    lifecycle.sync({ promptBusy });
  }

  async function testPrompt() {
    if (!project.get() || lifecycle.isRunning() || promptBusy || lifecycle.isPromptBusy()) return undefined;
    const mode = prompt.getMode();
    const source = prompt.getSampleText();
    if (mode !== "project-brief" && !String(source || "").trim()) {
      status.set("Enter sample source text or select a segment first.", "dirty");
      return undefined;
    }
    const settings = await settingsBoundary.persist();
    const promptRequest = prompt.createRequest(settings, mode);
    let config = null;
    try {
      config = settingsBoundary.runtimeConfig(settings);
      settingsBoundary.assertReady(settings, config, `testing a ${promptRequest.label} prompt`);
    } catch (error) {
      status.set(error.message || "Local AI key setup failed.", "dirty");
      return undefined;
    }
    if (providers.sharesExternally(settings)) {
      const ok = consent.externalShare({
        provider: providers.get(settings)?.name || settings.providerId,
        includesSourceText: mode !== "project-brief" || prompt.hasProjectBriefSamples(),
        contextLabels: prompt.getContextLabels(mode)
      });
      if (!ok) {
        status.set("AI prompt test canceled", "dirty");
        return undefined;
      }
    }
    const provider = providers.get(settings);
    if (!provider) {
      status.set("Prompt testing is not available for this provider.", "dirty");
      return undefined;
    }
    if (mode !== "pretranslate" && !provider.completePrompt) {
      status.set(`${prompt.getModeLabel(mode)} prompt testing is not available for this provider.`, "dirty");
      return undefined;
    }

    promptBusy = true;
    syncLifecycle();
    presentation.renderCommandCentre();
    status.set(`Sending ${promptRequest.label} prompt...`);
    try {
      const result =
        mode === "pretranslate"
          ? await provider.translateSegment(config, {
              project: project.get(),
              text: promptRequest.sourceText,
              sourceLanguage: settings.sourceLanguage,
              sourceCode: settings.sourceCode,
              targetLanguage: settings.targetLanguage,
              targetCode: settings.targetCode,
              segment: promptRequest.segment,
              glossaryTerms: promptRequest.glossaryTerms,
              prompt: promptRequest.prompt
            })
          : await provider.completePrompt(config, {
              project: project.get(),
              prompt: promptRequest.prompt,
              system: promptRequest.system,
              model: settings.model
            });
      const normalizedOutput = result.rawOutput || result.translatedText || result.text || "";
      output.set(normalizedOutput);
      presentation.renderOutput(normalizedOutput);
      status.set(`${promptRequest.label} prompt returned output`, "saved");
      return true;
    } catch (error) {
      const message = error.message || "Local AI prompt test failed.";
      presentation.renderOutput(message, { muted: false });
      status.set(message, "dirty");
      return false;
    } finally {
      promptBusy = false;
      syncLifecycle();
      presentation.renderCommandCentre();
    }
  }

  return Object.freeze({ testPrompt });
}
