/**
 * Owns the small, reusable HTML presentation rules shared by generated reports.
 * Report data collection, full-document composition, finalization, and delivery
 * remain outside this service.
 *
 * @param {{
 *   localization: {
 *     source: (text: unknown, values?: Record<string, unknown>) => string,
 *     sourceHtml: (text: unknown, values?: Record<string, unknown>) => string
 *   },
 *   escapeHtml: (value: unknown) => string,
 *   redactSensitiveText: (value: unknown) => string,
 *   qualityCategoryName: (value: unknown) => string,
 *   qaCheckMessage: (check: any) => string,
 *   qaCheckFixHint: (check: any) => string
 * }} options
 */
export function createReportPresentationService(options) {
  const localization = options?.localization;
  const escapeHtml = options?.escapeHtml;
  const redactSensitiveText = options?.redactSensitiveText;
  const qualityCategoryName = options?.qualityCategoryName;
  const qaCheckMessage = options?.qaCheckMessage;
  const qaCheckFixHint = options?.qaCheckFixHint;
  if (
    typeof localization?.source !== "function" ||
    typeof localization?.sourceHtml !== "function" ||
    typeof escapeHtml !== "function" ||
    typeof redactSensitiveText !== "function" ||
    typeof qualityCategoryName !== "function" ||
    typeof qaCheckMessage !== "function" ||
    typeof qaCheckFixHint !== "function"
  ) {
    throw new TypeError(
      "ReportPresentationService requires localization, escaping, redaction, quality-category, and QA presentation boundaries."
    );
  }

  function listHtml(items, emptyText = "None") {
    return items?.length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p class="muted">${localization.sourceHtml(emptyText)}</p>`;
  }

  function countTableHtml(counts, emptyText = "None") {
    const entries = Object.entries(counts || {}).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) return `<p class="muted">${localization.sourceHtml(emptyText)}</p>`;
    return `<table><tbody>${entries.map(([label, count]) => `<tr><th>${escapeHtml(localization.source(label))}</th><td>${count}</td></tr>`).join("")}</tbody></table>`;
  }

  function qualityCategoryCountTableHtml(counts, emptyText = "None") {
    const entries = Object.entries(counts || {}).sort(([a], [b]) =>
      qualityCategoryName(a).localeCompare(qualityCategoryName(b))
    );
    if (!entries.length) return `<p class="muted">${localization.sourceHtml(emptyText)}</p>`;
    return `<table><tbody>${entries.map(([label, count]) => `<tr><th>${escapeHtml(qualityCategoryName(label))}</th><td>${count}</td></tr>`).join("")}</tbody></table>`;
  }

  function safeLabel(value, fallback = "") {
    return redactSensitiveText(value || "").trim() || fallback;
  }

  function qaChecksTableHtml(checks = []) {
    if (!checks.length) return `<p class="muted">${localization.sourceHtml("No QA issues found.")}</p>`;
    const rows = checks
      .slice(0, 50)
      .map(
        (check) => `<tr>
    <td>#${escapeHtml(check.label || "")}</td>
    <td>${escapeHtml(localization.source(check.type || ""))}</td>
    <td>${escapeHtml(localization.source(check.severity || "info"))}</td>
    <td>${escapeHtml(qaCheckMessage(check))}</td>
    <td>${escapeHtml(qaCheckFixHint(check) || localization.source("None"))}</td>
  </tr>`
      )
      .join("");
    return `<table>
    <thead><tr><th>${localization.sourceHtml("Segment")}</th><th>${localization.sourceHtml("Type")}</th><th>${localization.sourceHtml("Severity")}</th><th>${localization.sourceHtml("Message")}</th><th>${localization.sourceHtml("Recommendation")}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  }

  return Object.freeze({
    countTableHtml,
    listHtml,
    qaChecksTableHtml,
    qualityCategoryCountTableHtml,
    safeLabel
  });
}
