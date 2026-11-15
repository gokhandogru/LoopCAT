/** Draft state is independent of rendered pages and never changes active linguistic data. */
export function createResourceEditorSession({ repository, resourceId, type, sessionId, onChange = (_state) => {} }) {
  const drafts = new Map();
  let persistence = Promise.resolve();
  let failure = null;
  let saving = false;
  const notify = () => onChange({ drafts: [...drafts.values()], saving, failure });
  const enqueue = (task) => {
    persistence = persistence
      .catch(() => {})
      .then(task)
      .catch((error) => {
        failure = error;
        notify();
        throw error;
      });
    void persistence.catch(() => {});
    return persistence;
  };
  function edit(record, patch) {
    const existing = drafts.get(record.id);
    const draft = {
      id: existing?.id || `${sessionId}:${record.id}`,
      sessionId,
      resourceId,
      type,
      entryId: record.id,
      before: existing ? existing.before : record._new ? null : structuredClone(record),
      values: { ...(existing?.values || record), ...patch },
      updatedAt: new Date().toISOString()
    };
    delete draft.values._new;
    drafts.set(record.id, draft);
    const snapshot = structuredClone(draft);
    enqueue(() => repository.putDraft(snapshot));
    notify();
    return draft;
  }
  async function discard(entryId) {
    const draft = drafts.get(entryId);
    if (!draft) return;
    await enqueue(() => repository.removeDraft(draft.id));
    if (drafts.get(entryId) === draft) drafts.delete(entryId);
    failure = null;
    notify();
  }
  async function discardAll() {
    for (const id of [...drafts.keys()]) await discard(id);
  }
  async function recover(records) {
    for (const record of records) {
      if (drafts.has(record.entryId)) continue;
      const copied = { ...record, id: `${sessionId}:${record.entryId}`, sessionId };
      drafts.set(record.entryId, copied);
      await enqueue(() => repository.putDraft(copied));
      if (record.sessionId !== sessionId) await enqueue(() => repository.removeDraft(record.id));
    }
    notify();
  }
  async function rebase(entryId, current) {
    const draft = drafts.get(entryId);
    if (!draft || !current) return;
    draft.before = structuredClone(current);
    draft.values.storageVersion = current.storageVersion;
    await enqueue(() => repository.putDraft(structuredClone(draft)));
    failure = null;
    notify();
  }
  async function save(resource, entryIds = [...drafts.keys()]) {
    if (saving) return { saved: [], failed: [] };
    saving = true;
    failure = null;
    notify();
    try {
      await flush();
      const pending = entryIds.map((id) => drafts.get(id)).filter(Boolean);
      if (!pending.length) return { saved: [], failed: [] };
      const result = await repository.saveEntries(type, resource, pending);
      const failedIds = new Set((result.failed || []).map((item) => item.draft?.entryId || item.entryId));
      for (const draft of pending)
        if (!failedIds.has(draft.entryId)) {
          const latest = drafts.get(draft.entryId);
          if (latest && latest !== draft) {
            const committed = result.saved?.find((record) => record.id === draft.entryId);
            if (committed) {
              latest.before = structuredClone(committed);
              latest.values.storageVersion = committed.storageVersion;
              await enqueue(() => repository.putDraft(structuredClone(latest)));
            }
          } else {
            await enqueue(() => repository.removeDraft(draft.id));
            if (drafts.get(draft.entryId) === draft) drafts.delete(draft.entryId);
            else {
              const newer = drafts.get(draft.entryId);
              const committed = result.saved?.find((record) => record.id === draft.entryId);
              if (newer && committed) {
                newer.before = structuredClone(committed);
                newer.values.storageVersion = committed.storageVersion;
                await enqueue(() => repository.putDraft(structuredClone(newer)));
              }
            }
          }
        }
      failure = result.failed?.[0]?.error || null;
      return result;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      saving = false;
      notify();
    }
  }
  async function flush() {
    await persistence.catch(() => {});
    // Retry the current snapshots after a quota/transient error, without discarding text.
    if (failure) {
      for (const draft of drafts.values()) await repository.putDraft(structuredClone(draft));
      failure = null;
    }
  }
  return Object.freeze({
    edit,
    discard,
    discardAll,
    recover,
    rebase,
    save,
    flush,
    get: (id) => drafts.get(id),
    values: () => [...drafts.values()],
    size: () => drafts.size,
    isSaving: () => saving,
    getFailure: () => failure
  });
}
