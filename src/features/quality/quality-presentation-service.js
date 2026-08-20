/**
 * Owns localized quality-profile, category, decision-severity, and risk-level
 * labels. Risk scoring, workbench orchestration, reports, and DOM rendering
 * remain behind their existing boundaries.
 *
 * @param {{
 *   localization: { source: (value: string) => string },
 *   baseCategoryLabel?: ((value: unknown) => string) | null
 * }} options
 */
export function createQualityPresentationService(options) {
  const localization = options?.localization;
  const baseCategoryLabel = options?.baseCategoryLabel;
  if (typeof localization?.source !== "function") {
    throw new TypeError("QualityPresentationService requires source localization.");
  }
  if (baseCategoryLabel != null && typeof baseCategoryLabel !== "function") {
    throw new TypeError("QualityPresentationService base category label must be a function when provided.");
  }

  function profile(value) {
    const label =
      {
        "student-review": "Student review",
        "freelance-delivery": "Freelance delivery",
        "agency-delivery": "Agency delivery",
        regulated: "Regulated",
        targeted: "Targeted",
        full: "Full",
        lqa: "LQA",
        balanced: "Balanced",
        strict: "Strict",
        standard: "Standard",
        "not-used": "Not used",
        "local-only": "Local only",
        "hosted-disclosed": "Hosted disclosed",
        "client-approved": "Client approved"
      }[String(value)] ||
      value ||
      "";
    return localization.source(label);
  }

  function category(value) {
    const label =
      baseCategoryLabel?.(value) ||
      {
        accuracy: "Accuracy",
        terminology: "Terminology",
        fluency: "Fluency",
        style: "Style",
        locale: "Locale",
        formatting: "Formatting",
        compliance: "Compliance",
        review: "Review"
      }[String(value)] ||
      value ||
      "Review";
    return localization.source(label);
  }

  function decisionSeverity(value) {
    const label =
      {
        low: "Low",
        medium: "Medium",
        high: "High",
        critical: "Critical"
      }[String(value)] || "Medium";
    return localization.source(label);
  }

  function riskLevel(value) {
    const label =
      {
        critical: "Critical",
        high: "High",
        medium: "Medium",
        low: "Low",
        clear: "Clear"
      }[String(value)] || "Risk";
    return localization.source(label);
  }

  return Object.freeze({ category, decisionSeverity, profile, riskLevel });
}
