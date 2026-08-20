/**
 * Owns portable-file reports, size/decoding/JSON input policy, progress and
 * failure copy, plus the shared import-task lifecycle. Format parsing,
 * mutations, validation DOM, and storage durability implementation remain
 * behind injected boundaries.
 *
 * @param {{
 *   encoding: { api?: { decodeTextFile: (file: any, options: any) => Promise<{ text: string }> } | null, decodingOptions: () => any },
 *   limits: { portableJsonBytes: number },
 *   task: { get: () => string, set: (value: string) => unknown },
 *   text: { lower: (value: string) => string },
 *   presentation: { renderBusy: () => unknown, renderValidation: (report: any) => unknown },
 *   status: { set: (message: string, mode?: string) => unknown },
 *   durability: { refresh: (options: { request: boolean }) => Promise<unknown> }
 * }} options
 */
export function createFileImportService(options) {
  const encoding = options?.encoding;
  const limits = options?.limits;
  const task = options?.task;
  const text = options?.text;
  const presentation = options?.presentation;
  const status = options?.status;
  const durability = options?.durability;

  if (
    typeof encoding?.decodingOptions !== "function" ||
    (encoding.api != null && typeof encoding.api.decodeTextFile !== "function") ||
    !Number.isFinite(limits?.portableJsonBytes) ||
    typeof task?.get !== "function" ||
    typeof task?.set !== "function" ||
    typeof text?.lower !== "function" ||
    typeof presentation?.renderBusy !== "function" ||
    typeof presentation?.renderValidation !== "function" ||
    typeof status?.set !== "function" ||
    typeof durability?.refresh !== "function"
  ) {
    throw new TypeError(
      "FileImportService requires encoding, limit, task, text, presentation, status, and durability boundaries."
    );
  }

  function errorReport(message) {
    return {
      ok: false,
      errors: [message],
      warnings: [],
      preserved: [],
      simplified: [],
      skipped: [],
      risky: []
    };
  }

  function assertSize(file, label, maxBytes) {
    if (file?.size > maxBytes) {
      throw new Error(`${label} is too large. Choose a file under ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }
  }

  async function parseJson(file, label) {
    if (file?.size > limits.portableJsonBytes) {
      throw new Error(`${label} is too large. Choose a LoopCAT JSON file under 50 MB.`);
    }
    try {
      const decoded = encoding.api
        ? await encoding.api.decodeTextFile(file, encoding.decodingOptions())
        : { text: await file.text() };
      return JSON.parse(decoded.text);
    } catch {
      throw new Error(`${label} is not valid JSON.`);
    }
  }

  async function readText(file, decodingOptions = encoding.decodingOptions()) {
    if (encoding.api) return (await encoding.api.decodeTextFile(file, decodingOptions)).text;
    return file.text();
  }

  function progressDetail(done, total, unitLabel) {
    const totalCount = Math.max(0, Number(total || 0));
    const doneCount = Math.max(0, Number(done || 0));
    const percent = totalCount ? Math.min(100, Math.floor((doneCount / totalCount) * 100)) : 100;
    const countText = totalCount ? `${doneCount}/${totalCount}` : `${doneCount}`;
    return `${percent}% - ${countText} ${unitLabel}`;
  }

  function failureMessage(error, label) {
    return `${label} failed: ${error?.message || "The selected file could not be imported."}`;
  }

  async function runTask(label, action) {
    if (task.get()) {
      status.set(
        `${task.get()} is still running. Wait for it to finish before starting ${text.lower(label)}.`,
        "dirty"
      );
      return false;
    }
    task.set(label);
    presentation.renderBusy();
    status.set(`${label} started...`);
    try {
      const result = await action();
      return result !== false && result !== null;
    } catch (error) {
      const message = failureMessage(error, label);
      presentation.renderValidation(errorReport(message));
      status.set(message, "dirty");
      return false;
    } finally {
      task.set("");
      presentation.renderBusy();
      await durability.refresh({ request: false });
    }
  }

  return Object.freeze({
    assertSize,
    errorReport,
    failureMessage,
    parseJson,
    progressDetail,
    readText,
    runTask
  });
}
