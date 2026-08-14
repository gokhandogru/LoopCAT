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
    <style>
      :root { color-scheme: light; font-family: Arial, sans-serif; color: #1f2937; background: #f6f8fa; }
      body { margin: 0; padding: 32px; }
      main { max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #d9e0e7; border-radius: 8px; overflow: hidden; }
      header { padding: 28px 32px; background: #202936; color: #fff; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { font-size: 26px; margin-bottom: 8px; }
      h2 { font-size: 18px; margin-bottom: 12px; }
      section { padding: 24px 32px; border-top: 1px solid #e5eaf0; }
      .meta, .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
      .card { border: 1px solid #d9e0e7; border-radius: 8px; padding: 14px; background: #fbfcfd; }
      .card strong { display: block; font-size: 22px; margin-bottom: 4px; }
      .muted { color: #657386; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { border-bottom: 1px solid #e5eaf0; padding: 9px 8px; text-align: left; vertical-align: top; }
      th { color: #405064; background: #f4f7f9; }
      ul { margin: 0; padding-left: 20px; }
      footer { padding: 18px 32px; color: #657386; font-size: 12px; border-top: 1px solid #e5eaf0; }
    </style>
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
        ${reportPresentationService.countTableHtml(qualityRiskQueue.byLevel || {}, "No unresolved quality risks.")}
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
        ${reportPresentationService.countTableHtml(validationCounts)}
        <h3>${uiLocalizationService.sourceHtml("Risk and warnings")}</h3>
        ${reportPresentationService.listHtml([...validation.risky, ...validation.warnings], "No risk or warning notes.")}
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
    <style>
      :root { color-scheme: light; font-family: Arial, sans-serif; color: #1f2937; background: #f6f8fa; }
      body { margin: 0; padding: 32px; }
      main { max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #d9e0e7; border-radius: 8px; overflow: hidden; }
      header { padding: 28px 32px; background: #202936; color: #fff; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { font-size: 26px; margin-bottom: 8px; }
      h2 { font-size: 18px; margin-bottom: 12px; }
      section { padding: 24px 32px; border-top: 1px solid #e5eaf0; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
      .card { border: 1px solid #d9e0e7; border-radius: 8px; padding: 14px; background: #fbfcfd; }
      .card strong { display: block; font-size: 22px; margin-bottom: 4px; }
      .muted { color: #657386; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { border-bottom: 1px solid #e5eaf0; padding: 9px 8px; text-align: left; vertical-align: top; }
      th { color: #405064; background: #f4f7f9; }
      ul { margin: 0; padding-left: 20px; }
      footer { padding: 18px 32px; color: #657386; font-size: 12px; border-top: 1px solid #e5eaf0; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${uiLocalizationService.sourceHtml("LoopCAT Quality Passport")}</h1>
        <p>${escapeHtml(projectTitle)} - ${escapeHtml(languagePairDisplay(project.sourceLang, project.targetLang))}</p>
        <p class="muted">${uiLocalizationService.sourceHtml("Generated {date}", { date: formatDateTime(passport.generatedAt || data.generatedAt) })}</p>
      </header>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Quality Contract")}</h2>
        <table>
          <tbody>
            <tr><th>${uiLocalizationService.sourceHtml("Standard")}</th><td>${escapeHtml(qualityLabel(profile.standard))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Review depth")}</th><td>${escapeHtml(qualityLabel(profile.reviewDepth))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Risk tolerance")}</th><td>${escapeHtml(qualityLabel(profile.riskTolerance))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Terminology")}</th><td>${escapeHtml(qualityLabel(profile.terminologyStrictness))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("AI disclosure")}</th><td>${escapeHtml(qualityLabel(profile.aiDisclosure))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Audience")}</th><td>${escapeHtml(reportPresentationService.safeLabel(profile.audience, uiLocalizationService.source("Not set")))}</td></tr>
            <tr><th>${uiLocalizationService.sourceHtml("Tone")}</th><td>${escapeHtml(reportPresentationService.safeLabel(profile.tone, uiLocalizationService.source("Neutral")))}</td></tr>
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
        ${reportPresentationService.countTableHtml(riskQueue.byLevel || {}, "No unresolved quality risks.")}
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
                .map((reason) => reason.label)
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
        ${reportPresentationService.countTableHtml(passport.reviewByState || {}, "No review states recorded.")}
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Export Readiness")}</h2>
        <div class="cards">
          <div class="card"><strong>${validation.errors.length}</strong><span>${uiLocalizationService.sourceHtml("Errors")}</span></div>
          <div class="card"><strong>${validation.risky.length}</strong><span>${uiLocalizationService.sourceHtml("Risks")}</span></div>
          <div class="card"><strong>${validation.warnings.length}</strong><span>${uiLocalizationService.sourceHtml("Warnings")}</span></div>
        </div>
        ${reportPresentationService.listHtml([...validation.errors, ...validation.risky, ...validation.warnings], "No export-readiness findings.")}
      </section>
      <section>
        <h2>${uiLocalizationService.sourceHtml("Effort Drivers")}</h2>
        ${reportPresentationService.listHtml(effort.drivers || [], "No major post-editing drivers.")}
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
