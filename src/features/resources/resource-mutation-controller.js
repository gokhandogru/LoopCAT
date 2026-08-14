/**
 * Owns Resources-dashboard TM/term saves and reversible entry/resource
 * deletion orchestration. DOM delegation, repositories, Trash commands,
 * resource refreshes, and status presentation remain injected boundaries.
 *
 * @param {{
 *   session: { getProjectId: () => string | null },
 *   repositories: {
 *     updateTmEntry: (entry: any) => Promise<any>,
 *     updateTerm: (term: any) => Promise<any>
 *   },
 *   resources: {
 *     markProjectsUsingDirty: (type: string, name: string, sourceLang: string, targetLang: string) => unknown,
 *     refresh: () => Promise<any>,
 *     refreshProjectTerms: (options: { rerender: boolean }) => Promise<any>,
 *     labelFromKey: (key: string) => any,
 *     items: (type: string, key: string) => any[]
 *   },
 *   commands: {
 *     execute: (command: any) => Promise<any>,
 *     createDeleteEntry: (options: any) => any,
 *     createDeleteResource: (options: any) => any,
 *     setProjectId: (projectId: string) => unknown
 *   },
 *   trash: {
 *     entryFromCommandResult: (result: any) => any,
 *     synchronize: (entry: any, options: { refreshSuggestions: boolean }) => Promise<any>
 *   },
 *   presentation: { renderUndo: () => unknown },
 *   status: { set: (message: string, mode: string) => unknown },
 *   testHooks?: {
 *     beforeSaveTm?: (entry: any) => unknown,
 *     beforeSaveTerm?: (term: any) => unknown,
 *     beforeDeleteTm?: (entry: any) => unknown,
 *     beforeDeleteTerm?: (term: any) => unknown,
 *     beforeDeleteResource?: (type: string, key: string) => unknown
 *   },
 *   logger?: { warn?: (...args: any[]) => unknown }
 * }} options
 */
export function createResourceMutationController(options) {
  const session = options?.session;
  const repositories = options?.repositories;
  const resources = options?.resources;
  const commands = options?.commands;
  const trash = options?.trash;
  const presentation = options?.presentation;
  const status = options?.status;
  const testHooks = options?.testHooks || {};
  const logger = options?.logger || console;
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

  async function saveTmEntry(entry, values) {
    try {
      testHooks.beforeSaveTm?.(entry);
      await repositories.updateTmEntry({ ...entry, source: values.source, target: values.target });
      resources.markProjectsUsingDirty("tm", entry.tmName, entry.sourceLang, entry.targetLang);
      await resources.refresh();
      status.set("TM entry saved", "saved");
      return true;
    } catch (error) {
      status.set(error.message || "TM entry save failed", "dirty");
      return false;
    }
  }

  async function saveTerm(term, values) {
    try {
      testHooks.beforeSaveTerm?.(term);
      await repositories.updateTerm({
        ...term,
        sourceTerm: values.sourceTerm,
        targetTerm: values.targetTerm,
        notes: values.notes,
        isForbidden: values.isForbidden
      });
      resources.markProjectsUsingDirty("termbase", term.termBaseName, term.sourceLang, term.targetLang);
      await resources.refresh();
      await resources.refreshProjectTerms({ rerender: true });
      status.set("Term saved", "saved");
      return true;
    } catch (error) {
      status.set(error.message || "Term save failed", "dirty");
      return false;
    }
  }

  async function executeTrashCommand(command, { refreshSuggestions = false } = {}) {
    if (!command) throw new Error("The reversible resource deletion service is unavailable.");
    const commandResult = await commands.execute(command);
    commands.setProjectId(command.projectId || "");
    const entry = trash.entryFromCommandResult(commandResult);
    let refreshFailed = false;
    try {
      await trash.synchronize(entry, { refreshSuggestions });
    } catch (error) {
      refreshFailed = true;
      logger.warn?.("Resource views could not refresh after moving an item to Trash.", error);
    }
    presentation.renderUndo();
    return { entry, refreshFailed };
  }

  async function deleteTmEntry(entry) {
    try {
      testHooks.beforeDeleteTm?.(entry);
      const command = commands.createDeleteEntry({
        resourceType: "tm",
        entityId: entry.id,
        projectId: session.getProjectId()
      });
      const result = await executeTrashCommand(command);
      status.set(
        result.refreshFailed
          ? "TM entry moved to Trash; the resource view could not refresh. Undo is available."
          : "TM entry moved to Trash. Undo is available.",
        "saved"
      );
      return true;
    } catch (error) {
      status.set(error.message || "TM entry could not be moved to Trash. Existing work was preserved.", "dirty");
      return false;
    }
  }

  async function deleteTerm(term, options = {}) {
    const { refreshSuggestions = false } = options;
    try {
      testHooks.beforeDeleteTerm?.(term);
      const command = commands.createDeleteEntry({
        resourceType: "tb",
        entityId: term.id,
        projectId: session.getProjectId()
      });
      const result = await executeTrashCommand(command, { refreshSuggestions });
      status.set(
        result.refreshFailed
          ? "Term moved to Trash; terminology views could not refresh. Undo is available."
          : "Term moved to Trash. Undo is available.",
        "saved"
      );
      return true;
    } catch (error) {
      status.set(error.message || "Term could not be moved to Trash. Existing work was preserved.", "dirty");
      return false;
    }
  }

  async function deleteResource(type, key) {
    const info = resources.labelFromKey(key);
    try {
      testHooks.beforeDeleteResource?.(type, key);
      const items = resources.items(type, key);
      const command = commands.createDeleteResource({
        resourceType: type,
        descriptor: {
          key,
          name: info.name,
          sourceLang: info.sourceLang,
          targetLang: info.targetLang,
          languagePair: info.languagePair
        },
        affectedIds: items.map((item) => item.id),
        projectId: session.getProjectId()
      });
      const result = await executeTrashCommand(command, { refreshSuggestions: type === "tb" });
      status.set(
        result.refreshFailed
          ? `${type === "tm" ? "Translation memory" : "Termbase"} moved to Trash; resource views could not refresh. Undo is available.`
          : `${type === "tm" ? "Translation memory" : "Termbase"} moved to Trash. Undo is available.`,
        "saved"
      );
      return true;
    } catch (error) {
      status.set(
        error.message ||
          `${type === "tm" ? "Translation memory" : "Termbase"} could not be moved to Trash. Existing work was preserved.`,
        "dirty"
      );
      return false;
    }
  }

  return Object.freeze({ saveTmEntry, saveTerm, deleteTmEntry, deleteTerm, deleteResource });
}
