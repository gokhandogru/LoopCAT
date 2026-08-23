export function validateDeliveryExportControllerOptions(options) {
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
  if (
    typeof session?.getProject !== "function" ||
    typeof session?.getSegments !== "function" ||
    typeof session?.replaceQaChecks !== "function" ||
    typeof application?.getDocumentId !== "function" ||
    typeof application?.clearQaFilter !== "function" ||
    typeof autosave?.flush !== "function" ||
    typeof documents?.list !== "function" ||
    typeof documents?.type !== "function" ||
    typeof terms?.listForValidation !== "function" ||
    typeof delivery?.plan !== "function" ||
    typeof delivery?.validate !== "function" ||
    typeof delivery?.reportCount !== "function" ||
    typeof delivery?.reportSummary !== "function" ||
    typeof localization?.source !== "function" ||
    typeof confirm !== "function" ||
    typeof displaySafeText !== "function" ||
    typeof qa?.run !== "function" ||
    typeof qa?.tagsForSegment !== "function" ||
    typeof qa?.missingTags !== "function" ||
    !(formats?.localizationTypes instanceof Set) ||
    !(formats?.xliffDocumentTypes instanceof Set) ||
    typeof formats?.buildTargetDocx !== "function" ||
    typeof formats?.buildBilingualDocx !== "function" ||
    typeof formats?.buildTargetXliff !== "function" ||
    typeof formats?.buildLocalizationFile !== "function" ||
    typeof formats?.buildXliff12 !== "function" ||
    typeof formats?.buildXliff22 !== "function" ||
    typeof formats?.localizationMimeType !== "function" ||
    typeof formats?.xliffMimeType !== "function" ||
    typeof fileSafeName !== "function" ||
    typeof download !== "function" ||
    typeof presentation?.renderValidationReport !== "function" ||
    typeof presentation?.renderQaResults !== "function" ||
    typeof activity?.logOptionalProject !== "function" ||
    typeof status?.appendActivityWarning !== "function" ||
    typeof status?.exportMode !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "DeliveryExportController requires session, application, autosave, document, term, delivery, localization, QA, format, download, presentation, activity, and status boundaries."
    );
  }
}

export function createDeliveryCanRun({ delivery, status }) {
  return function canRun(report) {
    if (!report?.ok || report?.canExport === false) {
      if (report?.ok) status.set("Export blocked: review the validation report.", "dirty");
      else status.set(delivery.reportSummary(report), "dirty");
      return false;
    }
    return true;
  };
}
