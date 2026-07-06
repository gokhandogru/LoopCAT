(() => {
function numberList(text) {
  return (text.match(/\d+(?:[.,]\d+)?/g) || []).sort().join("|");
}

function endingPunctuation(text) {
  return (text.trim().match(/[.!?\u3002\uff01\uff1f\u2026]$/u) || [""])[0];
}

function containsTerm(text, term) {
  const normalizeText = window.CatHan.tm?.normalizeText || ((value) => String(value || "").normalize("NFKC").toLowerCase().trim());
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  return ` ${normalizeText(text)} `.includes(` ${normalizedTerm} `);
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
        message: `Missing protected placeholder ${tagDisplayText(tag)}.`,
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
    terms.forEach((term) => {
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

window.CatHan.qa = { runQaChecks };
})();
