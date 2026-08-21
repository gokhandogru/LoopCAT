export function createApplicationTextSafetyService({ patterns }) {
  if (!(patterns?.sensitiveValue instanceof RegExp)) {
    throw new TypeError("ApplicationTextSafetyService requires a checked sensitive-value pattern.");
  }

  function stableLower(value) {
    return String(value || "").toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function redactSensitiveText(value) {
    return String(value || "").replace(new RegExp(patterns.sensitiveValue.source, "gi"), "[redacted secret]");
  }

  function displaySafeText(value, fallback = "") {
    return redactSensitiveText(value || "").trim() || fallback;
  }

  function displaySafeHtml(value, fallback = "") {
    return escapeHtml(displaySafeText(value, fallback));
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function fileSafeName(value) {
    return (redactSensitiveText(value || "export").trim() || "export").replace(/[^\p{L}\p{N}-]+/gu, "_");
  }

  return Object.freeze({
    stableLower,
    escapeHtml,
    displaySafeText,
    displaySafeHtml,
    escapeRegExp,
    fileSafeName,
    redactSensitiveText
  });
}
