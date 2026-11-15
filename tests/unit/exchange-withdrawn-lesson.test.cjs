const assert = require("node:assert/strict"),
  test = require("node:test"),
  { IDBFactory } = require("fake-indexeddb");
const modules = Promise.all([
  import("../../src/features/exchange/repository.js"),
  import("../../src/features/exchange/workflow-packs.js"),
  import("../../src/features/exchange/pack-format.js"),
  import("../../src/features/exchange/catalog-policy.js"),
  import("../../src/features/exchange/advanced-ui.js"),
  import("../../src/features/exchange/lab-session.js")
]);
function storage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i],
    setItem: (k, v) => data.set(k, v),
    getItem: (k) => data.get(k) ?? null
  };
}
test("a projectless live exercise is canceled on exact publisher withdrawal; catalog installation adopts only an explicitly reinstalled local copy", async (t) => {
  const [
    { createPackRepository },
    { BLIND_LAB_SAMPLE: pack },
    { encodePack },
    { checkpointKey, enforceCatalogAdvisories },
    { renderAdvancedPack },
    { openTrial, listResponses }
  ] = await modules;
  const device = storage(),
    answers = storage(),
    old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: device, configurable: true });
  t.after(() => {
    if (old) Object.defineProperty(globalThis, "localStorage", old);
    else delete globalThis.localStorage;
  });
  const repo = createPackRepository({ indexedDB: new IDBFactory() });
  t.after(() => repo.close());
  const blob = await encodePack(pack),
    local = await repo.install(blob);
  const signer = { catalogId: "school.primary", fingerprint: "a".repeat(64) },
    other = { catalogId: "other.catalog", fingerprint: "b".repeat(64) };
  function save(origin, withdrawn = false) {
    const checkpoint = {
      fingerprint: origin.fingerprint,
      versions: { [pack.id + "@" + pack.version]: local.digest },
      revoked: withdrawn ? [local.digest] : []
    };
    device.setItem(checkpointKey(origin.catalogId), JSON.stringify(checkpoint));
    return { catalogId: origin.catalogId, checkpoint };
  }
  await enforceCatalogAdvisories(repo, save(other, true));
  assert.equal(repo.isUsable(await repo.getPack(pack.id, pack.version)), true);
  save(signer);
  const record = await repo.install(blob, signer);
  assert.deepEqual(record.catalogOrigin, signer);
  assert.deepEqual((await repo.describe())[0].catalogOrigin, signer);
  save(other);
  await assert.rejects(repo.install(blob, other), /another catalog/);
  assert.deepEqual((await repo.install(blob)).catalogOrigin, signer);
  const doc = { createElement: node };
  function node() {
    return {
      ownerDocument: doc,
      kids: [],
      events: {},
      selectedIndex: 0,
      isConnected: true,
      textContent: "",
      append(...kids) {
        this.kids.push(...kids);
      },
      replaceChildren(...kids) {
        this.kids = kids;
      },
      setAttribute() {},
      remove() {
        this.isConnected = false;
      },
      addEventListener(k, f) {
        this.events[k] = f;
      }
    };
  }
  const root = node(),
    walk = (n) => [n, ...n.kids.flatMap(walk)],
    click = (title) =>
      walk(root)
        .find((n) => n.textContent === title)
        .events.click();
  const trial = openTrial({ storage: answers, pack, pin: record, exercise: pack.entries[0] });
  trial.submit(1, [2, 3, 4, 5], "I chose this wording.");
  trial.reveal();
  let job, started;
  const ready = new Promise((r) => {
    started = r;
  });
  const loadAiHost = () => ({
    providerIds: () => ["one", "two"],
    describe: () => ({ destinations: [] }),
    runLessonComparison(_entry, _ex, options) {
      job = options;
      started();
      return new Promise((resolve) => {
        options.signal.addEventListener("abort", () => resolve([]));
      });
    }
  });
  const args = {
    root,
    pack,
    pin: record,
    projectId: "",
    enabled: true,
    host: null,
    loadAiHost,
    repository: repo,
    storage: answers
  };
  const dispose = renderAdvancedPack(args);
  await click("Open exercise");
  await click("Compare with live engines");
  const pending = click("Run separate comparison");
  await ready;
  await enforceCatalogAdvisories(repo, save(other, true));
  assert.equal(job.signal.aborted, false);
  await enforceCatalogAdvisories(repo, save(signer, true));
  await pending;
  assert.equal(job.signal.aborted, true);
  assert.equal(job.active(), false);
  assert.throws(() => renderAdvancedPack(args), /withdrawn/);
  assert.equal(listResponses(answers)[0].value.reason, "I chose this wording.");
  dispose();
});
