import { normalizeError } from "./error-model.js";

const LEGACY_JOB_ID = "legacy-operation";
const OPERATION_PATTERN =
  /^(saving|starting|requesting|sending|running|generating|extracting|polishing|adapting|pretranslating|canceling)|:\s*(reading|parsing|importing|saving)/i;
const SAVE_PATTERN = /^(saved|saving|unsaved)|save\s+(pending|failed)|retrying autosave/i;
const ERROR_PATTERN = /failed|blocked|cannot|missing|required|offline|invalid|error/i;

export function createStatusController({ saveStore, jobStore, noticeStore, events }) {
  let lastError = null;

  function fromLegacy({ text, mode = "", projectId = null, segmentId = "" }) {
    const message = String(text || "").trim();
    const detail = { message, projectId, segmentId };

    if (OPERATION_PATTERN.test(message) && !/^saving/i.test(message)) {
      const current = jobStore.get(LEGACY_JOB_ID);
      const job = current
        ? jobStore.reportProgress(LEGACY_JOB_ID, { label: message })
        : jobStore.beginJob(LEGACY_JOB_ID, { label: message });
      events?.emit?.("operation-changed", job);
      return { channel: "job", value: job };
    }

    const activeJob = jobStore.get(LEGACY_JOB_ID);
    if (activeJob?.status === "running") {
      const job = ERROR_PATTERN.test(message)
        ? jobStore.fail(LEGACY_JOB_ID, { label: message })
        : /cancel/i.test(message)
          ? jobStore.cancel(LEGACY_JOB_ID, { label: message })
          : jobStore.complete(LEGACY_JOB_ID, { label: message });
      events?.emit?.("operation-changed", job);
    }

    if (SAVE_PATTERN.test(message)) {
      const value = /^saving/i.test(message)
        ? saveStore.setSaving(detail)
        : mode === "dirty" || /failed|pending|unsaved|retry/i.test(message)
          ? saveStore.setFailed(detail)
          : saveStore.setSaved(detail);
      return { channel: "save", value };
    }

    if (mode === "dirty" && ERROR_PATTERN.test(message)) {
      lastError = normalizeError(new Error(message), { whatHappened: message });
      return { channel: "error", value: lastError };
    }

    return {
      channel: "notice",
      value: noticeStore.notify(message, { tone: mode === "dirty" ? "warning" : "neutral" })
    };
  }

  return Object.freeze({
    fromLegacy,
    getLastError: () => lastError
  });
}
