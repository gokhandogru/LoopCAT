const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, sign, randomBytes, createHash } = require("node:crypto");
const kit = () => import("../../src/features/exchange/catalog.js");
function fixture() {
  const now = Date.now(),
    pack = randomBytes(11),
    sha256 = createHash("sha256").update(pack).digest("hex");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const key = {
    catalogId: "org.test.catalog",
    publicKey: Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("base64")
  };
  const entry = {
    id: "org.test.term",
    version: "1.0.0",
    bytes: pack.length,
    sha256,
    title: "Test pack",
    task: "Check terminology",
    region: "Türkiye",
    domain: "Medicine",
    edition: "Web and desktop",
    languages: ["tr", "en"],
    offline: true,
    sample: "Translate one word",
    maintainer: "Faculty",
    rights: "CC0",
    testedApp: "0.0.4",
    reviewedVersion: "1.0.0"
  };
  const p = {
    format: "loopcat-catalog-v1",
    catalogId: key.catalogId,
    sequence: 2,
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 100000).toISOString(),
    releases: [entry],
    revoked: []
  };
  const envelope = (diff = {}) => {
    const payload = Buffer.from(JSON.stringify({ ...p, ...diff }));
    return JSON.stringify({
      format: "loopcat-signed-index-v1",
      payload: payload.toString("base64"),
      signature: sign(null, payload, privateKey).toString("base64")
    });
  };
  return { now, pack, key, entry, envelope };
}
test("signature is rooted outside the artifact; rollback, expiry, equivocation, and republishing are blocked", async () => {
  const { verifyCatalog, verifyCatalogArtifact } = await kit(),
    f = fixture();
  const s = await verifyCatalog(f.envelope(), f.key);
  assert.equal(s.releases[0].title, "Test pack");
  await assert.rejects(verifyCatalog(f.envelope(), fixture().key), /signature/);
  await assert.rejects(verifyCatalog(f.envelope({ sequence: 1 }), f.key, s.checkpoint), /rollback/);
  await assert.rejects(verifyCatalog(f.envelope({ revoked: [f.entry.sha256] }), f.key, s.checkpoint), /conflicting/);
  await assert.rejects(
    verifyCatalog(f.envelope({ sequence: 3, releases: [{ ...f.entry, sha256: "a".repeat(64) }] }), f.key, s.checkpoint),
    /republished/
  );
  await assert.rejects(verifyCatalog(f.envelope({ expiresAt: new Date(f.now - 500).toISOString() }), f.key), /expired/);
  const accepted = await verifyCatalogArtifact(new Blob([f.pack]), f.entry, s);
  assert.match(accepted.name, /\.loopcat-pack\.zip$/);
  await assert.rejects(verifyCatalogArtifact(new Blob([randomBytes(11)]), f.entry, s), /checksum/);
  const bad = await verifyCatalog(f.envelope({ sequence: 3, revoked: [f.entry.sha256] }), f.key, s.checkpoint);
  const next = await verifyCatalog(f.envelope({ sequence: 4 }), f.key, bad.checkpoint);
  await assert.rejects(verifyCatalogArtifact(new Blob([f.pack]), f.entry, next), /withdrawn/);
});
test("download uses only the configured directory, GET, omit credentials and referrer; no redirects or overlarge streams", async () => {
  const { fetchCatalogFile, CATALOG_LIMIT } = await kit();
  const calls = [];
  const mock = (url, opts) => {
    calls.push([url, opts]);
    return Promise.resolve(new Response("signed"));
  };
  assert.equal(await (await fetchCatalogFile("https://store.example/l/", null, mock)).text(), "signed");
  assert.equal(calls[0][0], "https://store.example/l/index.json");
  assert.deepEqual(
    [calls[0][1].method, calls[0][1].credentials, calls[0][1].referrerPolicy, calls[0][1].redirect],
    ["GET", "omit", "no-referrer", "error"]
  );
  await assert.rejects(fetchCatalogFile("https://store.example/l/", "../foo", mock), /address/);
  await assert.rejects(fetchCatalogFile("http://127.0.0.1/", null, mock), /HTTPS/);
  await assert.rejects(
    fetchCatalogFile("https://store.example/l/", null, () =>
      Promise.resolve(new Response(new Uint8Array(CATALOG_LIMIT + 1)))
    ),
    /size limit/
  );
  assert.equal(calls.length, 1);
});
