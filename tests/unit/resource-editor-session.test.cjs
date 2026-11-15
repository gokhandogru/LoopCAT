const test = require("node:test");
const assert = require("node:assert/strict");

async function fixture(overrides = {}) {
  const { createResourceEditorSession } = await import("../../src/features/resources/resource-editor-session.js");
  const persisted = new Map();
  const repository = {
    putDraft: (draft) => {
      persisted.set(draft.id, structuredClone(draft));
      return Promise.resolve();
    },
    removeDraft: (id) => {
      persisted.delete(id);
      return Promise.resolve();
    },
    saveEntries: (_type, _resource, drafts) =>
      Promise.resolve({ saved: drafts.map((draft) => draft.values), failed: [] }),
    ...overrides
  };
  return {
    persisted,
    repository,
    session: createResourceEditorSession({ repository, type: "tm", resourceId: "resource", sessionId: "session" })
  };
}

const original = { id: "entry", resourceId: "resource", source: "Hello", target: "Merhaba", storageVersion: 3 };

test("resource drafts preserve the reviewed record independently of later edits and renders", async () => {
  const { session, persisted } = await fixture();
  const entry = structuredClone(original);
  session.edit(entry, { target: "Selam" });
  entry.target = "external change";
  session.edit(entry, { source: "Hi" });
  await session.flush();
  assert.deepEqual(session.get("entry").before, original);
  assert.equal(session.get("entry").values.target, "Selam");
  assert.equal(persisted.get("session:entry").values.source, "Hi");
  assert.equal(entry.target, "external change");
});

test("partial resource save retains conflict drafts and clears only committed edits", async () => {
  const { session } = await fixture({
    saveEntries: (_type, _resource, drafts) =>
      Promise.resolve({
        saved: [drafts[0].values],
        failed: [{ draft: drafts[1], error: { name: "StorageConflictError", message: "Conflict" } }]
      })
  });
  session.edit(original, { target: "Saved" });
  session.edit({ ...original, id: "other" }, { target: "Keep my text" });
  await session.save({ id: "resource" });
  assert.equal(session.size(), 1);
  assert.equal(session.get("other").values.target, "Keep my text");
  assert.equal(session.getFailure().name, "StorageConflictError");
});

test("failed draft persistence retains text and flush retries the current snapshot", async () => {
  let attempts = 0;
  const { session } = await fixture({
    putDraft: () => (++attempts === 1 ? Promise.reject(new Error("quota")) : Promise.resolve())
  });
  session.edit(original, { target: "Text must survive" });
  await new Promise(setImmediate);
  assert.equal(session.getFailure().message, "quota");
  await session.flush();
  assert.equal(session.getFailure(), null);
  assert.equal(session.get("entry").values.target, "Text must survive");
  assert.equal(attempts, 2);
});

test("recovering drafts transfers ownership without changing active entries", async () => {
  const { session, persisted } = await fixture();
  const draft = {
    id: "old:entry",
    sessionId: "old",
    resourceId: "resource",
    type: "tm",
    entryId: "entry",
    before: original,
    values: { ...original, target: "Recovered" }
  };
  persisted.set(draft.id, structuredClone(draft));
  await session.recover([draft]);
  assert.equal(persisted.has("old:entry"), false);
  assert.equal(persisted.get("session:entry").values.target, "Recovered");
  assert.equal(original.target, "Merhaba");
  await session.discardAll();
  assert.equal(session.size(), 0);
  assert.equal(persisted.size, 0);
});

test("typing during a save remains as a newer durable draft", async () => {
  let finish;
  let saving;
  const ready = new Promise((resolve) => {
    saving = resolve;
  });
  const { session, persisted } = await fixture({
    saveEntries: (_type, _resource, drafts) => {
      saving();
      return new Promise((resolve) => {
        finish = () => resolve({ saved: [{ ...drafts[0].values, storageVersion: 4 }], failed: [] });
      });
    }
  });
  session.edit(original, { target: "First edit" });
  const save = session.save({ id: "resource" });
  await ready;
  session.edit(original, { target: "Newer typing" });
  finish();
  await save;
  await session.flush();
  assert.equal(session.get("entry")?.values.target, "Newer typing");
  assert.equal(session.get("entry")?.before.storageVersion, 4);
  assert.equal(persisted.get("session:entry")?.values.target, "Newer typing");
});
