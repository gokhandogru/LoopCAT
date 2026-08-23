export function validateResourceLibraryImportControllerOptions(options) {
  const forms = options?.forms;
  const files = options?.files;
  const parsers = options?.parsers;
  const repositories = options?.repositories;
  const resources = options?.resources;
  const alert = options?.alert;
  const status = options?.status;
  if (
    typeof forms?.tmName !== "function" ||
    typeof forms?.tbName !== "function" ||
    typeof forms?.normalizeLanguageInput !== "function" ||
    !forms?.tmSourceLanguageInput ||
    !forms?.tmTargetLanguageInput ||
    !forms?.tbSourceLanguageInput ||
    !forms?.tbTargetLanguageInput ||
    typeof files?.assertSize !== "function" ||
    typeof files?.readText !== "function" ||
    typeof files?.reportProgress !== "function" ||
    typeof files?.progressDetail !== "function" ||
    typeof files?.yieldToUi !== "function" ||
    typeof parsers?.parseTmx !== "function" ||
    typeof parsers?.parseTbx !== "function" ||
    typeof parsers?.parseTermList !== "function" ||
    typeof parsers?.parseTermWorkbook !== "function" ||
    typeof repositories?.importTmEntries !== "function" ||
    typeof repositories?.importTerms !== "function" ||
    typeof resources?.markProjectsUsingDirty !== "function" ||
    typeof resources?.open !== "function" ||
    typeof resources?.refresh !== "function" ||
    typeof resources?.refreshProjectTerms !== "function" ||
    typeof alert !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "ResourceLibraryImportController requires form, file, parser, repository, resource, alert, and status boundaries."
    );
  }
}
