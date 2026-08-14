/**
 * Owns Project Report, anonymized report, and Quality Passport export
 * orchestration. Report data collection, document composition, report CSP
 * policy, download mechanics, activity persistence, and presentation remain
 * behind injected boundaries.
 *
 * @param {{
 *   session: {
 *     getProject: () => any,
 *     replaceQaChecks: (checks: any[]) => unknown,
 *     replaceQualityRiskQueue: (queue: any) => unknown
 *   },
 *   application: { clearQaFilter: () => unknown },
 *   data: { build: () => Promise<any> },
 *   documents: {
 *     projectReportHtml: (data: any, options: { anonymized: boolean }) => string,
 *     qualityPassportHtml: (data: any) => string
 *   },
 *   finalizeDocument: (html: string) => string,
 *   fileSafeName: (value: string) => string,
 *   download: (filename: string, content: string, type: string) => unknown,
 *   presentation: {
 *     renderQaResults: () => unknown,
 *     renderQualityWorkbench: () => unknown,
 *     renderValidationReport: (report: any) => unknown
 *   },
 *   validation: { reportCount: (report: any) => number },
 *   activity: { logOptionalProject: (type: string, summary: string, detail: any, label: string) => Promise<boolean> },
 *   status: {
 *     appendActivityWarning: (message: string, activityLogged: boolean) => string,
 *     exportMode: (mode: string, activityLogged: boolean) => string,
 *     set: (message: string, mode: string) => unknown
 *   }
 * }} options
 */
export function createReportExportController(options) {
  const session = options?.session;
  const application = options?.application;
  const data = options?.data;
  const documents = options?.documents;
  const finalizeDocument = options?.finalizeDocument;
  const fileSafeName = options?.fileSafeName;
  const download = options?.download;
  const presentation = options?.presentation;
  const validation = options?.validation;
  const activity = options?.activity;
  const status = options?.status;
  if (
    typeof session?.getProject !== "function" ||
    typeof session?.replaceQaChecks !== "function" ||
    typeof session?.replaceQualityRiskQueue !== "function" ||
    typeof application?.clearQaFilter !== "function" ||
    typeof data?.build !== "function" ||
    typeof documents?.projectReportHtml !== "function" ||
    typeof documents?.qualityPassportHtml !== "function" ||
    typeof finalizeDocument !== "function" ||
    typeof fileSafeName !== "function" ||
    typeof download !== "function" ||
    typeof presentation?.renderQaResults !== "function" ||
    typeof presentation?.renderQualityWorkbench !== "function" ||
    typeof presentation?.renderValidationReport !== "function" ||
    typeof validation?.reportCount !== "function" ||
    typeof activity?.logOptionalProject !== "function" ||
    typeof status?.appendActivityWarning !== "function" ||
    typeof status?.exportMode !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "ReportExportController requires session, application, data, document, download, presentation, validation, activity, and status boundaries."
    );
  }

  async function exportQualityPassport() {
    if (!session.getProject()) return;
    try {
      const reportData = await data.build();
      session.replaceQaChecks(reportData.qaChecks);
      application.clearQaFilter();
      session.replaceQualityRiskQueue(reportData.qualityPassport.riskQueue);
      presentation.renderQaResults();
      presentation.renderQualityWorkbench();
      presentation.renderValidationReport(reportData.validation);
      const base = fileSafeName(session.getProject().name || "project");
      download(
        `${base}_quality-passport.html`,
        finalizeDocument(documents.qualityPassportHtml(reportData)),
        "text/html"
      );
      const activityLogged = await activity.logOptionalProject(
        "export",
        "Quality Passport exported",
        {
          segmentCount: reportData.analysis.totals.segments,
          wordCount: reportData.analysis.totals.words,
          qaIssueCount: reportData.qaChecks.length,
          qualityScore: reportData.qualityPassport.confidenceScore,
          highRiskCount: reportData.qualityPassport.riskQueue.highRiskCount,
          validationNoteCount: validation.reportCount(reportData.validation)
        },
        "Quality Passport export"
      );
      const hasNotes =
        reportData.qaChecks.length ||
        reportData.qualityPassport.riskQueue.highRiskCount ||
        validation.reportCount(reportData.validation);
      status.set(
        status.appendActivityWarning(
          hasNotes ? "Quality Passport exported with notes" : "Quality Passport exported",
          activityLogged
        ),
        status.exportMode(hasNotes ? "dirty" : "saved", activityLogged)
      );
    } catch (error) {
      status.set(error.message || "Quality Passport export failed", "dirty");
    }
  }

  async function exportProjectReport(options = {}) {
    if (!session.getProject()) return;
    try {
      const anonymized = Boolean(options.anonymized);
      const reportData = await data.build();
      session.replaceQaChecks(reportData.qaChecks);
      application.clearQaFilter();
      presentation.renderQaResults();
      presentation.renderValidationReport(reportData.validation);
      const base = fileSafeName(session.getProject().name || "project");
      download(
        `${base}_${anonymized ? "anonymized-" : ""}project-report.html`,
        finalizeDocument(documents.projectReportHtml(reportData, { anonymized })),
        "text/html"
      );
      const label = anonymized ? "Anonymized report" : "Project report";
      const activityLogged = await activity.logOptionalProject(
        "export",
        anonymized ? "Anonymized project report exported" : "Project report exported",
        {
          segmentCount: reportData.analysis.totals.segments,
          wordCount: reportData.analysis.totals.words,
          qaIssueCount: reportData.qaChecks.length,
          validationNoteCount: validation.reportCount(reportData.validation),
          anonymized
        },
        `${label} export`
      );
      const hasNotes = reportData.qaChecks.length || validation.reportCount(reportData.validation);
      const message = hasNotes ? `${label} exported with notes` : `${label} exported`;
      status.set(
        status.appendActivityWarning(message, activityLogged),
        status.exportMode(hasNotes ? "dirty" : "saved", activityLogged)
      );
    } catch (error) {
      status.set(error.message || "Project report export failed", "dirty");
    }
  }

  const exportAnonymizedReport = () => exportProjectReport({ anonymized: true });
  return Object.freeze({ exportProjectReport, exportAnonymizedReport, exportQualityPassport });
}
