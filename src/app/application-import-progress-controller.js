export function createApplicationImportProgressController({ context, presentation, status, schedulers }) {
  if (!context?.getTask || !context.getWorkspaceStatus) {
    throw new TypeError("ApplicationImportProgressController requires checked live context boundaries.");
  }
  if (!presentation?.renderImportBusy || !presentation.renderRecoveryBusy) {
    throw new TypeError("ApplicationImportProgressController requires checked busy-presentation boundaries.");
  }
  if (!status?.set) {
    throw new TypeError("ApplicationImportProgressController requires a checked status boundary.");
  }
  if (!schedulers?.hasFrame || !schedulers.frame || !schedulers.timer) {
    throw new TypeError("ApplicationImportProgressController requires checked scheduler boundaries.");
  }

  function renderBusy() {
    const busy = Boolean(context.getTask());
    presentation.renderImportBusy(busy);
    presentation.renderRecoveryBusy({ busy, status: context.getWorkspaceStatus() || {} });
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = size;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
  }

  function setProgress(phase, file = null, detail = "") {
    const task = context.getTask() || "Import";
    const fileName = file?.name ? ` - ${file.name}` : "";
    const fileSize = file?.size ? ` (${formatFileSize(file.size)})` : "";
    const suffix = detail ? ` - ${detail}` : "";
    status.set(`${task}: ${phase}${fileName}${fileSize}${suffix}`);
  }

  /** @returns {Promise<void>} */
  function yieldToUi() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      if (schedulers.hasFrame()) {
        schedulers.frame(finish);
      }
      schedulers.timer(finish, 50);
    });
  }

  async function reportProgress(phase, file = null, detail = "") {
    setProgress(phase, file, detail);
    await yieldToUi();
  }

  return Object.freeze({ renderBusy, formatFileSize, setProgress, yieldToUi, reportProgress });
}
