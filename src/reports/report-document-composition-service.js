import { qualityReasonText } from "../features/quality/quality-presentation-service.js";

// The exported HTML also opens offline, without the application stylesheets.
const reportStyles = `:root { color-scheme: light; --canvas: #f7f7f2; --paper: white; --subtle: #f2f5f2; --text: #183932; --muted: #536860; --line: #d7dfd8; --accent: #086959; font: 1rem/1.5 system-ui, sans-serif; color: var(--text); background: var(--canvas); }
* { box-sizing: border-box; }
body { margin: 0; padding: clamp(.5rem, 3vw, 2rem); overflow-wrap: anywhere; }
main { max-width: 64rem; margin: auto; background: var(--paper); border: 1px solid var(--line); border-radius: .75rem; }
header, section, footer { padding: clamp(1rem, 3vw, 2rem); }
header { background: #133e39; color: white; border-radius: .75rem .75rem 0 0; }
header .muted { color: #daebe4; }
h1, h2, p { margin: 0 0 .5rem; }
h1 { font-size: clamp(1.5rem, 3vw, 2.125rem); line-height: 1.2; }
h2 { font-size: 1.2rem; }
section, footer { border-block-start: 1px solid var(--line); }
.meta, .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: .625rem; }
.card { border: 1px solid var(--line); border-radius: .625rem; padding: .875rem; background: var(--subtle); }
.card strong { display: block; font-size: 1.35rem; color: var(--accent); font-variant-numeric: tabular-nums; }
.card span, .muted, footer { color: var(--muted); }
table { width: 100%; border-collapse: collapse; font-size: .875rem; }
th, td { border-block-end: 1px solid var(--line); padding: .5rem; text-align: start; vertical-align: top; }
th { background: var(--subtle); } ul { margin: 0; padding-inline-start: 1.25rem; }
footer { font-size: .8125rem; }
@media screen and (prefers-color-scheme: dark) { :root { color-scheme: dark; --canvas: #15211e; --paper: #1c2c27; --subtle: #23362f; --text: #edf4eb; --muted: #b5c6bb; --line: #3c5046; --accent: #94e5c9; } }
@media (max-width: 36rem) { section:has(table) { overflow-x: auto; } th, td { padding: .35rem; } }
@media print { :root { --canvas: white; } body, main { padding: 0; background: white; border: 0; } header, header .muted { color: var(--text); background: white; } h2 { break-after: avoid; } tr, .card { break-inside: avoid; } }`;

/**
 * Owns complete Project Report and Quality Passport HTML document composition.
 * Data collection, document finalization, download, persistence, and status
 * effects remain outside this service.
 *
 * @param {Record<string, any> | null | undefined} options
 */
export function createReportDocumentCompositionService(options) {
  const uiLocalizationService = options?.localization;
  const reportPresentationService = options?.presentation;
  const escapeHtml = options?.escapeHtml;
  const redactSensitiveText = options?.redactSensitiveText;
  const defaultQualityProfile = options?.defaultQualityProfile;
  const sanitizeValidationReportForDisplay = options?.sanitizeValidationReportForDisplay;
  const languagePairDisplay = options?.languagePairDisplay;
  const formatDateTime = options?.formatDateTime;
  const qualityLabel = options?.qualityLabel;
  const qualityCategoryName = options?.qualityCategoryName;
  const qualityRiskLevelLabel = options?.qualityRiskLevelLabel;
  if (
    typeof uiLocalizationService?.source !== "function" ||
    typeof uiLocalizationService?.sourceHtml !== "function" ||
    typeof uiLocalizationService?.locale !== "function" ||
    typeof uiLocalizationService?.direction !== "function" ||
    typeof reportPresentationService?.countTableHtml !== "function" ||
    typeof reportPresentationService?.listHtml !== "function" ||
    typeof reportPresentationService?.qaChecksTableHtml !== "function" ||
    typeof reportPresentationService?.qualityCategoryCountTableHtml !== "function" ||
    typeof reportPresentationService?.safeLabel !== "function" ||
    typeof escapeHtml !== "function" ||
    typeof redactSensitiveText !== "function" ||
    typeof defaultQualityProfile !== "function" ||
    typeof sanitizeValidationReportForDisplay !== "function" ||
    typeof languagePairDisplay !== "function" ||
    typeof formatDateTime !== "function" ||
    typeof qualityLabel !== "function" ||
    typeof qualityCategoryName !== "function" ||
    typeof qualityRiskLevelLabel !== "function"
  ) {
    throw new TypeError(
      "ReportDocumentCompositionService requires localization, presentation, escaping, redaction, quality, validation, language, and date boundaries."
    );
  }

  const source = uiLocalizationService.source;
  const riskLabel = (value) => (value === "clear" ? source("No risk") : qualityRiskLevelLabel(value));
  const reviewLabel = (value) =>
    source({ "needs-review": "Needs review", reviewed: "Reviewed", blocked: "Blocked" }[value] || value);
  const validationLabel = (value) => source({ errors: "Errors", risk: "Risks", warnings: "Warnings", notes: "Notes" }[value]);

  function readinessNotice(text) {
    if (/^en(?:-|$)/i.test(uiLocalizationService.locale())) return text;
    const match = /^(\d+) (empty target|non-empty unconfirmed target) segments? (will (?:export source text|remain empty in the exported interchange file|be reported as untranslated|export as written))\.$/.exec(text);
    if (!match) return text;
    return source(`{value1} ${match[2]} segment(s) ${match[3]}.`, { value1: match[1] });
  }

  function effortDriver(text) {
    if (/^en(?:-|$)/i.test(uiLocalizationService.locale())) return text;
    if (text === "No major unresolved quality signals.") return source("No major post-editing drivers.");
    const match = /^(\d+) (high or critical risk segments?|QA issues?|untranslated segments?)\.$/.exec(text);
    if (!match) return text;
    const captions = { "high or critical risk segment": "High or critical risk segments", "QA issue": "QA issues", "untranslated segment": "Untranslated" };
    return `${source(captions[match[2].replace(/s$/, "")])}: ${match[1]}`;
  }

  function projectReportHtml(data, options = {}) {
    const anonymized = Boolean(options.anonymized);
    const project = data.project;
    const totals = data.analysis.totals;
    const ai = data.analysis.ai || {
      drafts: 0,
      suggestionSegments: 0,
      suggestions: 0,
      reviewRisk: 0,
      highRisk: 0,
      risk: {}
    };
    const quality = data.qualityPassport || {};
    const qualityProfile = defaultQualityProfile(quality.profile || project.qualityProfile);
    const qualityRiskQueue = quality.riskQueue || { totalRiskItems: 0, highRiskCount: 0, averageScore: 0, byLevel: {} };
    const qualityEffort = quality.postEditingEffort || { label: "No segments", score: 0, drivers: [] };
    const validation = sanitizeValidationReportForDisplay(data.validation) || {
      errors: [],
      risky: [],
      warnings: [],
      preserved: [],
      simplified: [],
      skipped: [],
      ok: true
    };
    const files = anonymized
      ? data.analysis.files.map((file, index) => ({ ...file, name: `File ${index + 1}` }))
      : data.analysis.files.map((file) => ({ ...file, name: reportPresentationService.safeLabel(file.name, "File") }));
    const resources = anonymized
      ? data.resources
      : {
          ...data.resources,
          mainTm: reportPresentationService.safeLabel(data.resources.mainTm, "None"),
          tmNames: (data.resources.tmNames || [])
            .map((name) => reportPresentationService.safeLabel(name))
            .filter(Boolean),
          tbNames: (data.resources.tbNames || [])
            .map((name) => reportPresentationService.safeLabel(name))
            .filter(Boolean)
        };
    const validationCounts = {
      errors: validation.errors.length,
      risk: validation.risky.length,
      warnings: validation.warnings.length,
      notes: validation.preserved.length + validation.simplified.length + validation.skipped.length
    };
    const rows = (values, cells) => values.map((item) => `<tr>${cells(item).join("")}</tr>`).join("");
    const projectTitle = anonymized
      ? uiLocalizationService.source("Anonymized project")
      : reportPresentationService.safeLabel(project.name, uiLocalizationService.source("Project"));
    const reportTitle = anonymized
      ? uiLocalizationService.source("LoopCAT Anonymized Project Report")
      : uiLocalizationService.source("LoopCAT Project Report");
    return `<!doctype html>
<html lang="${escapeHtml(uiLocalizationService.locale())}" dir="${escapeHtml(uiLocalizationService.direction())}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
    <title>${escapeHtml(projectTitle)} - ${escapeHtml(reportTitle)}</title>
    <style>${reportStyles}</style>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(reportTitle)}</h1>
        <p>${escapeHtml(projectTitle)} - ${escapeHtml(languagePairDisplay(project.sourceLang, project.targetLang))}</p>
        <p class="muted">${uiLocalizationService.sourceHtml("Generated {date}", { date: formatDateTime(data.generatedAt) })}</p>
      </header>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Project")}</h2>
        <div class="meta">
          <div class="card"><strong>${escapeHtml(redactSensitiveText(project.domain || "").trim() || uiLocalizationService.source("Not set"))}</strong><span>${uiLocalizationService.sourceHtml("Domain")}</span></div>
          <div class="card"><strong>${totals.confirmedPercent}%</strong><span>${uiLocalizationService.sourceHtml("Confirmed")}</span></div>
          <div class="card"><strong>${totals.words}</strong><span>${uiLocalizationService.sourceHtml("Source words")}</span></div>
          <div class="card"><strong>${data.qaChecks.length}</strong><span>${uiLocalizationService.sourceHtml("QA issues")}</span></div>
        </div>
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Progress")}</h2>
        <div class="cards">
          <div class="card"><strong>${totals.files}</strong><span>${uiLocalizationService.sourceHtml("Files")}</span></div>
          <div class="card"><strong>${totals.segments}</strong><span>${uiLocalizationService.sourceHtml("Segments")}</span></div>
          <div class="card"><strong>${totals.confirmed}</strong><span>${uiLocalizationService.sourceHtml("Confirmed")}</span></div>
          <div class="card"><strong>${totals.untranslated}</strong><span>${uiLocalizationService.sourceHtml("Untranslated")}</span></div>
          <div class="card"><strong>${totals.repetitions}</strong><span>${uiLocalizationService.sourceHtml("Repetitions")}</span></div>
          <div class="card"><strong>${totals.comments}</strong><span>${uiLocalizationService.sourceHtml("Review notes")}</span></div>
          <div class="card"><strong>${data.revisionCount}</strong><span>${uiLocalizationService.sourceHtml("Target revisions")}</span></div>
        </div>
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Quality Passport")}</h2>
        <div class="cards">
          <div class="card"><strong>${quality.confidenceScore ?? 0}</strong><span>${uiLocalizationService.sourceHtml("Quality score")}</span></div>
          <div class="card"><strong>${escapeHtml(uiLocalizationService.source(qualityEffort.label))}</strong><span>${uiLocalizationService.sourceHtml("Post-editing effort")}</span></div>
          <div class="card"><strong>${qualityRiskQueue.totalRiskItems}</strong><span>${uiLocalizationService.sourceHtml("Risk items")}</span></div>
          <div class="card"><strong>${qualityRiskQueue.highRiskCount}</strong><span>${uiLocalizationService.sourceHtml("High risk")}</span></div>
        </div>
        <table>
          <tbody>
            <tr><th>${uiLocalizationService.sourceHtml("Standard")}</th><td>${escapeHtml(qualityLabel(qualityProfile.standard))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Review depth")}</th><td>${escapeHtml(qualityLabel(qualityProfile.reviewDepth))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Risk tolerance")}</th><td>${escapeHtml(qualityLabel(qualityProfile.riskTolerance))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Terminology")}</th><td>${escapeHtml(qualityLabel(qualityProfile.terminologyStrictness))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("AI disclosure")}</th><td>${escapeHtml(qualityLabel(qualityProfile.aiDisclosure))}</td></tr>
          </tbody>
        </table>
        <h3>${uiLocalizationService.sourceHtml("Risk levels")}</h3>
        ${reportPresentationService.countTableHtml(qualityRiskQueue.byLevel || {}, "No unresolved quality risks.", riskLabel)}
        <h3>${uiLocalizationService.sourceHtml("Quality categories")}</h3>
        ${reportPresentationService.qualityCategoryCountTableHtml(qualityRiskQueue.byCategory || {}, "No categorized quality risks.")}
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("AI Triage")}</h2>
        <div class="cards">
          <div class="card"><strong>${ai.drafts || 0}</strong><span>${uiLocalizationService.sourceHtml("AI initiated")}</span></div>
          <div class="card"><strong>${ai.suggestionSegments || 0}</strong><span>${uiLocalizationService.sourceHtml("Segments with AI suggestions")}</span></div>
          <div class="card"><strong>${ai.suggestions || 0}</strong><span>${uiLocalizationService.sourceHtml("AI suggestions")}</span></div>
          <div class="card"><strong>${ai.reviewRisk || 0}</strong><span>${uiLocalizationService.sourceHtml("AI review risk")}</span></div>
          <div class="card"><strong>${ai.highRisk || 0}</strong><span>${uiLocalizationService.sourceHtml("High AI risk")}</span></div>
        </div>
        <h3>${uiLocalizationService.sourceHtml("AI review risk levels")}</h3>
        ${reportPresentationService.countTableHtml(ai.risk || {}, "No AI review risk recorded.")}
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Files")}</h2>
        <table>
          <thead><tr><th>${uiLocalizationService.sourceHtml("File")}</th><th>${uiLocalizationService.sourceHtml("Type")}</th><th>${uiLocalizationService.sourceHtml("Segments")}</th><th>${uiLocalizationService.sourceHtml("Words")}</th><th>${uiLocalizationService.sourceHtml("Confirmed")}</th><th>${uiLocalizationService.sourceHtml("Untranslated")}</th></tr></thead>
          <tbody>${rows(files, (file) => [
            `<td>${escapeHtml(file.name)}</td>`,
            `<td>${escapeHtml(file.type)}</td>`,
            `<td>${file.segments}</td>`,
            `<td>${file.words}</td>`,
            `<td>${file.confirmed}</td>`,
            `<td>${file.untranslated}</td>`
          ])}</tbody>
        </table>
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Resources")}</h2>
        <div class="cards">
          <div class="card"><strong>${escapeHtml(anonymized ? uiLocalizationService.source("Redacted") : resources.mainTm)}</strong><span>${uiLocalizationService.sourceHtml("Main TM")}</span></div>
          <div class="card"><strong>${data.tmEntryCount}</strong><span>${uiLocalizationService.sourceHtml("Linked TM units")}</span></div>
          <div class="card"><strong>${data.termCount}</strong><span>${uiLocalizationService.sourceHtml("Linked terms")}</span></div>
          <div class="card"><strong>${data.forbiddenTermCount}</strong><span>${uiLocalizationService.sourceHtml("Forbidden terms")}</span></div>
        </div>
        <p class="muted">${anonymized ? uiLocalizationService.sourceHtml("Resource names are redacted.") : `${uiLocalizationService.sourceHtml("TMs")}: ${escapeHtml(resources.tmNames.join(", ") || uiLocalizationService.source("None"))}`}</p>
        ${anonymized ? "" : `<p class="muted">${uiLocalizationService.sourceHtml("TBs")}: ${escapeHtml(resources.tbNames.join(", ") || uiLocalizationService.source("None"))}</p>`}
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Terminology")}</h2>
        ${
          anonymized
            ? `<p class="muted">${uiLocalizationService.sourceHtml("Terminology text is omitted from this anonymized report. Counts are preserved in Resources.")}</p>`
            : data.terms.length
              ? `<table>
          <thead><tr><th>${uiLocalizationService.sourceHtml("Source term")}</th><th>${uiLocalizationService.sourceHtml("Target term")}</th><th>${uiLocalizationService.sourceHtml("Status")}</th><th>${uiLocalizationService.sourceHtml("Termbase")}</th><th>${uiLocalizationService.sourceHtml("Notes")}</th></tr></thead>
          <tbody>${rows(data.terms, (term) => [
            `<td>${escapeHtml(term.sourceTerm)}</td>`,
            `<td>${escapeHtml(term.targetTerm)}</td>`,
            `<td>${uiLocalizationService.sourceHtml(term.isForbidden ? "Forbidden" : "Approved")}</td>`,
            `<td>${escapeHtml(reportPresentationService.safeLabel(term.termBaseName))}</td>`,
            `<td>${escapeHtml(term.notes)}</td>`
          ])}</tbody>
        </table>`
              : `<p class="muted">${uiLocalizationService.sourceHtml("No linked terms.")}</p>`
        }
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("QA Summary")}</h2>
        <h3>${uiLocalizationService.sourceHtml("By severity")}</h3>
        ${reportPresentationService.countTableHtml(data.qaBySeverity)}
        <h3>${uiLocalizationService.sourceHtml("By type")}</h3>
        ${reportPresentationService.countTableHtml(data.qaByType)}
        ${anonymized ? "" : `<h3>${uiLocalizationService.sourceHtml("QA details")}</h3>${reportPresentationService.qaChecksTableHtml(data.qaChecks)}`}
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Export Readiness")}</h2>
        ${reportPresentationService.countTableHtml(validationCounts, "None", validationLabel)}
        <h3>${uiLocalizationService.sourceHtml("Risk and warnings")}</h3>
        ${reportPresentationService.listHtml([...validation.risky, ...validation.warnings].map(readinessNotice), "No risk or warning notes.")}
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Recent Activity")}</h2>
        ${
          anonymized
            ? reportPresentationService.countTableHtml(data.activityByType || {}, "No activity recorded.")
            : data.activityEvents.length
              ? `<table><thead><tr><th>${uiLocalizationService.sourceHtml("Time")}</th><th>${uiLocalizationService.sourceHtml("Type")}</th><th>${uiLocalizationService.sourceHtml("Summary")}</th></tr></thead><tbody>${rows(
                  data.activityEvents.slice(0, 10),
                  (event) => [
                    `<td>${escapeHtml(formatDateTime(event.createdAt))}</td>`,
                    `<td>${escapeHtml(uiLocalizationService.source(event.type))}</td>`,
                    `<td>${escapeHtml(event.summary)}</td>`
                  ]
                )}</tbody></table>`
              : `<p class="muted">${uiLocalizationService.sourceHtml("No activity recorded.")}</p>`
        }
      </section>
      <footer>
        ${anonymized ? uiLocalizationService.sourceHtml("This anonymized report contains counts without project names, file names, resource names, terminology text, activity summaries, or segment text.") : uiLocalizationService.sourceHtml("This report contains project metadata, counts, terminology, QA totals, and activity summaries. Segment text is not included.")}
      </footer>
    </main>
  </body>
</html>`;
  }

  function qualityPassportHtml(data) {
    const project = data.project;
    const passport = data.qualityPassport || {};
    const profile = defaultQualityProfile(passport.profile || project.qualityProfile);
    const riskQueue = passport.riskQueue || {
      items: [],
      byLevel: {},
      totalRiskItems: 0,
      highRiskCount: 0,
      averageScore: 0
    };
    const validation = sanitizeValidationReportForDisplay(data.validation) || {
      errors: [],
      risky: [],
      warnings: [],
      preserved: [],
      simplified: [],
      skipped: [],
      ok: true
    };
    const effort = passport.postEditingEffort || { label: "No segments", score: 0, drivers: [] };
    const rows = (values, cells) => values.map((item) => `<tr>${cells(item).join("")}</tr>`).join("");
    const projectTitle = reportPresentationService.safeLabel(project.name, uiLocalizationService.source("Project"));
    const topRiskItems = (riskQueue.items || []).slice(0, 20);
    return `<!doctype html>
<html lang="${escapeHtml(uiLocalizationService.locale())}" dir="${escapeHtml(uiLocalizationService.direction())}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
    <title>${escapeHtml(projectTitle)} - ${uiLocalizationService.sourceHtml("LoopCAT Quality Passport")}</title>
    <style>${reportStyles}</style>
  </head>
  <body>
    <main>
      <header>
        <h1>${uiLocalizationService.sourceHtml("LoopCAT Quality Passport")}</h1>
        <p>${escapeHtml(projectTitle)} - ${escapeHtml(languagePairDisplay(project.sourceLang, project.targetLang))}</p>
        <p class="muted">${uiLocalizationService.sourceHtml("Generated {date}", { date: formatDateTime(passport.generatedAt || data.generatedAt) })}</p>
      </header>
      <section>
        ${passport.exchangeRuns?.length ? `<h2>LoopCAT Exchange — ${uiLocalizationService.sourceHtml(passport.exchangeIncomplete ? "Incomplete" : "Checks evaluated")}</h2><ul>${passport.exchangeRuns.map((run) => `<li>${escapeHtml(run.id)} ${escapeHtml(run.version)}: ${uiLocalizationService.sourceHtml(run.status)}</li>`).join("")}</ul>` : ""}<h2>${uiLocalizationService.sourceHtml("Quality Contract")}</h2>
        <table>
          <tbody>
            <tr><th>${uiLocalizationService.sourceHtml("Standard")}</th><td>${escapeHtml(qualityLabel(profile.standard))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Review depth")}</th><td>${escapeHtml(qualityLabel(profile.reviewDepth))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Risk tolerance")}</th><td>${escapeHtml(qualityLabel(profile.riskTolerance))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Terminology")}</th><td>${escapeHtml(qualityLabel(profile.terminologyStrictness))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("AI disclosure")}</th><td>${escapeHtml(qualityLabel(profile.aiDisclosure))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Audience")}</th><td>${escapeHtml(reportPresentationService.safeLabel(profile.audience, uiLocalizationService.source("Not set")))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Tone")}</th><td>${escapeHtml(profile.tone === "Neutral" ? source("Neutral") : reportPresentationService.safeLabel(profile.tone, source("Neutral")))}</td></tr>
          </tbody>
        </table>
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Delivery Evidence")}</h2>
        <div class="cards">
          <div class="card"><strong>${passport.confidenceScore ?? 0}</strong><span>${uiLocalizationService.sourceHtml("Quality score")}</span></div>
          <div class="card"><strong>${escapeHtml(uiLocalizationService.source(effort.label))}</strong><span>${uiLocalizationService.sourceHtml("Post-editing effort")}</span></div>
          <div class="card"><strong>${riskQueue.totalRiskItems}</strong><span>${uiLocalizationService.sourceHtml("Risk items")}</span></div>
          <div class="card"><strong>${riskQueue.highRiskCount}</strong><span>${uiLocalizationService.sourceHtml("High risk")}</span></div>
          <div class="card"><strong>${data.qaChecks.length}</strong><span>${uiLocalizationService.sourceHtml("QA issues")}</span></div>
          <div class="card"><strong>${data.analysis.totals.confirmedPercent}%</strong><span>${uiLocalizationService.sourceHtml("Confirmed")}</span></div>
        </div>
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Risk Queue")}</h2>
        <h3>${uiLocalizationService.sourceHtml("By level")}</h3>
        ${reportPresentationService.countTableHtml(riskQueue.byLevel || {}, "No unresolved quality risks.", riskLabel)}
        <h3>${uiLocalizationService.sourceHtml("Quality Categories")}</h3>
        ${reportPresentationService.qualityCategoryCountTableHtml(riskQueue.byCategory || {}, "No categorized quality risks.")}
        <h3>${uiLocalizationService.sourceHtml("Top risks")}</h3>
        ${
          topRiskItems.length
            ? `<table>
          <thead><tr><th>${uiLocalizationService.sourceHtml("Segment")}</th><th>${uiLocalizationService.sourceHtml("File")}</th><th>${uiLocalizationService.sourceHtml("Category")}</th><th>${uiLocalizationService.sourceHtml("Risk")}</th><th>${uiLocalizationService.sourceHtml("Signals")}</th></tr></thead>
          <tbody>${rows(topRiskItems, (item) => [
            `<td>#${escapeHtml(item.label)}</td>`,
            `<td>${escapeHtml(reportPresentationService.safeLabel(item.documentName, uiLocalizationService.source("Document")))}</td>`,
            `<td>${escapeHtml(qualityCategoryName(item.category))}</td>`,
            `<td>${escapeHtml(qualityRiskLevelLabel(item.level))} ${item.score}</td>`,
            `<td>${escapeHtml(
              item.reasons
                .map((reason) => qualityReasonText(reason, source, uiLocalizationService.locale()))
                .slice(0, 3)
                .join(" ")
            )}</td>`
          ])}</tbody>
        </table>`
            : `<p class="muted">${uiLocalizationService.sourceHtml("No unresolved quality risks.")}</p>`
        }
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("QA Evidence")}</h2>
        <h3>${uiLocalizationService.sourceHtml("By severity")}</h3>
        ${reportPresentationService.countTableHtml(data.qaBySeverity)}
        <h3>${uiLocalizationService.sourceHtml("By type")}</h3>
        ${reportPresentationService.countTableHtml(data.qaByType)}
        <h3>${uiLocalizationService.sourceHtml("QA details")}</h3>
        ${reportPresentationService.qaChecksTableHtml(data.qaChecks)}
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Review And AI Evidence")}</h2>
        <div class="cards">
          <div class="card"><strong>${data.analysis.totals.comments}</strong><span>${uiLocalizationService.sourceHtml("Review notes")}</span></div>
          <div class="card"><strong>${passport.ai?.drafts || 0}</strong><span>${uiLocalizationService.sourceHtml("AI initiated")}</span></div>
          <div class="card"><strong>${passport.ai?.reviewRisk || 0}</strong><span>${uiLocalizationService.sourceHtml("AI review risk")}</span></div>
          <div class="card"><strong>${passport.ai?.highRisk || 0}</strong><span>${uiLocalizationService.sourceHtml("High AI risk")}</span></div>
          <div class="card"><strong>${data.tmEntryCount}</strong><span>${uiLocalizationService.sourceHtml("Linked TM units")}</span></div>
          <div class="card"><strong>${data.termCount}</strong><span>${uiLocalizationService.sourceHtml("Linked terms")}</span></div>
        </div>
        <h3>${uiLocalizationService.sourceHtml("Review states")}</h3>
        ${reportPresentationService.countTableHtml(passport.reviewByState || {}, "No review states recorded.", reviewLabel)}
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Export Readiness")}</h2>
        <div class="cards">
          <div class="card"><strong>${validation.errors.length}</strong><span>${uiLocalizationService.sourceHtml("Errors")}</span></div>
          <div class="card"><strong>${validation.risky.length}</strong><span>${uiLocalizationService.sourceHtml("Risks")}</span></div>
          <div class="card"><strong>${validation.warnings.length}</strong><span>${uiLocalizationService.sourceHtml("Warnings")}</span></div>
        </div>
        ${reportPresentationService.listHtml([...validation.errors, ...validation.risky, ...validation.warnings].map(readinessNotice), "No export-readiness findings.")}
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Effort Drivers")}</h2>
        ${reportPresentationService.listHtml((effort.drivers || []).map(effortDriver), "No major post-editing drivers.")}
      </section>
      <footer>
        ${uiLocalizationService.sourceHtml("This passport contains quality settings, counts, risk signals, and readiness evidence. Segment text is not included.")}
      </footer>
    </main>
  </body>
</html>`;
  }

  return Object.freeze({ projectReportHtml, qualityPassportHtml });
}
