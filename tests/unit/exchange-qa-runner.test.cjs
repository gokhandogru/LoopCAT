const test = require("node:test"),
  assert = require("node:assert/strict");
test("uninstalling during a dispatched QA batch terminates its worker and invalidates the late response", async () => {
  const { evaluateRows } = await import("../../src/features/exchange/qa-runner.js");
  const savedWorker = global.Worker,
    savedLocation = global.location;
  let active,
    terminateCount = 0,
    announce;
  const dispatched = new Promise((resolve) => {
    announce = resolve;
  });
  global.location = new URL("https://test.invalid/");
  global.Worker = class {
    postMessage() {
      active = this;
      announce();
    }
    terminate() {
      terminateCount++;
    }
  };
  try {
    const ctl = new AbortController(),
      p = evaluateRows([{ pack: { kind: "qa" } }], [{ id: "one", source: "a", target: "b" }], {}, ctl.signal);
    await dispatched;
    ctl.abort();
    await assert.rejects(p, { name: "AbortError" });
    assert.equal(terminateCount, 1);
    active.onmessage({ data: { findings: [{ segmentId: "one", message: "late" }] } });
    assert.equal(terminateCount, 1);
  } finally {
    if (savedWorker === undefined) delete global.Worker;
    else global.Worker = savedWorker;
    if (savedLocation === undefined) delete global.location;
    else global.location = savedLocation;
  }
});
test("worker fallback shares rule logic and keeps document-wide segment numbering across batches", async () => {
  const { evaluateRows } = await import("../../src/features/exchange/qa-runner.js"),
    { EXAMPLE_QA_PACK } = await import("../../src/features/exchange/examples.js");
  const rows = Array.from({ length: 130 }, (_, i) => ({ id: String(i), source: "Server", target: "Makine" }));
  const out = await evaluateRows([{ pack: EXAMPLE_QA_PACK }], rows, { sourceLang: "en", targetLang: "tr" });
  assert.equal(out.length, 130);
  assert.equal(out.at(-1).label, "130");
});

test("a rule with excessive findings fails inside the evaluator before reading further rows", async () => {
  const { runPackQa } = await import("../../src/features/exchange/evaluator.js");
  let inspected = 0;
  const rows = Array.from({ length: 500 }, (_, i) => ({
    id: String(i),
    source: "text",
    get target() {
      inspected++;
      return "bad";
    }
  }));
  const rule = { id: "a", op: "target-contains", targets: ["bad"], message: "Check term." };
  assert.throws(
    () =>
      runPackQa([{ kind: "qa", id: "x.pack", entries: [rule] }], rows, {
        sourceLang: "en",
        targetLang: "tr",
        remaining: 3
      }),
    /limit/
  );
  assert(inspected < 20);
});
test("project QA rejects an earlier revision even if a translator reverted to the identical wording", async () => {
  const { createExchangeHost } = await import("../../src/features/exchange/host.js");
  const project = { id: "p", exchangeRequirements: [{ kind: "qa", required: true }] };
  const current = { id: "one", source: "server", target: "sunucu", revision: 3 };
  const host = createExchangeHost({
    document: { querySelector: () => null },
    getProject: () => project,
    getSegments: () => [current]
  });
  await assert.rejects(host.qa([{ ...current, revision: 1 }]), { name: "AbortError" });
  assert.equal((await host.qa([current])).incomplete, true);
});
