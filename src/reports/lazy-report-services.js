function captureDataDependencies(options) {
  const dependencies = {
    session: options?.session,
    autosave: options?.autosave,
    resources: options?.resources,
    repositories: options?.repositories,
    portable: options?.portable,
    reporting: options?.reporting,
    worker: options?.worker,
    tags: options?.tags,
    redactSensitiveText: options?.redactSensitiveText,
    timestamp: options?.timestamp
  };
  if (
    typeof dependencies.session?.getProject !== "function" ||
    typeof dependencies.session?.getSegments !== "function" ||
    typeof dependencies.autosave?.flush !== "function" ||
    typeof dependencies.resources?.getTmNames !== "function" ||
    typeof dependencies.resources?.getTermBaseNames !== "function" ||
    typeof dependencies.resources?.summarize !== "function" ||
    typeof dependencies.repositories?.getAllByIndex !== "function" ||
    typeof dependencies.repositories?.listTerms !== "function" ||
    typeof dependencies.repositories?.listActivityEvents !== "function" ||
    typeof dependencies.portable?.sanitize !== "function" ||
    typeof dependencies.reporting?.validateExportReadiness !== "function" ||
    typeof dependencies.reporting?.analyzeProject !== "function" ||
    typeof dependencies.reporting?.runQaChecks !== "function" ||
    typeof dependencies.reporting?.buildQualityPassportData !== "function" ||
    typeof dependencies.tags?.forSegment !== "function" ||
    typeof dependencies.tags?.missing !== "function" ||
    typeof dependencies.redactSensitiveText !== "function" ||
    typeof dependencies.timestamp !== "function"
  ) {
    throw new TypeError(
      "ReportDataService requires session, autosave, resource, repository, portable, reporting, tag, redaction, and clock boundaries."
    );
  }
  return dependencies;
}

function captureExportDependencies(options) {
  const dependencies = {
    session: options?.session,
    application: options?.application,
    documents: options?.documents,
    fileSafeName: options?.fileSafeName,
    download: options?.download,
    presentation: options?.presentation,
    validation: options?.validation,
    activity: options?.activity,
    status: options?.status
  };
  if (
    typeof dependencies.session?.getProject !== "function" ||
    typeof dependencies.session?.replaceQaChecks !== "function" ||
    typeof dependencies.session?.replaceQualityRiskQueue !== "function" ||
    typeof dependencies.application?.clearQaFilter !== "function" ||
    typeof dependencies.documents?.projectReportHtml !== "function" ||
    typeof dependencies.documents?.qualityPassportHtml !== "function" ||
    typeof dependencies.fileSafeName !== "function" ||
    typeof dependencies.download !== "function" ||
    typeof dependencies.presentation?.renderQaResults !== "function" ||
    typeof dependencies.presentation?.renderQualityWorkbench !== "function" ||
    typeof dependencies.presentation?.renderValidationReport !== "function" ||
    typeof dependencies.validation?.reportCount !== "function" ||
    typeof dependencies.activity?.logOptionalProject !== "function" ||
    typeof dependencies.status?.appendActivityWarning !== "function" ||
    typeof dependencies.status?.exportMode !== "function" ||
    typeof dependencies.status?.set !== "function"
  ) {
    throw new TypeError(
      "ReportExportController requires session, application, data, document, download, presentation, validation, activity, and status boundaries."
    );
  }
  return dependencies;
}

function defaultLoader() {
  return import("./install-report-services.js").then(({ installReportServices }) => installReportServices);
}

export function createLazyReportServices(options, lazyOptions = {}) {
  const dataDependencies = captureDataDependencies(options?.data);
  const load = Object.hasOwn(lazyOptions, "load") ? lazyOptions.load : defaultLoader;
  if (typeof load !== "function") throw new TypeError("Lazy report services require a load function.");
  let exportDependencies = null;
  let loadPromise = null;

  function loadServices() {
    if (!exportDependencies) {
      throw new TypeError("Lazy report services require export dependencies before first use.");
    }
    if (!loadPromise) {
      loadPromise = Promise.resolve()
        .then(() => load())
        .then((install) => {
          if (typeof install !== "function") throw new TypeError("Lazy report services did not load their installer.");
          const services = install({ data: dataDependencies, exports: exportDependencies });
          if (
            typeof services?.data?.build !== "function" ||
            typeof services?.exports?.exportProjectReport !== "function" ||
            typeof services?.exports?.exportAnonymizedReport !== "function" ||
            typeof services?.exports?.exportQualityPassport !== "function"
          ) {
            throw new TypeError("Lazy report services did not install their implementations.");
          }
          return services;
        })
        .catch((error) => {
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  }

  async function invoke(group, method, args) {
    const services = await loadServices();
    return services[group][method](...args);
  }

  const data = Object.freeze({
    build: (...args) => invoke("data", "build", args)
  });
  const exports = Object.freeze({
    exportProjectReport: (...args) => invoke("exports", "exportProjectReport", args),
    exportAnonymizedReport: (...args) => invoke("exports", "exportAnonymizedReport", args),
    exportQualityPassport: (...args) => invoke("exports", "exportQualityPassport", args)
  });

  function createExports(options) {
    exportDependencies = captureExportDependencies(options);
    return exports;
  }

  return Object.freeze({ createExports, data });
}
