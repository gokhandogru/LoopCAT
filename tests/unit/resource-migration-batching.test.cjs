const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { IDBFactory, IDBKeyRange, IDBObjectStore } = require("fake-indexeddb");

function storageFor(indexedDB, events = []) {
  const context = vm.createContext({
    window: { dispatchEvent: (event) => events.push(event) },
    indexedDB,
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
  return context.window.CatHan.storage;
}

test("import-time resource migration clears initialization after an already-open database", async (t) => {
  const events = [];
  const storage = storageFor(new IDBFactory(), events);
  const db = await storage.openDatabase();
  t.after(async () => {
    await storage.releaseProject("imported");
    db.close();
  });
  await storage.deleteByKey("appMeta", "resources-v2-migration");
  events.length = 0;
  await storage.importProjectPackageRecords({
    project: { id: "imported", name: "Imported", sourceLang: "en", targetLang: "tr", documents: [] }
  });
  const initialization = events.filter((event) => event.type === "loopcat-storage-initialization");
  assert.ok(initialization.some((event) => event.detail.message.includes("Updating existing")));
  assert.equal(initialization.at(-1).detail.message, "");
  assert.equal((await storage.get("appMeta", "resources-v2-migration")).complete, true);
});

async function legacyFixture() {
  const indexedDB = new IDBFactory();
  const storage = storageFor(indexedDB);
  const db = await storage.openDatabase();
  const tx = db.transaction(["appMeta", "tmEntries", "tmTokenIndex", "terms", "termTokenIndex"], "readwrite");
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
  tx.objectStore("appMeta").delete("resources-v2-migration");
  for (let index = 0; index < 260; index++) {
    const id = String(index).padStart(4, "0");
    const pair = { sourceLang: "en", targetLang: "tr", languagePair: "en::tr" };
    tx.objectStore("tmEntries").put({
      id,
      ...pair,
      tmName: "Legacy TM",
      source: `Source ${index}`,
      target: `Target ${index}`
    });
    tx.objectStore("terms").put({
      id,
      ...pair,
      termBaseName: "Legacy TB",
      sourceTerm: `Term ${index}`,
      targetTerm: `Terim ${index}`
    });
    tx.objectStore("termTokenIndex").put({ id, ...pair, termId: id, token: "term" });
    for (let token = 0; token < 2; token++) {
      tx.objectStore("tmTokenIndex").put({ id: `${id}:${token}`, ...pair, tmEntryId: id, token: String(token) });
    }
  }
  await done;
  db.close();
  return { indexedDB, storage: storageFor(indexedDB) };
}

test("legacy resource upgrade bounds reads and preserves every entry, token, and relationship", async (t) => {
  const { storage } = await legacyFixture();
  const nativeGetAll = IDBObjectStore.prototype.getAll;
  const scans = new Map();
  t.mock.method(IDBObjectStore.prototype, "getAll", function (query, count) {
    assert.ok(!["tmTokenIndex", "termTokenIndex"].includes(this.name), "startup must not scan derived token indexes");
    if (["tmEntries", "terms"].includes(this.name)) {
      assert.ok(count > 0 && count <= 128, `${this.name} must use bounded migration reads`);
      scans.set(this.name, (scans.get(this.name) || 0) + 1);
    }
    return nativeGetAll.call(this, query, count);
  });
  const db = await storage.openDatabase();
  t.mock.restoreAll();
  t.after(() => db.close());
  for (const count of scans.values()) assert.ok(count >= 4);
  assert.equal(scans.size, 2);
  const resources = await storage.getAll("resources");
  const tm = resources.find((resource) => resource.type === "tm");
  const tb = resources.find((resource) => resource.type === "termbase");
  assert.equal(resources.length, 2);
  const entries = await storage.getAll("tmEntries");
  const tokens = await storage.getAll("tmTokenIndex");
  assert.equal(entries.length, 260);
  assert.equal(tokens.length, 520);
  assert.ok(entries.every((entry, index) => entry.resourceId === tm.id && entry.target === `Target ${index}`));
  assert.ok(tokens.every((token) => !token.resourceId && entries.some((entry) => entry.id === token.tmEntryId)));
  assert.ok((await storage.getAll("terms")).every((term) => term.resourceId === tb.id));
  assert.equal((await storage.get("appMeta", "tm-token-index:en::tr")).dirty, true);
  assert.equal((await storage.get("appMeta", "term-token-index:en::tr")).dirty, true);
  assert.equal((await storage.getAll("termConcepts")).length, 260);
  assert.equal((await storage.getAll("termDesignations")).length, 520);
  const marker = await storage.get("appMeta", "resources-v2-migration");
  assert.equal(marker.complete, true);
  assert.equal(marker.tmEntryCount, 260);
  assert.equal(marker.legacyTermCount, 260);
  const runtime = vm.createContext({
    window: { CatHan: { storage } },
    console,
    TextEncoder,
    TextDecoder,
    Blob,
    crypto
  });
  for (const filename of ["tm.js", "termbase.js"]) {
    vm.runInContext(readFileSync(path.join(__dirname, "../..", filename), "utf8"), runtime);
  }
  const matches = await runtime.window.CatHan.tm.findTmMatches({
    source: "Source 200",
    sourceLang: "en",
    targetLang: "tr",
    resourceLinks: [{ type: "tm", resourceId: tm.id, lookup: true }]
  });
  assert.ok(matches.some((match) => match.target === "Target 200"));
  assert.equal((await storage.get("appMeta", "tm-token-index:en::tr")).dirty, false);
  await storage.put("projects", {
    id: "capture-project",
    name: "Capture",
    sourceLang: "en",
    targetLang: "tr",
    activeTermBaseId: tb.id,
    resourceLinks: [{ type: "termbase", resourceId: tb.id, contribute: true, lookup: true }]
  });
  await runtime.window.CatHan.termbase.saveTermPair({
    projectId: "capture-project",
    source: "New word",
    target: "Yeni sözcük"
  });
  const terms = await runtime.window.CatHan.termbase.findTerms({
    source: "Term 200",
    sourceLang: "en",
    targetLang: "tr",
    resourceLinks: [{ type: "termbase", resourceId: tb.id, lookup: true }]
  });
  assert.ok(
    terms.some((term) => term.targetTerm === "Terim 200"),
    "capturing a term must not hide the unmigrated legacy index"
  );
  assert.equal((await storage.get("appMeta", "term-token-index:en::tr")).dirty, false);
  await storage.releaseProject("capture-project");
});

test("a later migration batch failure rolls back earlier batches and can retry", async (t) => {
  const { indexedDB, storage } = await legacyFixture();
  const nativePut = IDBObjectStore.prototype.put;
  t.mock.method(IDBObjectStore.prototype, "put", function (value, ...args) {
    if (this.name === "terms" && value.id === "0200") throw new Error("Injected migration write failure");
    return nativePut.call(this, value, ...args);
  });
  await assert.rejects(storage.openDatabase(), /Injected migration write failure/);
  t.mock.restoreAll();
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("cathan-local-cat");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const read = (store, method, key) =>
    new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store)[method](key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  assert.equal(await read("appMeta", "get", "resources-v2-migration"), undefined);
  assert.equal(await read("resources", "count"), 0);
  assert.ok((await read("tmEntries", "getAll")).every((entry) => !entry.resourceId));
  assert.ok((await read("tmTokenIndex", "getAll")).every((token) => !token.resourceId));
  db.close();
  const retried = await storage.openDatabase();
  t.after(() => retried.close());
  assert.equal((await storage.get("appMeta", "resources-v2-migration")).complete, true);
});
