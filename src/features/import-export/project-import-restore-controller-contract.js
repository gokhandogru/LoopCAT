export function validateProjectImportRestoreControllerOptions(options) {
  const files = options?.files;
  const portability = options?.portability;
  const backup = options?.backup;
  const session = options?.session;
  const autosave = options?.autosave;
  const persistence = options?.persistence;
  const indexes = options?.indexes;
  const activity = options?.activity;
  const navigation = options?.navigation;
  const projects = options?.projects;
  const workspace = options?.workspace;
  const validation = options?.validation;
  const presentation = options?.presentation;
  const status = options?.status;
  const localization = options?.localization;
  const text = options?.text;

  if (
    typeof files?.progress !== "function" ||
    typeof files?.parseJson !== "function" ||
    typeof portability?.validate !== "function" ||
    typeof portability?.prepare !== "function" ||
    typeof backup?.validate !== "function" ||
    typeof session?.getProjects !== "function" ||
    typeof session?.replaceProject !== "function" ||
    typeof session?.replaceSegments !== "function" ||
    typeof autosave?.flush !== "function" ||
    typeof persistence?.importProjectPackageRecords !== "function" ||
    typeof persistence?.importAllData !== "function" ||
    typeof indexes?.rebuildTm !== "function" ||
    typeof indexes?.rebuildTerms !== "function" ||
    typeof activity?.logForProject !== "function" ||
    typeof activity?.appendWarning !== "function" ||
    typeof navigation?.openProjects !== "function" ||
    typeof navigation?.clearSelection !== "function" ||
    typeof projects?.load !== "function" ||
    typeof projects?.open !== "function" ||
    typeof workspace?.isConnected !== "function" ||
    typeof workspace?.clearDirty !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof workspace?.clearDirtyMarkers !== "function" ||
    typeof workspace?.markProjectsDirty !== "function" ||
    typeof validation?.count !== "function" ||
    typeof validation?.alertText !== "function" ||
    typeof presentation?.renderValidation !== "function" ||
    typeof presentation?.renderWorkspaceStatus !== "function" ||
    typeof status?.set !== "function" ||
    typeof status?.mode !== "function" ||
    typeof localization?.alert !== "function" ||
    typeof localization?.confirm !== "function" ||
    typeof text?.safe !== "function"
  ) {
    throw new TypeError(
      "ProjectImportRestoreController requires file, portability, backup, session, autosave, persistence, index, activity, navigation, project, workspace, validation, presentation, status, localization, and text boundaries."
    );
  }
}
