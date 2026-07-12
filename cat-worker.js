function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text) {
  return tokensFromNormalized(normalizeText(text));
}

function tokensFromNormalized(text) {
  return Array.from(new Set(String(text || "").split(" ").filter((token) => token.length > 2)));
}

function tokenOverlap(source, candidate) {
  return tokenOverlapTokens(tokens(source), tokens(candidate));
}

function tokenOverlapTokens(sourceTokens, candidateTokens) {
  const a = sourceTokens;
  const b = new Set(candidateTokens);
  if (!a.length || !b.size) return 0;
  return a.filter((token) => b.has(token)).length / Math.max(a.length, b.size);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function languagePairFromFields(sourceLang, targetLang) {
  const source = cleanText(sourceLang);
  const target = cleanText(targetLang);
  return source && target ? `${source}::${target}` : "";
}

function languagePairOf(entry = {}) {
  return cleanText(entry.languagePair) || languagePairFromFields(entry.sourceLang, entry.targetLang);
}

function memoryKey(entry = {}) {
  return [
    languagePairOf(entry),
    entry.tmName || "",
    normalizeText(entry.source),
    normalizeText(entry.target)
  ].join("::");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function similarity(source, candidate) {
  const a = normalizeText(source);
  const b = normalizeText(candidate);
  return similarityNormalized(a, b);
}

function similarityNormalized(a, b) {
  if (!a && !b) return 100;
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  return Math.max(0, Math.round((1 - levenshtein(a, b) / max) * 100));
}

function resourceNameSet(names, legacyName) {
  return new Set([...(Array.isArray(names) ? names : []), legacyName].map((name) => String(name || "").trim()).filter(Boolean));
}

function scoreTmEntries(entries, options = {}) {
  const { source, sourceLang, targetLang, tmName, tmNames, limit = 6 } = options || {};
  const sourceText = cleanText(source);
  const normalizedSource = normalizeText(sourceText);
  if (!normalizedSource) return [];
  const sourceTokens = tokensFromNormalized(normalizedSource);
  const languagePair = languagePairFromFields(sourceLang, targetLang);
  const allowedNames = resourceNameSet(tmNames, tmName);
  const byKey = new Map();
  (entries || []).forEach((entry) => {
    if (languagePair && languagePairOf(entry) !== languagePair) return;
    if (allowedNames.size && !allowedNames.has(entry.tmName)) return;
    const normalizedCandidate = normalizeText(entry.source);
    if (
      normalizedCandidate !== normalizedSource &&
      tokenOverlapTokens(sourceTokens, tokensFromNormalized(normalizedCandidate)) < 0.15
    ) return;
    const scored = { ...entry, score: similarityNormalized(normalizedSource, normalizedCandidate) };
    if (scored.score < 45) return;
    const key = [languagePairOf(entry), entry.tmName || "", normalizedCandidate, normalizeText(entry.target)].join("::");
    const existing = byKey.get(key);
    if (!existing || scored.score > existing.score || new Date(scored.updatedAt) > new Date(existing.updatedAt)) {
      byKey.set(key, scored);
    }
  });
  return Array.from(byKey.values())
    .sort((a, b) => b.score - a.score || new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, limit);
}

function numberList(text) {
  return (String(text || "").match(/\d+(?:[.,]\d+)?/g) || []).sort().join("|");
}

function endingPunctuation(text) {
  return (String(text || "").trim().match(/[.!?\u3002\uff01\uff1f\u2026]$/u) || [""])[0];
}

function containsTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  return ` ${normalizeText(text)} `.includes(` ${normalizedTerm} `);
}

function missingTags(segment) {
  const target = segment.target || "";
  const seen = new Map();
  return (segment.tags || []).filter((tag) => {
    const text = String(tag?.text || "");
    if (!text) return false;
    const used = seen.get(text) || 0;
    const occurrences = target.split(text).length - 1;
    seen.set(text, used + 1);
    return occurrences <= used;
  });
}

function tagDisplayText(tag) {
  return tag?.label || tag?.text || "";
}

function issue({ type, severity, segment, index, message, fixHint }) {
  return {
    id: `qa-${segment.id || index}-${type}`,
    severity,
    type,
    segmentId: segment.id,
    documentId: segment.documentId || "",
    label: `${index + 1}`,
    message,
    fixHint,
    createdAt: new Date().toISOString()
  };
}

function runQaChecks(segments, terms = []) {
  const checks = [];
  (segments || []).forEach((segment, index) => {
    const target = segment.target || "";
    if (!target.trim()) {
      checks.push(issue({
        type: "empty",
        severity: "error",
        segment,
        index,
        message: "Target is empty.",
        fixHint: "Translate this segment or copy the source if it must remain unchanged."
      }));
      return;
    }
    missingTags(segment).forEach((tag) => {
      checks.push(issue({
        type: "tag",
        severity: "error",
        segment,
        index,
        message: `Missing protected placeholder ${tagDisplayText(tag)}.`,
        fixHint: "Insert the missing protected placeholder into the target."
      }));
    });
    if (String(segment.source || "").trim() && String(segment.source || "").trim() === target.trim()) {
      checks.push(issue({
        type: "copy",
        severity: "warning",
        segment,
        index,
        message: "Target is identical to source.",
        fixHint: "Confirm this is intentional or translate the segment."
      }));
    }
    if (numberList(segment.source) !== numberList(target)) {
      checks.push(issue({
        type: "number",
        severity: "error",
        segment,
        index,
        message: "Numbers differ between source and target.",
        fixHint: "Check numeric values, dates, and measurements."
      }));
    }
    const sourceEnd = endingPunctuation(segment.source);
    const targetEnd = endingPunctuation(target);
    if (sourceEnd && targetEnd && sourceEnd !== targetEnd) {
      checks.push(issue({
        type: "punctuation",
        severity: "info",
        segment,
        index,
        message: "Ending punctuation differs.",
        fixHint: "Check whether punctuation should match the source."
      }));
    }
    (terms || []).forEach((term) => {
      const sourceHasTerm = containsTerm(segment.source, term.sourceTerm);
      if (!sourceHasTerm || !term.targetTerm) return;
      if (term.isForbidden && containsTerm(target, term.targetTerm)) {
        checks.push(issue({
          type: "forbidden-term",
          severity: "error",
          segment,
          index,
          message: `Forbidden term used: ${term.targetTerm}.`,
          fixHint: "Replace this with the approved wording or document a termbase exception before delivery."
        }));
        return;
      }
      if (!term.isForbidden && !containsTerm(target, term.targetTerm)) {
        checks.push(issue({
          type: "term",
          severity: "warning",
          segment,
          index,
          message: `Term may be missing: ${term.sourceTerm} -> ${term.targetTerm}.`,
          fixHint: "Use the approved term or update the termbase if this is a valid exception."
        }));
      }
    });
  });
  return checks;
}

self.addEventListener("message", (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type === "tm-match") {
      self.postMessage({ id, ok: true, result: scoreTmEntries(payload.entries, payload.options) });
      return;
    }
    if (type === "tm-match-batch") {
      const entriesById = new Map((Array.isArray(payload.entries) ? payload.entries : []).map((entry) => [entry.id, entry]));
      const candidateIds = Array.isArray(payload.candidateIds) ? payload.candidateIds : [];
      const options = Array.isArray(payload.options) ? payload.options : [];
      self.postMessage({
        id,
        ok: true,
        result: candidateIds.map((ids, index) => scoreTmEntries(
          (Array.isArray(ids) ? ids : []).map((entryId) => entriesById.get(entryId)).filter(Boolean),
          options[index] || {}
        ))
      });
      return;
    }
    if (type === "qa") {
      self.postMessage({ id, ok: true, result: runQaChecks(payload.segments, payload.terms) });
      return;
    }
    throw new Error(`Unknown worker request: ${type}`);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message || String(error) });
  }
});
