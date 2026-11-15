const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");
const root = path.resolve(__dirname, "../..");

async function setup(t, indexedDB = new IDBFactory()) {
  const events = [];
  const context = vm.createContext({
    window: { dispatchEvent: (event) => events.push(event) },
    indexedDB,
    IDBKeyRange,
    crypto: globalThis.crypto,
    structuredClone,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    Blob,
    TextEncoder,
    TextDecoder,
    CustomEvent
  });
  for (const file of ["linguistic-core.js", "storage.js", "tm.js", "termbase.js", "project.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  const api = context.window.CatHan;
  const { createResourceEditRepository } = await import(
    pathToFileURL(path.join(root, "src/features/resources/resource-edit-repository.js"))
  );
  const repository = createResourceEditRepository(api);
  t.after(async () => (await api.storage.openDatabase()).close());
  return { ...api, repository, events };
}

const tmInput = {
  id: "tm-entry",
  source: "Hello world",
  target: "Merhaba dünya",
  sourceLang: "en",
  targetLang: "tr",
  tmName: "Memory",
  resourceId: "tm-resource"
};
async function memory(h) {
  const resource = await h.storage.put("resources", {
    id: "tm-resource",
    type: "tm",
    name: "Memory",
    sourceLang: "en",
    targetLang: "tr"
  });
  const prepared = await h.tm.prepareTmEntryMutation(tmInput, { isNew: true });
  await h.storage.commitMutation(null, null, { changes: prepared.changes });
  return { resource, entry: await h.storage.get("tmEntries", tmInput.id) };
}

test("v9 upgrade keeps entries and adds local-only draft and operation stores", async (t) => {
  const indexedDB = new IDBFactory();
  await new Promise((resolve, reject) => {
    const open = indexedDB.open("cathan-local-cat", 9);
    open.onupgradeneeded = () => open.result.createObjectStore("tmEntries", { keyPath: "id" }).put(tmInput);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      open.result.close();
      resolve();
    };
  });
  const h = await setup(t, indexedDB);
  const db = await h.storage.openDatabase();
  assert.equal(db.version, 10);
  assert.ok(db.objectStoreNames.contains("resourceDrafts"));
  assert.ok(db.objectStoreNames.contains("resourceOperations"));
  assert.equal((await h.storage.get("tmEntries", tmInput.id)).target, tmInput.target);
});

test("TM edits atomically preserve indexes on stale-version conflict", async (t) => {
  const h = await setup(t);
  const { entry } = await memory(h);
  const saved = await h.tm.updateTmEntry({ ...entry, source: "Good morning" });
  const indexes = await h.storage.getAllByIndex("tmTokenIndex", "tmEntryId", entry.id);
  await assert.rejects(h.tm.updateTmEntry({ ...entry, source: "Stale overwrite" }), { name: "StorageConflictError" });
  assert.equal((await h.storage.get("tmEntries", entry.id)).source, "Good morning");
  assert.deepEqual(await h.storage.getAllByIndex("tmTokenIndex", "tmEntryId", entry.id), indexes);
  assert.ok(saved.storageVersion > entry.storageVersion);
  assert.ok(
    h.events.some((event) => event.type === "loopcat-resources-changed" && event.detail.entryIds.includes(entry.id))
  );
});

test("draft recovery, bounded operation receipts, undo and newer-edit protection", async (t) => {
  const h = await setup(t);
  const { resource, entry } = await memory(h);
  const draft = {
    id: "draft",
    sessionId: "session",
    resourceId: resource.id,
    type: "tm",
    entryId: entry.id,
    before: entry,
    values: { ...entry, target: "Günaydın" }
  };
  await h.repository.putDraft(draft);
  assert.equal((await h.repository.loadDrafts(resource.id)).length, 1);
  const saved = await h.repository.saveEntries("tm", resource, [draft]);
  assert.equal(saved.saved[0].target, "Günaydın");
  assert.deepEqual(saved.succeededDraftIds, [draft.id]);
  assert.equal((await h.repository.loadDrafts(resource.id)).length, 0);
  assert.equal((await h.storage.getAllByIndex("resourceOperations", "operationId", saved.operationId)).length, 1);
  const undone = await h.repository.undoOperation(saved.operationId);
  assert.equal(undone.status, "completed");
  assert.equal((await h.storage.get("tmEntries", entry.id)).target, entry.target);
  const updated = await h.repository.applyOperation("tm", resource, [
    { before: await h.storage.get("tmEntries", entry.id), after: { target: "One" } }
  ]);
  await h.tm.updateTmEntry({ ...(await h.storage.get("tmEntries", entry.id)), target: "Later change" });
  assert.equal((await h.repository.undoOperation(updated.operationId)).status, "failed");
  assert.equal((await h.storage.get("tmEntries", entry.id)).target, "Later change");
});

test("cancelled operations preserve committed entries and can undo creation and Trash deletion", async (t) => {
  const h = await setup(t);
  const { resource, entry } = await memory(h);
  const abort = new AbortController();
  const operation = await h.repository.applyOperation(
    "tm",
    resource,
    [
      { before: null, after: { ...tmInput, id: "new-entry", source: "New text" } },
      { before: entry, delete: true }
    ],
    { signal: abort.signal, onProgress: () => abort.abort() }
  );
  assert.equal(operation.status, "cancelled");
  assert.equal(operation.applied, 1);
  assert.ok(await h.storage.get("tmEntries", entry.id));
  assert.equal((await h.repository.undoOperation(operation.operationId)).status, "completed");
  assert.equal(await h.storage.get("tmEntries", "new-entry"), undefined);
  const deleted = await h.repository.applyOperation("tm", resource, [{ before: entry, delete: true }]);
  assert.equal((await h.storage.getAll("trashEntries")).length, 1);
  assert.equal((await h.repository.undoOperation(deleted.operationId)).status, "completed");
  assert.equal((await h.storage.get("tmEntries", entry.id)).target, entry.target);
  assert.equal((await h.storage.getAll("trashEntries")).length, 0);
});

test("receipt failure rolls back data and interrupted operation receipts remain undoable", async (t) => {
  const h = await setup(t);
  const { resource, entry } = await memory(h);
  const operation = await h.repository.applyOperation("tm", resource, [{ before: entry, after: { target: "Saved" } }]);
  const current = await h.storage.get("tmEntries", entry.id);
  const prepared = await h.tm.prepareTmEntryMutation({ ...current, target: "Must roll back" });
  await assert.rejects(
    h.storage.commitMutation(null, null, {
      changes: prepared.changes,
      resourceOperation: { operationId: operation.operationId, resourceId: resource.id, step: 0 }
    }),
    /already committed/
  );
  assert.equal((await h.storage.get("tmEntries", entry.id)).target, "Saved");
  const receipt = await h.storage.get("resourceOperations", operation.operationId);
  await h.storage.put("resourceOperations", { ...receipt, status: "running" });
  assert.equal((await h.repository.undoOperation(operation.operationId)).status, "completed");
  assert.equal((await h.storage.get("tmEntries", entry.id)).target, entry.target);
});

test("resource generations survive closed editors and never acknowledge newer package changes", async (t) => {
  const indexedDB = new IDBFactory();
  const owner = await setup(t, indexedDB);
  const { resource, entry } = await memory(owner);
  await owner.storage.put("projects", {
    id: "linked-project",
    name: "Linked",
    resourceLinks: [{ type: "tm", resourceId: resource.id }]
  });
  const firstGeneration = await owner.storage.getProjectResourceGeneration("linked-project");
  assert.equal(await owner.storage.acknowledgeProjectResourceGeneration("linked-project", firstGeneration), true);
  assert.equal((await owner.storage.listResourceDirtyProjects()).length, 0);
  const editor = await setup(t, indexedDB);
  await editor.tm.updateTmEntry({ ...entry, target: "Changed in a separate window" });
  const dirty = await owner.storage.listResourceDirtyProjects();
  assert.equal(dirty.length, 1);
  assert.equal(dirty[0].projectId, "linked-project");
  assert.ok(dirty[0].generation > firstGeneration);
  assert.equal(await owner.storage.acknowledgeProjectResourceGeneration("linked-project", firstGeneration), false);
  assert.equal((await owner.storage.listResourceDirtyProjects()).length, 1);
  assert.equal(await owner.storage.acknowledgeProjectResourceGeneration("linked-project", dirty[0].generation), true);
  assert.equal((await owner.storage.listResourceDirtyProjects()).length, 0);
  await owner.storage.releaseProject("linked-project");
});

test("stale resource descriptors cannot write into an archived or removed resource", async (t) => {
  const h = await setup(t);
  const { resource, entry } = await memory(h);
  await h.storage.put("resources", { ...(await h.storage.get("resources", resource.id)), archived: true });
  const result = await h.repository.applyOperation("tm", resource, [
    { before: entry, after: { target: "Must not save" } }
  ]);
  assert.equal(result.applied, 0);
  assert.equal((await h.storage.get("tmEntries", entry.id)).target, entry.target);
  await h.storage.deleteByKey("resources", resource.id);
  await assert.rejects(
    h.tm.prepareTmEntryMutation({ ...tmInput, id: "orphan" }, { isNew: true }),
    /removed or archived/
  );
});

test("saving an older snapshot never removes a newer durable draft", async (t) => {
  const h = await setup(t);
  const { resource, entry } = await memory(h);
  const draft = {
    id: "draft-race",
    sessionId: "session",
    resourceId: resource.id,
    entryId: entry.id,
    type: "tm",
    before: entry,
    values: { ...entry, target: "Snapshot being saved" },
    updatedAt: "2026-11-12T10:00:00.000Z"
  };
  await h.repository.putDraft(draft);
  const commit = h.storage.commitMutation;
  h.storage.commitMutation = async (...args) => {
    const result = await commit(...args);
    if (args[2].resourceOperation)
      await h.repository.putDraft({
        ...draft,
        values: { ...draft.values, target: "Newer typing" },
        updatedAt: "2026-11-12T10:00:01.000Z"
      });
    return result;
  };
  await h.repository.saveEntries("tm", resource, [draft]);
  const recovered = await h.repository.loadDrafts(resource.id);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].values.target, "Newer typing");
  assert.equal((await h.storage.get("tmEntries", entry.id)).target, "Snapshot being saved");
});

test("save all stops after the first failure and preserves every unattempted draft", async (t) => {
  const h = await setup(t);
  const { resource } = await memory(h);
  const drafts = ["first", "invalid", "unattempted"].map((id) => ({
    id: `draft-${id}`,
    sessionId: "batch-session",
    resourceId: resource.id,
    type: "tm",
    entryId: id,
    before: null,
    values: { ...tmInput, id, source: id === "invalid" ? "" : id }
  }));
  for (const draft of drafts) await h.repository.putDraft(draft);
  const result = await h.repository.saveEntries("tm", resource, drafts);
  assert.equal(result.applied, 1);
  assert.equal(result.failed.length, 2);
  assert.equal(result.failed[1].draft.entryId, "unattempted");
  assert.equal(result.failed[1].error.skipped, true);
  assert.equal(await h.storage.get("tmEntries", "unattempted"), undefined);
  assert.deepEqual((await h.repository.loadDrafts(resource.id)).map((draft) => draft.entryId).sort(), [
    "invalid",
    "unattempted"
  ]);
});

test("term edits synchronize concept siblings and resource copies remap designation identities", async (t) => {
  const h = await setup(t);
  const resource = await h.storage.put("resources", {
    id: "tb-resource",
    type: "termbase",
    name: "Terms",
    sourceLang: "en",
    targetLang: "tr"
  });
  const input = {
    id: "term-one",
    sourceTerm: "friend",
    targetTerm: "arkadaş",
    sourceLang: "en",
    targetLang: "tr",
    termBaseName: resource.name,
    resourceId: resource.id
  };
  const first = await h.termbase.prepareTermMutation(input, { isNew: true });
  await h.storage.commitMutation(null, null, { changes: first.changes });
  const firstRecord = await h.storage.get("terms", input.id);
  const second = await h.termbase.prepareTermMutation(
    {
      ...firstRecord,
      id: "term-two",
      storageVersion: 0,
      targetTerm: "dost",
      targetDesignationId: "",
      definition: "A trusted person"
    },
    { isNew: true }
  );
  await h.storage.commitMutation(null, null, { changes: second.changes });
  const current = await h.storage.get("terms", input.id);
  await h.termbase.updateTerm({
    ...current,
    sourceTerm: "companion",
    definition: "A close person",
    matchMode: "prefix"
  });
  const sibling = await h.storage.get("terms", "term-two");
  assert.equal(sibling.sourceTerm, "companion");
  assert.equal(sibling.targetTerm, "dost");
  assert.equal(sibling.definition, "A close person");
  assert.equal(sibling.matchMode, "prefix");
  const firstDraft = await h.storage.get("terms", input.id);
  const siblingDraft = await h.storage.get("terms", "term-two");
  const bulk = await h.repository.applyOperation("tb", resource, [
    { before: firstDraft, after: { ...firstDraft, definition: "Shared new definition" } },
    { before: siblingDraft, after: { ...siblingDraft, targetTerm: "yoldaş" } }
  ]);
  assert.equal(bulk.applied, 2);
  assert.equal((await h.storage.get("terms", "term-two")).definition, "Shared new definition");
  assert.equal((await h.storage.get("terms", "term-two")).targetTerm, "yoldaş");
  assert.equal((await h.repository.undoOperation(bulk.operationId)).status, "completed");
  assert.equal((await h.storage.get("terms", "term-two")).targetTerm, "dost");
  const staleSibling = await h.storage.get("terms", "term-two");
  await h.termbase.updateTerm({ ...staleSibling, targetTerm: "newer external edit" });
  const firstFresh = await h.storage.get("terms", input.id);
  const partial = await h.repository.applyOperation("tb", resource, [
    { before: firstFresh, after: { ...firstFresh, definition: "Concept edit" } },
    { before: staleSibling, after: { ...staleSibling, targetTerm: "stale overwrite" } }
  ]);
  assert.equal(partial.applied, 1);
  assert.equal(partial.conflicts.length, 1);
  assert.equal((await h.storage.get("terms", "term-two")).targetTerm, "newer external edit");
  const copied = await h.project.duplicateResource(resource.id);
  const terms = await h.storage.getAllByIndex("terms", "resourceId", copied.id);
  const designations = await h.storage.getAllByIndex("termDesignations", "resourceId", copied.id);
  assert.equal(terms.length, 2);
  assert.ok(terms.every((term) => designations.some((designation) => designation.id === term.sourceDesignationId)));
  assert.ok(terms.every((term) => designations.some((designation) => designation.id === term.targetDesignationId)));
});
