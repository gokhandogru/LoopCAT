const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

test("R6 command failure preserves earlier typing even after its pending entry was cleared", async () => {
  const { createCommandPersistenceService } = await import(
    pathToFileURL(path.join(__dirname, "../../src/features/editor/command-persistence-service.js")).href
  );
  const current = { id: "s", projectId: "p", target: "typed but unsaved" };
  const pending = new Map([[current.id, structuredClone(current)]]);
  const tasks = [];
  const autosave = {
    has: (id) => pending.has(id),
    clear: (value) => pending.delete(value.id),
    debounce: (value) => pending.set(value.id, structuredClone(value)),
    queue: (value) => pending.set(value.id, value)
  };
  const service = createCommandPersistenceService({
    autosave,
    session: { getSegments: () => [current] },
    repository: { save: () => Promise.reject(new Error("quota")), saveMany: () => Promise.resolve() },
    setTimer: (callback) => tasks.push(callback)
  });
  current.target = "command output";
  service.clear(current);
  await assert.rejects(service.save(current), /quota/);
  current.target = "typed but unsaved";
  tasks.splice(0).forEach((callback) => callback());
  assert.equal(pending.get("s").target, "typed but unsaved");
  service.clear(current);
  await service.saveMany([current]);
  tasks.splice(0).forEach((callback) => callback());
  assert.equal(pending.size, 0);
});

test("atomic confirmation keeps recovery dormant until its commit succeeds or fails", async () => {
  const { createCommandPersistenceService } = await import(
    pathToFileURL(path.join(__dirname, "../../src/features/editor/command-persistence-service.js")).href
  );
  const current = { id: "s", projectId: "p", target: "typed", status: "draft", revision: 1 };
  const pending = new Map([[current.id, structuredClone(current)]]);
  const tasks = [];
  const service = createCommandPersistenceService({
    autosave: {
      has: (id) => pending.has(id),
      clear: (value) => pending.delete(value.id),
      debounce: (value) => pending.set(value.id, structuredClone(value)),
      queue: (value) => pending.set(value.id, value)
    },
    session: { getSegments: () => [current] },
    repository: { save: async () => {}, saveMany: async () => {} },
    setTimer: (callback) => tasks.push(callback)
  });
  let finish;
  current.status = "confirmed";
  current.revision += 1;
  service.clear(current);
  const confirming = service.run(
    [current],
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  tasks.splice(0).forEach((callback) => callback());
  assert.equal(pending.size, 0, "pending recovery must not duplicate a confirmation in progress");
  finish({ segment: { ...current, storageVersion: 35 } });
  await confirming;
  tasks.splice(0).forEach((callback) => callback());
  assert.equal(pending.size, 0);

  pending.set(current.id, structuredClone(current));
  service.clear(current);
  await assert.rejects(
    service.run([current], () => Promise.reject(new Error("disk full"))),
    /disk full/
  );
  current.status = "draft";
  tasks.splice(0).forEach((callback) => callback());
  assert.equal(pending.get(current.id).status, "draft", "failed confirmation must still recover original typing");
});
