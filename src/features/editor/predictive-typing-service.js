const MAX_CANDIDATES = 512;
const MAX_EXAMINED_CHARACTERS = 65_536;
const MAX_SUGGESTION_LENGTH = 160;

function localeLower(value, locale) {
  try {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase(locale || undefined);
  } catch {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase();
  }
}

function rankFor(kind) {
  return (
    { terminologyPreferred: 0, terminologyAdmitted: 1, contextExact: 2, exact: 3, normalizedExact: 4, fuzzy: 5 }[
      kind
    ] ?? 6
  );
}

function targetWordSpans(value, locale) {
  const text = String(value || "");
  if (!text) return [];
  try {
    const segmenter = new Intl.Segmenter(locale || undefined, { granularity: "word" });
    return Array.from(segmenter.segment(text))
      .filter((part) => part.isWordLike)
      .map((part) => ({ text: part.segment, start: part.index, end: part.index + part.segment.length }));
  } catch {
    const spans = [];
    const pattern = /[\p{L}\p{M}\p{N}_'-]+/gu;
    let match;
    while ((match = pattern.exec(text))) {
      spans.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    }
    return spans.length
      ? spans
      : Array.from(text, (grapheme, index) => ({ text: grapheme, start: index, end: index + grapheme.length }));
  }
}

function tmKind(match) {
  if (match.matchKind === "context-exact" || match.rawScore === 101) return "contextExact";
  if (match.matchKind === "exact" || match.rawScore === 100) return "exact";
  if (match.matchKind === "normalized-exact" || match.rawScore === 99) return "normalizedExact";
  return "fuzzy";
}

export function prepareCompletionCandidates({ tmMatches = [], termMatches = [], locale = "", usage = {} } = {}) {
  const byText = new Map();
  let examinedCharacters = 0;
  const compare = (a, b) =>
    rankFor(a.kind) - rankFor(b.kind) ||
    Number(b.score) - Number(a.score) ||
    Number(a.resourcePriority ?? 999) - Number(b.resourcePriority ?? 999) ||
    Number(b.usage) - Number(a.usage) ||
    a.text.length - b.text.length;
  function add(text, candidate) {
    const value = String(text || "").trim();
    if (!value || value.length > MAX_SUGGESTION_LENGTH || /<[^>]*>|\{\{?[^}]*\}?\}/u.test(value)) return;
    const key = localeLower(value, locale);
    const next = { ...candidate, text: value, normalizedText: key, usage: Number(usage[key]) || 0 };
    const current = byText.get(key);
    if (!current || compare(next, current) < 0) byText.set(key, next);
  }
  for (const term of termMatches) {
    if (term.isForbidden || term.status === "forbidden" || !term.targetTerm) continue;
    add(term.targetTerm, {
      kind: term.status === "admitted" ? "terminologyAdmitted" : "terminologyPreferred",
      resourceId: term.resourceId || "",
      resourceName: term.termBaseName || "",
      source: term.sourceTerm || "",
      score: 101,
      resourcePriority: Number(term.resourcePriority ?? term.priority ?? 999),
      preserveCase: true,
      why: `${term.status === "admitted" ? "Admitted" : "Preferred"} terminology for “${term.sourceTerm || "source term"}”`
    });
  }
  for (const match of tmMatches) {
    if (Number(match.effectiveScore ?? match.score) < 70) continue;
    const target = String(match.target || "");
    if (!target || examinedCharacters + target.length > MAX_EXAMINED_CHARACTERS) break;
    examinedCharacters += target.length;
    const words = targetWordSpans(target, locale);
    const kind = tmKind(match);
    for (let index = 0; index < words.length; index += 1) {
      for (let size = 1; size <= 3 && index + size <= words.length; size += 1) {
        add(target.slice(words[index].start, words[index + size - 1].end), {
          kind,
          resourceId: match.resourceId || "",
          resourceName: match.tmName || match.resourceName || "",
          source: match.source || "",
          score: Number(match.effectiveScore ?? match.score) || 0,
          resourcePriority: Number(match.resourcePriority ?? match.priority ?? 999),
          preserveCase: false,
          why: `${String(match.matchKind || "fuzzy").replaceAll("-", " ")} TM fragment at ${Number(match.effectiveScore ?? match.score) || 0}%`
        });
      }
    }
  }
  return Array.from(byText.values()).sort(compare).slice(0, MAX_CANDIDATES);
}

function graphemeSuffix(value, limit = 16) {
  const text = String(value || "");
  try {
    const graphemes = Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
      (item) => item.segment
    );
    return graphemes.slice(-limit).join("");
  } catch {
    return Array.from(text).slice(-limit).join("");
  }
}

export function caretPrefix(value, caret, _locale = "") {
  const before = String(value || "").slice(0, Math.max(0, Number(caret) || 0));
  const spaced = before.match(/[\p{L}\p{M}\p{N}_'-]+(?:\s+[\p{L}\p{M}\p{N}_'-]+){0,2}$/u)?.[0] || "";
  if (spaced) return { text: spaced, start: before.length - spaced.length, end: before.length };
  const suffix = graphemeSuffix(before).match(/[^\s.,;:!?()[\]{}<>]+$/u)?.[0] || "";
  return { text: suffix, start: before.length - suffix.length, end: before.length };
}

function adaptCase(candidate, prefix, locale) {
  if (candidate.preserveCase) return candidate.text;
  const letters = Array.from(prefix).filter((char) => /\p{L}/u.test(char));
  if (letters.length > 1 && prefix === prefix.toLocaleUpperCase(locale || undefined))
    return candidate.text.toLocaleUpperCase(locale || undefined);
  const first = Array.from(prefix)[0] || "";
  if (
    first &&
    first === first.toLocaleUpperCase(locale || undefined) &&
    first !== first.toLocaleLowerCase(locale || undefined)
  ) {
    const graphemes = Array.from(candidate.text);
    return `${(graphemes.shift() || "").toLocaleUpperCase(locale || undefined)}${graphemes.join("")}`;
  }
  return candidate.text;
}

export function completePrefix({
  prefix = "",
  caretContext = { resourceSignature: "" },
  resourceSignature = "",
  candidates = [],
  locale = "",
  limit = 6
} = {}) {
  if (!prefix || caretContext.resourceSignature !== resourceSignature) return [];
  const normalizedPrefix = localeLower(prefix, locale);
  return candidates
    .filter(
      (candidate) =>
        candidate.normalizedText.startsWith(normalizedPrefix) && candidate.normalizedText !== normalizedPrefix
    )
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 6)))
    .map((candidate) => ({ ...candidate, insertion: adaptCase(candidate, prefix, locale) }));
}

export const PREDICTIVE_TYPING_LIMITS = Object.freeze({
  maxCandidates: MAX_CANDIDATES,
  maxExaminedCharacters: MAX_EXAMINED_CHARACTERS,
  maxSuggestionLength: MAX_SUGGESTION_LENGTH
});
