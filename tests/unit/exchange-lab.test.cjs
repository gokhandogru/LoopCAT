const { test } = require("node:test");
const assert = require("node:assert/strict");
const api = import("../../src/features/exchange/lab-session.js");
const sample = import("../../src/features/exchange/workflow-packs.js");
function device() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i],
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k)
  };
}
test("frozen trial rotation balances all four positions and recorded judgement survives restart and removal", async () => {
  const { BLIND_LAB_SAMPLE: pack } = await sample;
  const { openTrial, listResponses, forgetResponse, responseEvidence } = await api;
  const options = { pack, pin: { digest: "3".repeat(64) }, exercise: pack.entries[0] };
  const first = [];
  for (let group = 0; group < 4; group++) {
    const storage = device(),
      trial = openTrial({ ...options, group, storage });
    assert.throws(() => trial.reveal(), /before/);
    first.push(trial.snapshot().order[0]);
    assert.throws(() => trial.submit(1, [3, 5, 3, 0], "reason"), /score/);
    trial.submit(1, [3, 5, 4, 2], "sounds natural");
    const reopened = openTrial({ ...options, group: (group + 1) % 4, storage });
    assert.deepEqual(reopened.snapshot(), trial.snapshot());
    assert.throws(() => reopened.submit(0, [3, 5, 4, 2], "second"), /already/);
    const labels = reopened.reveal();
    assert.equal(labels[1], pack.entries[0].candidates[reopened.snapshot().order[1]].label);
    const [record] = listResponses(storage);
    assert.equal(responseEvidence(record.value).justification, undefined);
    assert.equal(responseEvidence(record.value, true).justification, "sounds natural");
    assert.equal(JSON.stringify(responseEvidence(record.value)).includes(pack.entries[0].source), false);
    forgetResponse(storage, record.key);
    assert.equal(listResponses(storage).length, 0);
  }
  assert.equal(new Set(first).size, 4);
});
test("lesson portable records reject identifiable endpoints, executable fields and malformed frozen examples", async () => {
  const { BLIND_LAB_SAMPLE: pack, validateWorkflowEntries } = await sample;
  assert.deepEqual(validateWorkflowEntries("lesson", pack.entries), pack.entries);
  for (const modify of [
    (e) => {
      e.participantName = "student";
    },
    (e) => e.candidates.pop(),
    (e) => {
      e.candidates[1].label = e.candidates[0].label;
    },
    (e) => {
      e.candidates[0].text = "Bearer ABCDEFGHIJK";
    },
    (e) => {
      e.source = "https://private.invalid/x";
    }
  ]) {
    const e = structuredClone(pack.entries[0]);
    modify(e);
    assert.throws(() => validateWorkflowEntries("lesson", [e]));
  }
});
