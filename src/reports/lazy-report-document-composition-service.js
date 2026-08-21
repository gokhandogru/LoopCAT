function captureDependencies(options) {
  const dependencies = {
    localization: options?.localization,
    presentation: options?.presentation,
    escapeHtml: options?.escapeHtml,
    redactSensitiveText: options?.redactSensitiveText,
    defaultQualityProfile: options?.defaultQualityProfile,
    sanitizeValidationReportForDisplay: options?.sanitizeValidationReportForDisplay,
    languagePairDisplay: options?.languagePairDisplay,
    formatDateTime: options?.formatDateTime,
    qualityLabel: options?.qualityLabel,
    qualityCategoryName: options?.qualityCategoryName,
    qualityRiskLevelLabel: options?.qualityRiskLevelLabel
  };
  if (
    typeof dependencies.localization?.source !== "function" ||
    typeof dependencies.localization?.sourceHtml !== "function" ||
    typeof dependencies.localization?.locale !== "function" ||
    typeof dependencies.localization?.direction !== "function" ||
    typeof dependencies.presentation?.countTableHtml !== "function" ||
    typeof dependencies.presentation?.listHtml !== "function" ||
    typeof dependencies.presentation?.qaChecksTableHtml !== "function" ||
    typeof dependencies.presentation?.qualityCategoryCountTableHtml !== "function" ||
    typeof dependencies.presentation?.safeLabel !== "function" ||
    typeof dependencies.escapeHtml !== "function" ||
    typeof dependencies.redactSensitiveText !== "function" ||
    typeof dependencies.defaultQualityProfile !== "function" ||
    typeof dependencies.sanitizeValidationReportForDisplay !== "function" ||
    typeof dependencies.languagePairDisplay !== "function" ||
    typeof dependencies.formatDateTime !== "function" ||
    typeof dependencies.qualityLabel !== "function" ||
    typeof dependencies.qualityCategoryName !== "function" ||
    typeof dependencies.qualityRiskLevelLabel !== "function"
  ) {
    throw new TypeError(
      "ReportDocumentCompositionService requires localization, presentation, escaping, redaction, quality, validation, language, and date boundaries."
    );
  }
  return dependencies;
}

function defaultLoader() {
  return import("./report-document-composition-service.js").then(
    ({ createReportDocumentCompositionService }) => createReportDocumentCompositionService
  );
}

export function createLazyReportDocumentCompositionService(options, lazyOptions = {}) {
  const dependencies = captureDependencies(options);
  const load = Object.hasOwn(lazyOptions, "load") ? lazyOptions.load : defaultLoader;
  if (typeof load !== "function") {
    throw new TypeError("Lazy ReportDocumentCompositionService requires a load function.");
  }
  let servicePromise = null;

  function loadService() {
    if (!servicePromise) {
      servicePromise = Promise.resolve()
        .then(() => load())
        .then((createService) => {
          if (typeof createService !== "function") {
            throw new TypeError("Lazy ReportDocumentCompositionService did not load its factory.");
          }
          const service = createService(dependencies);
          if (typeof service?.projectReportHtml !== "function" || typeof service?.qualityPassportHtml !== "function") {
            throw new TypeError("Lazy ReportDocumentCompositionService did not install its implementation.");
          }
          return service;
        })
        .catch((error) => {
          servicePromise = null;
          throw error;
        });
    }
    return servicePromise;
  }

  async function projectReportHtml(...args) {
    const service = await loadService();
    return service.projectReportHtml(...args);
  }

  async function qualityPassportHtml(...args) {
    const service = await loadService();
    return service.qualityPassportHtml(...args);
  }

  return Object.freeze({ projectReportHtml, qualityPassportHtml });
}
