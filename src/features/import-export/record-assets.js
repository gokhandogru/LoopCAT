const PART_BYTES = 4 * 1024 * 1024;
const ASSET_THRESHOLD = 256 * 1024;
const encoder = new TextEncoder();
export async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function externalAsset(root, hash, bytes = undefined) {
  if (!root || !/^[a-f0-9]{64}$/.test(hash))
    throw new Error("Open this recovery generation through its workspace folder to resolve source assets.");
  const base = await root.getDirectoryHandle("loopcat-v2", { create: Boolean(bytes) });
  const directory = await base.getDirectoryHandle("assets", { create: Boolean(bytes) });
  let handle;
  try {
    handle = await directory.getFileHandle(`${hash}.bin`);
  } catch (error) {
    if (error.name !== "NotFoundError" || !bytes) throw error;
    handle = await directory.getFileHandle(`${hash}.bin`, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(bytes);
      await writable.close();
    } catch (failure) {
      await writable.abort?.().catch(() => {});
      throw failure;
    }
  }
  const file = await handle.getFile();
  if (file.size > PART_BYTES) throw new Error("Workspace asset exceeds its size limit.");
  const checked = new Uint8Array(await file.arrayBuffer());
  if ((await digest(checked)) !== hash)
    throw new Error("Workspace source asset integrity check failed. Existing generations were preserved.");
  return checked;
}

// Assets have explicit paths outside the user's JSON. User content can therefore
// contain any object keys without being mistaken for an internal reference.
export async function separateAssets(input, savePart, signal) {
  const assets = [];
  async function visit(value, path) {
    signal?.throwIfAborted();
    if (path.length > 64) throw new Error("Record nesting exceeds the supported limit.");
    if (typeof value === "string" && value.length >= ASSET_THRESHOLD) {
      let binary = /base64$/i.test(String(path.at(-1))) && value.length % 4 === 0;
      if (binary)
        for (let start = 0; start < value.length; start += 65536) {
          const part = value.slice(start, start + 65536);
          if (!(start + 65536 >= value.length ? /^[A-Za-z0-9+/]*={0,2}$/ : /^[A-Za-z0-9+/]*$/).test(part)) {
            binary = false;
            break;
          }
        }
      const parts = [];
      // Base64 groups are multiples of four; UTF-16 chunks never split a surrogate pair.
      const stride = binary ? Math.floor(PART_BYTES / 3) * 4 : Math.floor(PART_BYTES / 4);
      for (let start = 0; start < value.length;) {
        let end = Math.min(start + stride, value.length);
        if (!binary && end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
        const text = value.slice(start, end);
        const bytes = binary
          ? Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
          : encoder.encode(text);
        const hash = await digest(bytes);
        await savePart(hash, bytes);
        parts.push({ sha256: hash, bytes: bytes.length });
        start = end;
      }
      assets.push({ path, encoding: binary ? "base64" : "utf8", parts });
      return null;
    }
    if (Array.isArray(value)) {
      const result = [];
      for (let index = 0; index < value.length; index++) result.push(await visit(value[index], [...path, index]));
      return result;
    }
    if (value && typeof value === "object") {
      const result = {};
      for (const [key, item] of Object.entries(value)) {
        if (item !== undefined)
          Object.defineProperty(result, key, {
            value: await visit(item, [...path, key]),
            enumerable: true,
            writable: true,
            configurable: true
          });
      }
      return result;
    }
    return value;
  }
  return { value: await visit(input, []), assets };
}

export async function combineAssets(record, readPart, { signal = undefined, maxAssetBytes = 150 * 1024 * 1024 } = {}) {
  const value = record.value;
  const paths = new Set();
  for (const asset of record.assets || []) {
    if (
      !Array.isArray(asset.path) ||
      asset.path.length > 64 ||
      !["base64", "utf8"].includes(asset.encoding) ||
      !Array.isArray(asset.parts) ||
      asset.parts.length > 100000
    )
      throw new Error("Invalid asset descriptor.");
    const identity = JSON.stringify(asset.path);
    if (paths.has(identity)) throw new Error("Duplicate asset reference.");
    paths.add(identity);
    let total = 0;
    const parts = [];
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (const part of asset.parts) {
      signal?.throwIfAborted();
      if (
        !/^[a-f0-9]{64}$/.test(part.sha256) ||
        !Number.isSafeInteger(part.bytes) ||
        part.bytes < 0 ||
        part.bytes > PART_BYTES
      )
        throw new Error("Invalid asset part.");
      total += part.bytes;
      if (total > maxAssetBytes) throw new Error("Source asset exceeds the expanded document limit.");
      const bytes = await readPart(part.sha256);
      if (bytes.length !== part.bytes || (await digest(bytes)) !== part.sha256)
        throw new Error("Source asset integrity check failed.");
      if (asset.encoding === "base64") {
        let text = "";
        for (let offset = 0; offset < bytes.length; offset += 32768)
          text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        parts.push(btoa(text));
      } else parts.push(decoder.decode(bytes, { stream: true }));
    }
    if (asset.encoding === "utf8") parts.push(decoder.decode());
    let parent = value;
    for (const key of asset.path.slice(0, -1)) {
      if (!parent || !Object.hasOwn(parent, key)) throw new Error("Asset reference points outside its record.");
      parent = parent[key];
    }
    const key = asset.path.at(-1);
    if (!asset.path.length || !parent || !Object.hasOwn(parent, key) || parent[key] !== null)
      throw new Error("Invalid asset placeholder.");
    Object.defineProperty(parent, key, { value: parts.join(""), enumerable: true, writable: true, configurable: true });
  }
  return value;
}
