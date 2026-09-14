const OPERATION_PATTERN =
  /^(saving|starting|requesting|sending|running|generating|extracting|polishing|adapting|pretranslating|canceling)\b|:\s*(reading|parsing|importing|saving)\b|\.\.\.$/i;
const COMPLETED_PATTERN = /\b(failed|canceled|cancelled|completed|finished)\b/i;
const PENDING_SAVE_PATTERN = /^unsaved\b|\bsave pending\b|\bretrying autosave\b/i;
const NOTICE_DURATION_MS = 2000;
const ROUTINE_SAVE_PATTERN = /^(Saved|Saving(?:\.{3}|…)?|Unsaved changes|\d+ saves? pending)$/i;

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
  let persistenceNotice = null;
  let storageNotice = null;
  let initializationNotice = "";

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
    if (persistenceNotice) {
      text = persistenceNotice.text;
      mode = persistenceNotice.mode;
    }
    if (storageNotice) {
      text = storageNotice.text;
      mode = "dirty";
    }
    if (initializationNotice) {
      text = initializationNotice;
      mode = "saving";
    }
    const displayText = redaction.sanitize(text || "").trim();
    model.publish({
      text: displayText,
      mode,
      projectId: context.getProjectId(),
      segmentId: context.getSegmentId()
    });
    // Routine autosave acknowledgements belong to the durability model. They
    // must neither interrupt typing nor replace an import/export notification.
    if (!initializationNotice && !persistenceNotice && !storageNotice && ROUTINE_SAVE_PATTERN.test(displayText)) return;
    cancelTimer();
    const noticeRevision = ++revision;
    view.setText(displayText ? localization.source(displayText) : "");
    view.setClass(`save-status ${(persistenceNotice || storageNotice) && !initializationNotice ? "error" : mode}`);
    const operationActive =
      mode !== "saved" && OPERATION_PATTERN.test(displayText) && !COMPLETED_PATTERN.test(displayText);
    persistent =
      Boolean(initializationNotice || persistenceNotice || storageNotice) ||
      operationActive ||
      PENDING_SAVE_PATTERN.test(displayText);
    view.setBusy(String(Boolean(initializationNotice) || operationActive));
    if (displayText && !persistent) {
      noticeTimer = timers.set(() => {
        if (revision !== noticeRevision) return;
        noticeTimer = 0;
        clear();
      }, NOTICE_DURATION_MS);
    }
  }

  function setPersistence(text, mode = "") {
    if (mode === "saved") {
      const resolved = Boolean(persistenceNotice);
      persistenceNotice = null;
      if (resolved && !initializationNotice && !storageNotice) clear();
    } else if (text && !ROUTINE_SAVE_PATTERN.test(text)) persistenceNotice = { text, mode };
    set(text, mode);
  }
  function setInitialization(text = "") {
    initializationNotice = text;
    set("");
  }
  function setStorage(text = "") {
    storageNotice = text ? { text } : null;
    set("");
  }
  return Object.freeze({ set, setPersistence, setInitialization, setStorage, navigationChanged });
}
