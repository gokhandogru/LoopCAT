export function createAiCredentialClearController(dependencies = {}) {
  const { settings, credentials, redaction, presentation } = dependencies || {};
  const optionalPresentationMethods = [
    presentation?.clearOpenSecret,
    presentation?.renderOpenStatus,
    presentation?.clearLocalSecret
  ];
  if (
    typeof settings?.readLocal !== "function" ||
    typeof credentials?.saveOpenAi !== "function" ||
    typeof credentials?.saveLocal !== "function" ||
    typeof redaction?.sanitize !== "function" ||
    typeof presentation?.renderLocalStatus !== "function" ||
    optionalPresentationMethods.some((method) => method != null && typeof method !== "function")
  ) {
    throw new TypeError(
      "AiCredentialClearController requires checked settings, credential, redaction, and presentation boundaries."
    );
  }

  function clearOpenAi() {
    try {
      credentials.saveOpenAi("", false);
    } catch (error) {
      presentation.renderOpenStatus?.(redaction.sanitize(error.message || "OpenAI key could not be cleared."));
      return false;
    }
    presentation.clearOpenSecret?.();
    presentation.renderOpenStatus?.(
      "OpenAI key: Not saved. API keys stay in this browser and are never exported with project packages."
    );
    return true;
  }

  function clearLocal() {
    const localSettings = settings.readLocal();
    try {
      credentials.saveLocal("", false, localSettings);
    } catch (error) {
      presentation.renderLocalStatus(
        "error",
        redaction.sanitize(error.message || "Local AI key could not be cleared.")
      );
      return false;
    }
    presentation.clearLocalSecret?.();
    presentation.renderLocalStatus("disconnected", "Local AI key cleared for this provider");
    return true;
  }

  return Object.freeze({ clearOpenAi, clearLocal });
}
