import { normalizeResourceQuery, selectResourceEntries, pageResourceEntries } from "./resource-query-core.js";

const cancelled = new Set();
let database;
let opening;
let cached;
let loading;
let cacheEpoch = 0;
const results = new Map();
const yieldQueue = [];
const yieldChannel = typeof MessageChannel === "function" ? new MessageChannel() : null;
if (yieldChannel) yieldChannel.port1.onmessage = () => yieldQueue.shift()?.();
const yieldFn = () =>
  new Promise((resolve) => {
    if (yieldChannel) {
      yieldQueue.push(resolve);
      yieldChannel.port2.postMessage(null);
    } else setTimeout(resolve, 0);
  });
const requestValue = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

async function openDatabase() {
  if (database) return database;
  if (opening) return opening;
  // The renderer initializes/migrates the database before requesting any query.
  // Opening without a version keeps this read-only worker out of migrations.
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open("cathan-local-cat");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      request.transaction.abort();
      reject(new Error("Open LoopCAT before opening a resource editor."));
    };
  });
  try {
    database = await opening;
  } finally {
    opening = null;
  }
  database.onversionchange = () => {
    database.close();
    database = null;
    cached = null;
    cacheEpoch += 1;
    results.clear();
  };
  return database;
}

async function snapshot(input) {
  const db = await openDatabase();
  const store = input.type === "tm" ? "tmEntries" : "terms";
  const transaction = db.transaction([store, "appMeta", "resources"], "readonly");
  const meta = transaction.objectStore("appMeta");
  const [generationRecord, epoch, resource] = await Promise.all([
    requestValue(meta.get(`resource-generation:${input.resourceId}`)),
    requestValue(meta.get("catalog-epoch")),
    requestValue(transaction.objectStore("resources").get(input.resourceId))
  ]);
  if (!resource) throw new Error("This resource no longer exists.");
  const generation = `${Number(generationRecord?.value || 0)}:${epoch?.value || ""}`;
  const key = `${input.type}:${input.resourceId}`;
  if (cached?.key === key && cached.generation === generation) return cached;
  const loadKey = `${cacheEpoch}:${key}:${generation}`;
  // Typing while a cold read is in flight must not load another full copy of
  // the same memory. Every caller still applies its own cancellation/query.
  if (loading?.key === loadKey) return loading.promise;
  const epochAtStart = cacheEpoch;
  const promise = requestValue(
    transaction.objectStore(store).index("resourceId").getAll(IDBKeyRange.only(input.resourceId))
  )
    .then((rows) => {
      const snapshot = { key, generation, rows };
      if (epochAtStart === cacheEpoch) {
        cached = snapshot;
        results.clear();
      }
      return snapshot;
    })
    .finally(() => {
      if (loading?.key === loadKey) loading = null;
    });
  loading = { key: loadKey, promise };
  return promise;
}

self.onmessage = async ({ data }) => {
  if (data.type === "cancel") {
    cancelled.add(data.id);
    return;
  }
  if (data.type === "invalidate") {
    cached = null;
    cacheEpoch += 1;
    results.clear();
    return;
  }
  if (data.type !== "query") return;
  const { id, input, all } = data;
  try {
    const started = performance.now();
    const normalized = normalizeResourceQuery(input);
    if (!normalized.resourceId) throw new Error("A resource ID is required.");
    const current = await snapshot(normalized);
    const loaded = performance.now();
    const key = `${current.generation}:${JSON.stringify(normalized)}`;
    let rows = results.get(key);
    if (!rows) {
      rows = await selectResourceEntries(current.rows, normalized, { yieldFn, cancelled: () => cancelled.has(id) });
      if (results.size >= 8) results.delete(results.keys().next().value);
      results.set(key, rows);
    }
    if (!cancelled.has(id)) {
      const result = all ? rows : pageResourceEntries(rows, input, current.generation);
      self.postMessage({
        id,
        result,
        ...(data.profile ? { timings: { load: loaded - started, select: performance.now() - loaded } } : {})
      });
    }
  } catch (error) {
    if (!cancelled.has(id))
      self.postMessage({ id, error: { name: error.name, message: error.message || String(error) } });
  } finally {
    cancelled.delete(id);
  }
};
