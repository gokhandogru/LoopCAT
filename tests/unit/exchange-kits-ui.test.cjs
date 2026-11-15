const test = require("node:test"),
  assert = require("node:assert/strict"),
  { IDBFactory } = require("fake-indexeddb");
// Small DOM boundary; the mounted kit, candidate lookup, archive decoder
// and activation transaction are the actual application implementations.
function node(ownerDocument) {
  const n = {
    ownerDocument,
    kids: [],
    events: {},
    textContent: "",
    isConnected: true,
    append(...kids) {
      this.kids.push(...kids);
    },
    addEventListener(k, f) {
      this.events[k] = f;
    },
    setAttribute() {},
    remove() {
      this.isConnected = false;
    }
  };
  return n;
}
function tree(n) {
  return [n, ...n.kids.flatMap(tree)];
}
async function waitUntil(f) {
  for (let i = 0; i < 80; i++) {
    if (f()) return;
    await new Promise((r) => {
      setTimeout(r, 5);
    });
  }
  throw Error("kit preview did not render");
}
test("kit preview reports incompatible active pins; closing does not activate, applying changes only selected exact resources", async () => {
  const [
    { renderAdvancedPack },
    { createPackRepository },
    { encodePack },
    { EXAMPLE_QA_PACK: q, EXAMPLE_TERM_PACK: t }
  ] = await Promise.all([
    import("../../src/features/exchange/advanced-ui.js"),
    import("../../src/features/exchange/repository.js"),
    import("../../src/features/exchange/pack-format.js"),
    import("../../src/features/exchange/examples.js")
  ]);
  const doc = { createElement: () => node(doc) },
    root = node(doc),
    repo = createPackRepository({ indexedDB: new IDBFactory() });
  const old = await repo.install(await encodePack({ ...q, version: "0.9.0" }));
  await repo.enable("A", old.id, old.version);
  const [quality, terms] = await Promise.all([q, t].map(async (p) => repo.install(await encodePack(p))));
  const kitPack = {
    ...q,
    id: "org.example.bundle",
    kind: "client",
    entries: [quality, terms].map((r, i) => ({
      id: r.id,
      version: r.version,
      digest: r.digest,
      priority: i,
      required: i === 0
    }))
  };
  const kit = await repo.install(await encodePack(kitPack));
  const options = {
    root,
    pack: kit.pack,
    pin: kit,
    projectId: "A",
    enabled: true,
    host: null,
    repository: repo,
    storage: {}
  };
  const render = async () => {
    const dispose = renderAdvancedPack(options);
    const section = root.kids.at(-1);
    await waitUntil(() => tree(section).some((n) => n.textContent === "Apply selected kit to this project"));
    assert.ok(tree(section).some((n) => n.textContent.includes("replaces active version")));
    return { section, dispose };
  };
  (await render()).dispose();
  assert.deepEqual(
    (await repo.active("A")).map((r) => r.digest),
    [old.digest]
  );
  const { section, dispose } = await render();
  const optional = tree(section).find((n) => n.textContent.includes("optional"));
  optional.kids[0].checked = false;
  await tree(section)
    .find((n) => n.textContent === "Apply selected kit to this project")
    .events.click();
  assert.deepEqual(
    (await repo.active("A")).map((r) => r.digest),
    [quality.digest, kit.digest]
  );
  dispose();
  repo.close();
});
