(() => {
const WORKER_URL = "./cat-worker.js";
const REQUEST_TIMEOUT_MS = 15000;

let worker = null;
let nextRequestId = 1;
const pending = new Map();
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
}

function getWorker() {
  if (disabledReason || !canUseWorker()) return null;
  if (worker) return worker;
  try {
    worker = new Worker(WORKER_URL);
    worker.addEventListener("message", (event) => {
      const { id, ok, result, error } = event.data || {};
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      clearTimeout(request.timer);
      if (ok) request.resolve(result);
      else request.reject(new Error(error || "Worker request failed."));
    });
    worker.addEventListener("error", (error) => {
      disabledReason = error.message || "Worker failed.";
      rejectPending(new Error(disabledReason));
      worker?.terminate();
      worker = null;
    });
  } catch (error) {
    disabledReason = error.message || "Workers are unavailable.";
    worker = null;
  }
  return worker;
}

function requestWorker(type, payload) {
  const activeWorker = getWorker();
  if (!activeWorker) return Promise.reject(new Error(disabledReason || "Workers are unavailable."));
  const id = `worker-${nextRequestId++}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Worker request timed out."));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    activeWorker.postMessage({ id, type, payload });
  });
}

async function findTmMatches({ entries, options, fallback }) {
  try {
    return await requestWorker("tm-match", { entries, options });
  } catch (error) {
    return fallback();
  }
}

async function findTmMatchesBatch({ entries, options, fallback }) {
  try {
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
    return fallback();
  }
}

async function runQaChecks({ segments, terms, fallback }) {
  try {
    return await requestWorker("qa", { segments, terms });
  } catch (error) {
    return fallback();
  }
}

function status() {
  return {
    supported: canUseWorker(),
    active: Boolean(worker),
    disabledReason
  };
}

window.CatHan = window.CatHan || {};
window.CatHan.workerClient = {
  findTmMatches,
  findTmMatchesBatch,
  runQaChecks,
  status
};
})();
