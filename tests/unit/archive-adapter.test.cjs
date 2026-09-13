const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const load = () =>
  import(pathToFileURL(path.join(__dirname, "../../src/features/import-export/archive-adapter.js")).href);

test("R3 archive round trip exceeds the legacy 50 MiB limit with bounded ZIP64 chunks", async () => {
  const archive = await load();
  const target = "İstanbul 🌍 <ph id='7'/> ".repeat(700);
  const value = {
    app: "LoopCAT",
    schemaVersion: 6,
    projects: [{ id: "p", name: "Preserved" }],
    segments: Array.from({ length: 3000 }, (_, i) => ({
      id: `s${i}`,
      projectId: "p",
      target,
      comments: [{ text: "note" }],
      targetHistory: [{ target: "before" }]
    }))
  };
  const written = await archive.writePackage(value);
  assert.ok(written.manifest.totalBytes > 50 * 1024 * 1024);
  assert.ok(written.manifest.chunks.every((chunk) => chunk.bytes <= archive.CHUNK_BYTES));
  const checked = await archive.readPackage(written.data);
  assert.equal(checked.verified, true);
  assert.equal(checked.digest, written.digest);
  assert.deepEqual(checked.value, value);
});

test("R7 actual decompressed size and duplicate ZIP names are rejected", async () => {
  const archive = await load();
  const { ZipWriter, BlobWriter, TextReader } = await import("@zip.js/zip.js");
  const writer = new ZipWriter(new BlobWriter(), { zip64: false });
  await writer.add("a.txt", new TextReader("expanded".repeat(100000)), { level: 6 });
  const bytes = new Uint8Array(await (await writer.close()).arrayBuffer());
  const view = new DataView(bytes.buffer);
  let directory = -1;
  for (let i = 0; i < bytes.length - 4; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      directory = i;
      break;
    }
  assert.ok(directory > 0);
  view.setUint32(directory + 24, 1, true);
  await assert.rejects(archive.readEntries(new Blob([bytes])), /size|limit|signature/i);
  const duplicates = new ZipWriter(new BlobWriter(), { zip64: false });
  await duplicates.add("a.txt", new TextReader("one"));
  await duplicates.add("b.txt", new TextReader("two"));
  const duplicateBytes = new Uint8Array(await (await duplicates.close()).arrayBuffer());
  const needle = new TextEncoder().encode("b.txt");
  for (let i = 0; i < duplicateBytes.length - needle.length; i++)
    if (needle.every((byte, j) => duplicateBytes[i + j] === byte)) duplicateBytes[i] = 97;
  await assert.rejects(archive.readEntries(new Blob([duplicateBytes])), /Duplicate/);
});

test("R12 repeated original binaries deduplicate into bounded asset parts and round trip exactly", async () => {
  const archive = await load();
  const base64 = Buffer.alloc(700000, 42).toString("base64");
  const value = {
    app: "LoopCAT",
    project: {
      id: "p",
      docxStructure: { docxPackageBase64: base64 },
      docxStructures: { d: { docxPackageBase64: base64 } }
    },
    segments: []
  };
  const written = await archive.writePackage(value);
  assert.equal(written.manifest.binaryParts.length, 1);
  assert.equal(written.manifest.binaryParts[0].bytes, 700000);
  assert.deepEqual((await archive.readPackage(written.data)).value, value);
});

test("R12 retention keeps ten recent backups, seven daily generations and protected rollbacks", async () => {
  const { retainedGenerations } = await import(
    pathToFileURL(path.join(__dirname, "../../src/features/workspace/workspace-archive-store.js")).href
  );
  const now = Date.parse("2026-09-08T12:00:00Z");
  const backups = Array.from({ length: 30 }, (_, index) => ({
    id: String(index),
    createdAt: new Date(now - index * 6 * 3600000).toISOString(),
    verified: true
  }));
  backups.push({ id: "rollback", createdAt: "2025-01-01T00:00:00Z", verified: true, rollback: true });
  const kept = retainedGenerations(backups, now);
  assert.ok(backups.slice(0, 10).every((value) => kept.includes(value)));
  assert.ok(kept.some((value) => value.id === "rollback"));
  assert.ok(kept.length < backups.length);
  assert.equal(retainedGenerations(backups.slice(0, 2), now).length, 2);
});

test("R7 bounded archive reader rejects declared limits, unsafe paths, corruption and cancellation", async () => {
  const archive = await load();
  for (const name of ["../file", "/absolute", "C:/file", "a\\b", "a/../b", "a//b", "a\u0000b"])
    assert.throws(() => archive.safeEntryName(name), /Unsafe/);
  const written = await archive.writePackage({ project: { id: "p" }, segments: [{ target: "intact" }] });
  await assert.rejects(archive.readPackage(written.data, { maxBytes: 1 }), /size|totals/);
  const bytes = new Uint8Array(await written.data.arrayBuffer());
  const needle = new TextEncoder().encode("intact");
  const offset = bytes.findIndex((_, i) => needle.every((byte, j) => bytes[i + j] === byte));
  assert.ok(offset > 0);
  bytes[offset] ^= 1;
  await assert.rejects(archive.readPackage(new Blob([bytes])), /signature|integrity|CRC/i);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(archive.readPackage(written.data, { signal: controller.signal }));
});

test("R13 archive verification streams readback without reconstructing the workspace", async () => {
  const archive = await load();
  const written = await archive.writePackage({ app: "LoopCAT", projects: [], segments: [] });
  const result = await archive.readPackage(written.data, { verifyOnly: true });
  assert.equal(result.verified, true);
  assert.equal(result.value, undefined);
});
