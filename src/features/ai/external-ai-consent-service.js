/**
 * Owns external-AI payload disclosure normalization, human-readable list
 * grammar, exact provider-aware question copy, and confirmation delegation.
 * Provider selection, command eligibility/timing, presentation, and status
 * remain with callers.
 *
 * @param {{ confirm: (message: string) => any }} options
 */
export function createExternalAiConsentService(options) {
  if (typeof options?.confirm !== "function") {
    throw new TypeError("ExternalAiConsentService requires a confirmation boundary.");
  }

  function humanReadableList(items) {
    const clean = [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
    if (clean.length <= 1) return clean[0] || "";
    if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
    return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
  }

  function confirmShare({ provider, includesSourceText, contextLabels = [] }) {
    const payloadItems = [includesSourceText ? "selected/source text" : "", "project instructions", ...contextLabels];
    const payload = humanReadableList(payloadItems);
    return options.confirm(`Open ${provider} and send ${payload} outside LoopCAT?`);
  }

  return Object.freeze({ confirmShare, humanReadableList });
}
