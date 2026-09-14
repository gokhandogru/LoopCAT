const DEFAULT_SAVE_DELAY_MS = 450;
const DEFAULT_RETRY_DELAY_MS = 2000;
const DEFAULT_MAX_WAIT_MS = 2000;

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
 *   maxWaitMs?: number,
 *   now?: () => number,
 *   setTimer?: (callback: () => void, delay: number) => any,
 *   clearTimer?: (timer: any) => void
 * }} options
 */
export function createAutosaveService(options) {
  const editorSessionStore = options?.editorSessionStore;
  const repository = options?.repository;
  const editLifecycle = options?.editLifecycle;
  const status = options?.status;
  function publish(message, mode = undefined) {
    try {
      status.set(message, mode);
    } catch (error) {
      console.warn("Save status could not be displayed.", error);
    }
  }
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
  const inFlight = new Set();
  const latestGenerations = new Map();
  const now = options.now || Date.now;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  let generation = 0;
  let writeTail = Promise.resolve();

  function size() {
    return new Set([
      ...pending.keys(),
      ...Array.from(inFlight).flatMap((operation) =>
        operation.records.filter((record) => !record.cancelled).map((record) => record.id)
      )
    ]).size;
  }

  function pendingRecords(projectId = "") {
    return Array.from(pending.entries())
      .map(([id, record]) => ({ ...record, id }))
      .filter((record) => record.segment && (!projectId || record.segment.projectId === projectId));
  }

  function discard(segmentId) {
    const record = pending.get(segmentId);
    let cancelled = false;
    for (const operation of inFlight) {
      if (operation.started) continue;
      for (const queued of operation.records) {
        if (queued.id !== segmentId) continue;
        queued.cancelled = true;
        cancelled = true;
      }
    }
    latestGenerations.delete(segmentId);
    if (!record) return cancelled;
    clearTimer(record.timer);
    pending.delete(segmentId);
    latestGenerations.delete(segmentId);
    return true;
  }

  function clear(segment, clearOptions = {}) {
    if (!segment?.id) return false;
    if (clearOptions.finalizeEdit !== false) editLifecycle.finalize(segment.id);
    return discard(segment.id);
  }

  function clearAll() {
    editLifecycle.finalizeAll();
    for (const operation of inFlight) {
      if (!operation.started) operation.records.forEach((record) => (record.cancelled = true));
    }
    pending.forEach((record) => clearTimer(record.timer));
    pending.clear();
    latestGenerations.clear();
  }

  function persistRecords(records, single = false) {
    records.forEach((record) => {
      clearTimer(record.timer);
      if (pending.get(record.id)?.generation === record.generation) pending.delete(record.id);
    });
    const operation = { records, promise: null, started: false };
    inFlight.add(operation);
    const write = writeTail.then(async () => {
      operation.started = true;
      records = records.filter((record) => !record.cancelled);
      if (!records.length) {
        inFlight.delete(operation);
        return [];
      }
      publish("Saving...");
      try {
        const segments = records.map((record) => record.segment);
        const expectedVersions = segments.map((segment) => Number(segment.storageVersion || 0));
        let committed;
        if (single) {
          beforeSave(segments[0]);
          committed = [await repository.save(segments[0])];
        } else {
          beforeFlush(segments);
          committed = await repository.saveMany(segments);
        }
        try {
          let currentById;
          segments.forEach((segment, index) => {
            const saved = committed?.[index] || segment;
            if (saved?.storageVersion === undefined) return;
            if (segments.length > 1 && !currentById)
              currentById = new Map(editorSessionStore.getSegments().map((value) => [value.id, value]));
            const current = currentById
              ? currentById.get(segment.id)
              : editorSessionStore.getSegments().find((value) => value.id === segment.id);
            if (
              current?.projectId === segment.projectId &&
              Number(current.storageVersion || 0) === expectedVersions[index] &&
              Number(current.revision || 0) >= Number(segment.revision || 0)
            )
              current.storageVersion = saved.storageVersion;
          });
        } catch (error) {
          console.warn("Saved output; refresh the editor's stored version.", error);
        }
        return segments;
      } catch (error) {
        records.forEach((record) => {
          // A failed older write must never replace a newer queued edit or resurrect a deletion.
          if (!pending.has(record.id) && latestGenerations.get(record.id) === record.generation) {
            queue(record.segment, retryDelayMs);
          }
        });
        publish(`${error?.message || "Save failed"}; retrying autosave`, "dirty");
        throw error;
      } finally {
        inFlight.delete(operation);
      }
    });
    operation.promise = write.then((segments) => {
      publish(size() ? `${size()} save pending` : "Saved", size() ? "dirty" : "saved");
      // Presentation failure cannot turn a committed write into a failed save.
      try {
        onSaved();
      } catch (error) {
        console.warn("Saved output; history presentation needs refreshing.", error);
      }
      return segments;
    });
    writeTail = operation.promise.catch(() => {});
    return operation.promise;
  }

  function queue(segment, delay = saveDelayMs, firstQueuedAt = now()) {
    if (!segment?.id) return false;
    const previous = pending.get(segment.id);
    if (previous) clearTimer(previous.timer);
    const record = {
      id: segment.id,
      segment: structuredClone(segment),
      generation: ++generation,
      firstQueuedAt,
      timer: null
    };
    // Isolated workflow probes use symbols; these are never stored or exported by structured clone.
    if (options.testHooks) for (const key of Object.getOwnPropertySymbols(segment)) record.segment[key] = segment[key];
    const timer = setTimer(async () => {
      if (pending.get(segment.id) !== record) return;
      editLifecycle.finalize(segment.id);
      try {
        await persistRecords([record], true);
      } catch {
        // persistRecords owns retry state and the visible error.
      }
    }, delay);
    record.timer = timer;
    pending.set(segment.id, record);
    latestGenerations.set(segment.id, record.generation);
    return true;
  }

  function debounce(segment) {
    publish("Unsaved changes", "dirty");
    const firstQueuedAt = pending.get(segment?.id)?.firstQueuedAt ?? now();
    return queue(segment, Math.min(saveDelayMs, Math.max(0, maxWaitMs - (now() - firstQueuedAt))), firstQueuedAt);
  }

  function trackCommand(segments, command) {
    const operation = {
      records: segments.map((segment) => ({ id: segment.id, segment: structuredClone(segment), generation })),
      started: true,
      promise: null
    };
    inFlight.add(operation);
    operation.promise = Promise.resolve(command)
      .then(() => [])
      .finally(() => inFlight.delete(operation));
    // A confirmation includes asynchronous resource reads before its atomic
    // commit. New typing must wait for that commit, and close/flush must wait too.
    // One failed command must not release the barrier for an earlier command
    // that is still reading or committing its records.
    writeTail = Promise.allSettled([writeTail, operation.promise]).then(() => {});
  }

  function clearDocument(projectId, documentId) {
    [
      ...pendingRecords(projectId),
      ...Array.from(inFlight).flatMap((operation) => (operation.started ? [] : operation.records))
    ]
      .filter((record) => record.segment.projectId === projectId)
      .filter((record) => record.segment.documentId === documentId)
      .forEach((record) => {
        editLifecycle.finalize(record.id);
        discard(record.id);
      });
  }

  async function flush(projectId = "", throughGeneration = generation) {
    if (projectId) editLifecycle.finalizeProject(projectId);
    else editLifecycle.finalizeAll();
    const writes = Array.from(inFlight)
      .filter((operation) =>
        operation.records.some(
          (record) => (!projectId || record.segment.projectId === projectId) && record.generation <= throughGeneration
        )
      )
      .map((operation) => operation.promise);
    const records = pendingRecords(projectId).filter((record) => record.generation <= throughGeneration);
    if (records.length) writes.push(persistRecords(records));
    return (await Promise.all(writes)).flat();
  }

  return Object.freeze({
    clear,
    clearAll,
    clearDocument,
    debounce,
    discard,
    flush,
    has: (segmentId) =>
      pending.has(segmentId) ||
      Array.from(inFlight).some((operation) =>
        operation.records.some((record) => record.id === segmentId && !record.cancelled)
      ),
    pendingRecords,
    queue,
    trackCommand,
    enqueueEdit(projectId, mutation) {
      if (mutation?.projectId !== projectId) throw new TypeError("Edit project does not match its segment.");
      debounce(mutation);
      return generation;
    },
    getGeneration: () => generation,
    getState: () => ({ pending: pending.size, inFlight: inFlight.size, generation }),
    size
  });
}
