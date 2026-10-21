/**
 * Owns read-only protected-tag reconciliation, display, multiplicity, and
 * warning policy. Detection implementation, DOM construction, editing,
 * commands, and persistence remain behind injected boundaries.
 *
 * @param {{ detectTags: (text: string, context?: any) => any[] }} options
 */
export function createProtectedTagInspectionService(options) {
  const detectTags = options?.detectTags;
  if (typeof detectTags !== "function") {
    throw new TypeError("ProtectedTagInspectionService requires a protected-tag detection boundary.");
  }

  function sourceTags(segment) {
    const detected = detectTags(segment?.source || "", segment?.structure);
    // PO flags determine the placeholder dialect. Re-detect persisted entries
    // so older heuristic matches cannot survive a corrected format policy.
    if (segment?.structure?.format === "po") return detected;
    const stored = Array.isArray(segment?.tags) ? segment.tags.filter((tag) => tag?.text || tag?.label) : [];
    if (!stored.length) return detected;
    if (!detected.length) return stored;
    const storedCounts = new Map();
    stored.forEach((tag) => {
      const text = String(tag.text || tag.label || "");
      if (text) storedCounts.set(text, (storedCounts.get(text) || 0) + 1);
    });
    const detectedCounts = new Map();
    const merged = [...stored];
    detected.forEach((tag) => {
      const text = String(tag.text || tag.label || "");
      if (!text) return;
      const count = (detectedCounts.get(text) || 0) + 1;
      detectedCounts.set(text, count);
      if (count > (storedCounts.get(text) || 0)) merged.push(tag);
    });
    return merged;
  }

  function displayText(tag) {
    return tag?.label || tag?.text || "";
  }

  function missing(segment) {
    const target = segment.target || "";
    const targetCounts = segment?.structure?.format === "po" ? new Map() : null;
    if (targetCounts) {
      targetTags(segment).forEach((tag) => {
        targetCounts.set(tag.text, (targetCounts.get(tag.text) || 0) + 1);
      });
    }
    const seen = new Map();
    return sourceTags(segment).filter((tag) => {
      const used = seen.get(tag.text) || 0;
      const occurrences = targetCounts ? targetCounts.get(tag.text) || 0 : target.split(tag.text).length - 1;
      seen.set(tag.text, used + 1);
      return occurrences <= used;
    });
  }

  function targetTags(segment) {
    return detectTags(segment.target || "", segment?.structure);
  }

  function hasIssue(segment) {
    return Boolean((segment.target || "").trim() && missing(segment).length);
  }

  return Object.freeze({ sourceTags, displayText, missing, targetTags, hasIssue });
}
