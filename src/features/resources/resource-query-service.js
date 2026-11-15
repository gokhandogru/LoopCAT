const WORKER_URL = "./resource-query-worker.js";

/** @param {{storage: any, workerFactory?: (url: string) => any}} options */
export function createResourceQueryService({ storage, workerFactory } = /** @type {any} */ ({})) {
  if (typeof storage?.get !== "function") throw new TypeError("Resource queries require storage.");
  const pending = new Map();
  let worker;
  let sequence = 0;
  let activeQuery;
  let disposed = false;
  function ensureWorker() {
    if (worker) return worker;
    const host = /** @type {any} */ (globalThis);
    const trustedUrl = host.CatHan?.appRuntime?.safeHtml?.trustedScriptUrl?.(WORKER_URL) || WORKER_URL;
    worker = workerFactory
      ? workerFactory(WORKER_URL)
      : host.CatHan?.createFileWorker?.(WORKER_URL) || new Worker(trustedUrl);
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      job.cleanup();
      if (data.error) job.reject(Object.assign(new Error(data.error.message), { name: data.error.name || "Error" }));
      else job.resolve(data.result);
    };
    worker.onerror = () => {
      const error = new Error("Resource search could not run. Reopen the editor and try again.");
      for (const job of pending.values()) {
        job.cleanup();
        job.reject(error);
      }
      pending.clear();
      worker.terminate();
      worker = null;
    };
    return worker;
  }
  function cancel(id, reason = /** @type {Error} */ (new DOMException("Resource query cancelled", "AbortError"))) {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    job.cleanup();
    job.reject(reason);
    worker?.postMessage({ type: "cancel", id });
  }
  async function run(input, all = false) {
    if (disposed) throw new Error("Resource query service is closed.");
    const { signal, ...request } = input;
    signal?.throwIfAborted();
    const id = ++sequence;
    if (!all) {
      cancel(activeQuery);
      activeQuery = id;
    }
    // Ensures the main storage initialization/migration is finished first.
    await storage.get("appMeta", "committed-generation");
    signal?.throwIfAborted();
    if (disposed || (!all && activeQuery !== id)) throw new DOMException("Resource query cancelled", "AbortError");
    const target = ensureWorker();
    return new Promise((resolve, reject) => {
      const abort = () => cancel(id, signal.reason || new DOMException("Resource query cancelled", "AbortError"));
      const timer = setTimeout(
        () => cancel(id, new Error("Resource search timed out. Try a narrower filter.")),
        120000
      );
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      };
      pending.set(id, { resolve, reject, cleanup });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        target.postMessage({ type: "query", id, input: request, all });
      } catch (error) {
        cancel(id, error);
      }
    });
  }
  return Object.freeze({
    queryResourceEntries: (input) => run(input),
    getMatchingEntries: (input) => run(input, true),
    invalidate: (_resourceId = "") => worker?.postMessage({ type: "invalidate" }),
    dispose() {
      disposed = true;
      for (const id of [...pending.keys()]) cancel(id);
      worker?.terminate();
      worker = null;
    }
  });
}
