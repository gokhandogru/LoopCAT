/**
 * Durable editor drafts and reversible, version-checked resource operations.
 * @param {{storage: any, tm: any, termbase: any, project?: any}} options
 */
export function createResourceEditRepository({ storage, tm, termbase }) {
  if (
    !storage?.commitMutation ||
    !storage?.getAllByIndex ||
    !tm?.prepareTmEntryMutation ||
    !termbase?.prepareTermMutation
  ) {
    throw new TypeError("ResourceEditRepository requires storage and atomic resource mutation builders.");
  }
  const stamp = () => new Date().toISOString();
  const clone = (value) => structuredClone(value);
  const normalizeType = (type) => {
    if (type === "tm") return "tm";
    if (type === "tb" || type === "termbase") return "tb";
    throw new TypeError("Unknown resource type.");
  };
  const storeFor = (type) => (type === "tm" ? "tmEntries" : "terms");
  const errorInfo = (error) => ({
    name: error?.name || "Error",
    message: error?.message || "Resource operation failed."
  });

  async function loadDrafts(resourceId) {
    return (await storage.getAllByIndex("resourceDrafts", "resourceId", resourceId)).sort((a, b) =>
      String(a.updatedAt).localeCompare(String(b.updatedAt))
    );
  }

  async function putDraft(draft) {
    if (!draft?.id || !draft.sessionId || !draft.resourceId || !draft.entryId) {
      throw new Error("A draft requires its session, resource, and entry identity.");
    }
    const value = { ...clone(draft), type: normalizeType(draft.type), updatedAt: draft.updatedAt || stamp() };
    await storage.put("resourceDrafts", value);
    return value;
  }

  const removeDraft = (id) => storage.deleteByKey("resourceDrafts", id);

  async function prepareChange(type, resource, change) {
    const liveResource = await storage.get("resources", resource.id);
    if (!liveResource || liveResource.archived || liveResource.type !== (type === "tm" ? "tm" : "termbase")) {
      throw new Error("This resource was removed or archived. Your changes were preserved.");
    }
    resource = liveResource;
    const before = change.before || null;
    if (before?.resourceId && before.resourceId !== resource.id)
      throw new Error("The entry belongs to another resource.");
    if (change.delete) {
      if (!before?.id) throw new Error("A deletion requires the reviewed entry.");
      const name = type === "tm" ? before.tmName : before.termBaseName;
      const trash = {
        id: storage.makeId("trash"),
        entityType: type === "tm" ? "tm-entry" : "term",
        entityId: before.id,
        projectId: "",
        resourceType: type,
        resourceName: name,
        sourceLang: before.sourceLang,
        targetLang: before.targetLang,
        languagePair: before.languagePair,
        label: `${type === "tm" ? "Translation memory entry" : "Termbase entry"} · ${name}`,
        deletedAt: stamp(),
        payload: { records: [before] }
      };
      const currentResource = await storage.get("resources", resource.id);
      return {
        record: null,
        changes: [
          { store: "trashEntries", value: trash, insertOnly: true },
          { store: storeFor(type), key: before.id, value: before, delete: true, assertValue: before },
          {
            store: type === "tm" ? "tmTokenIndex" : "termTokenIndex",
            where: { [type === "tm" ? "tmEntryId" : "termId"]: before.id }
          },
          ...(currentResource ? [{ store: "resources", value: { ...currentResource, updatedAt: stamp() } }] : [])
        ]
      };
    }
    const value = {
      ...(before || {}),
      ...(change.after || {}),
      resourceId: resource.id,
      id: before?.id || change.after?.id || storage.makeId(type === "tm" ? "tm" : "term"),
      storageVersion: before?.storageVersion || 0,
      sourceLang: before?.sourceLang || resource.sourceLang,
      targetLang: before?.targetLang || resource.targetLang,
      [type === "tm" ? "tmName" : "termBaseName"]: resource.name
    };
    return type === "tm"
      ? tm.prepareTmEntryMutation(value, { isNew: !before })
      : termbase.prepareTermMutation(value, { isNew: !before });
  }

  async function applyOperation(
    inputType,
    resource,
    inputChanges,
    options = /** @type {{onProgress?: (progress: any) => unknown, signal?: AbortSignal}} */ ({})
  ) {
    const { onProgress, signal } = options;
    const type = normalizeType(inputType);
    if (!resource?.id || resource.archived) throw new Error("Open an active resource before editing.");
    const changes = clone(inputChanges || []);
    const operationId = storage.makeId("resource-operation");
    const operation = {
      id: operationId,
      kind: "operation",
      resourceId: resource.id,
      type,
      total: changes.length,
      applied: 0,
      status: "running",
      createdAt: stamp(),
      updatedAt: stamp()
    };
    await storage.put("resourceOperations", operation);
    const results = [];
    const errors = [];
    const ownRecords = new Map();
    let cancelled = false;
    // Each entry and its small append-only receipt commit together. Large jobs
    // never rewrite an ever-growing receipt or hold one unbounded transaction.
    for (let index = 0; index < changes.length; index++) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }
      try {
        const requested = changes[index];
        const lineage = requested.before?.id ? ownRecords.get(requested.before.id) : null;
        const owned = lineage && lineage.baseVersion === (requested.before.storageVersion || 0) ? lineage.record : null;
        // A preceding concept edit may have updated this same draft's sibling.
        // Rebase only onto records committed by this operation, keeping the
        // user's explicit field changes and their CAS version intact.
        const intended = owned
          ? Object.fromEntries(
              Object.entries(requested.after || {}).filter(
                ([key, value]) =>
                  !["storageVersion", "storageWriter", "storageGeneration", "updatedAt", "updatedBy"].includes(key) &&
                  !sameContent(value, requested.before[key])
              )
            )
          : null;
        const effective = owned ? { ...requested, before: owned, after: { ...owned, ...intended } } : requested;
        const prepared = await prepareChange(type, resource, effective);
        if (signal?.aborted) {
          cancelled = true;
          break;
        }
        const committed = await storage.commitMutation(null, null, {
          changes: prepared.changes,
          resourceOperation: { operationId, resourceId: resource.id, step: index, count: 1 }
        });
        for (const value of committed.values)
          if (
            value?.resourceId === resource.id &&
            (type === "tm" ? Object.hasOwn(value, "source") : Object.hasOwn(value, "sourceTerm"))
          )
            ownRecords.set(value.id, {
              record: value,
              baseVersion:
                ownRecords.get(value.id)?.baseVersion ??
                prepared.changes.find((change) => change.store === storeFor(type) && change.value?.id === value.id)
                  ?.value.storageVersion ??
                0
            });
        const record = prepared.record
          ? committed.values.find((value) => value?.id === prepared.record.id) || prepared.record
          : null;
        results.push({ index, entryId: record?.id || changes[index].before?.id, record });
      } catch (error) {
        errors.push({ index, entryId: changes[index].before?.id || changes[index].after?.id, ...errorInfo(error) });
        break;
      }
      try {
        await onProgress?.({ operationId, applied: results.length, completed: index + 1, total: changes.length });
      } catch {
        /* Presentation failure cannot change the committed outcome. */
      }
      if ((index + 1) % 25 === 0)
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
    }
    const persisted = await storage.get("resourceOperations", operationId);
    const status = cancelled ? "cancelled" : errors.length ? "failed" : "completed";
    await storage.put("resourceOperations", { ...persisted, status, errors, updatedAt: stamp() });
    return {
      operationId,
      applied: results.length,
      total: changes.length,
      status,
      errors,
      conflicts: errors.filter((error) => error.name === "StorageConflictError"),
      results
    };
  }

  async function saveEntries(type, resource, drafts) {
    const result = await applyOperation(
      type,
      resource,
      drafts.map((draft) => ({
        before: draft.before || null,
        after: { ...draft.values, id: draft.before?.id || draft.entryId }
      }))
    );
    const saved = [];
    const succeededDraftIds = [];
    const draftCleanupErrors = [];
    for (const entry of result.results) {
      saved.push(entry.record);
      succeededDraftIds.push(drafts[entry.index].id);
      try {
        if (storage.deleteResourceDraftIfUnchanged) await storage.deleteResourceDraftIfUnchanged(drafts[entry.index]);
        else await removeDraft(drafts[entry.index].id);
      } catch (error) {
        draftCleanupErrors.push({ draftId: drafts[entry.index].id, ...errorInfo(error) });
      }
    }
    return {
      ...result,
      saved,
      succeededDraftIds,
      draftCleanupErrors,
      failed: drafts.flatMap((draft, index) =>
        succeededDraftIds.includes(draft.id)
          ? []
          : [
              {
                draft,
                error: result.errors.find((error) => error.index === index) || {
                  name: "OperationStoppedError",
                  message: "This draft was not saved because the operation stopped after an earlier failure.",
                  skipped: true
                }
              }
            ]
      )
    };
  }

  function sameContent(left, right) {
    const canonical = (value) => {
      if (Array.isArray(value)) return value.map(canonical);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .filter((key) => !["storageVersion", "storageWriter", "storageGeneration"].includes(key))
          .map((key) => [key, canonical(value[key])])
      );
    };
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  }

  async function undoOperation(operationId) {
    const operation = await storage.get("resourceOperations", operationId);
    if (!operation || operation.kind !== "operation") throw new Error("Resource operation not found.");
    const receipts = (await storage.getAllByIndex("resourceOperations", "operationId", operationId)).sort(
      (a, b) => b.step - a.step
    );
    const versions = new Map();
    const errors = [];
    let undone = receipts.filter((receipt) => receipt.undone).length;
    for (const receipt of receipts) {
      if (receipt.undone) {
        for (const change of receipt.changes)
          if (change.store !== "resources" && change.before) {
            versions.set(`${change.store}:${change.key}`, receipt.undoGeneration);
          }
        continue;
      }
      try {
        // Collapse delete+insert index updates to their original/final values.
        const collapsed = new Map();
        for (const change of receipt.changes) {
          const key = `${change.store}:${change.key}`;
          const existing = collapsed.get(key);
          collapsed.set(key, existing ? { ...change, before: existing.before } : change);
        }
        const inverse = [];
        for (const [key, change] of collapsed) {
          if (change.store === "resources") continue;
          const current = await storage.get(change.store, change.key);
          if (
            !sameContent(current || null, change.after || null) ||
            (current?.storageVersion && current.storageVersion !== (versions.get(key) || change.after?.storageVersion))
          ) {
            const error = new Error("An entry changed after this operation. Undo preserved the newer work.");
            error.name = "StorageConflictError";
            throw error;
          }
          inverse.push(
            change.before
              ? {
                  store: change.store,
                  value: {
                    ...change.before,
                    ...(Object.hasOwn(change.before, "storageVersion") || current?.storageVersion
                      ? { storageVersion: current?.storageVersion || 0 }
                      : {})
                  },
                  ...(current ? { assertValue: current } : { insertOnly: true })
                }
              : {
                  store: change.store,
                  key: change.key,
                  value: current,
                  delete: true,
                  ...(current ? { assertValue: current } : {})
                }
          );
        }
        const resource = await storage.get("resources", operation.resourceId);
        if (resource) inverse.push({ store: "resources", value: { ...resource, updatedAt: stamp() } });
        const committed = await storage.commitMutation(null, null, {
          changes: inverse,
          resourceOperationUndo: receipt.id
        });
        inverse.forEach((change, index) => {
          if (committed.values[index]?.storageVersion)
            versions.set(`${change.store}:${change.key || change.value?.id}`, committed.values[index].storageVersion);
        });
        undone++;
      } catch (error) {
        errors.push({ step: receipt.step, ...errorInfo(error) });
        break;
      }
    }
    const status = errors.length ? "failed" : "completed";
    await storage.put("resourceOperations", {
      ...(await storage.get("resourceOperations", operationId)),
      undoStatus: status,
      undone,
      undoErrors: errors,
      updatedAt: stamp()
    });
    return {
      operationId,
      applied: undone,
      total: receipts.length,
      status,
      errors,
      conflicts: errors.filter((error) => error.name === "StorageConflictError")
    };
  }

  return Object.freeze({ loadDrafts, putDraft, removeDraft, saveEntries, applyOperation, undoOperation });
}
