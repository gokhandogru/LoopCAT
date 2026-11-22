const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { generateKeyPairSync, createHash } = require("node:crypto");
const { IDBFactory } = require("fake-indexeddb");
test("publisher rehearsal signs a real pack, checks embedded identity, and verifies disconnected with a separate anchor", async (t) => {
  const [{ runCatalogCli }, { encodePack }, { EXAMPLE_TERM_PACK }, { verifyCatalog, verifyCatalogArtifact }] =
    await Promise.all([
      import("../../scripts/exchange-catalog.mjs"),
      import("../../src/features/exchange/pack-format.js"),
      import("../../src/features/exchange/examples.js"),
      import("../../src/features/exchange/catalog.js")
    ]);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "loopcat-catalog-rehearsal-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const release = path.join(dir, "public"),
    paths = path.join(release, "packs");
  await fs.mkdir(paths, { recursive: true });
  const pem = path.join(dir, "test-signing.pem");
  await fs.writeFile(pem, generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }));
  const zip = await encodePack(EXAMPLE_TERM_PACK);
  const bytes = Buffer.from(await zip.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await fs.writeFile(path.join(paths, `${sha256}.loopcat-pack.zip`), bytes);
  const issued = Date.now();
  const e = {
    id: EXAMPLE_TERM_PACK.id,
    version: EXAMPLE_TERM_PACK.version,
    title: EXAMPLE_TERM_PACK.name,
    task: "Term lookup",
    region: "TR",
    domain: "Technology",
    edition: "Web and desktop",
    sample: "Try the term server.",
    maintainer: "Test department",
    rights: EXAMPLE_TERM_PACK.license,
    testedApp: "Test build",
    reviewedVersion: EXAMPLE_TERM_PACK.version,
    languages: ["en", "tr"],
    offline: true,
    bytes: bytes.length,
    sha256
  };
  const payload = {
    format: "loopcat-catalog-v1",
    catalogId: "org.test.rehearsal",
    issuedAt: new Date(issued).toISOString(),
    expiresAt: new Date(issued + 3600000).toISOString(),
    sequence: 1,
    releases: [e],
    revoked: []
  };
  const file = path.join(dir, "release.json");
  await fs.writeFile(file, JSON.stringify(payload));
  const args = ["sign", file, pem, release, release];
  assert.match(await runCatalogCli(args), /fingerprint/);
  const index = path.join(release, "index.json"),
    trust = path.join(release, "catalog-key.json");
  assert.match(await runCatalogCli(["verify", index, trust]), /revision 1/);
  const verified = await verifyCatalog(await fs.readFile(index, "utf8"), JSON.parse(await fs.readFile(trust, "utf8")));
  const approved = await verifyCatalogArtifact(zip, verified.releases[0], verified);
  assert.equal(approved.size, zip.size);
  await fs.writeFile(file, JSON.stringify({ ...payload, releases: [{ ...e, rights: "wrong" }] }));
  const rejected = path.join(dir, "rejected");
  await fs.mkdir(rejected);
  await assert.rejects(runCatalogCli(["sign", file, pem, release, rejected]), /rights/);
  assert.deepEqual(await fs.readdir(rejected), []);
  await assert.rejects(runCatalogCli(args), /cannot be overwritten/);
});
test("only records installed from that signer are quarantined and missing authority fails closed", async () => {
  const { checkpointKey, assertRecordAllowed, enforceCatalogAdvisories, assertCatalogInstall } =
    await import("../../src/features/exchange/catalog-policy.js");
  const catalogOrigin = { catalogId: "org.sample.school", fingerprint: "a".repeat(64) },
    digest = "b".repeat(64);
  const record = { id: "org.sample.term", version: "1.0.0", digest, catalogOrigin };
  const state = {
    fingerprint: catalogOrigin.fingerprint,
    revoked: [digest],
    versions: { "org.sample.term@1.0.0": digest }
  };
  const storage = { getItem: (key) => (key === checkpointKey(catalogOrigin.catalogId) ? JSON.stringify(state) : null) };
  assert.throws(() => assertRecordAllowed(record, storage), /withdrawn/);
  assert.doesNotThrow(() => assertRecordAllowed({ ...record, catalogOrigin: undefined }, storage));
  assert.throws(
    () => assertRecordAllowed({ ...record, catalogOrigin: { ...catalogOrigin, fingerprint: "x" } }, storage),
    /unavailable/
  );
  const disabled = [];
  const repo = {
    list: () =>
      Promise.resolve([
        record,
        { ...record, id: "org.sample.local", catalogOrigin: null },
        { ...record, id: "org.sample.other", catalogOrigin: { ...catalogOrigin, catalogId: "org.sample.other" } }
      ]),
    affectedProjects: () => Promise.resolve(["p"]),
    requirements: () => Promise.resolve([record]),
    disable: (...args) => Promise.resolve(disabled.push(args))
  };
  assert.equal(await enforceCatalogAdvisories(repo, { catalogId: catalogOrigin.catalogId, checkpoint: state }), 1);
  assert.deepEqual(disabled, [["p", record.id, digest]]);
  assert.throws(() => assertCatalogInstall(record, { ...catalogOrigin, expires: 0 }, storage), /expired/);
  state.revoked = [];
  assert.deepEqual(
    assertCatalogInstall(record, { ...catalogOrigin, expires: Date.now() + 50000 }, storage),
    catalogOrigin
  );
});

test("a complete disposable publication installs both releases and a signed withdrawal disables only the old exact version", async (t) => {
  const [
    { runCatalogCli },
    { createPackRepository },
    { encodePack },
    { EXAMPLE_QA_PACK },
    { verifyCatalog, verifyCatalogArtifact },
    { checkpointKey, enforceCatalogAdvisories }
  ] = await Promise.all([
    import("../../scripts/exchange-catalog.mjs"),
    import("../../src/features/exchange/repository.js"),
    import("../../src/features/exchange/pack-format.js"),
    import("../../src/features/exchange/examples.js"),
    import("../../src/features/exchange/catalog.js"),
    import("../../src/features/exchange/catalog-policy.js")
  ]);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "loopcat-private-publication-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, "source"),
    keyFile = path.join(dir, "disposable-key.pem");
  await fs.mkdir(path.join(source, "packs"), { recursive: true });
  await fs.writeFile(keyFile, generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }));
  const entries = [];
  for (const version of ["1.0.0", "2.0.0"]) {
    const pack = { ...EXAMPLE_QA_PACK, version },
      blob = await encodePack(pack);
    const bytes = Buffer.from(await blob.arrayBuffer()),
      sha256 = createHash("sha256").update(bytes).digest("hex");
    await fs.writeFile(path.join(source, "packs", sha256 + ".loopcat-pack.zip"), bytes);
    entries.push({
      id: pack.id,
      version,
      sha256,
      bytes: bytes.length,
      title: pack.name,
      task: "QA checks",
      domain: "Software",
      region: "TR",
      edition: "Web and desktop",
      languages: ["en", "tr"],
      offline: true,
      sample: "Check terminology.",
      maintainer: "Disposable publisher",
      rights: pack.license,
      testedApp: "Test build",
      reviewedVersion: version
    });
  }
  const index = {
    format: "loopcat-catalog-v1",
    catalogId: "private.test.catalog",
    sequence: 1,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    releases: entries,
    revoked: []
  };
  async function publish(sequence, revoked = []) {
    const output = path.join(dir, "revision-" + sequence),
      input = path.join(dir, "review-" + sequence + ".json");
    await fs.mkdir(output);
    await fs.writeFile(input, JSON.stringify({ ...index, sequence, revoked }));
    await runCatalogCli(["sign", input, keyFile, source, output]);
    assert.ok(!(await fs.readdir(output)).some((name) => name.endsWith(".pem")));
    return {
      output,
      text: await fs.readFile(path.join(output, "index.json"), "utf8"),
      trust: JSON.parse(await fs.readFile(path.join(output, "catalog-key.json"), "utf8"))
    };
  }
  const first = await publish(1),
    verified = await verifyCatalog(first.text, first.trust);
  const storage = new Map(),
    previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (name) => storage.get(name) || null,
      setItem: (name, text) => storage.set(name, text)
    }
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  });
  const repo = createPackRepository({ indexedDB: new IDBFactory() });
  t.after(() => repo.close());
  const name = checkpointKey(verified.catalogId);
  storage.set(name, JSON.stringify(verified.checkpoint));
  for (const e of entries) {
    const actual = new Blob([await fs.readFile(path.join(first.output, "packs", e.sha256 + ".loopcat-pack.zip"))]);
    await repo.install(await verifyCatalogArtifact(actual, e, verified), {
      catalogId: verified.catalogId,
      fingerprint: verified.checkpoint.fingerprint
    });
    await repo.enable("project-" + e.version, e.id, e.version, { required: true, priority: 31 });
  }
  const second = await publish(2, [entries[0].sha256]);
  // Disconnected recipient still has its last accepted checkpoint.
  assert.equal((await repo.active("project-1.0.0")).length, 1);
  const update = await verifyCatalog(second.text, second.trust, verified.checkpoint);
  storage.set(name, JSON.stringify(update.checkpoint));
  assert.equal(await enforceCatalogAdvisories(repo, update), 1);
  assert.deepEqual(await repo.active("project-1.0.0"), []);
  assert.equal((await repo.active("project-2.0.0"))[0].version, "2.0.0");
  assert.equal((await repo.requirements("project-1.0.0"))[0].priority, 31);
  assert.equal((await repo.requirements("project-1.0.0"))[0].required, true);
  assert.equal((await repo.list()).length, 2);
  await assert.rejects(verifyCatalog(first.text, first.trust, update.checkpoint), /rollback/);
  await assert.rejects(fs.stat(path.join(second.output, "packs", entries[0].sha256 + ".loopcat-pack.zip")), /ENOENT/);
  assert.ok((await fs.stat(path.join(second.output, "packs", entries[1].sha256 + ".loopcat-pack.zip"))).size > 0);
});
