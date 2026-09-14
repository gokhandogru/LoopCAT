(() => {
const WORKER_URL = "./cat-worker.js";
const REQUEST_TIMEOUT_MS = 15000;

let worker = null;
let nextRequestId = 1;
const pending = new Map();
const queue = [];
let disabledReason = "";

function canUseWorker() {
  return typeof Worker !== "undefined" && ["http:", "https:", "file:", "loopcat:"].includes(window.location.protocol);
}

function rejectPending(error) {
  pending.forEach(({ reject, timer }) => {
    clearTimeout(timer);
    reject(error);
  });
  pending.clear();
  for (const request of queue.splice(0)) request.reject(error);
}

function getWorker() {
  if (disabledReason || !canUseWorker()) return null;
  if (worker) return worker;
  try {
    const trustedWorkerUrl = window.CatHan?.appRuntime?.safeHtml?.trustedScriptUrl?.(WORKER_URL) || WORKER_URL;
    worker = new Worker(trustedWorkerUrl);
    worker.addEventListener("message", (event) => {
      const { id, ok, result, error } = event.data || {};
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      clearTimeout(request.timer);
      if (ok) request.resolve(result);
      else request.reject(new Error(error || "Worker request failed."));
      pump();
    });
    worker.addEventListener("error", (error) => {
      rejectPending(new Error(error.message || "Worker failed."));
      worker?.terminate();
      worker = null;
    });
  } catch (error) {
    disabledReason = error.message || "Workers are unavailable.";
    worker = null;
  }
  return worker;
}

function pump() {
  if (pending.size || !queue.length) return;
  const queued = queue.shift();
  const activeWorker = getWorker();
  if (!activeWorker) { queued.reject(new Error(disabledReason || "Workers are unavailable.")); pump(); return; }
  const id = `worker-${nextRequestId++}`;
  const { type, payload, resolve, reject } = queued;
    const timer = setTimeout(() => {
      activeWorker.terminate();
      if (worker === activeWorker) worker = null;
      rejectPending(new Error("Worker request timed out. The worker was reset; retry the operation."));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    try { activeWorker.postMessage({ id, type, payload }); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); pump(); }
}

function requestWorker(type, payload) {
  return new Promise((resolve, reject) => {
    if (type === "tm-match") {
      const outdated = queue.findIndex((request) => request.type === type);
      if (outdated >= 0) queue.splice(outdated, 1)[0].reject(new DOMException("Lookup superseded by the latest query.", "AbortError"));
    }
    if (queue.length >= 16) { reject(new Error("Worker queue is full. Retry when current work finishes.")); return; }
    queue.push({ type, payload, resolve, reject });
    pump();
  });
}

async function findTmMatches({ entries, options, fallback }) {
  try {
    return await requestWorker("tm-match", { entries, options });
  } catch (error) {
    if (!canUseWorker() && (entries?.length || 0) <= 50 && String(options?.source || "").length <= 1000) return fallback();
    throw error;
  }
}

async function findTmMatchesBatch({ entries, options, fallback }) {
  try {
    if (entries.length > 32) {
      const results = [];
      for (let start = 0; start < entries.length; start += 32) results.push(...await findTmMatchesBatch({ entries: entries.slice(start, start + 32), options: Array.isArray(options) ? options.slice(start, start + 32) : options, fallback }));
      return results;
    }
    const uniqueEntries = new Map();
    const candidateIds = (entries || []).map((items) => (items || []).map((entry) => {
      uniqueEntries.set(entry.id, entry);
      return entry.id;
    }));
    return await requestWorker("tm-match-batch", {
      entries: Array.from(uniqueEntries.values()),
      candidateIds,
      options
    });
  } catch (error) {
    if (!canUseWorker() && (entries?.length || 0) <= 5 && entries.every((items) => items.length <= 10)) return fallback();
    throw error;
  }
}

async function runQaChecks({ segments, terms, fallback }) {
  try {
    if (segments.length > 250) {
      const results = [];
      for (let start = 0; start < segments.length; start += 250) results.push(...await requestWorker("qa", { segments: segments.slice(start, start + 250), terms }));
      return results;
    }
    return await requestWorker("qa", { segments, terms });
  } catch (error) {
    if (!canUseWorker() && (segments?.length || 0) <= 10 && (terms?.length || 0) <= 50) return fallback();
    throw error;
  }
}

function status() {
  return {
    supported: canUseWorker(),
    active: Boolean(worker),
    disabledReason
  };
}

// Analysis has its own disposable worker: exhaustive project scoring must
// never queue in front of the active segment's TM lookup or QA request.
function analyzeTm({ sources, entries, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Analysis canceled", "AbortError")); return; }
    if (!canUseWorker()) { reject(new Error("Background analysis is unavailable.")); return; }
    let analysisWorker;
    let timer;
    const finish = (error, result) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      analysisWorker?.terminate();
      if (error) reject(error); else resolve(result);
    };
    function abort() { finish(new DOMException("Analysis canceled", "AbortError")); }
    try {
      const url = window.CatHan?.appRuntime?.safeHtml?.trustedScriptUrl?.(WORKER_URL) || WORKER_URL;
      analysisWorker = new Worker(url);
      signal?.addEventListener("abort", abort, { once: true });
      analysisWorker.addEventListener("message", ({ data }) => finish(data.ok ? null : new Error(data.error), data.result));
      analysisWorker.addEventListener("error", (error) => finish(new Error(error.message || "Analysis failed.")));
      timer = setTimeout(() => finish(new Error("Project analysis timed out. Reopen the file view to retry.")), 60000);
      analysisWorker.postMessage({ id: "analysis", type: "tm-analysis", payload: { sources, entries } });
    } catch (error) { finish(error); }
  });
}

window.CatHan = window.CatHan || {};
window.CatHan.workerClient = {
  analyzeTm,
  findTmMatches,
  findTmMatchesBatch,
  runQaChecks,
  status
};
})();
