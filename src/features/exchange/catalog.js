// The signed envelope covers the exact UTF-8 payload bytes. Keys come only from a
// separately trusted source, never from a snapshot or a translation project.
export const CATALOG_LIMIT = 1024 * 1024;
export const PACK_LIMIT = 8 * 1024 * 1024;
export const OFFICIAL_CATALOG = Object.freeze({ source: null, key: null });
const idRx = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const versionRx = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*)?$/;
const hashRx = /^[a-f0-9]{64}$/;
const decoder = new TextDecoder("utf-8", { fatal: true });
const fail = (message) => {
  throw new Error(message);
};
function isText(v, length = 160) {
  return (
    typeof v === "string" &&
    v.trim().length > 0 &&
    v.length <= length &&
    !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v)
  );
}
function isId(v) {
  return isText(v, 96) && idRx.test(v);
}
function bytes64(s, limit) {
  if (
    typeof s !== "string" ||
    !s ||
    s.length > 4 * Math.ceil(limit / 3) ||
    s.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(s)
  )
    fail("Invalid catalog encoding.");
  const data = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  if (data.length > limit) fail("Catalog value exceeds its size limit.");
  return data;
}
export async function catalogHash(bytes) {
  if (!globalThis.crypto?.subtle) fail("Signature verification is unavailable in this edition.");
  return [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function readCatalogKey(input) {
  if (!input || !isId(input.catalogId)) fail("Invalid catalog trust file.");
  const key = bytes64(input.publicKey, 32);
  if (key.length !== 32) fail("Invalid catalog signing key.");
  return { catalogId: input.catalogId, publicKey: input.publicKey, fingerprint: await catalogHash(key) };
}
function release(entry) {
  if (
    !entry ||
    !isId(entry.id) ||
    !isText(entry.version, 64) ||
    !versionRx.test(entry.version) ||
    typeof entry.sha256 !== "string" ||
    !hashRx.test(entry.sha256) ||
    !Number.isSafeInteger(entry.bytes) ||
    entry.bytes < 1 ||
    entry.bytes > PACK_LIMIT
  )
    fail("Invalid catalog release identity or size.");
  const textFields = [
    "title",
    "task",
    "region",
    "domain",
    "edition",
    "sample",
    "maintainer",
    "rights",
    "testedApp",
    "reviewedVersion"
  ];
  for (const field of textFields)
    if (!isText(entry[field], field === "sample" ? 800 : 160)) fail("Catalog listing is incomplete.");
  if (
    !Array.isArray(entry.languages) ||
    entry.languages.length > 32 ||
    !entry.languages.every((x) => isText(x, 40)) ||
    typeof entry.offline !== "boolean"
  )
    fail("Invalid catalog compatibility information.");
  if (entry.reviewedVersion !== entry.version) fail("A review must identify this exact release.");
  // SHA-addressed relative paths only: signed entries never introduce a destination.
  return Object.freeze({
    id: entry.id,
    version: entry.version,
    sha256: entry.sha256,
    bytes: entry.bytes,
    ...Object.fromEntries(textFields.map((k) => [k, entry[k]])),
    languages: Object.freeze([...entry.languages]),
    offline: entry.offline
  });
}
export async function verifyCatalog(text, keyInput, prior = null, now = Date.now()) {
  if (typeof text !== "string" || text.length > CATALOG_LIMIT) fail("Catalog exceeds its size limit.");
  const envelope = JSON.parse(text);
  if (envelope?.format !== "loopcat-signed-index-v1") fail("Unsupported catalog format.");
  const key = await readCatalogKey(keyInput);
  const payloadBytes = bytes64(envelope.payload, 720 * 1024);
  const sig = bytes64(envelope.signature, 64);
  const pub = await crypto.subtle.importKey("raw", bytes64(key.publicKey, 32), "Ed25519", false, ["verify"]);
  if (sig.length !== 64 || !(await crypto.subtle.verify("Ed25519", pub, sig, payloadBytes)))
    fail("Catalog signature did not match the trusted publisher.");
  const p = JSON.parse(decoder.decode(payloadBytes));
  const hash = await catalogHash(payloadBytes);
  if (
    p?.format !== "loopcat-catalog-v1" ||
    p.catalogId !== key.catalogId ||
    !Number.isSafeInteger(p.sequence) ||
    p.sequence < 1
  )
    fail("Invalid catalog identity or revision.");
  const created = Date.parse(p.issuedAt),
    expires = Date.parse(p.expiresAt);
  if (
    !Number.isFinite(created) ||
    !Number.isFinite(expires) ||
    created > now + 300000 ||
    expires <= now ||
    expires <= created ||
    expires - created > 90 * 86400000
  )
    fail("Catalog metadata is expired or has an invalid validity period. Existing projects remain available.");
  if (
    prior &&
    (prior.fingerprint !== key.fingerprint ||
      prior.sequence > p.sequence ||
      (prior.sequence === p.sequence && prior.hash !== hash))
  )
    fail("Catalog rollback, key change, or conflicting revision refused.");
  if (
    !Array.isArray(p.releases) ||
    p.releases.length > 512 ||
    !Array.isArray(p.revoked) ||
    p.revoked.length > 1024 ||
    !p.revoked.every((x) => typeof x === "string" && hashRx.test(x))
  )
    fail("Invalid catalog contents.");
  const releases = p.releases.map(release);
  const seen = new Set();
  const versions = { ...(prior?.versions || {}) };
  for (const r of releases) {
    const k = `${r.id}@${r.version}`;
    if (seen.has(k) || (versions[k] && versions[k] !== r.sha256)) fail("Duplicate or republished catalog version.");
    seen.add(k);
    versions[k] = r.sha256;
  }
  const revoked = [...new Set([...(prior?.revoked || []), ...p.revoked])];
  if (Object.keys(versions).length > 8192 || revoked.length > 2048)
    fail("Catalog history exceeds the supported bound.");
  return {
    catalogId: p.catalogId,
    releases,
    expires,
    checkpoint: { sequence: p.sequence, hash, fingerprint: key.fingerprint, revoked, versions }
  };
}
export async function verifyCatalogArtifact(file, entry, snapshot, now = Date.now()) {
  const current = snapshot.releases.find((r) => r.id === entry.id && r.version === entry.version);
  if (
    !current ||
    current.sha256 !== entry.sha256 ||
    snapshot.expires <= now ||
    snapshot.checkpoint.revoked.includes(current.sha256)
  )
    fail("Release is unavailable, expired, or withdrawn.");
  if (
    !(file instanceof Blob) ||
    file.size !== current.bytes ||
    file.size > PACK_LIMIT ||
    (await catalogHash(await file.arrayBuffer())) !== current.sha256
  )
    fail("Pack checksum or size did not match the reviewed artifact.");
  return new File([file], `${current.id}-${current.version}.loopcat-pack.zip`, { type: "application/zip" });
}
function trustedSource(source) {
  const url = new URL(source);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith("/")
  )
    fail("Catalog source requires a trusted HTTPS directory.");
  return url;
}
export async function fetchCatalogFile(source, digest = null, fetchImpl = fetch, signal = undefined) {
  const base = trustedSource(source);
  if (digest !== null && (typeof digest !== "string" || !hashRx.test(digest))) fail("Invalid pack address.");
  const url = new URL(digest ? `packs/${digest}.loopcat-pack.zip` : "index.json", base);
  const limit = digest ? PACK_LIMIT : CATALOG_LIMIT;
  const response = await fetchImpl(url.href, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    signal
  });
  if (!response.ok || !response.body || response.redirected || Number(response.headers.get("content-length")) > limit)
    fail("Catalog download failed or exceeded its size limit.");
  const reader = response.body.getReader(),
    parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        fail("Catalog download exceeds its size limit.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(parts);
}
