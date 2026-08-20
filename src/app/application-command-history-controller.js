const RESOURCE_TRASH_ENTITY_TYPES = new Set(["tm-entry", "term", "translation-memory", "termbase"]);

export function createApplicationCommandHistoryController({
  controls,
  context,
  commands,
  edits,
  session,
  projects,
  navigation,
  resources,
  trash,
  presentation,
  status
}) {
  if (!context?.getProjectId || !context.getView) {
    throw new TypeError("ApplicationCommandHistoryController requires checked context boundaries.");
  }
  if (!commands?.canUndo || !commands.canRedo || !commands.undo || !commands.redo) {
    throw new TypeError("ApplicationCommandHistoryController requires checked command boundaries.");
  }
  if (!edits?.finalizeProject || !edits.finalizeAll || !edits.focusActive) {
    throw new TypeError("ApplicationCommandHistoryController requires checked edit boundaries.");
  }
  for (const action of ["getProject", "getProjects", "getSegments", "replaceProject", "replaceSegments"]) {
    if (typeof session?.[action] !== "function") {
      throw new TypeError("ApplicationCommandHistoryController requires checked session boundaries.");
    }
  }
  if (!projects?.load || !projects.open || !projects.readSegments || !projects.prepareHistories) {
    throw new TypeError("ApplicationCommandHistoryController requires checked project boundaries.");
  }
  if (
    !navigation?.getActiveIndex ||
    !navigation.selectSegment ||
    !navigation.clearSelection ||
    !navigation.showProjects
  ) {
    throw new TypeError("ApplicationCommandHistoryController requires checked navigation boundaries.");
  }
  for (const action of [
    "markLinkedDirty",
    "refreshResources",
    "refreshTerms",
    "refreshSuggestions",
    "refreshEditorContext"
  ]) {
    if (typeof resources?.[action] !== "function") {
      throw new TypeError("ApplicationCommandHistoryController requires checked resource boundaries.");
    }
  }
  if (!trash?.isOpen || !trash.renderList || !trash.renderSummary) {
    throw new TypeError("ApplicationCommandHistoryController requires checked Trash boundaries.");
  }
  if (!presentation?.renderAll || !status?.set) {
    throw new TypeError("ApplicationCommandHistoryController requires checked presentation and status boundaries.");
  }

  function render() {
    const projectId = context.getProjectId();
    if (controls?.undo) controls.undo.disabled = !commands.canUndo(projectId);
    if (controls?.redo) controls.redo.disabled = !commands.canRedo(projectId);
  }

  function isResourceEntry(entry) {
    return Boolean(entry && RESOURCE_TRASH_ENTITY_TYPES.has(entry.entityType));
  }

  function entryFromCommandResult(commandResult) {
    const value = commandResult?.result;
    if (isResourceEntry(value)) return value;
    return isResourceEntry(value?.entry) ? value.entry : null;
  }

  async function synchronize(entry, { refreshSuggestions = false } = {}) {
    if (!isResourceEntry(entry)) return false;
    const linkType = entry.resourceType === "tm" ? "tm" : "termbase";
    resources.markLinkedDirty(linkType, entry.resourceName, entry.sourceLang, entry.targetLang);
    await resources.refreshResources();
    if (entry.resourceType === "tb") {
      await resources.refreshTerms({ rerender: context.getView() === "editor" });
      if (refreshSuggestions || context.getView() === "editor") {
        await resources.refreshSuggestions();
      }
    } else if (context.getView() === "editor") {
      await resources.refreshEditorContext();
    }
    if (trash.isOpen()) await trash.renderList();
    else await trash.renderSummary();
    return true;
  }

  async function undo() {
    const projectId = context.getProjectId();
    if (projectId) edits.finalizeProject(projectId);
    else edits.finalizeAll();
    const result = await commands.undo(projectId);
    if (!result) return false;
    const requestedActiveSegmentId = result.result?.activeSegmentId || "";
    await projects.load(false);
    if (session.getProject()?.id === projectId) {
      session.replaceProject(session.getProjects().find((project) => project.id === projectId) || session.getProject());
      session.replaceSegments(projects.prepareHistories(await projects.readSegments(projectId)));
      const requestedIndex = requestedActiveSegmentId
        ? session.getSegments().findIndex((segment) => segment.id === requestedActiveSegmentId)
        : -1;
      const nextIndex = session.getSegments().length
        ? requestedIndex >= 0
          ? requestedIndex
          : Math.max(0, Math.min(navigation.getActiveIndex(), session.getSegments().length - 1))
        : -1;
      navigation.selectSegment({
        activeIndex: nextIndex,
        segmentId: session.getSegments()[nextIndex]?.id || ""
      });
      presentation.renderAll();
    } else if (
      !session.getProject() &&
      projectId &&
      session.getProjects().some((project) => project.id === projectId)
    ) {
      await projects.open(projectId);
    }
    await synchronize(entryFromCommandResult(result));
    status.set(result.receipt.undoLabel, "saved");
    render();
    if (result.result?.focusTarget || result.receipt.commandId === "edit-target") {
      edits.focusActive(result.result?.selection || null);
    }
    return result;
  }

  async function redo() {
    const projectId = context.getProjectId();
    if (projectId) edits.finalizeProject(projectId);
    else edits.finalizeAll();
    const result = await commands.redo(projectId);
    if (!result) return false;
    const requestedActiveSegmentId = result.result?.activeSegmentId || "";
    if (result.receipt.commandId === "delete-project" && session.getProject()?.id === projectId) {
      session.replaceProject(null);
      session.replaceSegments([]);
      navigation.showProjects();
      navigation.clearSelection();
    }
    await projects.load(false);
    if (result.receipt.commandId === "delete-document" && session.getProject()?.id === projectId) {
      session.replaceProject(session.getProjects().find((project) => project.id === projectId) || session.getProject());
      session.replaceSegments(projects.prepareHistories(await projects.readSegments(projectId)));
      const nextIndex = session.getSegments().length
        ? Math.max(0, Math.min(navigation.getActiveIndex(), session.getSegments().length - 1))
        : -1;
      navigation.selectSegment({
        activeIndex: nextIndex,
        segmentId: session.getSegments()[nextIndex]?.id || ""
      });
      presentation.renderAll();
    } else if (session.getProject()?.id === projectId && requestedActiveSegmentId) {
      session.replaceSegments(projects.prepareHistories(await projects.readSegments(projectId)));
      const requestedIndex = session.getSegments().findIndex((segment) => segment.id === requestedActiveSegmentId);
      if (requestedIndex >= 0) {
        navigation.selectSegment({
          activeIndex: requestedIndex,
          segmentId: session.getSegments()[requestedIndex]?.id || ""
        });
      }
      presentation.renderAll();
    }
    await synchronize(entryFromCommandResult(result));
    status.set(result.receipt.undoLabel.replace(/^Undo\s+/i, "Redid "), "saved");
    render();
    if (result.result?.focusTarget || result.receipt.commandId === "edit-target") {
      edits.focusActive(result.result?.selection || null);
    }
    return result;
  }

  return Object.freeze({ render, entryFromCommandResult, synchronize, undo, redo });
}
