const VALIDATION_GROUP_KEYS = Object.freeze(["errors", "risky", "warnings", "simplified", "skipped", "preserved"]);

/**
 * Owns validation-report display sanitization, alert copy, application state,
 * localized presentation composition, and auto-dismiss policy. Validation
 * domain reports, text redaction, localization, report summaries/counts,
 * application state, and ImportExportController rendering remain injected.
 *
 * @param {{
 *   redaction: { sanitize: (value: unknown) => string },
 *   reports: {
 *     summary: (report: unknown) => unknown,
 *     count: (report: unknown) => unknown
 *   },
 *   state: { setLast: (report: unknown) => unknown },
 *   localization: {
 *     label: (key: string) => unknown,
 *     source: (text: string) => unknown
 *   },
 *   presentation: { render: (model: unknown) => unknown }
 * }} options
 */
export function createApplicationValidationPresentationController(options) {
  const redaction = options?.redaction;
  const reports = options?.reports;
  const state = options?.state;
  const localization = options?.localization;
  const presentation = options?.presentation;

  if (typeof redaction?.sanitize !== "function") {
    throw new TypeError("ApplicationValidationPresentationController requires a redaction boundary.");
  }
  if (typeof reports?.summary !== "function" || typeof reports.count !== "function") {
    throw new TypeError("ApplicationValidationPresentationController requires report summary and count boundaries.");
  }
  if (typeof state?.setLast !== "function") {
    throw new TypeError("ApplicationValidationPresentationController requires a validation-state boundary.");
  }
  if (typeof localization?.label !== "function" || typeof localization.source !== "function") {
    throw new TypeError("ApplicationValidationPresentationController requires localization boundaries.");
  }
  if (typeof presentation?.render !== "function") {
    throw new TypeError("ApplicationValidationPresentationController requires a presentation boundary.");
  }

  function sanitize(report) {
    if (!report) return null;
    const clean = { ...report };
    VALIDATION_GROUP_KEYS.forEach((key) => {
      clean[key] = Array.isArray(report[key])
        ? report[key].map((message) => redaction.sanitize(message || "").trim()).filter(Boolean)
        : [];
    });
    clean.ok = clean.errors.length === 0;
    return clean;
  }

  function alertText(report, fallback = "Validation failed.") {
    const clean = sanitize(report);
    const errors = Array.isArray(clean?.errors) ? clean.errors : [];
    return errors.length ? errors.join("\n") : redaction.sanitize(fallback);
  }

  function render(report) {
    const displayReport = sanitize(report);
    state.setLast(displayReport);
    presentation.render({
      report: displayReport,
      summary: displayReport ? reports.summary(displayReport) : "",
      groups: [
        { key: "errors", label: localization.label("errors") },
        { key: "risky", label: localization.label("risk") },
        { key: "warnings", label: localization.source("Warnings") },
        { key: "simplified", label: localization.label("simplified") },
        { key: "skipped", label: localization.label("skipped") },
        { key: "preserved", label: localization.label("preserved") }
      ],
      dismissLabel: localization.source("Dismiss validation report"),
      dismissText: localization.source("Dismiss"),
      emptyLabel: localization.source("No validation issues."),
      autoDismissMs: displayReport?.ok ? (reports.count(displayReport) ? 12000 : 7000) : 0
    });
  }

  return Object.freeze({ sanitize, alertText, render });
}
