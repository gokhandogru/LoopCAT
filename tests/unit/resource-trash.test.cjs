const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function memoryStorage({ tmEntries = [], terms = [], trashEntries = [] } = {}) {
  const stores = { tmEntries, terms, trashEntries };
  const calls = [];
  return {
    calls,
    get(storeName, id) {
      return Promise.resolve(stores[storeName].find((record) => record.id === id) || null);
    },
    getAll(storeName) {
      return Promise.resolve([...(stores[storeName] || [])]);
    },
    getAllByIndex() {
      return Promise.resolve([]);
    },
    moveProjectToTrash() {},
    restoreTrashRecords() {},
    moveResourceRecordsToTrash(resourceType, entry) {
      calls.push(["move-resource", resourceType, entry]);
      stores.trashEntries.push(entry);
      const storeName = resourceType === "tm" ? "tmEntries" : "terms";
      const ids = new Set(entry.payload.records.map((record) => record.id));
      stores[storeName] = stores[storeName].filter((record) => !ids.has(record.id));
      return Promise.resolve(entry);
    },
    restoreResourceTrashRecords(entryId) {
      calls.push(["restore-resource", entryId]);
      const entry = stores.trashEntries.find((record) => record.id === entryId);
      if (!entry) return Promise.reject(new Error("Trash item no longer exists."));
      const storeName = entry.resourceType === "tm" ? "tmEntries" : "terms";
      stores[storeName].push(...entry.payload.records);
      stores.trashEntries = stores.trashEntries.filter((record) => record.id !== entryId);
      return Promise.resolve(entry);
    },
    moveProjectDocumentToTrash() {},
    deleteByKey() {
      return Promise.resolve();
    }
  };
}

test("TrashRepository moves one term with its exact record and restores through the atomic resource boundary", async () => {
  const { createTrashRepository } = await moduleAt("src/data/trash-repository.js");
  const term = {
    id: "term-1",
    termBaseName: "Terms",
    sourceLang: "en",
    targetLang: "tr",
    languagePair: "en::tr",
    sourceTerm: "cat",
    targetTerm: "kedi"
  };
  const storage = memoryStorage({ terms: [term] });
  const repository = createTrashRepository(storage);

  const entry = await repository.moveResourceEntry("tb", term.id);
  assert.equal(entry.entityType, "term");
  assert.equal(entry.resourceName, "Terms");
  assert.deepEqual(entry.payload.records, [term]);
  assert.equal((await storage.getAll("terms")).length, 0);

  const restored = await repository.restore(entry.id);
  assert.equal(restored.id, entry.id);
  assert.deepEqual(await storage.getAll("terms"), [term]);
  assert.deepEqual(
    storage.calls.map((call) => call.slice(0, 2)),
    [
      ["move-resource", "tb"],
      ["restore-resource", entry.id]
    ]
  );
});

test("TrashRepository moves only the selected translation memory name and language pair", async () => {
  const { createTrashRepository } = await moduleAt("src/data/trash-repository.js");
  const selected = [
    { id: "tm-1", tmName: "Main", sourceLang: "en", targetLang: "tr", languagePair: "en::tr" },
    { id: "tm-2", tmName: "Main", sourceLang: "en", targetLang: "tr", languagePair: "en::tr" }
  ];
  const untouched = { id: "tm-3", tmName: "Main", sourceLang: "en", targetLang: "de", languagePair: "en::de" };
  const storage = memoryStorage({ tmEntries: [...selected, untouched] });
  const repository = createTrashRepository(storage);

  const entry = await repository.moveResource("tm", { name: "Main", languagePair: "en::tr" });
  assert.equal(entry.entityType, "translation-memory");
  assert.deepEqual(
    entry.payload.records.map((record) => record.id),
    ["tm-1", "tm-2"]
  );
  assert.deepEqual(await storage.getAll("tmEntries"), [untouched]);
});

test("resource Trash commands keep redacted receipts and refresh their recovery token on Redo", async () => {
  const [{ createCommandBus }, { createUndoStore }, trashCommands] = await Promise.all([
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js"),
    moduleAt("src/commands/trash-commands.js")
  ]);
  let sequence = 0;
  const calls = [];
  const trashRepository = {
    moveResourceEntry(resourceType, entityId) {
      const entry = {
        id: `trash-${++sequence}`,
        entityType: "tm-entry",
        resourceType,
        payload: { records: [{ id: entityId, source: "private source text", target: "private target text" }] }
      };
      calls.push(["move", entityId, entry.id]);
      return Promise.resolve(entry);
    },
    restore(entryId) {
      calls.push(["restore", entryId]);
      return Promise.resolve({ id: entryId, entityType: "tm-entry", resourceType: "tm" });
    }
  };
  const bus = createCommandBus({ undoStore: createUndoStore(10) });
  const command = trashCommands.createDeleteResourceEntryCommand({
    resourceType: "tm",
    entityId: "tm-1",
    projectId: "project-1",
    trashRepository
  });

  const executed = await bus.execute(command);
  assert.equal(executed.receipt.commandId, "delete-resource-entry");
  assert.equal(JSON.stringify(executed.receipt).includes("private source text"), false);
  assert.equal(JSON.stringify(executed.receipt).includes("private target text"), false);
  assert.equal(executed.receipt.recoveryToken, "trash-1");
  await bus.undo("project-1");
  const redone = await bus.redo("project-1");
  assert.equal(redone.receipt.recoveryToken, "trash-2");
  assert.deepEqual(calls, [
    ["move", "tm-1", "trash-1"],
    ["restore", "trash-1"],
    ["move", "tm-1", "trash-2"]
  ]);
});

test("whole-resource Trash commands restore the exact recovery token and refresh it on Redo", async () => {
  const [{ createCommandBus }, { createUndoStore }, { createDeleteResourceCommand }] = await Promise.all([
    moduleAt("src/commands/command-bus.js"),
    moduleAt("src/commands/undo-store.js"),
    moduleAt("src/commands/trash-commands.js")
  ]);
  let sequence = 0;
  const calls = [];
  const trashRepository = {
    moveResource(resourceType, descriptor) {
      const entry = { id: `trash-resource-${++sequence}`, entityType: "termbase", resourceType };
      calls.push(["move", descriptor.name, descriptor.languagePair, entry.id]);
      return Promise.resolve(entry);
    },
    restore(entryId) {
      calls.push(["restore", entryId]);
      return Promise.resolve({ id: entryId, entityType: "termbase", resourceType: "tb" });
    }
  };
  const bus = createCommandBus({ undoStore: createUndoStore(10) });
  const command = createDeleteResourceCommand({
    resourceType: "tb",
    descriptor: { name: "Main terms", languagePair: "en::tr" },
    affectedIds: ["term-1", "term-2"],
    projectId: "project-1",
    trashRepository
  });

  const executed = await bus.execute(command);
  assert.equal(executed.receipt.commandId, "delete-resource");
  assert.deepEqual(executed.receipt.affectedIds, ["term-1", "term-2"]);
  assert.equal(executed.receipt.recoveryToken, "trash-resource-1");
  await bus.undo("project-1");
  const redone = await bus.redo("project-1");
  assert.equal(redone.receipt.recoveryToken, "trash-resource-2");
  assert.deepEqual(calls, [
    ["move", "Main terms", "en::tr", "trash-resource-1"],
    ["restore", "trash-resource-1"],
    ["move", "Main terms", "en::tr", "trash-resource-2"]
  ]);
});
