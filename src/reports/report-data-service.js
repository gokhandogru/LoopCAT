/**
 * Owns the asynchronous data-collection and aggregation pipeline shared by
 * Project Report and Quality Passport exports. Report document composition,
 * download, persistence, UI refresh, activity, and status effects remain
 * outside this service.
 *
 * @param {{
 *   session: { getProject: () => any, getSegments: () => any[] },
 *   autosave: { flush: () => Promise<any> },
 *   resources: { getTmNames: () => string[], getTermBaseNames: () => string[], summarize: (project: any) => any },
 *   repositories: {
 *     getAllByIndex: (store: string, index: string, value: string) => Promise<any[]>,
 *     listTerms: (query: any) => Promise<any[]>,
 *     listActivityEvents: (projectId: string) => Promise<any[]>
 *   },
 *   portable: { sanitize: (value: any, key: string) => any },
 *   reporting: {
 *     validateExportReadiness: (options: any) => any,
 *     analyzeProject: (project: any, segments: any[], tmEntries: any[]) => any,
 *     runQaChecks: (segments: any[], terms: any[], tagHelpers: any) => any,
 *     buildQualityPassportData: (options: any) => any
 *   },
 *   worker?: { runQaChecks?: (options: any) => Promise<any[]> } | null,
 *   tags: { forSegment: (segment: any) => any[], missing: (segment: any) => any[] },
 *   redactSensitiveText: (value: any) => string,
 *   timestamp: () => string
 * }} options
 */
export function createReportDataService(options) {
  const session = options?.session;
  const autosave = options?.autosave;
  const resources = options?.resources;
  const repositories = options?.repositories;
  const portable = options?.portable;
  const reporting = options?.reporting;
  const worker = options?.worker;
  const tags = options?.tags;
  const redactSensitiveText = options?.redactSensitiveText;
  const timestamp = options?.timestamp;
  if (
    typeof session?.getProject !== "function" ||
    typeof session?.getSegments !== "function" ||
    typeof autosave?.flush !== "function" ||
    typeof resources?.getTmNames !== "function" ||
    typeof resources?.getTermBaseNames !== "function" ||
    typeof resources?.summarize !== "function" ||
    typeof repositories?.getAllByIndex !== "function" ||
    typeof repositories?.listTerms !== "function" ||
    typeof repositories?.listActivityEvents !== "function" ||
    typeof portable?.sanitize !== "function" ||
    typeof reporting?.validateExportReadiness !== "function" ||
    typeof reporting?.analyzeProject !== "function" ||
    typeof reporting?.runQaChecks !== "function" ||
    typeof reporting?.buildQualityPassportData !== "function" ||
    typeof tags?.forSegment !== "function" ||
    typeof tags?.missing !== "function" ||
    typeof redactSensitiveText !== "function" ||
    typeof timestamp !== "function"
  ) {
    throw new TypeError(
      "ReportDataService requires session, autosave, resource, repository, portable, reporting, tag, redaction, and clock boundaries."
    );
  }
  function countBy(items, keyFn) {
    return (items || []).reduce((counts, item) => {
      const key = keyFn(item) || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  async function build() {
    await autosave.flush();
    const tmNames = new Set(resources.getTmNames());
    const [tmEntries, terms, activityEvents] = await Promise.all([
      repositories.getAllByIndex(
        "tmEntries",
        "languagePair",
        `${session.getProject().sourceLang}::${session.getProject().targetLang}`
      ),
      repositories.listTerms({
        sourceLang: session.getProject().sourceLang,
        targetLang: session.getProject().targetLang,
        termBaseNames: resources.getTermBaseNames()
      }),
      repositories.listActivityEvents(session.getProject().id)
    ]);
    const scopedTm = tmEntries.filter((entry) => tmNames.has(entry.tmName));
    const reportActivityEvents = portable.sanitize(activityEvents, "activityEvents");
    const validation = reporting.validateExportReadiness({
      project: session.getProject(),
      segments: session.getSegments(),
      format: "project-report",
      terms
    });
    const analysis = reporting.analyzeProject(session.getProject(), session.getSegments(), scopedTm);
    const qaSegments = session.getSegments().map((segment) => ({
      ...segment,
      tags: tags.forSegment(segment)
    }));
    const fallback = () =>
      Promise.resolve(reporting.runQaChecks(session.getSegments(), terms, { missingTags: tags.missing }));
    const qaChecks = worker?.runQaChecks
      ? await worker.runQaChecks({ segments: qaSegments, terms, fallback })
      : await fallback();
    const qualityPassport = reporting.buildQualityPassportData({
      project: session.getProject(),
      segments: session.getSegments(),
      qaChecks,
      validation,
      analysis,
      terms,
      activityEvents: reportActivityEvents,
      tmEntries: scopedTm,
      tmEntryCount: scopedTm.length,
      termCount: terms.length,
      profile: session.getProject().qualityProfile
    });
    return {
      generatedAt: timestamp(),
      project: session.getProject(),
      resources: resources.summarize(session.getProject()),
      analysis,
      validation,
      qualityPassport,
      qaChecks,
      qaBySeverity: countBy(qaChecks, (check) => check.severity),
      qaByType: countBy(qaChecks, (check) => check.type),
      reviewByState: countBy(
        session.getSegments().filter((segment) => segment.reviewState),
        (segment) => segment.reviewState
      ),
      activityEvents: reportActivityEvents,
      activityByType: countBy(reportActivityEvents, (event) => event.type),
      tmEntryCount: scopedTm.length,
      termCount: terms.length,
      forbiddenTermCount: terms.filter((term) => term.isForbidden).length,
      revisionCount: session
        .getSegments()
        .reduce((sum, segment) => sum + (Array.isArray(segment.targetHistory) ? segment.targetHistory.length : 0), 0),
      terms: terms
        .map((term) => ({
          sourceTerm: term.sourceTerm || "",
          targetTerm: term.targetTerm || "",
          termBaseName: term.termBaseName || "",
          notes: redactSensitiveText(term.notes || "").trim(),
          isForbidden: Boolean(term.isForbidden)
        }))
        .sort((a, b) => a.termBaseName.localeCompare(b.termBaseName) || a.sourceTerm.localeCompare(b.sourceTerm))
    };
  }

  return Object.freeze({ build });
}
