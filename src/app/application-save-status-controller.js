const OPERATION_PATTERN =
  /^(saving|starting|requesting|sending|running|generating|extracting|polishing|adapting|pretranslating|canceling)|:\s*(reading|parsing|importing|saving)/i;

export function createApplicationSaveStatusController({ redaction, model, context, localization, view, timers }) {
  if (!redaction?.sanitize || !model?.publish || !context?.getProjectId || !context.getSegmentId) {
    throw new TypeError("ApplicationSaveStatusController requires checked redaction, model, and context boundaries.");
  }
  if (!localization?.source || !localization.translate) {
    throw new TypeError("ApplicationSaveStatusController requires checked localization boundaries.");
  }
  if (!view?.setText || !view.setClass || !view.setBusy) {
    throw new TypeError("ApplicationSaveStatusController requires checked view boundaries.");
  }
  if (!timers?.set || !timers.clear) {
    throw new TypeError("ApplicationSaveStatusController requires checked timer boundaries.");
  }

  let savedTimer = 0;

  function set(text, mode = "") {
    if (savedTimer) {
      timers.clear(savedTimer);
      savedTimer = 0;
    }
    const displayText = redaction.sanitize(text || "").trim();
    model.publish({
      text: displayText,
      mode,
      projectId: context.getProjectId(),
      segmentId: context.getSegmentId()
    });
    view.setText(localization.source(displayText));
    view.setClass(`save-status ${mode}`);
    const operationActive = OPERATION_PATTERN.test(displayText);
    view.setBusy(String(operationActive));
    if ((mode === "saved" || displayText.startsWith("Saved to ")) && displayText !== "Saved") {
      savedTimer = timers.set(() => {
        view.setText(localization.translate("app.status.saved"));
        view.setClass("save-status saved");
        savedTimer = 0;
      }, 5000);
    }
  }

  return Object.freeze({ set });
}
