const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
async function lib() {
  return {
    ...(await import("../../scripts/exchange-compute-turkish.mjs")),
    ...(await import("../../scripts/exchange-compute-runner.mjs"))
  };
}
test("typed Turkish lookup detects inflections without hard-coded inflected forms and rejects fixture near misses", async () => {
  const { turkishGuest, runCompute } = await lib();
  const rows = JSON.parse(
    await fs.readFile(path.join(__dirname, "../fixtures/exchange-catalog/turkish-heldout.json"), "utf8")
  );
  const findings = await runCompute(
    turkishGuest(),
    rows.map(([lemma, token, soften]) => ({ lemma, token, soften }))
  );
  assert.deepEqual(
    findings,
    rows.map(([, word, , match]) => (match ? [{ kind: "termMatch", start: 0, end: word.length }] : []))
  );
});
test("guest cannot use ambient imports, expand its memory, or return an oversized finding", async () => {
  const { fixtureModule, runCompute } = await lib();
  const item = [{ lemma: "bir", token: "bir" }];
  const forbidden = fixtureModule([65, 1]);
  const off = Buffer.from(forbidden).indexOf("host");
  forbidden.set(Buffer.from("evil"), off);
  await assert.rejects(runCompute(forbidden, item), /Unsupported/);
  // Return memory.grow(1) == -1: host supplied exactly one maximum page.
  assert.equal((await runCompute(fixtureModule([65, 1, 64, 0, 65, 127, 70]), item))[0].length, 1);
  await assert.rejects(runCompute(fixtureModule([65, 63]), item), /output/);
  await assert.rejects(runCompute(fixtureModule([65, 1]), [{ lemma: "x", token: "x".repeat(1500) }]), /input/);
});
test("external deadline and lifetime revocation terminate a noncooperating guest", async () => {
  const { fixtureModule, runCompute } = await lib();
  const loop = fixtureModule([3, 64, 12, 0, 11, 65, 0]);
  const items = [{ lemma: "a", token: "a" }];
  await assert.rejects(runCompute(loop, items, { deadlineMs: 200 }), /deadline/);
  const controller = new AbortController(),
    pending = runCompute(loop, items, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /revoked/);
  assert.equal((await runCompute(fixtureModule([65, 1]), items))[0].length, 1);
});
