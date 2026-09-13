import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { separateAssets, combineAssets, digest, externalAsset } from "./record-assets.js";
const CHUNK = 4 * 1024 * 1024;
const MAX_RECORD = 64 * 1024 * 1024;
const LIMIT = 32 * 1024 * 1024 * 1024;
const STORES = ["projects", "segments", "tmEntries", "terms", "activityEvents", "trashEntries"];
const encoder = new TextEncoder();

async function* objectRecords(value) {
  if (value.archiveSource) {
    yield* value.archiveSource.records();
    return;
  }
  const excluded = new Set(value.project ? ["segments", "activityEvents", "resources"] : STORES);
  yield { store: "metadata", value: Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.has(key))) };
  for (const store of value.project ? ["segments", "activityEvents"] : STORES) {
    for (const record of value[store] || []) yield { store, value: record };
  }
  if (value.project)
    for (const store of ["tmEntries", "terms"]) {
      for (const record of value.resources?.[store] || []) yield { store, value: record };
    }
}

export async function writeRecordPackage(
  value,
  writable,
  { signal = undefined, generation = 0, parentGeneration = null, externalRoot = undefined } = {}
) {
  const writer = new ZipWriter(writable || new BlobWriter("application/zip"), { zip64: true, level: 0 });
  const chunks = [];
  const binaryParts = new Map();
  const counts = Object.fromEntries(
    STORES.filter(
      (store) => value.archiveSource || Array.isArray(value[store]) || Array.isArray(value.resources?.[store])
    ).map((store) => [store, 0])
  );
  let buffer = new Uint8Array(CHUNK);
  let used = 0;
  let totalBytes = 0;
  function account(bytes) {
    totalBytes += bytes;
    if (totalBytes > LIMIT || chunks.length + binaryParts.size >= 99999)
      throw new Error("Archive exceeds its supported structural or size limit.");
  }
  async function savePart(hash, bytes) {
    if (binaryParts.has(hash)) return;
    signal?.throwIfAborted();
    account(bytes.length);
    const part = { path: `assets/${hash}.bin`, bytes: bytes.length, sha256: hash };
    if (externalRoot) part.external = true;
    binaryParts.set(hash, part);
    if (externalRoot) await externalAsset(externalRoot, hash, bytes);
    else await writer.add(part.path, new BlobReader(new Blob([bytes])), { signal });
  }
  async function flush() {
    if (!used) return;
    const bytes = buffer.subarray(0, used);
    account(used);
    const chunk = {
      path: `records/${String(chunks.length).padStart(8, "0")}.ndjson`,
      bytes: used,
      sha256: await digest(bytes)
    };
    chunks.push(chunk);
    await writer.add(chunk.path, new BlobReader(new Blob([bytes])), { signal });
    buffer = new Uint8Array(CHUNK);
    used = 0;
  }
  try {
    for await (const record of objectRecords(value)) {
      signal?.throwIfAborted();
      if (!["metadata", ...STORES].includes(record.store)) throw new Error("Unsupported archive record store.");
      const separated = await separateAssets(record.value, savePart, signal);
      const bytes = encoder.encode(JSON.stringify({ store: record.store, ...separated }) + "\n");
      if (bytes.length > MAX_RECORD)
        throw new Error("A record exceeds the 64 MiB structural limit after asset separation.");
      counts[record.store] = (counts[record.store] || 0) + 1;
      for (let offset = 0; offset < bytes.length;) {
        const length = Math.min(bytes.length - offset, CHUNK - used);
        buffer.set(bytes.subarray(offset, offset + length), used);
        used += length;
        offset += length;
        if (used === CHUNK) await flush();
      }
    }
    await flush();
    const manifest = {
      format: "LoopCAT archive",
      version: 1,
      encoding: "records-v1",
      kind: value.project ? "project" : "workspace",
      generation,
      parentGeneration,
      chunkBytes: CHUNK,
      totalBytes,
      counts,
      chunks,
      binaryParts: [...binaryParts.values()]
    };
    if (counts.metadata !== 1) throw new Error("Archive metadata must occur exactly once.");
    const bytes = encoder.encode(JSON.stringify(manifest));
    if (bytes.length > 16 * 1024 * 1024) throw new Error("Archive manifest exceeds its limit.");
    await writer.add("manifest.json", new BlobReader(new Blob([bytes])), { signal });
    const data = await writer.close();
    return { data: writable ? undefined : data, manifest, digest: await digest(bytes), written: true, verified: false };
  } catch (error) {
    await writable?.abort?.(error).catch(() => {});
    throw error;
  }
}

export async function readRecordPackage(
  manifest,
  entries,
  readEntry,
  { signal = undefined, verifyOnly = false, onRecord = undefined, externalRoot = undefined } = {}
) {
  if (!Array.isArray(manifest.binaryParts) || !manifest.counts || !["project", "workspace"].includes(manifest.kind))
    throw new Error("Invalid record archive manifest.");
  const described = [...manifest.chunks, ...manifest.binaryParts];
  if (
    described.filter((part) => !part.external).length + 1 !== entries.size ||
    new Set(described.map((part) => part.path)).size !== described.length
  )
    throw new Error("Duplicate or unexpected archive entries.");
  const assetParts = new Map();
  let total = 0;
  for (const part of described) {
    signal?.throwIfAborted();
    if (
      !Number.isSafeInteger(part.bytes) ||
      part.bytes < 1 ||
      part.bytes > CHUNK ||
      !/^[a-f0-9]{64}$/.test(part.sha256) ||
      (!part.external && !entries.has(part.path)) ||
      (part.external && !part.path.startsWith("assets/"))
    )
      throw new Error("Invalid archive part.");
    if (part.path.startsWith("assets/")) {
      if (part.path !== `assets/${part.sha256}.bin` || assetParts.has(part.sha256))
        throw new Error("Invalid or duplicate binary asset.");
      assetParts.set(part.sha256, part);
    } else if (!/^records\/\d{8}\.ndjson$/.test(part.path)) throw new Error("Invalid record chunk path.");
    total += part.bytes;
  }
  if (total !== manifest.totalBytes) throw new Error("Archive totals do not match.");
  async function checked(part) {
    signal?.throwIfAborted();
    const bytes = part.external
      ? await externalAsset(externalRoot, part.sha256)
      : await readEntry(entries.get(part.path), part.bytes, signal);
    if (bytes.length !== part.bytes || (await digest(bytes)) !== part.sha256)
      throw new Error("Archive SHA-256 integrity check failed.");
    return bytes;
  }
  // Check all assets, including unreferenced entries, without retaining their bytes.
  for (const part of assetParts.values()) await checked(part);
  let metadata;
  let partial = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const counts = {};
  const stores = Object.fromEntries(STORES.map((store) => [store, []]));
  async function accept(line) {
    const record = JSON.parse(line);
    if (
      !["metadata", ...STORES].includes(record.store) ||
      !record.value ||
      typeof record.value !== "object" ||
      Array.isArray(record.value)
    )
      throw new Error("Invalid archive record.");
    counts[record.store] = (counts[record.store] || 0) + 1;
    if (counts[record.store] > (manifest.counts[record.store] || 0))
      throw new Error("Archive record count exceeds the manifest.");
    if (verifyOnly) {
      const paths = new Set();
      for (const asset of record.assets || []) {
        if (
          !Array.isArray(asset.path) ||
          !asset.path.length ||
          asset.path.length > 64 ||
          !["base64", "utf8"].includes(asset.encoding) ||
          !Array.isArray(asset.parts)
        )
          throw new Error("Invalid archive asset reference.");
        const identity = JSON.stringify(asset.path);
        if (paths.has(identity)) throw new Error("Duplicate archive asset reference.");
        paths.add(identity);
        let size = 0;
        for (const part of asset.parts) {
          if (assetParts.get(part.sha256)?.bytes !== part.bytes)
            throw new Error("A required source asset is missing or invalid.");
          size += part.bytes;
          if (size > 150 * 1024 * 1024) throw new Error("Source asset exceeds the expanded document limit.");
        }
        let value = record.value;
        for (const key of asset.path) {
          if (!value || !Object.hasOwn(value, key)) throw new Error("Invalid archive asset path.");
          value = value[key];
        }
        if (value !== null) throw new Error("Invalid archive asset placeholder.");
      }
    }
    const value = verifyOnly
      ? record.value
      : await combineAssets(
          record,
          (hash) => {
            const part = assetParts.get(hash);
            if (!part) throw new Error("A required source asset is missing.");
            return checked(part);
          },
          { signal }
        );
    if (record.store === "metadata") {
      if (metadata) throw new Error("Duplicate archive metadata.");
      metadata = value;
    }
    if (onRecord && !verifyOnly) await onRecord({ store: record.store, value });
    else if (!verifyOnly && record.store !== "metadata") stores[record.store].push(value);
  }
  for (const chunk of manifest.chunks) {
    const text = partial + decoder.decode(await checked(chunk), { stream: true });
    let offset = 0;
    for (let end = text.indexOf("\n", offset); end !== -1; end = text.indexOf("\n", offset)) {
      if (end - offset > MAX_RECORD) throw new Error("Archive record exceeds its structural limit.");
      await accept(text.slice(offset, end));
      offset = end + 1;
    }
    partial = text.slice(offset);
    if (partial.length > MAX_RECORD) throw new Error("Archive record exceeds its structural limit.");
  }
  partial += decoder.decode();
  if (
    partial ||
    !metadata ||
    counts.metadata !== 1 ||
    Object.entries(manifest.counts).some(
      ([store, count]) => !Number.isSafeInteger(count) || count < 0 || (counts[store] || 0) !== count
    )
  )
    throw new Error("Incomplete archive record stream.");
  if (verifyOnly) return undefined;
  if (onRecord) return metadata;
  const included = Object.fromEntries(
    STORES.filter((store) => Object.hasOwn(manifest.counts, store)).map((store) => [store, stores[store]])
  );
  if (manifest.kind === "workspace") return { ...metadata, ...included };
  const { tmEntries, terms, ...records } = included;
  return {
    ...metadata,
    ...records,
    ...(tmEntries || terms ? { resources: { ...(tmEntries ? { tmEntries } : {}), ...(terms ? { terms } : {}) } } : {})
  };
}
