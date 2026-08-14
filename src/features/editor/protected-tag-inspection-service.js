/**
 * Owns read-only protected-tag reconciliation, display, multiplicity, and
 * warning policy. Detection implementation, DOM construction, editing,
 * commands, and persistence remain behind injected boundaries.
 *
 * @param {{ detectTags: (text: string) => any[] }} options
 */
export function createProtectedTagInspectionService(options) {
  const detectTags = options?.detectTags;
  if (typeof detectTags !== "function") {
    throw new TypeError("ProtectedTagInspectionService requires a protected-tag detection boundary.");
  }

  function sourceTags(segment) {
    const stored = Array.isArray(segment?.tags) ? segment.tags.filter((tag) => tag?.text || tag?.label) : [];
    const detected = detectTags(segment?.source || "");
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
    const seen = new Map();
    return sourceTags(segment).filter((tag) => {
      const used = seen.get(tag.text) || 0;
      const occurrences = target.split(tag.text).length - 1;
      seen.set(tag.text, used + 1);
      return occurrences <= used;
    });
  }

  function targetTags(segment) {
    return detectTags(segment.target || "");
  }

  function hasIssue(segment) {
    return Boolean((segment.target || "").trim() && missing(segment).length);
  }

  return Object.freeze({ sourceTags, displayText, missing, targetTags, hasIssue });
}
