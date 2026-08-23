export function validateProjectResourceTransferControllerOptions(options) {
  const session = options?.session;
  const files = options?.files;
  const parsers = options?.parsers;
  const repositories = options?.repositories;
  const resources = options?.resources;
  const refresh = options?.refresh;
  const builders = options?.builders;
  const fileSafeName = options?.fileSafeName;
  const download = options?.download;
  const activity = options?.activity;
  const status = options?.status;
  if (
    typeof session?.getProject !== "function" ||
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
    typeof repositories?.getAllByIndex !== "function" ||
    typeof repositories?.listTerms !== "function" ||
    typeof resources?.mainTmName !== "function" ||
    typeof resources?.projectTmNames !== "function" ||
    typeof resources?.selectedTermBaseName !== "function" ||
    typeof resources?.primaryTermBaseName !== "function" ||
    typeof resources?.projectTermBaseNames !== "function" ||
    typeof resources?.markProjectsUsingDirty !== "function" ||
    typeof refresh?.tmMatches !== "function" ||
    typeof refresh?.projectTerms !== "function" ||
    typeof refresh?.terms !== "function" ||
    typeof builders?.buildTmx !== "function" ||
    typeof builders?.buildTbx !== "function" ||
    typeof fileSafeName !== "function" ||
    typeof download !== "function" ||
    typeof activity?.logOptionalProject !== "function" ||
    typeof status?.appendActivityWarning !== "function" ||
    typeof status?.exportMode !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "ProjectResourceTransferController requires session, file, parser, repository, resource, refresh, builder, download, activity, and status boundaries."
    );
  }
}
