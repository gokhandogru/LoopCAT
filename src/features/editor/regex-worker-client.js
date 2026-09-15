export function evaluateRegex(payload, { signal = undefined, timeoutMs = 2000 } = {}) {
  if (typeof Worker === "undefined") return Promise.reject(new Error("Regex search requires worker support."));
  return new Promise((resolve, reject) => {
    const url = "./regex-worker.js";
    const worker =
      window.CatHan?.createFileWorker?.(url) ||
      new Worker(window.CatHan?.appRuntime?.safeHtml?.trustedScriptUrl?.(url) || url);
    let timer;
    const finish = (error, result = undefined) => {
      worker.terminate();
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(result);
    };
    function abort() {
      finish(new DOMException("Search canceled", "AbortError"));
    }
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(
      () => finish(new Error("Regex exceeded its two-second deadline. Simplify the pattern and retry.")),
      timeoutMs
    );
    worker.onmessage = ({ data }) => finish(data.ok ? null : new Error(data.error), data.result);
    worker.onerror = () => finish(new Error("Regex worker failed. Retry the search."));
    worker.postMessage(payload);
  });
}
