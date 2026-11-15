const test = require("node:test");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const modules = Promise.all([
  import("../../src/features/exchange/repository.js"),
  import("../../src/features/exchange/pack-format.js"),
  import("../../src/features/exchange/examples.js")
]);
test("a denied direct-file storage probe offers session-only operations, while HTTP fails visibly and working file IndexedDB persists", async () => {
  const [{ createPackRepository }, { encodePack }, { EXAMPLE_TERM_PACK: p }] = await modules;
  const denied = {
    open() {
      throw new Error("Storage denied.");
    }
  };
  const local = createPackRepository({ indexedDB: denied, protocol: "file:" });
  assert.equal(await local.storageMode(), "session");
  const blob = await encodePack(p);
  await local.install(blob);
  assert.equal((await local.describe())[0].entryCount, p.entries.length);
  assert.equal((await local.describe())[0].pack.entries, undefined);
  await local.enable("a", p.id, p.version);
  assert.equal((await local.active("a")).length, 1);
  assert.deepEqual(await local.active("b"), []);
  await local.disable("a", p.id);
  await local.saveDraft("my draft", { name: "Test" });
  assert.equal((await local.getDraft("my draft")).value.name, "Test");
  await local.uninstall(p.id);
  assert.deepEqual(await local.describe(), []);
  const web = createPackRepository({ indexedDB: denied, protocol: "https:" });
  await assert.rejects(web.storageMode(), /denied/);
  const indexedDB = new IDBFactory(),
    f = createPackRepository({ indexedDB, protocol: "file:" });
  assert.equal(await f.storageMode(), "device");
  await f.install(blob);
  f.close();
  const reopened = createPackRepository({ indexedDB, protocol: "file:" });
  assert.equal((await reopened.describe()).length, 1);
  assert.deepEqual(await reopened.listDrafts(), []);
  local.close();
  web.close();
  reopened.close();
});

test("install is inert and immutable; pins survive reopen; removing a required pack revokes use without losing the requirement", async () => {
  const [{ createPackRepository }, { encodePack }, { EXAMPLE_QA_PACK: p }] = await modules;
  const indexedDB = new IDBFactory();
  const a = createPackRepository({ indexedDB }),
    b = createPackRepository({ indexedDB });
  const blob = await encodePack(p);
  await assert.rejects(a.install(p));
  const installed = await a.install(blob);
  assert.deepEqual(await b.active("A"), []);
  await a.enable("A", p.id, p.version, { required: true });
  const snapshot = await b.snapshot("A");
  assert.equal(snapshot.records[0].digest, installed.digest);
  assert.deepEqual(await b.active("B"), []);
  await assert.rejects(a.install(await encodePack({ ...p, name: "changed bytes" })), /Different bytes/);
  await a.disable("A", p.id);
  assert.ok(!(await b.isCurrent("A", snapshot.generation)));
  assert.equal((await a.requirements("A"))[0].required, true);
  await a.enable("A", p.id, p.version, { required: true });
  const current = await a.snapshot("A");
  await a.uninstall(p.id, p.version);
  assert.ok(current.signal.aborted);
  assert.deepEqual(await b.active("A"), []);
  assert.equal((await a.requirements("A"))[0].digest, installed.digest);
  await a.install(blob);
  assert.deepEqual(await a.active("A"), []);
  await a.forgetRequirement("A", p.id);
  assert.deepEqual(await a.requirements("A"), []);
  a.close();
  b.close();
});
test("a client kit fails atomically for a mismatched digest and applies chosen, exact dependency versions", async () => {
  const [{ createPackRepository }, { encodePack }, { EXAMPLE_QA_PACK: q, EXAMPLE_TERM_PACK: t }] = await modules;
  const repo = createPackRepository({ indexedDB: new IDBFactory() });
  const items = await Promise.all([q, t].map(async (p) => repo.install(await encodePack(p))));
  const entries = items.map((r, i) => ({
    id: r.id,
    version: r.version,
    digest: r.digest,
    required: i === 0,
    priority: i
  }));
  const kit = { ...q, kind: "client", id: "example.kit", entries };
  const bad = { ...kit, version: "0.0.1", entries: [entries[0], { ...entries[1], digest: "0".repeat(64) }] };
  await repo.install(await encodePack(kit));
  await repo.install(await encodePack(bad));
  await assert.rejects(repo.applyKit("A", kit.id, bad.version), /pin/);
  assert.deepEqual(await repo.active("A"), []);
  await repo.applyKit("A", kit.id, kit.version, [q.id]);
  assert.deepEqual(
    (await repo.active("A")).map((r) => r.id),
    [q.id, kit.id]
  );
  await repo.setRequirements("restored", await repo.requirements("A"));
  assert.deepEqual(await repo.active("restored"), []);
  assert.equal((await repo.exportPack(t.id, t.version)).size, items[1].blob.size);
  repo.close();
});
test("local draft supports reload, replacement and explicit deletion", async () => {
  const [{ createPackRepository }] = await modules;
  const indexedDB = new IDBFactory(),
    a = createPackRepository({ indexedDB }),
    b = createPackRepository({ indexedDB });
  await a.saveDraft("draft-1", { title: "unfinished" });
  assert.deepEqual((await b.getDraft("draft-1")).input, { title: "unfinished" });
  await b.saveDraft("draft-1", { title: "revised" });
  assert.equal((await a.listDrafts()).length, 1);
  await a.deleteDraft("draft-1");
  assert.deepEqual(await b.listDrafts(), []);
  a.close();
  b.close();
});
