export function validateResourceMutationControllerOptions(options) {
  const session = options?.session;
  const repositories = options?.repositories;
  const resources = options?.resources;
  const commands = options?.commands;
  const trash = options?.trash;
  const presentation = options?.presentation;
  const status = options?.status;
  if (
    typeof session?.getProjectId !== "function" ||
    typeof repositories?.updateTmEntry !== "function" ||
    typeof repositories?.updateTerm !== "function" ||
    typeof resources?.markProjectsUsingDirty !== "function" ||
    typeof resources?.refresh !== "function" ||
    typeof resources?.refreshProjectTerms !== "function" ||
    typeof resources?.labelFromKey !== "function" ||
    typeof resources?.items !== "function" ||
    typeof commands?.execute !== "function" ||
    typeof commands?.createDeleteEntry !== "function" ||
    typeof commands?.createDeleteResource !== "function" ||
    typeof commands?.setProjectId !== "function" ||
    typeof trash?.entryFromCommandResult !== "function" ||
    typeof trash?.synchronize !== "function" ||
    typeof presentation?.renderUndo !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "ResourceMutationController requires session, repository, resource, command, Trash, presentation, and status boundaries."
    );
  }
}
