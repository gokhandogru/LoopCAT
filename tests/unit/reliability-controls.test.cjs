const assert = require("node:assert/strict");
const test = require("node:test");

async function harness(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { createReliabilityControls } = await import("../../src/app/reliability-controls.js");
  const listeners = new Map();
  const notices = [];
  let durability;
  let storedGeneration = 0;
  let checkpoints = 0;
  const buttons = new Map();
  buttons.set("retryLocalSaveBtn", { addEventListener: (_, callback) => buttons.set("retry", callback) });
  const controls = createReliabilityControls({
    window: {
      CatHan: {},
      addEventListener: (name, callback) => listeners.set(name, callback)
    },
    document: { getElementById: (id) => buttons.get(id) },
    storage: {
      get: () => Promise.resolve(null),
      flushMutations: async () => {},
      getCommittedGeneration: () => Promise.resolve(storedGeneration),
      createCheckpoint: () => {
        checkpoints++;
        return Promise.resolve({ id: "checkpoint", generation: storedGeneration });
      },
      migrateCheckpointAssets: () => Promise.resolve(null)
    },
    session: { getProject: () => ({ id: "p" }) },
    autosave: { getState: () => ({ pending: 0, inFlight: 0 }), size: () => 0, flush: async () => {} },
    status: { setPersistence: (...args) => notices.push(args), set: () => {} },
    saveState: {
      setDurability: (value) => {
        durability = value;
      }
    },
    render: () => {},
    workspace: { connected: () => false }
  });
  controls.mount();
  await Promise.resolve();
  return {
    notices,
    durability: () => durability,
    generation: (value) => {
      storedGeneration = value;
    },
    checkpoints: () => checkpoints,
    emit: (name, detail) => listeners.get(name)({ detail }),
    retry: () => buttons.get("retry")()
  };
}

test("Committed saves resolve only the conflicting records they actually wrote", async (t) => {
  const h = await harness(t);
  h.emit("loopcat-storage-status", { message: "First conflict", code: "conflict", recordKeys: ["s1"] });
  h.emit("loopcat-storage-status", { message: "Second conflict", code: "conflict", recordKeys: ["s2"] });
  h.emit("loopcat-committed", { generation: 10, recordKeys: ["s3"] });
  assert.deepEqual(h.durability().durableErrors, ["Second conflict"]);
  h.emit("loopcat-committed", { generation: 11, recordKeys: ["s2"] });
  assert.deepEqual(h.durability().durableErrors, ["First conflict"]);
  assert.notDeepEqual(h.notices.at(-1), ["Saved", "saved"]);
  h.emit("loopcat-committed", { generation: 12, recordKeys: ["s1"] });
  assert.deepEqual(h.durability().durableErrors, []);
  assert.deepEqual(h.notices.at(-1), ["Saved", "saved"]);
});

test("An unrelated successful save never hides a generic database error", async (t) => {
  const h = await harness(t);
  h.emit("loopcat-storage-status", "Database upgrade is blocked");
  h.emit("loopcat-storage-status", { message: "Conflict", code: "conflict", recordKeys: ["s1"] });
  h.emit("loopcat-committed", { generation: 1, recordKeys: ["s1"] });
  assert.deepEqual(h.durability().durableErrors, ["Database upgrade is blocked"]);
  await h.retry();
  assert.deepEqual(h.durability().durableErrors, []);
  assert.deepEqual(h.notices.at(-1), ["Saved", "saved"]);
});

test("Retry cannot clear conflicts when there were no pending saves to commit", async (t) => {
  const h = await harness(t);
  h.emit("loopcat-storage-status", { message: "Unsaved conflict", code: "conflict", recordKeys: ["s1"] });
  await h.retry();
  assert.deepEqual(h.durability().durableErrors, ["Unsaved conflict"]);
  assert.notDeepEqual(h.notices.at(-1), ["Saved", "saved"]);
});

test("external resource saves schedule recovery without acknowledging local conflicts", async (t) => {
  const h = await harness(t);
  h.emit("loopcat-storage-status", { message: "Unsaved conflict", code: "conflict", recordKeys: ["s1"] });
  h.generation(9);
  h.emit("loopcat-resources-changed", { generation: 9, external: true });
  assert.equal(h.durability().committedGeneration, 9);
  assert.deepEqual(h.durability().durableErrors, ["Unsaved conflict"]);
  t.mock.timers.tick(60000);
  for (let index = 0; index < 10; index++) await Promise.resolve();
  assert.equal(h.checkpoints(), 1);
  assert.deepEqual(h.durability().durableErrors, ["Unsaved conflict"]);
  h.generation(10);
  h.emit("focus");
  for (let index = 0; index < 4; index++) await Promise.resolve();
  assert.equal(h.durability().committedGeneration, 10);
});
