import { ruleFlags } from "./evaluator.js";
import { validateWorkflowEntries } from "./workflow-packs.js";

export const PACK_LIMITS = Object.freeze({
  bytes: 8 * 1024 * 1024,
  expanded: 32 * 1024 * 1024,
  files: 64,
  terms: 10000,
  rules: 100
});
const keys = Object.keys;
const kinds = ["terminology", "qa", "lesson", "client", "ai"];
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const secret =
  /(?:\b(?:sk-|gh[pousr]_|github_pat_|npm_)[A-Za-z0-9_-]{8,}|\bBearer\s+[A-Za-z\d._~+/=-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;
function fail(reason) {
  throw new Error("Invalid LoopCAT pack: " + reason);
}
function fields(obj, allowed) {
  if (
    !obj ||
    (Object.getPrototypeOf(obj) !== Object.prototype && Object.getPrototypeOf(obj) !== null) ||
    keys(obj).some((k) => !allowed.includes(k))
  )
    fail("unexpected fields or object shape.");
}
function str(v, max = 128) {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v) ||
    secret.test(v)
  )
    fail("empty, oversized, or unsafe text.");
  return v.trim().normalize("NFC");
}
function id(v) {
  if (typeof v !== "string" || v.length > 96 || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(v))
    fail("invalid pack ID.");
  return v;
}
function version(v) {
  if (
    typeof v !== "string" ||
    v.length > 64 ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/.test(v)
  )
    fail("invalid pack version.");
  return v;
}
function lang(v) {
  const value = str(v, 48);
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return fail("invalid language tag.");
  }
}
function array(v, max) {
  if (!Array.isArray(v) || !v.length || v.length > max) fail("invalid entry count.");
  return v;
}
function bool(v, fallback = false) {
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") fail("invalid boolean.");
  return v;
}
function term(t) {
  fields(t, ["sourceTerm", "targetTerm", "status", "caseSensitive", "conceptId", "attribution", "domain"]);
  if (t.status !== undefined && !["preferred", "admitted", "forbidden"].includes(t.status))
    fail("invalid term status.");
  return {
    sourceTerm: str(t.sourceTerm, 256),
    targetTerm: str(t.targetTerm, 256),
    status: t.status || "preferred",
    caseSensitive: bool(t.caseSensitive),
    ...(t.conceptId ? { conceptId: str(t.conceptId, 96) } : {}),
    ...(t.attribution ? { attribution: str(t.attribution, 512) } : {}),
    ...(t.domain ? { domain: str(t.domain, 128) } : {})
  };
}
function qaRule(r, languages) {
  fields(r, ["id", "op", "source", "targets", "caseSensitive", "severity", "message", "examples"]);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(str(r.id, 64))) fail("invalid rule ID.");
  if (!["target-missing-if-source", "target-contains"].includes(r.op)) fail("unsupported QA operator.");
  if (r.severity !== undefined && r.severity !== "warning") fail("pack QA is advisory only.");
  if (r.op === "target-contains" && r.source !== undefined) fail("unexpected source condition.");
  const rule = {
    id: r.id,
    op: r.op,
    ...(r.op === "target-missing-if-source" ? { source: str(r.source, 256) } : {}),
    targets: array(r.targets, 32).map((v) => str(v, 256)),
    caseSensitive: bool(r.caseSensitive),
    severity: "warning",
    message: str(r.message, 256),
    examples: array(r.examples, 16).map((v) => {
      fields(v, ["source", "target", "expect"]);
      if (!["pass", "fail"].includes(v.expect)) fail("invalid example expectation.");
      return { source: str(v.source, 1024), target: str(v.target, 1024), expect: v.expect };
    })
  };
  if (new Set(rule.examples.map((e) => e.expect)).size !== 2)
    fail("each QA rule needs both passing and failing examples.");
  for (const example of rule.examples) {
    if (
      ruleFlags(rule, example, { sourceLang: languages.source, targetLang: languages.target }) !==
      (example.expect === "fail")
    )
      fail("QA example did not produce its expected result.");
  }
  return rule;
}
export function validatePack(input) {
  fields(input, [
    "format",
    "schemaVersion",
    "id",
    "version",
    "kind",
    "name",
    "publisher",
    "license",
    "description",
    "attribution",
    "allowTermCopy",
    "languages",
    "entries"
  ]);
  if (input.format !== "loopcat-pack" || input.schemaVersion !== 1 || !kinds.includes(input.kind))
    fail("unsupported schema or kind.");
  if (input.kind !== "terminology" && input.allowTermCopy !== undefined)
    fail("allowTermCopy is only valid for terminology.");
  const raw = input.languages === undefined ? {} : input.languages;
  fields(raw, ["source", "target"]);
  const languages = {
    ...(raw.source === undefined ? {} : { source: lang(raw.source) }),
    ...(raw.target === undefined ? {} : { target: lang(raw.target) })
  };
  const pack = {
    format: "loopcat-pack",
    schemaVersion: 1,
    id: id(input.id),
    version: version(input.version),
    kind: input.kind,
    name: str(input.name),
    publisher: str(input.publisher),
    license: str(input.license, 128),
    ...(input.description === undefined ? {} : { description: str(input.description, 1024) }),
    ...(input.attribution === undefined ? {} : { attribution: str(input.attribution, 512) }),
    ...(input.kind === "terminology" && input.allowTermCopy !== undefined
      ? { allowTermCopy: bool(input.allowTermCopy) }
      : {}),
    languages,
    entries:
      input.kind === "terminology"
        ? array(input.entries, PACK_LIMITS.terms).map(term)
        : input.kind === "qa"
          ? array(input.entries, PACK_LIMITS.rules).map((r) => qaRule(r, languages))
          : validateWorkflowEntries(input.kind, input.entries)
  };
  if (pack.kind === "qa" && new Set(pack.entries.map((r) => r.id)).size !== pack.entries.length)
    fail("duplicate rule ID.");
  if (encoder.encode(JSON.stringify(pack)).byteLength > PACK_LIMITS.expanded) fail("size limit.");
  return pack;
}
export function validateRequirement(value) {
  fields(value, ["id", "version", "digest", "required", "kind", "priority"]);
  if (
    typeof value.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.digest) ||
    (value.kind !== undefined && !kinds.includes(value.kind)) ||
    (value.priority !== undefined && (!Number.isInteger(value.priority) || value.priority < 0 || value.priority > 100))
  )
    fail("invalid pack reference.");
  return {
    id: id(value.id),
    version: version(value.version),
    digest: value.digest,
    required: bool(value.required),
    ...(value.kind ? { kind: value.kind } : {}),
    ...(value.priority === undefined ? {} : { priority: value.priority })
  };
}
export function packRequirement(pack, digest, required = false) {
  return validateRequirement({ id: pack.id, version: pack.version, kind: pack.kind, digest, required });
}
export async function encodePack(input) {
  const { entries, ...manifest } = validatePack(input);
  const { ZipWriter, BlobWriter, TextReader } = await import("@zip.js/zip.js");
  const zip = new ZipWriter(new BlobWriter("application/zip"), {
    level: 0,
    useWebWorkers: false,
    zip64: false,
    bufferedWrite: true,
    extendedTimestamp: false,
    dataDescriptor: false,
    lastModDate: new Date(2000, 0, 1, 0, 0, 0)
  });
  await zip.add("manifest.json", new TextReader(JSON.stringify(manifest)));
  await zip.add("entries.json", new TextReader(JSON.stringify(entries)));
  const blob = await zip.close();
  if (blob.size > PACK_LIMITS.bytes) fail("ZIP exceeds 8 MiB.");
  return blob;
}
export async function fingerprintPack(blob) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > PACK_LIMITS.bytes) fail("ZIP exceeds 8 MiB or is empty.");
  const bytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
}
// Pack v1 is a narrow ZIP profile. Check both names, local ranges, types and sizes
// before our bounded ZIP reader inflates anything; no preamble, trailing payload,
// ZIP64, symlinks, encryption, concealed local entries, or alternate path encodings.
function checkEnvelope(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = bytes.length,
    end = size - 22;
  const u16 = (n) => v.getUint16(n, true),
    u32 = (n) => v.getUint32(n, true);
  const reject = () => fail("unsafe or malformed pack ZIP.");
  if (end < 0 || u32(end) !== 0x06054b50 || u16(end + 4) !== 0 || u16(end + 6) !== 0 || u16(end + 20) !== 0) reject();
  const count = u16(end + 10);
  if (count !== 2 || u16(end + 8) !== count) fail("expected only manifest.json and entries.json.");
  const start = u32(end + 16);
  if (start + u32(end + 12) !== end) reject();
  const seen = new Set(),
    spans = [];
  let pos = start,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || u32(pos) !== 0x02014b50) reject();
    const nameLen = u16(pos + 28),
      extra = u16(pos + 30),
      comment = u16(pos + 32),
      local = u32(pos + 42);
    if (pos + 46 + nameLen + extra + comment > end || local + 30 > start || u32(local) !== 0x04034b50) reject();
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    if (!["manifest.json", "entries.json"].includes(name) || seen.has(name))
      fail("expected only manifest.json and entries.json.");
    seen.add(name);
    const flags = u16(pos + 8),
      method = u16(pos + 10),
      treeMode = u32(pos + 38) >>> 28;
    if (
      flags & ~0x080e ||
      ![0, 8].includes(method) ||
      u16(pos + 34) !== 0 ||
      (treeMode !== 0 && treeMode !== 8) ||
      u32(pos + 38) & 0x10
    )
      reject();
    if (u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 26) !== nameLen) reject();
    const localExtra = u16(local + 28);
    if (
      local + 30 + nameLen + localExtra > start ||
      decoder.decode(bytes.subarray(local + 30, local + 30 + nameLen)) !== name
    )
      reject();
    for (const [at, length] of [
      [pos + 46 + nameLen, extra],
      [local + 30 + nameLen, localExtra]
    ]) {
      let p = at;
      while (p < at + length) {
        if (p + 4 > at + length || [1, 0x7075, 0x9901].includes(u16(p))) reject();
        p += 4 + u16(p + 2);
      }
      if (p !== at + length) reject();
    }
    const compressed = u32(pos + 20),
      expanded = u32(pos + 24);
    total += expanded;
    if (total > PACK_LIMITS.expanded || (name === "manifest.json" && expanded > 16384)) fail("expanded size limit.");
    let stop = local + 30 + nameLen + localExtra + compressed;
    if (stop > start) reject();
    if (flags & 8) {
      if (stop + 12 > start) reject();
      if (u32(stop) === 0x08074b50) stop += 4;
      if (
        stop + 12 > start ||
        u32(stop) !== u32(pos + 16) ||
        u32(stop + 4) !== compressed ||
        u32(stop + 8) !== expanded
      )
        reject();
      stop += 12;
    } else if (u32(local + 14) !== u32(pos + 16) || u32(local + 18) !== compressed || u32(local + 22) !== expanded)
      reject();
    spans.push([local, stop]);
    pos += 46 + nameLen + extra + comment;
  }
  spans.sort((a, b) => a[0] - b[0]);
  if (pos !== end || spans[0][0] !== 0 || spans[1][0] !== spans[0][1] || spans[1][1] !== start) reject();
}
export async function decodePack(blob, options = {}) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > PACK_LIMITS.bytes) fail("ZIP exceeds 8 MiB or is empty.");
  checkEnvelope(new Uint8Array(await blob.arrayBuffer()));
  const { readEntries } = await import("../import-export/archive-adapter.js");
  const files = await readEntries(blob, {
    maxBytes: PACK_LIMITS.expanded,
    maxEntries: PACK_LIMITS.files,
    signal: options.signal
  });
  if (files.size !== 2 || !files.has("manifest.json") || !files.has("entries.json"))
    fail("expected only manifest.json and entries.json.");
  if (files.get("manifest.json").data.byteLength > 16384) fail("oversized manifest.");
  const manifest = JSON.parse(decoder.decode(files.get("manifest.json").data));
  fields(manifest, [
    "format",
    "schemaVersion",
    "id",
    "version",
    "kind",
    "name",
    "publisher",
    "license",
    "description",
    "attribution",
    "allowTermCopy",
    "languages"
  ]);
  const entries = JSON.parse(decoder.decode(files.get("entries.json").data));
  const pack = validatePack({ ...manifest, entries });
  return { pack, digest: await fingerprintPack(blob), blob };
}
