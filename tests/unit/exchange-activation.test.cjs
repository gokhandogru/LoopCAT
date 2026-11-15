const test = require("node:test");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const modules = Promise.all([
  import("../../src/features/exchange/repository.js"),
  import("../../src/features/exchange/host.js"),
  import("../../src/features/exchange/pack-format.js"),
  import("../../src/features/exchange/examples.js")
]);

async function setup(t) {
  const [{ createPackRepository }, { publishProjectPackChange }, { encodePack }, { EXAMPLE_QA_PACK: example }] =
    await modules;
  const repo = createPackRepository({ indexedDB: new IDBFactory() });
  t.after(() => repo.close());
  const install = async (version, fields = {}) => repo.install(await encodePack({ ...example, version, ...fields }));
  const v1 = await install("1.0.0"),
    v2 = await install("2.0.0");
  const key = "project@old";
  await repo.enable(key, v1.id, v1.version, { required: true, priority: 78 });
  const initial = {
    id: "project",
    storageVersion: 3,
    exchangeLocalBinding: "old",
    exchangeRequirements: await repo.requirements(key)
  };
  let project = initial;
  const opts = {
    getProject: () => project,
    saveProject: (p) => Promise.resolve((project = { ...p, storageVersion: p.storageVersion + 1 }))
  };
  const op = (r, type = "enable", overrides = {}) => ({
    type,
    id: r.id,
    version: r.version,
    digest: r.digest,
    ...overrides
  });
  const change = (operation, saveProject = opts.saveProject, captured = project) =>
    publishProjectPackChange(repo, { ...opts, saveProject }, captured, operation);
  return { repo, key, initial, op, change, install, v1, v2, current: opts.getProject };
}

test("withdrawn optional upgrade and a failed project write both preserve the active required version and priority", async (t) => {
  const { repo, key, initial, change, v1, v2, op, current } = await setup(t);
  const checkpoint = { fingerprint: "a".repeat(64), versions: { [v2.id + "@" + v2.version]: v2.digest }, revoked: [] };
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => JSON.stringify(checkpoint) }
  });
  t.after(() => {
    if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage);
    else delete globalThis.localStorage;
  });
  await repo.install(v2.blob, { catalogId: "example.catalog", fingerprint: checkpoint.fingerprint });
  checkpoint.revoked = [v2.digest];
  const generation = (await repo.snapshot(key)).generation;
  const op2 = op(v2, "enable", { required: false, priority: 1 });
  let saved = false;
  await assert.rejects(
    change(op2, () => {
      saved = true;
    }),
    /withdrawn/
  );
  assert.equal(saved, false);
  checkpoint.revoked = [];
  const requiredV1 = { id: v1.id, kind: "qa", version: v1.version, digest: v1.digest, required: true, priority: 78 };
  await assert.rejects(
    change(op2, async (draft) => {
      assert.notEqual(draft.exchangeLocalBinding, initial.exchangeLocalBinding);
      assert.equal(draft.exchangeRequirements[0].digest, v2.digest);
      assert.equal((await repo.active(key))[0].digest, v1.digest);
      throw Error("Disk quota exceeded.");
    }),
    /quota/
  );
  assert.equal(current(), initial);
  assert.deepEqual(initial.exchangeRequirements, [requiredV1]);
  const snap = await repo.snapshot(key);
  assert.equal(snap.generation, generation);
  assert.deepEqual(snap.requirements, [requiredV1]);
  assert.equal(snap.records[0].digest, v1.digest);
  assert.deepEqual(await repo.affectedProjects(v2.id, v2.version), []);
  await change(op(v2));
  const updated = current();
  assert.notEqual(updated.exchangeLocalBinding, "old");
  assert.deepEqual(updated.exchangeRequirements, [{ ...requiredV1, version: v2.version, digest: v2.digest }]);
  assert.equal((await repo.active("project@" + updated.exchangeLocalBinding))[0].digest, v2.digest);
  assert.deepEqual(await repo.active(key), []);
  await assert.rejects(change(op(v1), undefined, initial), /Project changed/);
});

test("kit publication failure preserves the previous grants and a successful retry never grants portable-only pins", async (t) => {
  const { repo, key, initial, change, install, v1, v2, op, current } = await setup(t);
  const kit = await install("1.0.0", {
    kind: "client",
    id: "example.kit",
    entries: [{ id: v2.id, version: v2.version, digest: v2.digest, required: false, priority: 14 }]
  });
  const unrelated = await install("1.0.0", { id: "example.never-approved" });
  await repo.enable(key, kit.id, kit.version);
  initial.exchangeRequirements = [
    ...(await repo.requirements(key)),
    { id: unrelated.id, version: unrelated.version, digest: unrelated.digest, required: true, priority: 2, kind: "qa" }
  ];
  const apply = op(kit, "kit", { selectedIds: [v2.id] });
  await assert.rejects(
    change(apply, () => Promise.reject(Error("Save conflict"))),
    /Save conflict/
  );
  assert.deepEqual((await repo.active(key)).map((r) => r.digest).sort(), [v1.digest, kit.digest].sort());
  assert.equal(initial.exchangeRequirements.find((p) => p.id === v1.id).priority, 78);
  assert.deepEqual(await repo.affectedProjects(v2.id, v2.version), []);
  await change(apply);
  const updated = current(),
    snap = await repo.snapshot("project@" + updated.exchangeLocalBinding);
  assert.deepEqual(snap.records.map((r) => r.digest).sort(), [v2.digest, kit.digest].sort());
  assert.deepEqual(snap.requirements, updated.exchangeRequirements);
  const rule = snap.requirements.find((p) => p.id === v2.id);
  assert.equal(rule.priority, 14);
  assert.equal(rule.required, true);
  assert.equal(snap.requirements.find((p) => p.id === unrelated.id).required, true);
});

test("simultaneous changes from the same project version cannot overwrite the winning selection", async (t) => {
  const { repo, key, initial, op, change, v1, v2, current } = await setup(t);
  const [upgrade, staleDisable] = await Promise.allSettled([
    change(op(v2)),
    change(op(v1, "disable"), undefined, initial)
  ]);
  assert.equal(upgrade.status, "fulfilled");
  assert.equal(staleDisable.status, "rejected");
  assert.match(staleDisable.reason.message, /Project changed/);
  assert.deepEqual(await repo.active(key), []);
  const newKey = "project@" + current().exchangeLocalBinding;
  assert.equal((await repo.active(newKey))[0].digest, v2.digest);
  assert.deepEqual(await repo.affectedProjects(v1.id, v1.version), []);
  assert.deepEqual(await repo.affectedProjects(v2.id, v2.version), [newKey]);
});
