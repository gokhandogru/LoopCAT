export function validateProjectExportControllerOptions(options) {
  const build = options?.build;
  const session = options?.session;
  const persistence = options?.persistence;
  const activity = options?.activity;
  const files = options?.files;
  const validation = options?.validation;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;
  const clock = options?.clock;
  const test = options?.test;
  const logger = options?.logger;

  if (
    typeof build?.buildBackupExport !== "function" ||
    typeof build?.buildProjectPackage !== "function" ||
    typeof build?.assertValidProjectPackageForWrite !== "function" ||
    typeof session?.getProject !== "function" ||
    typeof session?.getProjects !== "function" ||
    typeof session?.replaceProject !== "function" ||
    typeof session?.replaceProjects !== "function" ||
    typeof session?.replaceActivityEvents !== "function" ||
    typeof persistence?.updateProject !== "function" ||
    typeof persistence?.bulkPut !== "function" ||
    typeof persistence?.listActivityEvents !== "function" ||
    typeof activity?.draft !== "function" ||
    typeof activity?.appendWarning !== "function" ||
    typeof files?.safeName !== "function" ||
    typeof files?.download !== "function" ||
    typeof validation?.count !== "function" ||
    typeof validation?.errorReport !== "function" ||
    typeof presentation?.renderValidation !== "function" ||
    typeof presentation?.renderEditor !== "function" ||
    typeof presentation?.renderBackupReminder !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof status?.set !== "function" ||
    typeof status?.mode !== "function" ||
    typeof clock?.now !== "function" ||
    typeof clock?.nowMs !== "function" ||
    typeof test?.shouldFailActivity !== "function" ||
    typeof logger?.warn !== "function"
  ) {
    throw new TypeError(
      "ProjectExportController requires build, session, persistence, activity, file, validation, presentation, workspace, status, clock, test, and logger boundaries."
    );
  }
}
