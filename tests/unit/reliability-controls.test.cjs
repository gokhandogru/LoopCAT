const assert = require("node:assert/strict");
const test = require("node:test");

async function harness(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { createReliabilityControls } = await import("../../src/app/reliability-controls.js");
  const listeners = new Map();
  const notices = [];
  let durability;
  const buttons = new Map();
  buttons.set("retryLocalSaveBtn", { addEventListener: (_, callback) => buttons.set("retry", callback) });
  const controls = createReliabilityControls({
    window: {
      CatHan: {},
      addEventListener: (name, callback) => listeners.set(name, callback)
    },
    document: { getElementById: (id) => buttons.get(id) },
    storage: { get: () => Promise.resolve(null), flushMutations: async () => {} },
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
