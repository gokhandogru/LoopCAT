const DEFAULT_SAVE_DELAY_MS = 450;
const DEFAULT_RETRY_DELAY_MS = 2000;

/**
 * Owns pending target-save timers, retry scheduling, forced flushes, and
 * persistence sequencing. Segment records remain owned by EditorSessionStore,
 * while durable writes and visible status stay behind injected boundaries.
 *
 * @param {{
 *   editorSessionStore: { getSegments: () => any[] },
 *   repository: { save: (segment: any) => Promise<unknown>, saveMany: (segments: any[]) => Promise<unknown> },
 *   editLifecycle: { finalize: (segmentId: string) => unknown, finalizeProject: (projectId: string) => unknown, finalizeAll: () => unknown },
 *   status: { set: (message: string, mode?: string) => void },
 *   onSaved?: () => void,
 *   testHooks?: { beforeSave?: (segment: any) => void, beforeFlush?: (segments: any[]) => void },
 *   saveDelayMs?: number,
 *   retryDelayMs?: number,
 *   setTimer?: (callback: () => void, delay: number) => any,
 *   clearTimer?: (timer: any) => void
 * }} options
 */
export function createAutosaveService(options) {
  const editorSessionStore = options?.editorSessionStore;
  const repository = options?.repository;
  const editLifecycle = options?.editLifecycle;
  const status = options?.status;
  if (typeof editorSessionStore?.getSegments !== "function") {
    throw new TypeError("AutosaveService requires EditorSessionStore segment selection.");
  }
  if (typeof repository?.save !== "function" || typeof repository?.saveMany !== "function") {
    throw new TypeError("AutosaveService requires segment repository save boundaries.");
  }
  if (
    typeof editLifecycle?.finalize !== "function" ||
    typeof editLifecycle?.finalizeProject !== "function" ||
    typeof editLifecycle?.finalizeAll !== "function"
  ) {
    throw new TypeError("AutosaveService requires target-edit finalization boundaries.");
  }
  if (typeof status?.set !== "function") {
    throw new TypeError("AutosaveService requires a visible save-status boundary.");
  }

  const saveDelayMs = Number.isFinite(options.saveDelayMs) ? options.saveDelayMs : DEFAULT_SAVE_DELAY_MS;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : DEFAULT_RETRY_DELAY_MS;
  const setTimer = typeof options.setTimer === "function" ? options.setTimer : globalThis.setTimeout;
  const clearTimer = typeof options.clearTimer === "function" ? options.clearTimer : globalThis.clearTimeout;
  const onSaved = typeof options.onSaved === "function" ? options.onSaved : () => {};
  const beforeSave = typeof options.testHooks?.beforeSave === "function" ? options.testHooks.beforeSave : () => {};
  const beforeFlush = typeof options.testHooks?.beforeFlush === "function" ? options.testHooks.beforeFlush : () => {};
  const pending = new Map();

  function pendingRecords(projectId = "") {
    return Array.from(pending.entries())
      .map(([id, record]) => ({ id, timer: record.timer, segment: record.segment }))
      .filter((record) => record.segment && (!projectId || record.segment.projectId === projectId));
  }

  function discard(segmentId) {
    const record = pending.get(segmentId);
    if (!record) return false;
    clearTimer(record.timer);
    pending.delete(segmentId);
    return true;
  }

  function clear(segment, clearOptions = {}) {
    if (!segment?.id) return false;
    if (clearOptions.finalizeEdit !== false) editLifecycle.finalize(segment.id);
    return discard(segment.id);
  }

  function clearAll() {
    editLifecycle.finalizeAll();
    pending.forEach((record) => clearTimer(record.timer));
    pending.clear();
  }

  function queue(segment, delay = saveDelayMs) {
    if (!segment?.id) return false;
    const timer = setTimer(async () => {
      try {
        editLifecycle.finalize(segment.id);
        status.set("Saving...");
        const record = pending.get(segment.id);
        const latest =
          editorSessionStore.getSegments().find((item) => item.id === segment.id) || record?.segment || segment;
        beforeSave(latest);
        await repository.save(latest);
        if (pending.get(segment.id)?.timer === timer) pending.delete(segment.id);
        status.set(pending.size ? `${pending.size} save pending` : "Saved", "saved");
        onSaved();
      } catch (error) {
        const record = pending.get(segment.id);
        const latest =
          editorSessionStore.getSegments().find((item) => item.id === segment.id) || record?.segment || segment;
        if (pending.get(segment.id)?.timer === timer) {
          pending.delete(segment.id);
          queue(latest, retryDelayMs);
        }
        status.set(`${error?.message || "Save failed"}; retrying autosave`, "dirty");
      }
    }, delay);
    pending.set(segment.id, { timer, segment });
    return true;
  }

  function debounce(segment) {
    status.set("Unsaved changes", "dirty");
    clear(segment, { finalizeEdit: false });
    return queue(segment);
  }

  function clearDocument(projectId, documentId) {
    pendingRecords(projectId)
      .filter((record) => record.segment.documentId === documentId)
      .forEach((record) => {
        editLifecycle.finalize(record.id);
        discard(record.id);
      });
  }

  async function flush(projectId = "") {
    if (projectId) editLifecycle.finalizeProject(projectId);
    else editLifecycle.finalizeAll();
    const records = pendingRecords(projectId);
    if (!records.length) return [];
    records.forEach((record) => discard(record.id));
    const segments = records.map((record) => record.segment);
    try {
      beforeFlush(segments);
      if (segments.length) await repository.saveMany(segments);
    } catch (error) {
      records.forEach((record) => queue(record.segment, retryDelayMs));
      throw error;
    }
    return segments;
  }

  return Object.freeze({
    clear,
    clearAll,
    clearDocument,
    debounce,
    discard,
    flush,
    has: (segmentId) => pending.has(segmentId),
    pendingRecords,
    queue,
    size: () => pending.size
  });
}
