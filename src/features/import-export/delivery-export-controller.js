import {
  createDeliveryCanRun,
  validateDeliveryExportControllerOptions
} from "./delivery-export-controller-contract.js";

/**
 * Owns Target TXT, target DOCX, bilingual DOCX, Other formats, and XLIFF
 * delivery-export orchestration. Storage, domain validation/planning, format
 * builders, browser downloads, and activity persistence remain injected.
 *
 * @param {{
 *   session: {
 *     getProject: () => any,
 *     getSegments: () => any[],
 *     replaceQaChecks: (checks: any[]) => unknown
 *   },
 *   application: { getDocumentId: () => string, clearQaFilter: () => unknown },
 *   autosave: { flush: () => Promise<any> },
 *   documents: { list: () => any[], type: (documentInfo: any) => string },
 *   terms: { listForValidation: () => Promise<any[]> },
 *   delivery: {
 *     plan: (options: any) => any,
 *     validate: (options: any) => any,
 *     reportCount: (report: any) => number,
 *     reportSummary: (report: any) => string
 *   },
 *   localization: { source: (text: string, values?: Record<string, any>) => string },
 *   confirm: (message: string) => boolean,
 *   displaySafeText: (value: any) => string,
 *   qa: {
 *     worker?: { runQaChecks?: (options: any) => Promise<any[]> } | null,
 *     run: (segments: any[], terms: any[], tagHelpers: any) => any,
 *     tagsForSegment: (segment: any) => any[],
 *     missingTags: (segment: any) => any[]
 *   },
 *   formats: {
 *     localizationTypes: Set<string>,
 *     xliffDocumentTypes: Set<string>,
 *     buildTargetDocx: (project: any, segments: any[]) => Promise<any>,
 *     buildBilingualDocx: (project: any, segments: any[], options: any) => Promise<any> | any,
 *     buildTargetXliff: (project: any, segments: any[], structure: any) => Promise<any> | any,
 *     buildLocalizationFile: (type: string, segments: any[], structure: any) => Promise<any>,
 *     buildXliff12: (project: any, segments: any[]) => Promise<any> | any,
 *     buildXliff22: (project: any, segments: any[]) => Promise<any> | any,
 *     localizationMimeType: (extension: string, structure: any) => string,
 *     xliffMimeType: (version: string) => string
 *   },
 *   fileSafeName: (value: string) => string,
 *   download: (filename: string, content: any, type: string) => unknown,
 *   presentation: { renderValidationReport: (report: any) => unknown, renderQaResults: () => unknown },
 *   activity: { logOptionalProject: (type: string, summary: string, detail: any, label: string) => Promise<boolean> },
 *   status: {
 *     appendActivityWarning: (message: string, activityLogged: boolean) => string,
 *     exportMode: (mode: string, activityLogged: boolean) => string,
 *     set: (message: string, mode: string) => unknown
 *   }
 * }} options
 */
export function createDeliveryExportController(options) {
  const session = options?.session;
  const application = options?.application;
  const autosave = options?.autosave;
  const documents = options?.documents;
  const terms = options?.terms;
  const delivery = options?.delivery;
  const localization = options?.localization;
  const confirm = options?.confirm;
  const displaySafeText = options?.displaySafeText;
  const qa = options?.qa;
  const formats = options?.formats;
  const fileSafeName = options?.fileSafeName;
  const download = options?.download;
  const presentation = options?.presentation;
  const activity = options?.activity;
  const status = options?.status;
  validateDeliveryExportControllerOptions(options);
  const canRun = createDeliveryCanRun({ delivery, status });

  function selectedDocumentForTypes(supportedTypes, selectedTypeMessage, missingMessage) {
    const projectDocuments = documents.list();
    const selected = application.getDocumentId()
      ? projectDocuments.find((item) => item.id === application.getDocumentId())
      : null;
    if (selected) {
      if (supportedTypes.has(documents.type(selected))) return selected;
      status.set(selectedTypeMessage, "dirty");
      return null;
    }
    const documentInfo = projectDocuments.find((item) => supportedTypes.has(documents.type(item)));
    if (!documentInfo) status.set(missingMessage, "dirty");
    return documentInfo || null;
  }

  function selectedDocument() {
    if (!application.getDocumentId()) return null;
    return documents.list().find((documentInfo) => documentInfo.id === application.getDocumentId()) || null;
  }

  function scopedSegments() {
    const documentInfo = selectedDocument();
    return {
      documentInfo,
      segments: documentInfo
        ? session.getSegments().filter((segment) => segment.documentId === documentInfo.id)
        : session.getSegments()
    };
  }

  function scopedBaseName(baseName, documentInfo) {
    const base = fileSafeName(baseName || session.getProject()?.name || "project");
    return documentInfo ? `${base}_${fileSafeName(documentInfo.name || "current-file")}` : base;
  }

  function addScopeNote(report, documentInfo, label) {
    if (report?.preserved && documentInfo) {
      report.preserved.push(`${displaySafeText(documentInfo.name || "Current file")} selected for ${label} export.`);
    }
  }

  function canRunBilingual(report) {
    if (!report?.ok || report?.canExport === false) {
      if (report?.ok) status.set("Bilingual DOCX blocked: review the validation report.", "dirty");
      else status.set(delivery.reportSummary(report), "dirty");
      return false;
    }
    return true;
  }

  function activityDetail(plan) {
    return {
      emptyTargetPolicy: plan.policy,
      emptyTargetCount: plan.emptyTargetCount,
      sourceFallbackCount: plan.sourceFallbackCount,
      preservedEmptyTargetCount: plan.preservedEmptyTargetCount,
      draftTargetCount: plan.draftTargetCount
    };
  }

  function hasWarnings(plan) {
    return Boolean(plan.emptyTargetCount || plan.draftTargetCount);
  }

  function incompleteScopeLabel(documentInfo, fallbackLabel) {
    return documentInfo?.name ? displaySafeText(documentInfo.name) : fallbackLabel;
  }

  function confirmIncomplete(plan, documentInfo, fallbackLabel) {
    if (!plan.requiresConfirmation) return true;
    const lines = [
      localization.source("The export scope {value1} contains incomplete translation work.", {
        value1: incompleteScopeLabel(documentInfo, fallbackLabel)
      })
    ];
    if (plan.sourceFallbackCount) {
      lines.push(
        localization.source("{value1} empty target segment(s) will export source text.", {
          value1: plan.sourceFallbackCount
        })
      );
    }
    if (plan.preservedEmptyTargetCount) {
      lines.push(
        localization.source("{value1} empty target segment(s) will remain empty in the exported interchange file.", {
          value1: plan.preservedEmptyTargetCount
        })
      );
    }
    if (plan.draftTargetCount) {
      lines.push(
        localization.source("{value1} non-empty unconfirmed target segment(s) will export as written.", {
          value1: plan.draftTargetCount
        })
      );
    }
    lines.push(localization.source("Export anyway?"));
    return confirm(lines.join("\n\n"));
  }

  function completedMessage(baseMessage, plan) {
    const notes = [];
    if (plan.sourceFallbackCount) {
      notes.push(`${plan.sourceFallbackCount} source fallback${plan.sourceFallbackCount === 1 ? "" : "s"}`);
    }
    if (plan.preservedEmptyTargetCount) {
      notes.push(`${plan.preservedEmptyTargetCount} empty target${plan.preservedEmptyTargetCount === 1 ? "" : "s"}`);
    }
    if (plan.draftTargetCount) {
      notes.push(`${plan.draftTargetCount} unconfirmed target${plan.draftTargetCount === 1 ? "" : "s"}`);
    }
    return notes.length ? `${baseMessage} with ${notes.join(" and ")}` : baseMessage;
  }

  function cancelIncomplete() {
    status.set("Export cancelled; no file was created.", "dirty");
  }

  function finish(message, plan, activityLogged) {
    status.set(
      status.appendActivityWarning(message, activityLogged),
      status.exportMode(hasWarnings(plan) ? "dirty" : "saved", activityLogged)
    );
  }

  async function exportTargetText() {
    if (!session.getProject()) return;
    try {
      await autosave.flush();
      const { documentInfo, segments } = scopedSegments();
      const exportPlan = delivery.plan({ format: "txt", documentInfo, segments });
      const report = delivery.validate({
        project: session.getProject(),
        segments,
        format: "txt",
        terms: await terms.listForValidation(),
        exportPlan
      });
      addScopeNote(report, documentInfo, "Target TXT");
      presentation.renderValidationReport(report);
      if (!canRun(report)) return;
      if (!confirmIncomplete(exportPlan, documentInfo, session.getProject().name || "project")) {
        cancelIncomplete();
        return;
      }
      const content = exportPlan.segments.map((segment) => segment.target.trim()).join("\n\n");
      const base = scopedBaseName(session.getProject().name || "project", documentInfo);
      download(`${base}_${session.getProject().targetLang}.txt`, content, "text/plain");
      const activityLogged = await activity.logOptionalProject(
        "export",
        "Target TXT exported",
        {
          documentId: documentInfo?.id || "",
          fileName: documentInfo?.name || "",
          segmentCount: segments.length,
          ...activityDetail(exportPlan)
        },
        "Target TXT export"
      );
      finish(completedMessage("Target TXT exported", exportPlan), exportPlan, activityLogged);
    } catch (error) {
      status.set(error.message || "Target TXT export failed", "dirty");
    }
  }

  async function exportTargetDocx() {
    if (!session.getProject()) return;
    try {
      await autosave.flush();
      const documentInfo = selectedDocumentForTypes(
        new Set(["docx"]),
        "The selected file is not a DOCX document.",
        "Select a DOCX document to export."
      );
      if (!documentInfo) return;
      const segments = session.getSegments().filter((segment) => segment.documentId === documentInfo.id);
      const exportPlan = delivery.plan({ format: "docx", documentInfo, segments });
      const report = delivery.validate({
        project: session.getProject(),
        segments,
        documentInfo,
        format: "docx",
        terms: await terms.listForValidation(),
        exportPlan
      });
      presentation.renderValidationReport(report);
      if (!canRun(report)) return;
      if (!confirmIncomplete(exportPlan, documentInfo, session.getProject().name || "project")) {
        cancelIncomplete();
        return;
      }
      const docxStructure =
        session.getProject().docxStructures?.[documentInfo.id] || session.getProject().docxStructure;
      const base = fileSafeName(session.getProject().name || "project");
      const bytes = await formats.buildTargetDocx({ ...session.getProject(), docxStructure }, exportPlan.segments);
      download(
        `${base}_${fileSafeName(documentInfo.name)}_${session.getProject().targetLang}.docx`,
        bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      const activityLogged = await activity.logOptionalProject(
        "export",
        "Target DOCX exported",
        {
          documentId: documentInfo.id,
          fileName: documentInfo.name,
          segmentCount: segments.length,
          ...activityDetail(exportPlan)
        },
        "Target DOCX export"
      );
      finish(completedMessage("DOCX exported", exportPlan), exportPlan, activityLogged);
    } catch (error) {
      status.set(error.message || "DOCX export failed", "dirty");
    }
  }

  async function exportBilingualDocx() {
    if (!session.getProject()) return;
    try {
      await autosave.flush();
      const validationTerms = await terms.listForValidation();
      const report = delivery.validate({
        project: session.getProject(),
        segments: session.getSegments(),
        format: "bilingual-docx",
        terms: validationTerms
      });
      presentation.renderValidationReport(report);
      if (!canRunBilingual(report)) return;
      const qaSegments = session.getSegments().map((segment) => ({
        ...segment,
        tags: qa.tagsForSegment(segment)
      }));
      const fallback = () =>
        Promise.resolve(qa.run(session.getSegments(), validationTerms, { missingTags: qa.missingTags }));
      const qaChecks = qa.worker?.runQaChecks
        ? await qa.worker.runQaChecks({ segments: qaSegments, terms: validationTerms, fallback })
        : await fallback();
      session.replaceQaChecks(qaChecks);
      application.clearQaFilter();
      presentation.renderQaResults();
      const base = fileSafeName(session.getProject().name || "project");
      const bytes = await formats.buildBilingualDocx(session.getProject(), session.getSegments(), { qaChecks });
      download(
        `${base}_bilingual.docx`,
        bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      const activityLogged = await activity.logOptionalProject(
        "export",
        "Bilingual DOCX exported",
        {
          segmentCount: session.getSegments().length,
          qaIssueCount: qaChecks.length,
          validationNoteCount: delivery.reportCount(report)
        },
        "Bilingual DOCX export"
      );
      const hasNotes = delivery.reportCount(report) || qaChecks.length;
      status.set(
        status.appendActivityWarning(
          hasNotes ? "Bilingual DOCX exported with notes" : "Bilingual DOCX exported",
          activityLogged
        ),
        status.exportMode(hasNotes ? "dirty" : "saved", activityLogged)
      );
    } catch (error) {
      status.set(error.message || "Bilingual DOCX export failed", "dirty");
    }
  }

  async function exportLocalization() {
    try {
      if (!session.getProject()) return;
      await autosave.flush();
      const documentInfo = selectedDocumentForTypes(
        formats.localizationTypes,
        "The selected file is not exportable from Other formats.",
        "Select a document from Other formats to export."
      );
      if (!documentInfo) return;
      const documentType = documents.type(documentInfo);
      const exportDocumentInfo = { ...documentInfo, type: documentType };
      const segments = session.getSegments().filter((segment) => segment.documentId === documentInfo.id);
      const structure = session.getProject().localizationStructures?.[documentInfo.id];
      const exportPlan = delivery.plan({
        format: documentType,
        documentInfo: exportDocumentInfo,
        structure,
        segments
      });
      const report = delivery.validate({
        project: session.getProject(),
        segments,
        documentInfo: exportDocumentInfo,
        format: documentType,
        terms: await terms.listForValidation(),
        exportPlan,
        structure
      });
      presentation.renderValidationReport(report);
      if (!canRun(report)) return;
      if (!confirmIncomplete(exportPlan, exportDocumentInfo, session.getProject().name || "project")) {
        cancelIncomplete();
        return;
      }
      const content = formats.xliffDocumentTypes.has(documentType)
        ? await formats.buildTargetXliff(session.getProject(), exportPlan.segments, structure)
        : await formats.buildLocalizationFile(documentType, exportPlan.segments, structure);
      const extension = documentType === "yml" ? "yaml" : documentType === "markdown" ? "md" : documentType;
      const type = formats.localizationMimeType(extension, structure);
      download(`${fileSafeName(documentInfo.name)}_${session.getProject().targetLang}.${extension}`, content, type);
      const activityLogged = await activity.logOptionalProject(
        "export",
        "Localization file exported",
        {
          documentId: documentInfo.id,
          documentType,
          segmentCount: segments.length,
          ...activityDetail(exportPlan)
        },
        "Localization export"
      );
      finish(completedMessage("Localization file exported", exportPlan), exportPlan, activityLogged);
    } catch (error) {
      status.set(error.message || "Localization export failed", "dirty");
    }
  }

  async function exportXliff(version = "1.2") {
    if (!session.getProject()) return;
    try {
      await autosave.flush();
      const { documentInfo, segments } = scopedSegments();
      const exportPlan = delivery.plan({ format: "xliff", documentInfo, segments });
      const report = delivery.validate({
        project: session.getProject(),
        segments,
        format: "xliff",
        terms: await terms.listForValidation(),
        exportPlan
      });
      addScopeNote(report, documentInfo, "XLIFF");
      presentation.renderValidationReport(report);
      if (!canRun(report)) return;
      if (!confirmIncomplete(exportPlan, documentInfo, session.getProject().name || "project")) {
        cancelIncomplete();
        return;
      }
      const base = scopedBaseName(session.getProject().name || "project", documentInfo);
      const exportProject = documentInfo
        ? { ...session.getProject(), sourceFileName: documentInfo.name }
        : session.getProject();
      const isXliff22 = version === "2.2";
      const content = isXliff22
        ? await formats.buildXliff22(exportProject, exportPlan.segments)
        : await formats.buildXliff12(exportProject, exportPlan.segments);
      const label = isXliff22 ? "XLIFF 2.2" : "XLIFF";
      const exportedMessage = isXliff22 ? "XLIFF 2.2 exported" : "XLIFF exported";
      download(
        `${base}_${session.getProject().sourceLang}-${session.getProject().targetLang}.xlf`,
        content,
        formats.xliffMimeType(version)
      );
      const activityLogged = await activity.logOptionalProject(
        "export",
        exportedMessage,
        {
          documentId: documentInfo?.id || "",
          fileName: documentInfo?.name || "",
          segmentCount: segments.length,
          xliffVersion: version,
          ...activityDetail(exportPlan)
        },
        `${label} export`
      );
      finish(completedMessage(exportedMessage, exportPlan), exportPlan, activityLogged);
    } catch (error) {
      status.set(error.message || (version === "2.2" ? "XLIFF 2.2 export failed" : "XLIFF export failed"), "dirty");
    }
  }

  const exportXliff12 = () => exportXliff();
  const exportXliff22 = () => exportXliff("2.2");
  return Object.freeze({
    canRun,
    exportBilingualDocx,
    exportLocalization,
    exportTargetDocx,
    exportTargetText,
    exportXliff12,
    exportXliff22
  });
}
