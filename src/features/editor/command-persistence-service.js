/** Keeps pre-command typing obligations alive if a command fails or aborts. */
export function createCommandPersistenceService({ autosave, session, repository, setTimer = setTimeout }) {
  const obligations = new Map();
  const active = new Map();
  function recover(id) {
    if (active.has(id) || !obligations.has(id)) return;
    const obligation = obligations.get(id);
    obligations.delete(id);
    if (autosave.has(id)) return;
    const current = session
      .getSegments()
      .find((segment) => segment.id === id && segment.projectId === obligation.projectId);
    if (current) autosave.debounce(current);
    else autosave.queue(obligation);
  }
  function clear(segment, options) {
    if (autosave.has(segment?.id)) {
      obligations.set(segment.id, structuredClone(segment));
      // Command catch handlers restore their snapshot before this task runs.
      setTimer(() => recover(segment.id), 0);
    }
    return autosave.clear(segment, options);
  }
  async function write(records, action) {
    const token = {};
    for (const record of records) active.set(record.id, token);
    let committed = false;
    try {
      const operation = action();
      autosave.trackCommand?.(records, operation);
      const result = await operation;
      committed = true;
      return result;
    } finally {
      for (const record of records) {
        if (active.get(record.id) !== token) continue;
        active.delete(record.id);
        if (committed) obligations.delete(record.id);
        else setTimer(() => recover(record.id), 0);
      }
    }
  }
  return Object.freeze({
    clear,
    // Atomic commands own the same pending typing obligation as ordinary saves.
    run: write,
    save: (record) => write([record], () => repository.save(record)),
    saveMany: (records) => write(records, () => repository.saveMany(records))
  });
}
