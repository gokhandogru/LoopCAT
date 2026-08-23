export function validateProjectDocumentImportControllerOptions(options) {
  const session = options?.session;
  const catalog = options?.catalog;
  const files = options?.files;
  const formats = options?.formats;
  const repository = options?.repository;
  const histories = options?.histories;
  const progress = options?.progress;
  const ids = options?.ids;
  const summaries = options?.summaries;
  const navigation = options?.navigation;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const status = options?.status;
  const presentation = options?.presentation;
  const text = options?.text;
  const confirm = options?.confirm;

  const requiredFunctions = [
    session?.getProject,
    session?.getProjects,
    session?.getSegments,
    session?.replaceProject,
    session?.replaceProjects,
    session?.replaceSegments,
    catalog?.list,
    catalog?.manifest,
    files?.assertSize,
    formats?.extractDocx,
    formats?.parseLocalization,
    formats?.parseXliff,
    formats?.decodingOptions,
    formats?.isXliffType,
    repository?.append,
    repository?.getProjectSegments,
    histories?.prepare,
    progress?.report,
    ids?.next,
    summaries?.refresh,
    navigation?.selectDocument,
    activity?.log,
    activity?.appendWarning,
    workspace?.markDirty,
    status?.set,
    status?.mode,
    presentation?.renderAll,
    presentation?.refreshEditorContext,
    text?.lower,
    text?.safe,
    confirm
  ];
  if (requiredFunctions.some((value) => typeof value !== "function") || !Number.isFinite(files?.maxBytes)) {
    throw new TypeError(
      "ProjectDocumentImportController requires checked session, catalog, file, format, repository, history, progress, ID, summary, navigation, activity, workspace, status, presentation, text, and confirmation boundaries."
    );
  }
}

export function createProjectDocumentDuplicatePolicy({ catalog, text, confirm }) {
  function hasDocumentNamed(fileName) {
    const normalized = text.lower(String(fileName || "").trim());
    if (!normalized) return false;
    return catalog.list().some((documentInfo) => text.lower(documentInfo.name.trim()) === normalized);
  }

  function confirmDuplicate(file) {
    if (!hasDocumentNamed(file.name)) return true;
    return confirm(`A file named "${text.safe(file.name)}" already exists in this project. Import it again anyway?`);
  }

  return { confirmDuplicate, hasDocumentNamed };
}
