const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const vm = require("node:vm");
const esbuild = require("esbuild");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");
const root = path.resolve(__dirname, "../..");
const load = (name) => import(pathToFileURL(path.join(root, "src/features/resources", name)).href);

test("resource queries filter and globally sort before paging, including entries past page one", async () => {
  const { selectResourceEntries, pageResourceEntries } = await load("resource-query-core.js");
  const input = { type: "tm", resourceId: "one", sort: { field: "source", direction: "asc" }, limit: 100 };
  const entries = Array.from({ length: 230 }, (_, index) => ({
    id: `id-${index}`,
    source: `Entry ${230 - index}`,
    target: "target",
    sourceLang: "en"
  }));
  const sorted = await selectResourceEntries(entries, input);
  const first = pageResourceEntries(sorted, input, "1");
  const second = pageResourceEntries(sorted, { ...input, cursor: first.nextCursor }, "1");
  assert.equal(first.rows[0].source, "Entry 1");
  assert.equal(second.rows[0].source, "Entry 101");
  assert.equal(second.total, 230);
  const found = await selectResourceEntries(entries, { ...input, query: { text: "Entry 201", mode: "exact" } });
  assert.equal(found.length, 1);
  assert.equal(found[0].source, "Entry 201");
  assert.equal(pageResourceEntries(sorted, { ...input, cursor: first.nextCursor }, "2").cursorReset, true);
  const anchored = pageResourceEntries(sorted, { ...input, cursor: second.cursor, anchorId: sorted[101].id }, "2");
  assert.equal(anchored.rows[1].id, sorted[101].id);
  assert.equal(anchored.pageIndex, 1);
  assert.equal(anchored.cursorReset, true);
  assert.equal(pageResourceEntries(sorted, { ...input, cursor: anchored.previousCursor }, "2").pageIndex, 0);
});

test("resource queries respect Turkish casing, Unicode normalization, term status, metadata and dates", async () => {
  const { selectResourceEntries } = await load("resource-query-core.js");
  const rows = [
    {
      id: "a",
      sourceTerm: "IŞIK",
      targetTerm: "LİGHT",
      sourceLang: "tr",
      targetLang: "en",
      status: "admitted",
      domain: "Optics",
      projectName: "Manual",
      updatedAt: "2026-11-12T12:00:00Z"
    },
    { id: "b", sourceTerm: "ışık", targetTerm: "light", sourceLang: "tr", targetLang: "en", isForbidden: true },
    { id: "c", sourceTerm: "cafe\u0301", targetTerm: "coffee", sourceLang: "fr", targetLang: "en" }
  ];
  assert.equal(
    (await selectResourceEntries(rows, { type: "tb", query: { text: "ışık", field: "source", mode: "exact" } })).length,
    2
  );
  assert.equal(
    (
      await selectResourceEntries(rows, {
        type: "tb",
        query: { text: "ışık", field: "source", mode: "exact", caseSensitive: true }
      })
    ).length,
    1
  );
  assert.equal(
    (await selectResourceEntries(rows, { type: "tb", query: { text: "café", field: "source", mode: "exact" } }))[0].id,
    "c"
  );
  const filtered = await selectResourceEntries(rows, {
    type: "tb",
    filters: { status: "admitted", domain: "opt", projectName: "manual", dateFrom: "2026-11-12", dateTo: "2026-11-12" }
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "a");
});

test("duplicate review separates identical pairs from alternatives and term domains", async () => {
  const { selectResourceEntries } = await load("resource-query-core.js");
  const base = { sourceTerm: "bank", sourceLang: "en", targetLang: "tr", domain: "finance" };
  const rows = [
    { ...base, id: "a", targetTerm: "banka" },
    { ...base, id: "b", targetTerm: "banka" },
    { ...base, id: "c", targetTerm: "finans kurumu" },
    { ...base, id: "d", targetTerm: "banka", domain: "geography" }
  ];
  assert.deepEqual(
    (await selectResourceEntries(rows, { type: "tb", filters: { duplicates: "exact" } })).map((row) => row.id),
    ["a", "b"]
  );
  assert.deepEqual(
    (await selectResourceEntries(rows, { type: "tb", filters: { duplicates: "alternatives" } })).map((row) => row.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    (await selectResourceEntries(rows, { type: "tb", filters: { duplicates: "all" } })).map((row) => row.id),
    ["a", "b", "c"]
  );
});

test("identical TM text with distinct context or provenance is not an exact duplicate", async () => {
  const { selectResourceEntries } = await load("resource-query-core.js");
  const base = { source: "Open", target: "Aç", sourceLang: "en", targetLang: "tr" };
  const rows = [
    { ...base, id: "one", domain: "UI" },
    { ...base, id: "two", domain: "Instructions" },
    { ...base, id: "three", previousSource: "File" },
    { ...base, id: "four", projectName: "Manual" }
  ];
  assert.equal((await selectResourceEntries(rows, { type: "tm", filters: { duplicates: "exact" } })).length, 0);
});

test("query client rejects obsolete searches and aborts without exposing stale results", async () => {
  const { createResourceQueryService } = await load("resource-query-service.js");
  const requests = [];
  const worker = {
    postMessage: (message) => {
      requests.push(message);
    },
    terminate() {}
  };
  const service = createResourceQueryService({
    storage: { get: () => Promise.resolve(null) },
    workerFactory: () => worker
  });
  const first = service.queryResourceEntries({ type: "tm", resourceId: "one" });
  const rejected = assert.rejects(first, { name: "AbortError" });
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  const second = service.queryResourceEntries({ type: "tm", resourceId: "one", query: { text: "latest" } });
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  const query = requests.filter((request) => request.type === "query").at(-1);
  worker.onmessage({ data: { id: query.id, result: { rows: [{ id: "new" }], total: 1 } } });
  assert.equal((await second).rows[0].id, "new");
  await rejected;
  assert.ok(requests.some((request) => request.type === "cancel"));
  service.dispose();
});

test("resource query worker reads only resourceId rows and invalidates cached pages after committed writes", async () => {
  const indexedDB = new IDBFactory();
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("cathan-local-cat", 9);
    request.onupgradeneeded = () => {
      for (const name of ["tmEntries", "terms"])
        request.result.createObjectStore(name, { keyPath: "id" }).createIndex("resourceId", "resourceId");
      request.result.createObjectStore("appMeta", { keyPath: "key" });
      request.result.createObjectStore("resources", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function write(entries, generation) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["tmEntries", "appMeta", "resources"], "readwrite");
      tx.objectStore("resources").put({ id: "one", type: "tm" });
      entries.forEach((entry) => tx.objectStore("tmEntries").put(entry));
      tx.objectStore("appMeta").put({ key: "committed-generation", value: generation });
      if (entries.some((entry) => entry.resourceId === "one"))
        tx.objectStore("appMeta").put({ key: "resource-generation:one", value: generation });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  await write(
    [
      { id: "a", resourceId: "one", source: "zebra" },
      { id: "b", resourceId: "other", source: "hidden" }
    ],
    1
  );
  const bundle = esbuild.buildSync({
    entryPoints: [path.join(root, "src/features/resources/resource-query-worker-runtime.js")],
    bundle: true,
    write: false,
    format: "iife"
  }).outputFiles[0].text;
  const messages = [];
  const self = {
    postMessage: (message) => {
      messages.push(message);
    }
  };
  vm.runInNewContext(bundle, {
    self,
    indexedDB,
    IDBKeyRange,
    setTimeout,
    clearTimeout,
    performance,
    DOMException,
    Intl,
    Date,
    Map,
    Set
  });
  const input = { type: "tm", resourceId: "one", limit: 100 };
  await self.onmessage({ data: { type: "query", id: 1, input } });
  assert.equal(messages[0].result.total, 1);
  await write([{ id: "c", resourceId: "one", source: "aardvark" }], 2);
  const obsolete = self.onmessage({ data: { type: "query", id: 2, input } });
  const latest = self.onmessage({ data: { type: "query", id: 3, input } });
  await self.onmessage({ data: { type: "cancel", id: 2 } });
  await Promise.all([obsolete, latest]);
  assert.deepEqual(
    messages.map((message) => message.id),
    [1, 3]
  );
  assert.equal(messages[1].result.total, 2);
  assert.equal(messages[1].result.rows[0].id, "c");
  assert.notEqual(messages[1].result.generation, messages[0].result.generation);
  await write([{ id: "other-change", resourceId: "other", source: "another resource" }], 3);
  await self.onmessage({ data: { type: "query", id: 4, input } });
  assert.equal(messages[2].result.generation, messages[1].result.generation);
  assert.equal(messages[2].result.total, 2);
  db.close();
});
