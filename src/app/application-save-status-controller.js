const OPERATION_PATTERN =
  /^(saving|starting|requesting|sending|running|generating|extracting|polishing|adapting|pretranslating|canceling)\b|:\s*(reading|parsing|importing|saving)\b|\.\.\.$/i;
const COMPLETED_PATTERN = /\b(failed|canceled|cancelled|completed|finished)\b/i;
const PENDING_SAVE_PATTERN = /^unsaved\b|\bsave pending\b|\bretrying autosave\b/i;
const NOTICE_DURATION_MS = 2000;

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

  let noticeTimer = 0;
  let persistent = false;
  let revision = 0;

  function cancelTimer() {
    if (noticeTimer) timers.clear(noticeTimer);
    noticeTimer = 0;
  }

  function clear() {
    cancelTimer();
    revision += 1;
    view.setText("");
    view.setClass("save-status");
    view.setBusy("false");
  }

  function navigationChanged(next, previous) {
    if (
      !persistent &&
      (next.view !== previous.view || next.projectId !== previous.projectId || next.documentId !== previous.documentId)
    ) {
      clear();
    }
  }

  function set(text, mode = "") {
    cancelTimer();
    const noticeRevision = ++revision;
    const displayText = redaction.sanitize(text || "").trim();
    model.publish({
      text: displayText,
      mode,
      projectId: context.getProjectId(),
      segmentId: context.getSegmentId()
    });
    view.setText(displayText ? localization.source(displayText) : "");
    view.setClass(`save-status ${mode}`);
    const operationActive =
      mode !== "saved" && OPERATION_PATTERN.test(displayText) && !COMPLETED_PATTERN.test(displayText);
    persistent = operationActive || PENDING_SAVE_PATTERN.test(displayText);
    view.setBusy(String(operationActive));
    if (displayText && !persistent) {
      noticeTimer = timers.set(() => {
        if (revision !== noticeRevision) return;
        noticeTimer = 0;
        clear();
      }, NOTICE_DURATION_MS);
    }
  }

  return Object.freeze({ set, navigationChanged });
}
