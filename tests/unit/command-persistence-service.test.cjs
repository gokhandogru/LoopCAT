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
