(() => {
function numberList(text) {
  const normalized = String(text || "")
    .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) & 15))
    .replace(/\u066b/g, ".").replace(/\u066c/g, ",");
  return (normalized.match(/\d+(?:[.,]\d+)?/g) || []).sort().join("|");
}

function endingPunctuation(text) {
  const normalized = String(text || "").trim().replace(/\u061f$/, "?").replace(/\u06d4$/, ".");
  return (normalized.match(/[.!?\u3002\uff01\uff1f\u2026]$/u) || [""])[0];
}

function containsTerm(text, term) {
  const normalizeText = window.CatHan.tm?.normalizeText || ((value) => String(value || "").normalize("NFKC").toLowerCase().trim());
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
    const sourceTokens = String(text || "").normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}_'-]+/gu) || [];
    const termTokens = String(term.text || "").normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}_'-]+/gu) || [];
    return Boolean(termTokens.length && sourceTokens.some((_, index) =>
      termTokens.every((token, offset) => sourceTokens[index + offset]?.startsWith(token))
    ));
  }
  if (term.matchMode === "fuzzy") {
    const normalizeText = window.CatHan.tm?.normalizeText || ((value) => String(value || "").normalize("NFKC").toLowerCase().trim());
    const similarity = window.CatHan.tm?.similarity;
    if (typeof similarity !== "function") return containsDesignation(text, term.text, term.caseSensitivity);
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
    if (!group.sourceTerms.some((item) => item.text === term.sourceTerm)) group.sourceTerms.push({
      text: term.sourceTerm,
      caseSensitivity: term.caseSensitivity,
      matchMode: term.matchMode,
      fuzzyThreshold: term.fuzzyThreshold
    });
    const designation = { text: term.targetTerm, caseSensitivity: term.caseSensitivity };
    if (term.isForbidden || term.status === "forbidden") group.forbidden.push(designation);
    else if (!group.accepted.some((item) => item.text === designation.text)) group.accepted.push(designation);
  });
  return Array.from(groups.values());
}

function issue({ type, severity, segment, index, message, messageValues, fixHint, fixHintValues }) {
  return {
    id: `qa-${segment.id || index}-${type}`,
    severity,
    type,
    segmentId: segment.id,
    documentId: segment.documentId || "",
    label: `${index + 1}`,
    message,
    messageValues: messageValues || {},
    fixHint,
    fixHintValues: fixHintValues || {},
    createdAt: new Date().toISOString()
  };
}

function segmentTags(segment) {
  if (segment?.tags?.length) return segment.tags;
  return window.CatHan.docx?.detectProtectedTags?.(segment?.source || "") || [];
}

function tagDisplayText(tag) {
  return tag?.label || tag?.text || "";
}

function defaultMissingTags(segment) {
  const target = String(segment?.target || "");
  const seen = new Map();
  return segmentTags(segment).filter((tag) => {
    const text = String(tag?.text || "");
    if (!text) return false;
    const used = seen.get(text) || 0;
    const occurrences = target.split(text).length - 1;
    seen.set(text, used + 1);
    return occurrences <= used;
  });
}

function runQaChecks(segments, terms = [], tagHelpers = {}) {
  const checks = [];
  const concepts = termConceptGroups(terms);
  segments.forEach((segment, index) => {
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
    const missingTags = tagHelpers.missingTags ? tagHelpers.missingTags(segment) : defaultMissingTags(segment);
    missingTags.forEach((tag) => {
      checks.push(issue({
        type: "tag",
        severity: "error",
        segment,
        index,
        message: "Missing protected placeholder {value1}.",
        messageValues: {
          value1: tagDisplayText(tag)
        },
        fixHint: "Insert the missing protected placeholder into the target."
      }));
    });
    if (segment.source.trim() && segment.source.trim() === target.trim()) {
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
          message: "Forbidden term used: {value1}.",
          messageValues: {
            value1: term.text
          },
          fixHint: "Replace this with the approved wording or document a termbase exception before delivery."
        }));
      });
      if (concept.accepted.length && !concept.accepted.some((term) => containsDesignation(target, term.text, term.caseSensitivity))) {
        checks.push(issue({
          type: "term",
        severity: "warning",
        segment,
        index,
          message: "Term may be missing: {sourceTerm} -> {targetTerm}.",
          messageValues: {
            sourceTerm: source.text,
            targetTerm: concept.accepted.map((term) => term.text).join(" / ")
          },
          fixHint: "Use the approved term or update the termbase if this is a valid exception."
        }));
      }
    });
  });
  return checks;
}

window.CatHan.qa = { runQaChecks };
})();
