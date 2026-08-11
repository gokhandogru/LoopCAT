export function createJobStore() {
  const jobs = new Map();
  const listeners = new Set();

  function publish() {
    const snapshot = Array.from(jobs.values());
    listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  }

  function update(id, patch) {
    const previous = jobs.get(id) || { id, status: "pending", progress: null, cancellable: false };
    const next = Object.freeze({ ...previous, ...patch, id, updatedAt: new Date().toISOString() });
    jobs.set(id, next);
    publish();
    return next;
  }

  return Object.freeze({
    beginJob(id, detail = {}) {
      return update(id, { ...detail, status: "running" });
    },
    reportProgress(id, detail = {}) {
      return update(id, { ...detail, status: "running" });
    },
    complete(id, detail = {}) {
      return update(id, { ...detail, status: "completed" });
    },
    fail(id, detail = {}) {
      return update(id, { ...detail, status: "failed" });
    },
    cancel(id, detail = {}) {
      return update(id, { ...detail, status: "cancelled" });
    },
    remove(id) {
      jobs.delete(id);
      return publish();
    },
    get(id) {
      return jobs.get(id) || null;
    },
    list() {
      return Array.from(jobs.values());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
