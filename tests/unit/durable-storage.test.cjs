const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");

function loadStorage(indexedDB = new IDBFactory()) {
  const context = vm.createContext({
    window: {},
    indexedDB,
    crypto: globalThis.crypto,
    structuredClone,
    setInterval,
    clearInterval,
    console,
    Blob,
    TextEncoder,
    IDBKeyRange,
    CustomEvent: globalThis.CustomEvent
  });
  vm.runInContext(readFileSync(path.join(__dirname, "../../storage.js"), "utf8"), context);
  return context.window.CatHan.storage;
}

test("R11 v6 upgrade retains target, history, stable IDs and original reconstruction data", async () => {
  const indexedDB = new IDBFactory();
  const fixture = {
    id: "legacy-s",
    projectId: "legacy-p",
    target: "Acknowledged ç 🎯",
    revision: 17,
    targetHistory: [{ target: "prior" }],
    tags: [{ id: "stable-tag" }]
  };
  const original = { id: "legacy-p", docxStructure: { docxPackageBase64: "UEsDBA==" } };
  await new Promise((resolve, reject) => {
    const request = indexedDB.open("cathan-local-cat", 6);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("segments", { keyPath: "id" }).put(fixture);
      request.result.createObjectStore("projects", { keyPath: "id" }).put(original);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
  const storage = loadStorage(indexedDB);
  assert.deepEqual(JSON.parse(JSON.stringify(await storage.get("segments", fixture.id))), {
    ...fixture,
    storageVersion: 0
  });
  const migratedProject = JSON.parse(JSON.stringify(await storage.get("projects", original.id)));
  assert.deepEqual(migratedProject.docxStructure, original.docxStructure);
  assert.equal(migratedProject.storageVersion, 0);
  assert.equal(migratedProject.resourceLinks.length, 1);
  assert.equal(migratedProject.resourceLinks[0].type, "tm");
  assert.equal(migratedProject.resourceLinks[0].role, "main");
  assert.ok(migratedProject.resourceLinks[0].resourceId);
  assert.equal(migratedProject.activeTermBaseId, null);
  (await storage.openDatabase()).close();
});

test("R11 v7 commits records, monotonic storage versions and journal in one transaction", async () => {
  const storage = loadStorage();
  const db = await storage.openDatabase();
  assert.equal(db.version, 8);
  const first = await storage.put("segments", { id: "s", projectId: "p", target: "first", revision: 1 });
  const result = await storage.commitMutation(first.storageVersion, null, {
    changes: [{ store: "segments", value: { ...first, target: "second", revision: 2 } }]
  });
  assert.equal(result.values[0].storageVersion, 2);
  assert.equal((await storage.get("segments", "s")).target, "second");
  assert.equal((await storage.getAll("journal")).length, 2);
  assert.equal((await storage.get("appMeta", "project-generation:p")).value, result.generation);
  await storage.releaseProject("p");
  db.close();
});

test("R4 atomic multi-store writes return the committed storage versions", async () => {
  const storage = loadStorage();
  const first = await storage.writeStoresAtomically({
    resources: [{ id: "resource", type: "tm", name: "Main TM" }],
    projects: [{ id: "project", name: "First" }]
  });
  assert.ok(first.resources[0].storageVersion > 0);
  assert.equal(first.projects[0].storageVersion, first.resources[0].storageVersion);

  const second = await storage.writeStoresAtomically({
    projects: [{ ...first.projects[0], name: "Second" }]
  });
  assert.ok(second.projects[0].storageVersion > first.projects[0].storageVersion);
  assert.equal((await storage.get("projects", "project")).name, "Second");
  await storage.releaseProject("project");
  (await storage.openDatabase()).close();
});

test("R14 duplicate DOCX migration requires a verified unchanged checkpoint and JSON exports reconstruct the original representation", async () => {
  const storage = loadStorage();
  const structure = { docxPackageBase64: "UEsDBA==", mapping: [{ id: "keep" }] };
  const project = await storage.put("projects", {
    id: "p",
    documents: [{ id: "d", name: "source.docx", type: "docx" }],
    docxStructure: structure,
    docxStructures: { d: structure }
  });
  assert.equal(await storage.migrateCheckpointAssets("missing", project.id), null);
  const checkpoint = await storage.createCheckpoint();
  assert.equal(
    (await storage.get("projects", project.id)).docxStructure.docxPackageBase64,
    structure.docxPackageBase64
  );
  const migrated = await storage.migrateCheckpointAssets(checkpoint.id, project.id);
  assert.equal(migrated.docxStructure, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.docxStructures.d)), structure);
  const portable = (await storage.exportAllData()).projects[0];
  assert.deepEqual(JSON.parse(JSON.stringify(portable.docxStructure)), structure);
  assert.equal(portable.legacyDocxDocumentId, undefined);
  const restored = [];
  for await (const record of storage.checkpointRecords(checkpoint.id)) restored.push(record);
  assert.deepEqual(JSON.parse(JSON.stringify(restored[0].value.docxStructure)), structure);
  assert.equal(await storage.migrateCheckpointAssets(checkpoint.id, project.id), null);
  await storage.releaseProject(project.id);
  (await storage.openDatabase()).close();
});

test("R5 JSON copy restore remaps record ownership without rewriting protected tag IDs or original JSON", async () => {
  const storage = loadStorage();
  const input = {
    app: "LoopCAT",
    schemaVersion: 6,
    projects: [
      { id: "p", documents: [], localizationStructures: { original: { sourceJson: { id: "s", projectId: "p" } } } }
    ],
    segments: [{ id: "s", projectId: "p", target: "Kept", tags: [{ id: "s", text: "<tag>" }] }],
    tmEntries: [],
    terms: [],
    activityEvents: []
  };
  await storage.commitRestore(await storage.prepareRestore(input, { mode: "copy" }));
  const project = (await storage.getAll("projects"))[0];
  const segment = (await storage.getAll("segments"))[0];
  assert.notEqual(project.id, "p");
  assert.notEqual(segment.id, "s");
  assert.equal(segment.projectId, project.id);
  assert.equal(segment.tags[0].id, "s");
  assert.deepEqual(JSON.parse(JSON.stringify(project.localizationStructures.original.sourceJson)), {
    id: "s",
    projectId: "p"
  });
  await storage.releaseProject(project.id);
  (await storage.openDatabase()).close();
});

test("R11 compacted journals replay from a verified checkpoint and preserve later changes", async () => {
  const storage = loadStorage();
  await storage.put("segments", { id: "s", projectId: "p", target: "checkpoint base" });
  await storage.createCheckpoint();
  await storage.createCheckpoint();
  assert.equal((await storage.getAll("journal")).length, 0);
  const next = await storage.put("segments", {
    ...(await storage.get("segments", "s")),
    target: "newer than checkpoint",
    revision: 1
  });
  const db = await storage.openDatabase();
  const tx = db.transaction("segments", "readwrite");
  tx.objectStore("segments").clear();
  await new Promise((resolve) => {
    tx.oncomplete = resolve;
  });
  await storage.replayCommittedJournal();
  assert.equal((await storage.get("segments", "s")).target, next.target);
  await storage.releaseProject("p");
  db.close();
});

test("R4 project metadata cannot overwrite a newer version from the same writer", async () => {
  const storage = loadStorage();
  const first = await storage.put("projects", { id: "p", name: "Original" });
  await storage.put("projects", { ...first, name: "Current" });
  await assert.rejects(storage.put("projects", { ...first, name: "Stale" }), /conflict/);
  assert.equal((await storage.get("projects", "p")).name, "Current");
  await storage.releaseProject("p");
  (await storage.openDatabase()).close();
});

test("R4 stale CAS preserves the conflicting target without acknowledging it", async () => {
  const storage = loadStorage();
  const first = await storage.put("segments", { id: "s", projectId: "p", target: "winner", revision: 1 });
  await assert.rejects(
    storage.commitMutation(0, null, {
      changes: [{ store: "segments", value: { ...first, target: "conflict", revision: 1 } }]
    }),
    { name: "StorageConflictError" }
  );
  assert.equal((await storage.get("segments", "s")).target, "winner");
  assert.equal((await storage.getAll("journal")).length, 1);
  assert.equal((await storage.getAll("conflictCopies"))[0].changes[0].value.target, "conflict");
  await storage.releaseProject("p");
  (await storage.openDatabase()).close();
});

test("R4 independent contexts enforce one owner and reject stale fencing tokens", async () => {
  const indexedDB = new IDBFactory();
  const a = loadStorage(indexedDB);
  const b = loadStorage(indexedDB);
  const token = await a.acquireProject("p");
  assert.equal(await b.acquireProject("p"), null);
  await a.releaseProject("p");
  const next = await b.acquireProject("p");
  assert.ok(next > token);
  await assert.rejects(
    b.commitMutation(null, token, {
      changes: [{ store: "segments", value: { id: "s", projectId: "p", target: "stale" } }]
    }),
    /ownership expired/
  );
  assert.equal(await b.get("segments", "s"), undefined);
  await b.releaseProject("p");
  (await a.openDatabase()).close();
  (await b.openDatabase()).close();
});

test("R15 a failed database open can be retried without deleting data", async () => {
  const indexedDB = new IDBFactory();
  let fail = true;
  const storage = loadStorage({
    open(...args) {
      if (!fail) return indexedDB.open(...args);
      fail = false;
      const request = {};
      queueMicrotask(() => {
        request.error = new Error("temporary failure");
        request.onerror();
      });
      return request;
    }
  });
  await assert.rejects(storage.openDatabase(), /temporary failure/);
  assert.equal((await storage.openDatabase()).version, 8);
  (await storage.openDatabase()).close();
});

test("R5 replacing with an empty backup keeps a verified rollback checkpoint", async () => {
  const storage = loadStorage();
  await storage.put("projects", { id: "p", name: "Latest" });
  await storage.put("segments", { id: "s", projectId: "p", target: "acknowledged output" });
  const plan = await storage.prepareRestore(
    { app: "LoopCAT", schemaVersion: 6, projects: [], segments: [], tmEntries: [], terms: [], activityEvents: [] },
    { mode: "replace" }
  );
  assert.equal((await storage.getAll("segments")).length, 1);
  await storage.commitRestore(plan);
  assert.equal((await storage.getAll("segments")).length, 0);
  const checkpoints = await storage.getAll("checkpoints");
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].verified, true);
  assert.equal(checkpoints[0].rollback, true);
  const recovered = [];
  for await (const record of storage.checkpointRecords(checkpoints[0].id)) recovered.push(record);
  assert.equal(recovered.find((record) => record.store === "segments").value.target, "acknowledged output");
  await storage.releaseProject("p");
  (await storage.openDatabase()).close();
});

test("R5 archive staging is isolated, rejects duplicate IDs and detects tampering before replacement", async () => {
  const storage = loadStorage();
  await storage.put("projects", { id: "old", name: "Existing" });
  const read = async (accept) => {
    await accept({ store: "metadata", value: { app: "LoopCAT", schemaVersion: 6 } });
    await accept({ store: "projects", value: { id: "p", name: "Incoming" } });
    await accept({ store: "segments", value: { id: "s", projectId: "p", target: "Recovered" } });
  };
  const staged = await storage.stageBackupRecords(read);
  assert.equal((await storage.getAll("projects"))[0].id, "old");
  const plan = await storage.prepareRestore(staged, { mode: "copy" });
  const result = await storage.commitRestore(plan);
  assert.equal((await storage.getAll("projects")).length, 2);
  assert.notEqual(result.projectIds[0], "p");
  const restored = (await storage.getAll("segments"))[0];
  assert.equal(restored.target, "Recovered");
  assert.equal(restored.projectId, result.projectIds[0]);
  const stagingCount = (await storage.getAll("restoreStaging")).length;
  await assert.rejects(
    storage.stageBackupRecords(async (accept) => {
      await read(accept);
      await accept({ store: "segments", value: { id: "s", projectId: "p", target: "duplicate" } });
    }),
    { name: "ConstraintError" }
  );
  assert.equal(
    (await storage.getAll("restoreStaging")).length,
    stagingCount,
    "a rejected archive releases partial staging records"
  );
  const replacement = await storage.prepareRestore(staged, { mode: "replace" });
  const row = (await storage.getAll("restoreStaging")).find(
    (value) => value.id.startsWith(replacement.id + ":record:") && value.store === "segments"
  );
  await storage.put("restoreStaging", { ...row, value: { ...row.value, target: "tampered" } });
  await assert.rejects(storage.commitRestore(replacement), /integrity/);
  assert.equal((await storage.getAll("projects")).length, 2);
  await storage.releaseProject("old");
  (await storage.openDatabase()).close();
});

test("R12 repeated checkpoints share immutable records and corrupt newest recovery does not destroy older checkpoints", async () => {
  const storage = loadStorage();
  await storage.put("segments", { id: "s", projectId: "p", target: "original" });
  const first = await storage.createCheckpoint();
  const second = await storage.createCheckpoint();
  assert.equal((await storage.getAll("binaryAssets")).length, 1);
  assert.equal((await storage.getAll("checkpoints")).length, 2);
  assert.equal(first.generation, second.generation);
  const original = await storage.get("segments", "s");
  await storage.put("segments", { ...original, target: "latest", revision: 1 });
  const third = await storage.createCheckpoint();
  const rows = await storage.getAll("restoreStaging");
  const latest = rows.find((row) => row.checkpointId === third.id);
  await storage.put("binaryAssets", {
    ...(await storage.get("binaryAssets", latest.asset)),
    json: "damaged",
    blob: new Blob(["damaged"])
  });
  await assert.rejects(async () => {
    for await (const _record of storage.checkpointRecords(third.id)) {
      /* Consume verification. */
    }
  }, /integrity/);
  const records = [];
  for await (const record of storage.checkpointRecords(first.id)) records.push(record);
  assert.equal(records[0].value.target, "original");
  await storage.releaseProject("p");
  (await storage.openDatabase()).close();
});

test("R11 journal replay reconstructs committed targets and respects replacement and later deletion", async () => {
  const storage = loadStorage();
  await storage.put("segments", { id: "s", projectId: "p", target: "committed" });
  const db = await storage.openDatabase();
  const damaged = db.transaction("segments", "readwrite");
  damaged.objectStore("segments").delete("s");
  await new Promise((resolve) => {
    damaged.oncomplete = resolve;
  });
  await storage.replayCommittedJournal();
  assert.equal((await storage.get("segments", "s")).target, "committed");
  const plan = await storage.prepareRestore(
    { app: "LoopCAT", schemaVersion: 6, projects: [], segments: [], tmEntries: [], terms: [], activityEvents: [] },
    { mode: "replace" }
  );
  await storage.commitRestore(plan);
  await storage.replayCommittedJournal();
  assert.equal((await storage.getAll("segments")).length, 0);
  const next = await storage.put("segments", { id: "s", projectId: "p", target: "new" });
  assert.ok(next.storageVersion > 1);
  await storage.deleteByKey("segments", "s");
  await assert.rejects(storage.put("segments", { ...next, target: "stale resurrection", revision: 2 }), /conflict/);
  await storage.replayCommittedJournal();
  assert.equal((await storage.getAll("segments")).length, 0);
  await storage.releaseProject("p");
  db.close();
});
