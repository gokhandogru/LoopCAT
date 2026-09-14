const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");

function harness() {
  const cache = new Map();
  const context = vm.createContext({
    window: {
      localStorage: {
        getItem: (key) => cache.get(key),
        setItem: (key, value) => cache.set(key, value),
        removeItem: (key) => cache.delete(key)
      }
    },
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    crypto: globalThis.crypto,
    structuredClone,
    Blob,
    TextEncoder,
    CustomEvent: globalThis.CustomEvent,
    setInterval,
    clearInterval,
    setTimeout: (fn, delay) => setTimeout(fn, delay).unref(),
    console
  });
  vm.runInContext(readFileSync(path.join(__dirname, "../../storage.js"), "utf8"), context);
  return context.window.CatHan.storage;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
async function seed(storage) {
  await storage.commitMutation(null, null, {
    changes: [
      { store: "segments", value: { id: "s", projectId: "p", source: "Two words", status: "draft" } },
      {
        store: "tmEntries",
        value: {
          id: "e",
          resourceId: "r",
          tmName: "Memory",
          sourceLang: "en",
          targetLang: "tr",
          source: "One",
          target: "Bir"
        }
      },
      {
        store: "projects",
        value: {
          id: "p",
          name: "Project",
          documents: [{ id: "d", name: "file.docx", docxStructure: { huge: "payload" } }],
          docxStructure: { huge: "payload" }
        }
      },
      { store: "resources", value: { id: "r", name: "Memory", type: "tm", sourceLang: "en", targetLang: "tr" } }
    ]
  });
}

test("Catalog mutations maintain counts atomically regardless of change order, including confirmation, Undo and rollback", async () => {
  const storage = harness();
  await storage.rebuildCatalog();
  await seed(storage);
  let catalog = await storage.readCatalog();
  assert.deepEqual(plain(catalog.projects[0].catalogProgress), {
    total: 1,
    confirmed: 0,
    draft: 1,
    words: 2,
    percent: 0
  });
  assert.equal(catalog.resources[0].entryCount, 1);
  assert.equal(catalog.projects[0].docxStructure, undefined);
  assert.equal(catalog.projects[0].documents[0].docxStructure, undefined);
  let segment = await storage.get("segments", "s");
  await storage.put("segments", { ...segment, status: "confirmed", source: "Three source words" });
  catalog = await storage.readCatalog();
  assert.equal(catalog.projects[0].catalogProgress.percent, 100);
  assert.equal(catalog.projects[0].catalogProgress.words, 3);
  await assert.rejects(storage.put("segments", { ...segment, source: "Stale write" }), /Save conflict/);
  assert.deepEqual(plain(await storage.readCatalog()), plain(catalog));
  segment = await storage.get("segments", "s");
  await storage.put("segments", { ...segment, status: "draft", source: "Two words" });
  assert.equal((await storage.readCatalog()).projects[0].catalogProgress.percent, 0);
  assert.equal(storage.readCatalogPreview().generation, (await storage.readCatalog()).generation);
});

test("Verified catalog reads never scan content; recovery invalidates both summaries and preview", async () => {
  const storage = harness();
  await seed(storage);
  await storage.rebuildCatalog();
  const db = await storage.openDatabase();
  const transaction = db.transaction.bind(db);
  db.transaction = (stores, ...args) => {
    assert.equal(String(stores), "appMeta");
    return transaction(stores, ...args);
  };
  assert.equal((await storage.readCatalog()).projects.length, 1);
  db.transaction = transaction;
  await storage.replayCommittedJournal();
  assert.equal(await storage.get("appMeta", "workspace-catalog:v1"), undefined);
  assert.equal(storage.readCatalogPreview(), null);
  assert.equal((await storage.rebuildCatalog()).resources[0].entryCount, 1);
});

test("Replacement restore invalidates summaries and rebuilds only restored project progress", async () => {
  const storage = harness();
  await seed(storage);
  await storage.rebuildCatalog();
  await storage.replaceStoresAtomically({
    projects: [{ id: "restored", name: "Restored project" }],
    segments: [{ id: "restored-s", projectId: "restored", source: "Restored words", status: "confirmed" }]
  });
  assert.equal(storage.readCatalogPreview(), null);
  assert.equal(await storage.get("appMeta", "workspace-catalog:v1"), undefined);
  const rebuilt = await storage.rebuildCatalog();
  assert.deepEqual(plain(rebuilt.projects.map((project) => project.id)), ["restored"]);
  assert.equal(rebuilt.projects[0].catalogProgress.percent, 100);
  await storage.deleteByKey("tmEntries", "e");
  assert.equal((await storage.readCatalog()).resources[0].entryCount, 0);
});

test("Missing catalogs show unknown counts until rebuilt and resource pages cover every selected entry once", async () => {
  const storage = harness();
  await seed(storage);
  const unknown = await storage.readCatalog();
  assert.equal(unknown.projects[0].catalogPending, true);
  assert.equal(unknown.resources[0].entryCount, undefined);
  const db = await storage.openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("tmEntries", "readwrite");
    for (let i = 0; i < 250; i++)
      tx.objectStore("tmEntries").put({
        id: String(i).padStart(4, "0"),
        tmName: "Memory",
        resourceId: i % 2 ? "other" : "r"
      });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  const resource = await storage.get("resources", "r");
  const ids = [];
  let after = null;
  do {
    const result = await storage.resourceEntries("tm", resource, { after, limit: 20 });
    assert.ok(result.rows.length <= 20);
    ids.push(...result.rows.map((row) => row.id));
    after = result.next;
  } while (after);
  assert.equal(ids.length, 126);
  assert.equal(new Set(ids).size, 126);
  assert.equal((await storage.resourceEntries("tm", resource, { limit: Infinity })).rows.length, 126);
});

test("Catalog generations reject stale summaries from an older writer", async () => {
  const storage = harness();
  await seed(storage);
  const catalog = await storage.rebuildCatalog();
  await storage.put("appMeta", { key: "committed-generation", value: catalog.generation + 1 });
  const pending = await storage.readCatalog();
  assert.equal(pending.pending, true);
  assert.equal(pending.projects[0].catalogPending, true);
  assert.equal(pending.projects[0].catalogProgress, undefined);
});

test("Catalog metadata tolerates malformed legacy document containers without blocking persistence", async () => {
  const storage = harness();
  await storage.rebuildCatalog();
  await storage.put("projects", { id: "legacy", name: "Legacy", documents: { invalid: true } });
  assert.deepEqual(plain((await storage.readCatalog()).projects[0].documents), []);
  assert.deepEqual(plain((await storage.get("projects", "legacy")).documents), { invalid: true });
});
