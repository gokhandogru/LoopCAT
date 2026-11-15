const test = require("node:test");
const assert = require("node:assert/strict");

const mods = Promise.all([
  import("../../src/features/exchange/pack-format.js"),
  import("../../src/features/exchange/evaluator.js"),
  import("../../src/features/exchange/examples.js")
]);
test("warm term lookup reuses one snapshot and checks durable generation and revocation before serving it", async () => {
  const [, { createTermSnapshotCache }] = await mods;
  let count = 0,
    generation = 1,
    allowed = true;
  let controller = new AbortController();
  const repo = {
    snapshot(_key, kind) {
      assert.equal(kind, "terminology");
      count++;
      return { generation, records: [{ id: "term" }], signal: controller.signal };
    },
    isCurrent: (_key, v) => v === generation,
    isUsable: () => allowed
  };
  const cache = createTermSnapshotCache(repo);
  assert.equal((await cache.read("project")).records.length, 1);
  assert.equal((await cache.read("project")).records.length, 1);
  assert.equal(count, 1);
  allowed = false;
  assert.deepEqual((await cache.read("project")).records, []);
  generation++;
  controller.abort();
  controller = new AbortController();
  await cache.read("project");
  assert.equal(count, 2);
  await cache.read("other");
  assert.equal(count, 3);
});
test("a deterministic portable ZIP round-trips, matches its exact bytes and refuses foreign members", async () => {
  const [{ encodePack, decodePack, validatePack }, , { EXAMPLE_TERM_PACK: pack }] = await mods;
  const a = await encodePack(pack),
    b = await encodePack(pack);
  const decoded = await decodePack(a);
  assert.deepEqual(decoded.pack, validatePack(pack));
  const h = require("node:crypto")
    .createHash("sha256")
    .update(Buffer.from(await a.arrayBuffer()))
    .digest("hex");
  assert.equal(h, decoded.digest);
  assert.deepEqual(await a.arrayBuffer(), await b.arrayBuffer());
  const wrongLocalName = new Uint8Array(await a.arrayBuffer());
  wrongLocalName[30] = 88;
  await assert.rejects(decodePack(new Blob([wrongLocalName])), /malformed/);
  const extraPayload = new Blob([a, new Uint8Array([0, 1, 2])]);
  await assert.rejects(decodePack(extraPayload), /malformed/);
  const corrupted = new Uint8Array(await a.arrayBuffer());
  corrupted[45] ^= 1;
  await assert.rejects(decodePack(new Blob([corrupted])));
  const { ZipWriter, BlobWriter, TextReader } = await import("@zip.js/zip.js");
  const zip = new ZipWriter(new BlobWriter("application/zip"), { level: 0, useWebWorkers: false });
  await zip.add("manifest.json", new TextReader("{}"));
  await zip.add("boot.js", new TextReader("/* never executable */"));
  await assert.rejects(decodePack(await zip.close()), /expected only/);
  await assert.rejects(decodePack(new Blob([new Uint8Array(8 * 1024 * 1024 + 1)])), /8 MiB/);
});
test("QA requires executable positive and negative fixtures; capability and secret-shaped fields rejected", async () => {
  const [{ validatePack, validateRequirement }, , { EXAMPLE_QA_PACK: q }] = await mods;
  for (const patch of [
    { entrypoint: "code.js" },
    { url: "https://example.com" },
    { kind: "worker" },
    { name: "Bearer zzzzzzzzzzzzzzz" },
    { languages: { source: "bad lang" } }
  ])
    assert.throws(() => validatePack({ ...q, ...patch }));
  const r = q.entries[0];
  for (const replacement of [
    { ...r, op: "regex" },
    { ...r, severity: "error" },
    { ...r, examples: [r.examples[0]] },
    { ...r, examples: [r.examples[0], { ...r.examples[0], expect: "pass" }] }
  ])
    assert.throws(() => validatePack({ ...q, entries: [replacement] }));
  assert.throws(() => validateRequirement({ id: q.id, version: q.version, digest: "G".repeat(64), required: false }));
});
test("pack terms and advisory QA use language tags, Unicode boundaries, Turkish folding and explicit inflections", async () => {
  const [{ validatePack }, { containsForm, findPackTerms, runPackQa }, { EXAMPLE_TERM_PACK: t, EXAMPLE_QA_PACK: q }] =
    await mods;
  assert.equal(containsForm("IŞIK", "ışık", "tr"), true);
  assert.equal(containsForm("IŞIK", "ışık", "en"), false);
  assert.equal(containsForm("𐐀server", "server", "en"), false);
  const terms = { id: t.id, pack: validatePack(t), digest: "1".repeat(64) };
  const ctx = { sourceLang: "en-US", targetLang: "tr-TR" };
  assert.equal(findPackTerms([terms], "a serverless app", ctx).length, 0);
  const result = findPackTerms([terms], "A server.", ctx);
  assert.equal(result[0].readOnly, true);
  assert.equal(result[0].allowTermCopy, true);
  const privatePack = { ...t };
  delete privatePack.allowTermCopy;
  assert.equal(findPackTerms([validatePack(privatePack)], "A server.", ctx)[0].allowTermCopy, false);
  assert.throws(() => validatePack({ ...q, allowTermCopy: true }), /only valid for terminology/);
  assert.equal(result[0].attribution, "LoopCAT teaching example");
  assert.deepEqual(findPackTerms([terms], "a server", { ...ctx, targetLang: "fr" }), []);
  const rule = validatePack(q);
  const checks = runPackQa(
    [rule],
    [
      { id: "a", source: "The server", target: "Sunucunun adı" },
      { id: "b", source: "The server", target: "Sunucumsu" },
      { id: "c", source: "The serverless app", target: "Uygulama" }
    ],
    ctx
  );
  assert.equal(checks.length, 1);
  assert.equal(checks[0].segmentId, "b");
  assert.equal(checks[0].advisory, true);
});
