import { BlobReader, ZipReader, configure } from "@zip.js/zip.js";
import { readRecordPackage } from "./archive-record-package.js";
export { writeRecordPackage as writePackage } from "./archive-record-package.js";

configure({ useWebWorkers: false, chunkSize: 64 * 1024 });
export const DOCUMENT_LIMIT = 150 * 1024 * 1024;
export const CHUNK_BYTES = 4 * 1024 * 1024;
export const BACKUP_LIMIT = 32 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 100000;
const MANIFEST_LIMIT = 16 * 1024 * 1024;

export function safeEntryName(name) {
  if (typeof name !== "string" || name.length > 1024 || /[\\\x00-\x1f:]/.test(name) || name.startsWith("/"))
    throw new Error("Unsafe archive entry path.");
  const parts = name.replace(/\/$/, "").split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error("Unsafe archive entry path.");
  return name;
}

export async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function boundedEntry(entry, remaining, signal) {
  if (entry.encrypted || entry.uncompressedSize > remaining || !Number.isSafeInteger(entry.uncompressedSize))
    throw new Error("Archive entry exceeds the expanded size limit or uses unsupported encryption.");
  let size = 0;
  const chunks = [];
  await entry.getData(
    new WritableStream({
      write(chunk) {
        signal?.throwIfAborted();
        size += chunk.byteLength;
        if (size > remaining || size > entry.uncompressedSize)
          throw new Error("Archive expanded beyond its declared size or limit.");
        chunks.push(chunk.slice());
      }
    }),
    { checkSignature: true, signal }
  );
  if (size !== entry.uncompressedSize) throw new Error("Archive entry has an unexpected expanded size.");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function readEntries(
  input,
  { maxBytes = DOCUMENT_LIMIT, maxEntries = MAX_ENTRIES, signal = undefined } = {}
) {
  const reader = new ZipReader(new BlobReader(input instanceof Blob ? input : new Blob([input])));
  const result = new Map();
  let total = 0;
  let count = 0;
  try {
    for await (const entry of reader.getEntriesGenerator()) {
      signal?.throwIfAborted();
      const name = safeEntryName(entry.filename);
      if (++count > maxEntries) throw new Error("Archive contains too many entries.");
      if (result.has(name)) throw new Error("Duplicate archive entry path.");
      const data = await boundedEntry(entry, maxBytes - total, signal);
      total += data.byteLength;
      result.set(name, { name, data });
    }
    return result;
  } finally {
    await reader.close();
  }
}

export async function readPackage(
  input,
  {
    signal = undefined,
    maxBytes = BACKUP_LIMIT,
    verifyOnly = false,
    onRecord = undefined,
    externalRoot = undefined
  } = {}
) {
  const reader = new ZipReader(new BlobReader(input));
  try {
    const entries = new Map();
    let declaredTotal = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      safeEntryName(entry.filename);
      if (entries.size >= MAX_ENTRIES || entries.has(entry.filename))
        throw new Error("Too many or duplicate archive entries.");
      declaredTotal += entry.uncompressedSize;
      if (!Number.isSafeInteger(declaredTotal) || declaredTotal > maxBytes + MANIFEST_LIMIT)
        throw new Error("Archive expanded size exceeds its limit.");
      entries.set(entry.filename, entry);
    }
    const manifestEntry = entries.get("manifest.json");
    if (!manifestEntry) throw new Error("LoopCAT archive manifest is missing.");
    const manifestBytes = await boundedEntry(manifestEntry, MANIFEST_LIMIT, signal);
    const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
    if (manifest.format !== "LoopCAT archive" || manifest.version !== 1)
      throw new Error("Unsupported LoopCAT archive version. Update LoopCAT before importing.");
    if (manifest.encoding === "records-v1") {
      if (
        !Array.isArray(manifest.chunks) ||
        !Number.isSafeInteger(manifest.totalBytes) ||
        manifest.totalBytes < 0 ||
        manifest.totalBytes > maxBytes
      )
        throw new Error("Invalid archive manifest totals.");
      const value = await readRecordPackage(manifest, entries, boundedEntry, {
        signal,
        verifyOnly,
        onRecord,
        externalRoot
      });
      return { value, manifest, digest: await sha256(manifestBytes), verified: true };
    }
    throw new Error("Unsupported archive record encoding.");
  } finally {
    await reader.close();
  }
}
