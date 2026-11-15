// The evaluator only interprets fixed predicates. Author strings never become regular expressions.
const word = /[\p{L}\p{N}\p{M}\p{Pc}]/u;
function normalized(value, locale, sensitive) {
  const n = String(value ?? "").normalize("NFC");
  return sensitive ? n : n.toLocaleLowerCase(locale || "und").normalize("NFC");
}

export function containsForm(value, form, locale, sensitive = false) {
  const text = normalized(value, locale, sensitive);
  const needle = normalized(form, locale, sensitive);
  return containsNormalized(text, needle);
}
function containsNormalized(text, needle) {
  if (!needle) return false;
  for (let from = 0; from < text.length;) {
    const at = text.indexOf(needle, from);
    if (at < 0) return false;
    const end = at + needle.length;
    // Read actual code points at boundaries (including supplementary-plane scripts).
    const before = /.$/su.exec(text.slice(Math.max(0, at - 2), at))?.[0] || "";
    const after = String.fromCodePoint(text.codePointAt(end) ?? 0);
    const first = String.fromCodePoint(needle.codePointAt(0));
    const last = /.$/su.exec(needle)?.[0] || "";
    if ((!word.test(first) || !word.test(before)) && (!word.test(last) || !word.test(after))) return true;
    from = at + 1;
  }
  return false;
}

function langMatches(declared, actual) {
  if (!declared) return true;
  if (!actual) return false;
  const expected = declared.toLowerCase(),
    provided = actual.toLowerCase();
  return provided === expected || provided.startsWith(expected + "-");
}

export function matchPackLanguages(pack, context = {}) {
  return (
    langMatches(pack.languages?.source, context.sourceLang) && langMatches(pack.languages?.target, context.targetLang)
  );
}

export function ruleFlags(rule, segment, context = {}) {
  // Empty targets are a separate native CAT issue, not a translation using a wrong term.
  if (!segment.target?.trim()) return false;
  const containsTarget = rule.targets.some((form) =>
    containsForm(segment.target, form, context.targetLang, rule.caseSensitive)
  );
  if (rule.op === "target-contains") return containsTarget;
  if (rule.op === "target-missing-if-source")
    return containsForm(segment.source, rule.source, context.sourceLang, rule.caseSensitive) && !containsTarget;
  throw new Error("Unsupported pack rule.");
}

function owner(record) {
  return record.pack || record;
}
// Hold only the currently viewed project's active dictionaries; IndexedDB
// records (and their indexes) are not recloned on every segment selection.
export function createTermSnapshotCache(repo) {
  let cache = null;
  function clear() {
    cache?.snapshot.signal.removeEventListener("abort", clear);
    cache = null;
  }
  async function read(key) {
    const last = cache;
    if (last?.key === key && !last.snapshot.signal.aborted && (await repo.isCurrent(key, last.snapshot.generation)))
      return { ...last.snapshot, records: last.snapshot.records.filter((r) => repo.isUsable(r)) };
    const snapshot = await repo.snapshot(key, "terminology");
    if (!snapshot.signal.aborted) {
      clear();
      cache = { key, snapshot };
      snapshot.signal.addEventListener("abort", clear, { once: true });
    }
    return snapshot;
  }
  return { read, clear };
}
const indexes = new WeakMap();
const firstWord = /[\p{L}\p{N}\p{M}\p{Pc}]+/u;
function termIndex(pack, locale) {
  const existing = indexes.get(pack);
  if (existing?.locale === locale) return existing;
  const insensitive = new Map(),
    sensitive = new Map(),
    fallback = [];
  for (const [i, entry] of pack.entries.entries()) {
    const literal = normalized(entry.sourceTerm, locale, entry.caseSensitive),
      token = firstWord.exec(literal)?.[0];
    const row = { i, entry, literal };
    if (!token) {
      fallback.push(row);
      continue;
    }
    const index = entry.caseSensitive ? sensitive : insensitive;
    if (!index.has(token)) index.set(token, []);
    index.get(token).push(row);
  }
  const result = { locale, sensitive, insensitive, fallback };
  indexes.set(pack, result);
  return result;
}
export function findPackTerms(packs, segment, context = {}) {
  const source = typeof segment === "string" ? segment : segment?.source;
  if (!source) return [];
  const result = [];
  const exact = normalized(source, context.sourceLang, true),
    folded = normalized(source, context.sourceLang, false);
  const words = (t) => new Set(t.match(/[\p{L}\p{N}\p{M}\p{Pc}]+/gu) || []);
  const exactWords = words(exact),
    foldedWords = words(folded);
  for (const record of packs) {
    const pack = owner(record);
    if (pack.kind !== "terminology" || !matchPackLanguages(pack, context)) continue;
    const index = termIndex(pack, context.sourceLang);
    const candidates = [...index.fallback];
    for (const [tokens, map] of [
      [exactWords, index.sensitive],
      [foldedWords, index.insensitive]
    ]) {
      for (const token of tokens) for (const row of map.get(token) || []) candidates.push(row);
    }
    for (const { i, entry, literal } of candidates.sort((a, b) => a.i - b.i)) {
      if (!containsNormalized(entry.caseSensitive ? exact : folded, literal)) continue;
      result.push({
        ...entry,
        id: `exchange:${pack.id}:${pack.version}:${i}`,
        packId: pack.id,
        packVersion: pack.version,
        packDigest: record.digest || "",
        termBaseName: pack.name,
        sourceLang: context.sourceLang,
        targetLang: context.targetLang,
        readOnly: true,
        allowTermCopy: pack.allowTermCopy === true,
        isForbidden: entry.status === "forbidden"
      });
    }
  }
  return result;
}
export const MAX_QA_FINDINGS = 10000;
export function runPackQa(packs, segments, context = {}) {
  const limit = Math.min(
    MAX_QA_FINDINGS,
    Math.max(0, Number.isSafeInteger(context.remaining) ? context.remaining : MAX_QA_FINDINGS)
  );
  const result = [];
  for (const record of packs) {
    const pack = owner(record);
    if (pack.kind !== "qa" || !matchPackLanguages(pack, context)) continue;
    for (const [i, segment] of segments.entries()) {
      context.signal?.throwIfAborted();
      for (const rule of pack.entries) {
        if (!ruleFlags(rule, segment, context)) continue;
        if (result.length >= limit) throw Error("Exchange QA finding limit reached. Run on a smaller selection.");
        result.push({
          id: `exchange:${pack.id}:${rule.id}:${segment.id ?? i}`,
          type: "exchange",
          severity: "warning",
          advisory: true,
          ruleId: rule.id,
          packId: pack.id,
          packVersion: pack.version,
          packDigest: record.digest || "",
          segmentId: segment.id,
          documentId: segment.documentId || "",
          label: String(i + 1),
          message: rule.message,
          fixHint: "",
          messageValues: {},
          fixHintValues: {}
        });
      }
    }
  }
  return result;
}
