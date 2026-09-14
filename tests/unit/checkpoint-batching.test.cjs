const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { IDBFactory, IDBKeyRange, IDBObjectStore } = require("fake-indexeddb");

async function fixture(t) {
  const context = vm.createContext({
    window: {},
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    crypto,
    structuredClone,
    setInterval,
    clearInterval,
    console,
    Blob,
    TextEncoder,
    CustomEvent
  });
  vm.runInContext(readFileSync(path.join(__dirname, "../../storage.js"), "utf8"), context);
  const storage = context.window.CatHan.storage;
  const db = await storage.openDatabase();
  t.after(async () => {
    await storage.releaseProject("p");
    db.close();
  });
  const segments = Array.from({ length: 260 }, (_, index) => ({
    id: `s${String(index).padStart(4, "0")}`,
    projectId: "p",
    source: `Source ${index}`,
    target: `Target ${index}`
  }));
  const committed = await storage.writeStoresAtomically({
    projects: [{ id: "p", name: "Snapshot", documents: [] }],
    segments
  });
  return { storage, segments: committed.segments };
}

test("bounded checkpoint reads preserve one committed generation across concurrent edits", async (t) => {
  const { storage, segments } = await fixture(t);
  const native = IDBObjectStore.prototype.getAll;
  let reads = 0;
  let edit;
  t.mock.method(IDBObjectStore.prototype, "getAll", function (query, count) {
    const request = native.call(this, query, count);
    if (this.name === "segments") {
      assert.ok(count > 0 && count <= 128, "capture must bound each database read");
      if (++reads === 2)
        request.addEventListener("success", () => {
          edit = storage.put("segments", { ...segments[200], target: "Edited during capture" });
        });
    }
    return request;
  });
  const checkpoint = await storage.createCheckpoint("concurrent-edit");
  await edit;
  t.mock.restoreAll();
  assert.ok(reads >= 4);
  assert.equal(checkpoint.verified, true);
  const records = [];
  for await (const record of storage.checkpointRecords(checkpoint.id))
    if (record.store === "segments") records.push(record.value);
  assert.deepEqual(JSON.parse(JSON.stringify(records)), JSON.parse(JSON.stringify(segments)));
  assert.equal((await storage.get("segments", segments[200].id)).target, "Edited during capture");
});

test("failure in a later checkpoint batch rolls back its references and permits a clean retry", async (t) => {
  const { storage, segments } = await fixture(t);
  const native = IDBObjectStore.prototype.getAll;
  let reads = 0;
  t.mock.method(IDBObjectStore.prototype, "getAll", function (query, count) {
    const request = native.call(this, query, count);
    if (this.name === "segments" && ++reads === 2) request.addEventListener("success", () => this.transaction.abort());
    return request;
  });
  await assert.rejects(storage.createCheckpoint("injected-failure"), /abort/i);
  t.mock.restoreAll();
  assert.equal((await storage.getAll("checkpoints")).length, 0);
  assert.equal((await storage.getAll("restoreStaging")).length, 0);
  assert.equal((await storage.getAll("binaryAssets")).length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(await storage.getAll("segments"))), JSON.parse(JSON.stringify(segments)));
  assert.equal((await storage.createCheckpoint("retry")).recordCount, 261);
});
