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
    entry.resourceId || entry.tmName || "",
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

function orderedTokenSimilarity(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  let cursor = 0;
  let count = 0;
  for (const token of aTokens) {
    const index = bTokens.indexOf(token, cursor);
    if (index < 0) continue;
    count += 1;
    cursor = index + 1;
  }
  return count / Math.max(aTokens.length, bTokens.length);
}

function contextMatches(entry, context = {}) {
  const previous = normalizeText(context.previousSource || "");
  const next = normalizeText(context.nextSource || "");
  const documentKey = cleanText(context.documentKey);
  const previousMatch = previous && previous === normalizeText(entry.previousSource || "");
  const nextMatch = next && next === normalizeText(entry.nextSource || "");
  return Boolean(documentKey && documentKey === cleanText(entry.documentKey) || previousMatch && nextMatch || previousMatch && !next || nextMatch && !previous);
}

function scoreTmEntries(entries, options = {}) {
  const { source, sourceLang, targetLang, tmName, tmNames, limit = 6, context = {} } = options || {};
  if (
    Object.prototype.hasOwnProperty.call(options, "resourceLinks") &&
    !(options.resourceLinks || []).some((link) => link?.type === "tm" && link.lookup !== false)
  ) return [];
  const sourceText = cleanText(source);
  const normalizedSource = normalizeText(sourceText);
  if (!normalizedSource) return [];
  const sourceTokens = tokensFromNormalized(normalizedSource);
  const languagePair = languagePairFromFields(sourceLang, targetLang);
  const allowedNames = resourceNameSet(tmNames, tmName);
  const links = new Map((options.resourceLinks || []).filter((link) => link?.type === "tm" && link.lookup !== false).map((link, index) => [link.resourceId || link.name, { ...link, priority: Number(link.priority) || index, penalty: Math.max(0, Math.min(30, Number(link.penalty) || 0)) }]));
  const byKey = new Map();
  (entries || []).forEach((entry) => {
    if (languagePair && languagePairOf(entry) !== languagePair) return;
    const link = links.get(entry.resourceId || entry.tmName);
    if (links.size && !link) return;
    if (!links.size && allowedNames.size && !allowedNames.has(entry.tmName)) return;
    const normalizedCandidate = normalizeText(entry.source);
    const candidateTokens = tokensFromNormalized(normalizedCandidate);
    const overlapRatio = tokenOverlapTokens(sourceTokens, candidateTokens);
    const characterScore = similarityNormalized(normalizedSource, normalizedCandidate);
    if (
      normalizedCandidate !== normalizedSource &&
      overlapRatio < 0.15 &&
      characterScore < 45
    ) return;
    const overlapScore = Math.round(overlapRatio * 100);
    const orderScore = Math.round(orderedTokenSimilarity(sourceTokens, candidateTokens) * 100);
    let rawScore;
    let matchKind;
    if (sourceText === cleanText(entry.source) && contextMatches(entry, context)) { rawScore = 101; matchKind = "context-exact"; }
    else if (sourceText === cleanText(entry.source)) { rawScore = 100; matchKind = "exact"; }
    else if (normalizedCandidate === normalizedSource) { rawScore = 99; matchKind = "normalized-exact"; }
    else {
      const combined = Math.round(characterScore * 0.55 + overlapScore * 0.3 + orderScore * 0.15);
      rawScore = Math.min(98, overlapScore ? combined : Math.max(combined, characterScore - 3));
      matchKind = "fuzzy";
    }
    if (rawScore < 45) return;
    const penalty = link?.penalty || 0;
    const effectiveScore = Math.max(0, Math.min(101, rawScore - penalty));
    const scored = {
      ...entry,
      score: effectiveScore,
      rawScore,
      penalty,
      effectiveScore,
      matchKind,
      resourcePriority: link?.priority ?? 999,
      sameDomainProvenance: Boolean(
        cleanText(context.domain) && normalizeText(entry.domain) === normalizeText(context.domain)
      ),
      provenance: [{
        resourceId: entry.resourceId || "",
        resourceName: entry.tmName || "",
        projectName: entry.projectName || "",
        domain: entry.domain || "",
        updatedAt: entry.updatedAt || ""
      }]
    };
    const key = [languagePairOf(entry), normalizedCandidate, normalizeText(entry.target)].join("::");
    const existing = byKey.get(key);
    if (existing) existing.provenance.push(...scored.provenance.filter((item) => !existing.provenance.some((known) => known.resourceId === item.resourceId)));
    if (!existing || scored.effectiveScore > existing.effectiveScore || new Date(scored.updatedAt) > new Date(existing.updatedAt)) {
      if (existing) scored.provenance = existing.provenance;
      byKey.set(key, scored);
    }
  });
  return Array.from(byKey.values())
    .sort((a, b) =>
      b.effectiveScore - a.effectiveScore ||
      a.resourcePriority - b.resourcePriority ||
      Number(b.sameDomainProvenance) - Number(a.sameDomainProvenance) ||
      new Date(b.updatedAt) - new Date(a.updatedAt)
    )
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

function containsDesignation(text, value, caseSensitivity = "insensitive") {
  const source = String(text || "");
  const designation = String(value || "");
  if (!designation) return false;
  if (caseSensitivity === "sensitive") return source.includes(designation);
  if (caseSensitivity === "initial-sensitive") {
    const index = source.toLocaleLowerCase().indexOf(designation.toLocaleLowerCase());
    return index >= 0 && source[index] === designation[0];
  }
  return containsTerm(source, designation);
}

function sourceDesignationMatches(text, term) {
  if (term.matchMode === "prefix") {
    const sourceTokens = normalizeText(text).split(" ").filter(Boolean);
    const termTokens = normalizeText(term.text).split(" ").filter(Boolean);
    return Boolean(termTokens.length && sourceTokens.some((_, index) =>
      termTokens.every((token, offset) => sourceTokens[index + offset]?.startsWith(token))
    ));
  }
  if (term.matchMode === "fuzzy") {
    const sourceTokens = normalizeText(text).split(" ").filter(Boolean);
    const termTokens = normalizeText(term.text).split(" ").filter(Boolean);
    if (!termTokens.length || sourceTokens.length < termTokens.length) return false;
    const threshold = Math.max(50, Math.min(100, Number(term.fuzzyThreshold) || 85));
    for (let index = 0; index <= sourceTokens.length - termTokens.length; index += 1) {
      if (similarity(sourceTokens.slice(index, index + termTokens.length).join(" "), termTokens.join(" ")) >= threshold) return true;
    }
    return false;
  }
  return containsDesignation(text, term.text, term.caseSensitivity);
}

function termConceptGroups(terms) {
  const groups = new Map();
  (terms || []).forEach((term) => {
    const key = term.conceptId || `${term.resourceId || term.termBaseName}:${term.sourceTerm}`;
    if (!groups.has(key)) groups.set(key, { sourceTerms: [], accepted: [], forbidden: [] });
    const group = groups.get(key);
    if (!group.sourceTerms.some((item) => item.text === term.sourceTerm)) {
      group.sourceTerms.push({
        text: term.sourceTerm,
        caseSensitivity: term.caseSensitivity,
        matchMode: term.matchMode,
        fuzzyThreshold: term.fuzzyThreshold
      });
    }
    const designation = { text: term.targetTerm, caseSensitivity: term.caseSensitivity };
    if (term.isForbidden || term.status === "forbidden") group.forbidden.push(designation);
    else if (!group.accepted.some((item) => item.text === designation.text)) group.accepted.push(designation);
  });
  return Array.from(groups.values());
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
  const concepts = termConceptGroups(terms);
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
    concepts.forEach((concept) => {
      const source = concept.sourceTerms.find((term) => sourceDesignationMatches(segment.source, term));
      if (!source) return;
      concept.forbidden.forEach((term) => {
        if (!containsDesignation(target, term.text, term.caseSensitivity)) return;
        checks.push(issue({
          type: "forbidden-term",
          severity: "error",
          segment,
          index,
          message: `Forbidden term used: ${term.text}.`,
          fixHint: "Replace this with the approved wording or document a termbase exception before delivery."
        }));
      });
      if (concept.accepted.length && !concept.accepted.some((term) => containsDesignation(target, term.text, term.caseSensitivity))) {
        checks.push(issue({
          type: "term",
          severity: "warning",
          segment,
          index,
          message: `Term may be missing: ${source.text} -> ${concept.accepted.map((term) => term.text).join(" / ")}.`,
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
