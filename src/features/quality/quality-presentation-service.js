/**
 * Owns localized quality-profile, category, decision-severity, and risk-level
 * labels. Risk scoring, workbench orchestration, reports, and DOM rendering
 * remain behind their existing boundaries.
 *
 * @param {{
 *   localization: { source: (value: string) => string, label: (key: string) => string },
 *   baseCategoryLabel?: ((value: unknown) => string) | null
 * }} options
 */
export function createQualityPresentationService(options) {
  const localization = options?.localization;
  const baseCategoryLabel = options?.baseCategoryLabel;
  if (typeof localization?.source !== "function") {
    throw new TypeError("QualityPresentationService requires source localization.");
  }
  if (typeof localization.label !== "function") {
    throw new TypeError("QualityPresentationService requires label localization.");
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

  function aiReviewRisk(value) {
    return (
      {
        none: localization.label("noIssuesFound"),
        low: localization.label("lowRisk"),
        medium: localization.label("mediumRisk"),
        high: localization.label("highRisk"),
        critical: localization.label("criticalRisk")
      }[value] || localization.label("unrankedRisk")
    );
  }

  return Object.freeze({ aiReviewRisk, category, decisionSeverity, profile, riskLevel });
}
// Only interpret labels emitted by the scoring engine. Older or custom evidence stays verbatim.
export function qualityReasonText(reason, source, locale) {
  const text = reason?.label || "";
  if (/^qa-(empty|tag|copy|number|punctuation|forbidden-term|term)$/.test(reason?.type)) {
    return source(text, reason.messageValues || {});
  }
  if (!reason?.type || /^en(?:-|$)/i.test(locale)) return text;
  const aliases = {
    untranslated: ["Target is still empty.", "Target is empty."],
    unconfirmed: ["Target is not confirmed.", "Draft"],
    "needs-review": ["Marked needs review.", "Needs review"],
    blocked: ["Marked blocked.", "Blocked"]
  };
  if (Object.hasOwn(aliases, reason.type) && aliases[reason.type][0] === text) return source(aliases[reason.type][1]);
  const counts = {
    comments: [/^(\d+) review notes?\.$/, "Review notes"],
    "ai-suggestions": [/^(\d+) unapplied AI suggestions?\.$/, "AI suggestions"],
    "revision-density": [/^(\d+) target revisions\.$/, "Target revisions"],
    "low-tm-leverage": [/^Best TM match is (\d+%)\.$/, "Best TM match"]
  };
  if (Object.hasOwn(counts, reason.type)) {
    const [pattern, caption] = counts[reason.type];
    const match = text.match(pattern);
    if (match) return `${source(caption)}: ${match[1]}`;
  }
  if (reason.type === "ai-risk") {
    const match = /^(Low|Medium|High|Critical) AI review risk\.$/.exec(text);
    if (match) return `${source("AI review risk")}: ${source(match[1])}`;
  }
  if (reason.type === "quality-decision") {
    const match =
      /^(Accuracy|Terminology|Fluency|Style|Locale|Formatting|Compliance|Review) (?:(Low|Medium|High|Critical) )?decision recorded\.$/.exec(
        text
      );
    if (match)
      return [source("Quality decision saved"), source(match[1]), match[2] && source(match[2])]
        .filter(Boolean)
        .join(" · ");
  }
  if (["ai-draft", "full-review", "lqa-review", "regulated-profile", "strict-profile"].includes(reason.type)) {
    return source(text);
  }
  return text;
}
