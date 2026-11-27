const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");
function storage() {
  const context = vm.createContext({
    window: {},
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    crypto: globalThis.crypto,
    structuredClone,
    setInterval,
    clearInterval,
    console,
    Blob,
    TextEncoder,
    CustomEvent: globalThis.CustomEvent
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../storage.js"), "utf8"), context);
  return context.window.CatHan.storage;
}
async function setup(overrides = {}) {
  const api = storage();
  const module = await import("../../src/features/projects/file-lifecycle-service.js");
  await api.put("projects", {
    id: "p",
    name: "Files",
    sourceLang: "en",
    targetLang: "tr",
    documents: [
      { id: "d", name: "one.txt", type: "txt" },
      { id: "e", name: "two.txt", type: "txt" }
    ],
    resourceLinks: [],
    localizationStructures: { d: { sourceLines: ["Hello world", "Save changes"] } }
  });
  await api.bulkPut("segments", [
    {
      id: "a",
      projectId: "p",
      documentId: "d",
      documentName: "one.txt",
      documentType: "txt",
      source: "Hello world",
      target: "Merhaba dünya",
      status: "confirmed",
      index: 0,
      comments: [{ text: "Saved note" }]
    },
    {
      id: "b",
      projectId: "p",
      documentId: "d",
      documentName: "one.txt",
      documentType: "txt",
      source: "Save changes",
      target: "Değişiklikleri kaydet",
      status: "draft",
      index: 1
    }
  ]);
  const service = module.createFileLifecycleService({
    storage: api,
    prepare: (file) => ({
      fileName: "updated.txt",
      documentType: "txt",
      structure: { sourceLines: file.sources },
      segments: file.sources.map((source) => ({ source, target: "" })),
      importOptions: { encoding: "auto" }
    }),
    validate: async () => {},
    ...overrides
  });
  return { api, service, module };
}

test("reviewed update archives complete old rows, retains logical identity and rejects stale writes", async () => {
  const { api, service } = await setup();
  const old = await api.get("segments", "a");
  const p = await service.preview("p", "d", { sources: ["Hello world", "Save all changes"] });
  assert.equal(p.rows[0].target, "Merhaba dünya");
  assert.equal(p.rows[0].status, "draft");
  assert.equal(p.rows[1].target, "");
  assert.equal(p.rows[1].previousTarget, "Değişiklikleri kaydet");
  await service.commit(p.id, {}, "update-1");
  const project = await api.get("projects", "p");
  assert.equal(project.documents[0].id, "d");
  assert.equal(project.documents[0].sourceRevision, 2);
  const rows = await api.getAllByIndex("segments", "projectId", "p");
  assert.equal(rows.length, 2);
  assert.equal(rows.find((s) => s.index === 1).previousTranslation.target, "Değişiklikleri kaydet");
  assert.equal((await api.get("versionSegments", "a")).comments[0].text, "Saved note");
  await assert.rejects(api.put("segments", { ...old, target: "Late autosave" }), /historical/);
  await service.commit(p.id, {}, "update-1");
  assert.equal((await api.getAll("documentVersions")).length, 1);
  await assert.rejects(service.commit(p.id, { all: "incoming" }, "update-1"), /retry choices/);
  const data = await api.exportAllData();
  const restored = await api.importAllData(data, { prepareOnly: true });
  assert.equal(restored.documentVersions.length, 1);
  assert.equal(restored.versionSegments.length, 2);
  (await api.openDatabase()).close();
});

test("subtitle source updates retain local timing and expose a changed source time for review", async () => {
  const { api, service } = await setup({
    prepare: () => ({
      documentType: "srt",
      structure: { format: "srt", source: "new timing" },
      segments: [
        {
          source: "Hello world",
          target: "",
          structure: { format: "srt", cueIndex: "1", timing: "00:00:02,000 --> 00:00:05,000" }
        }
      ]
    })
  });
  const project = await api.get("projects", "p");
  project.documents[0].type = "srt";
  project.localizationStructures.d = { format: "srt", source: "old timing" };
  await api.put("projects", project);
  const segment = await api.get("segments", "a");
  segment.structure = { format: "srt", cueIndex: "1", timing: "00:00:01,000 --> 00:00:04,000" };
  segment.subtitle = { version: 1, timing: { startMs: 1200, endMs: 4200 } };
  await api.put("segments", segment);
  const preview = await service.preview("p", "d", {});
  await service.commit(preview.id);
  const rows = await api.getAllByIndex("segments", "projectId", "p");
  const updated = rows.find((row) => row.source === "Hello world");
  assert.equal(updated.subtitle.timing.startMs, 1200);
  assert.equal(updated.subtitle.sourceTimingConflict.startMs, 2000);
  assert.equal(updated.reviewState, "needs-review");
  assert.equal((await api.get("versionSegments", "a")).subtitle.timing.startMs, 1200);
  (await api.openDatabase()).close();
});
test("resegmenting a stored bilingual file versions live edits, comments and review state atomically", async () => {
  const { api, service } = await setup({
    resegment: ({ segments }) => ({
      prepared: {
        fileName: "sample.xlf",
        documentType: "xlf",
        structure: { format: "xliff" },
        importOptions: { splitBilingualBlocks: true },
        segments: [
          { text: "Hello", target: "Merhaba", structure: { xliffPart: { index: 0, count: 2 } } },
          { text: "world", target: "dünya", structure: { xliffPart: { index: 1, count: 2 } } },
          { text: segments[1].source, target: segments[1].target, structure: {} }
        ]
      },
      parentRows: [segments[0], segments[0], segments[1]]
    })
  });
  let preview = await service.previewResegmentation("p", "d");
  const old = await api.get("segments", "b");
  await api.put("segments", { ...old, target: "Edited after import", targetHistory: [{ target: old.target }] });
  await assert.rejects(service.commit(preview.id), /changed after review/);
  assert.equal((await api.getAll("documentVersions")).length, 0);
  preview = await service.previewResegmentation("p", "d");
  await service.commit(preview.id, {}, "split-request");
  await service.commit(preview.id, {}, "split-request");
  const live = (await api.getAll("segments")).sort((a, b) => a.index - b.index);
  assert.deepEqual(
    live.map((s) => s.target),
    ["Merhaba", "dünya", "Edited after import"]
  );
  assert.deepEqual(
    live.map((s) => s.documentIndex),
    [0, 1, 2]
  );
  assert.deepEqual(
    live.map((s) => s.status),
    ["confirmed", "confirmed", "draft"]
  );
  assert.equal(live[0].comments[0].text, "Saved note");
  assert.equal(live[1].comments.length, 0);
  assert.equal(live[2].targetHistory[0].target, old.target);
  assert.equal((await api.get("versionSegments", "b")).target, "Edited after import");
  assert.equal((await api.getAll("documentVersions")).length, 1);
  assert.equal((await api.get("projects", "p")).documents[0].importOptions.splitBilingualBlocks, true);
  (await api.openDatabase()).close();
});

test("an edit made after preview prevents source replacement and retains the edit", async () => {
  const { api, service } = await setup();
  const p = await service.preview("p", "d", { sources: ["New source"] });
  const row = await api.get("segments", "a");
  await api.put("segments", { ...row, target: "Late edit" });
  await assert.rejects(service.commit(p.id), /changed after review/);
  assert.equal((await api.get("segments", "a")).target, "Late edit");
  assert.equal((await api.getAll("documentVersions")).length, 0);
  (await api.openDatabase()).close();
});
test("restoring a historical version creates a third head and retains intermediate versions", async () => {
  const { api, service } = await setup();
  const p = await service.preview("p", "d", { sources: ["Changed source"] });
  await service.commit(p.id);
  const versions = await service.versions("p", "d");
  const restore = await service.restoreVersion("p", "d", versions[0].id);
  await service.commit(restore.id, { all: "incoming" });
  assert.equal((await api.get("projects", "p")).documents[0].sourceRevision, 3);
  assert.equal((await service.versions("p", "d")).length, 2);
  assert.equal((await api.getAll("segments")).length, 2);
  (await api.openDatabase()).close();
});
test("bulk Trash is atomic, replay safe, and restores original order with history", async () => {
  const { api, service } = await setup();
  await service.rename("p", "d", "renamed.txt");
  await assert.rejects(service.rename("p", "d", "wrong.json"), /extension/);
  await assert.rejects(service.trash("p", ["d", "missing"]), /no longer/);
  assert.equal((await api.getAll("segments")).length, 2);
  await service.trash("p", ["d", "e"], "trash-1");
  await service.trash("p", ["d", "e"], "trash-1");
  assert.equal((await api.get("projects", "p")).documents.length, 0);
  const receipts = await api.get("fileLifecycleReceipts", "trash-1");
  assert.equal(receipts.entryIds.length, 2);
  await service.restoreTrash(receipts.entryIds);
  assert.deepEqual(
    Array.from((await api.get("projects", "p")).documents, (d) => d.id),
    ["d", "e"]
  );
  assert.equal((await api.getAll("segments")).length, 2);
  (await api.openDatabase()).close();
});
test("alignment never transfers changed wording or ambiguously repeated translations", async () => {
  const { compareSourceUpdate } = await import("../../src/features/projects/file-lifecycle-service.js");
  const old = [
    { id: "a", source: "Repeat", target: "One", status: "confirmed" },
    { id: "b", source: "Repeat", target: "Two", status: "confirmed" },
    { id: "c", source: "Repeat", target: "Three", status: "confirmed" }
  ];
  const result = compareSourceUpdate(old, [
    { source: "Repeat" },
    { source: "Repeat" },
    { source: "Repeat" },
    { source: "Repeat" }
  ]);
  assert.equal(result.rows.filter((row) => row.target === "Two").length, 0);
  assert.equal(result.rows[2].target, "");
  const changed = compareSourceUpdate(
    [{ id: "a", source: "Do not delete", target: "Silme", status: "confirmed" }],
    [{ source: "Delete" }]
  );
  assert.equal(changed.rows[0].target, "");
  assert.equal(changed.rows[0].disposition, "changed");
  const relocated = compareSourceUpdate(
    [{ id: "keyed", source: "Open", target: "Aç", status: "confirmed", structure: { key: "menu.open" } }],
    [{ source: "Open", structure: { key: "document.open" } }]
  );
  assert.equal(relocated.rows[0].target, "Aç");
  assert.equal(relocated.rows[0].status, "draft");
});

test("invalidating retired segments preserves unrelated Undo and Redo entries", async () => {
  const { createUndoStore } = await import("../../src/commands/undo-store.js");
  const store = createUndoStore();
  const retired = { command: { affectedIds: ["old-segment"] } },
    other = { command: { affectedIds: ["other-file"] } };
  store.push("p", retired);
  store.push("p", other);
  store.pushRedo("p", retired);
  store.pushRedo("p", other);
  store.invalidateAffected("p", ["old-segment"]);
  assert.equal(store.popUndo("p"), other);
  assert.equal(store.popUndo("p"), null);
  assert.equal(store.popRedo("p"), other);
  assert.equal(store.popRedo("p"), null);
});

test("a copied package preserves historical references and restores trashed files in the copy", async () => {
  const { api, service } = await setup();
  const review = await service.preview("p", "d", { sources: ["Different source"] });
  await service.commit(review.id);
  await service.trash("p", ["d"]);
  const snapshot = await api.exportProjectSnapshot("p");
  const { createProjectPackagePortabilityService } =
    await import("../../src/features/import-export/project-package-portability-service.js");
  let counter = 0;
  const portable = createProjectPackagePortabilityService({
    validation: { validate: () => ({ ok: true }) },
    storage: api,
    records: { sanitize: structuredClone },
    ids: { make: (prefix) => `${prefix}-copy-${++counter}` },
    projects: { getAll: () => [] },
    clock: { now: () => new Date().toISOString() }
  });
  const copy = await portable.prepare({ ...snapshot, resources: {} }, { importAsCopy: true });
  await api.importProjectPackageRecords({ ...copy, resources: [] });
  const entry = copy.trashEntries[0];
  await service.restoreTrash([entry.id]);
  const restored = await service.state(copy.project.id, "d");
  assert.equal(restored.segments.length, 1);
  assert.equal(restored.segments[0].projectId, copy.project.id);
  const versions = await service.versions(copy.project.id, "d");
  assert.equal(versions.length, 1);
  assert.notEqual(versions[0].id, (await service.versions("p", "d"))[0].id);
  assert.equal((await service.versionSegments(versions[0].id)).length, 2);
  const oldReference = restored.segments[0].previousTranslation.segmentId;
  assert.equal((await api.get("versionSegments", oldReference)).projectId, copy.project.id);
  (await api.openDatabase()).close();
});

test("replacement and Trash restoration preserve project order and reject incomplete archives", async () => {
  const { api, service } = await setup();
  await api.put("segments", {
    id: "e1",
    projectId: "p",
    documentId: "e",
    documentName: "two.txt",
    documentType: "txt",
    source: "Last file",
    target: "",
    index: 2
  });
  const p = await service.preview("p", "d", { sources: ["One", "Two", "Three"] });
  await service.commit(p.id);
  let rows = (await api.getAll("segments")).sort((a, b) => a.index - b.index);
  assert.deepEqual(
    Array.from(rows, (s) => s.documentId),
    ["d", "d", "d", "e"]
  );
  await service.trash("p", ["d"], "ordering-trash");
  const q = await service.preview("p", "e", { sources: ["Changed last"] });
  await service.commit(q.id);
  await service.restoreTrash((await api.get("fileLifecycleReceipts", "ordering-trash")).entryIds);
  rows = (await api.getAll("segments")).sort((a, b) => a.index - b.index);
  assert.deepEqual(
    Array.from(rows, (s) => s.documentId),
    ["d", "d", "d", "e"]
  );
  const backup = await api.exportAllData();
  backup.versionSegments.pop();
  await assert.rejects(api.importAllData(backup, { prepareOnly: true }), /missing segments/);
  (await api.openDatabase()).close();
});

test("full backup copy remaps archived and trashed segment references", async () => {
  const { api, service } = await setup();
  const p = await service.preview("p", "d", { sources: ["Changed wording"] });
  await service.commit(p.id);
  await service.trash("p", ["d"]);
  const plan = await api.prepareRestore(await api.exportAllData(), { mode: "copy" });
  const result = await api.commitRestore(plan);
  const projectId = result.projectIds[0];
  assert.notEqual(projectId, "p");
  const entry = (await api.getAllByIndex("trashEntries", "projectId", projectId))[0];
  await service.restoreTrash([entry.id]);
  const state = await service.state(projectId, "d");
  const prior = await api.get("versionSegments", state.segments[0].previousTranslation.segmentId);
  assert.equal(prior.projectId, projectId);
  assert.equal((await service.versions(projectId, "d")).length, 1);
  (await api.openDatabase()).close();
});

test("streamed backup copy preserves the version graph", async () => {
  const { api, service } = await setup();
  const p = await service.preview("p", "d", { sources: ["Changed wording"] });
  await service.commit(p.id);
  await service.trash("p", ["d"]);
  const data = await api.exportAllData();
  const staged = await api.stageBackupRecords(async (write) => {
    await write({ store: "metadata", value: { app: data.app, schemaVersion: data.schemaVersion } });
    for (const store of [
      "projects",
      "segments",
      "resources",
      "tmEntries",
      "tmContributions",
      "terms",
      "termConcepts",
      "termDesignations",
      "activityEvents",
      "trashEntries",
      "documentVersions",
      "versionSegments",
      "fileLifecycleReceipts"
    ])
      for (const value of data[store] || []) await write({ store, value });
  });
  const plan = await api.prepareRestore(staged, { mode: "copy" });
  const result = await api.commitRestore(plan);
  const projectId = result.projectIds[0];
  assert.notEqual(projectId, "p");
  const entry = (await api.getAllByIndex("trashEntries", "projectId", projectId))[0];
  await service.restoreTrash([entry.id]);
  const state = await service.state(projectId, "d");
  const prior = await api.get("versionSegments", state.segments[0].previousTranslation.segmentId);
  assert.equal(prior.projectId, projectId);
  assert.equal((await service.versions(projectId, "d")).length, 1);
  (await api.openDatabase()).close();
});
