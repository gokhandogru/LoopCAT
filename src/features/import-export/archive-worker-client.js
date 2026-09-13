const WORKER_URL = "./archive-worker.js";
const activeJobs = new Set();
function publishJobs() {
  window.dispatchEvent(new CustomEvent("loopcat-archive-jobs", { detail: { count: activeJobs.size } }));
}
export function cancelArchiveJobs() {
  for (const cancel of [...activeJobs]) cancel();
}

export function archiveJob(
  operation,
  input,
  { writable = null, signal = undefined, onRecord = undefined, ...options } = {}
) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    // FileSystemWritableFileStream itself is not transferable in Chromium.
    // A normal WritableStream forwards bounded, backpressured chunks to it.
    const destination = writable?.getWriter();
    const destinationClosed = destination?.closed;
    destinationClosed?.catch(() => {});
    const transferable = destination
      ? new WritableStream({
          write: (bytes) => destination.write(bytes),
          async close() {
            try {
              await destination.close();
            } finally {
              destination.releaseLock();
            }
          },
          async abort(reason) {
            try {
              await destination.abort(reason);
            } finally {
              destination.releaseLock();
            }
          }
        })
      : null;
    const trustedUrl = window.CatHan?.appRuntime?.safeHtml?.trustedScriptUrl?.(WORKER_URL) || WORKER_URL;
    let worker;
    try {
      worker = new Worker(trustedUrl);
    } catch (error) {
      if (destination)
        destination
          .abort(error)
          .catch(() => {})
          .finally(() => destination.releaseLock());
      reject(error);
      return;
    }
    let finished = false;
    let timer;
    const deadline = setTimeout(
      () => finish(new Error("Archive job exceeded its thirty-minute deadline. Existing work was preserved.")),
      30 * 60 * 1000
    );
    const abort = () => finish(signal?.reason || new DOMException("Archive operation canceled", "AbortError"));
    function finish(error, value) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (error && destination) {
        try {
          destination
            .abort(error)
            .catch(() => {})
            .finally(() => {
              try {
                destination.releaseLock();
              } catch {
                /* Already released by close. */
              }
            });
        } catch {
          /* Closed destinations have already released ownership. */
        }
      }
      activeJobs.delete(abort);
      publishJobs();
      if (error) reject(error);
      else resolve(value);
    }
    function heartbeat() {
      clearTimeout(timer);
      timer = setTimeout(() => finish(new Error("Archive worker stopped responding. Retry the operation.")), 30000);
    }
    worker.onmessage = async ({ data }) => {
      heartbeat();
      if (data.type === "complete") {
        // A transferred stream can report worker completion before the original
        // destination's asynchronous close has finished flushing to disk.
        clearTimeout(timer);
        try {
          await destinationClosed;
          finish(null, data.result);
        } catch (error) {
          finish(error);
        }
      } else if (data.type === "failed") finish(new Error(data.error));
      else if (data.type === "record") {
        try {
          await onRecord(data.record);
          worker.postMessage({ type: "ack", id: data.id });
        } catch (error) {
          worker.postMessage({ type: "ack", id: data.id, error: error.message });
          finish(error);
        }
      }
    };
    worker.onerror = () =>
      finish(
        new Error("Archive worker could not run. Reopen LoopCAT from its installed desktop app or a local HTTP server.")
      );
    signal?.addEventListener("abort", abort, { once: true });
    activeJobs.add(abort);
    publishJobs();
    heartbeat();
    try {
      worker.postMessage(
        { type: "job", operation, input, options, writable: transferable, streamRecords: Boolean(onRecord) },
        transferable ? [transferable] : []
      );
    } catch (error) {
      finish(error);
    }
  });
}

export const readArchive = (input, options) => archiveJob("read", input, options);
export const writeArchive = (input, writable, options) => archiveJob("write", input, { ...options, writable });
