const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { generateKeyPairSync, createHash } = require("node:crypto");
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
  await assert.rejects(runCatalogCli(args), /rights/);
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
