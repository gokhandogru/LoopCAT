import { validateProjectDeletionControllerOptions } from "./project-deletion-controller-contract.js";

/**
 * Owns reversible project and project-document deletion orchestration.
 * Session state, confirmation, text safety, autosave, command construction and
 * execution, repositories, histories, navigation, workspace markers, activity,
 * presentation, status, test hooks, and logging remain injected owners.
 *
 * @param {any} options
 */
export function createProjectDeletionController(options) {
  const session = options?.session;
  const confirmation = options?.confirmation;
  const text = options?.text;
  const autosave = options?.autosave;
  const commands = options?.commands;
  const commandState = options?.commandState;
  const workspace = options?.workspace;
  const navigation = options?.navigation;
  const projects = options?.projects;
  const segments = options?.segments;
  const histories = options?.histories;
  const activity = options?.activity;
  const summaries = options?.summaries;
  const home = options?.home;
  const status = options?.status;
  const history = options?.history;
  const test = options?.test;
  const logger = options?.logger;

  validateProjectDeletionControllerOptions(options);

  async function deleteProject(projectId = session.getProject()?.id) {
    const project = session.getProjects().find((item) => item.id === projectId);
    if (!project) return false;
    const ok = confirmation.ask(`Move project "${text.safe(project.name)}" and all of its files to Trash?`);
    if (!ok) return false;
    try {
      await autosave.flush(project.id);
      if (test.projectDeleteFails(project)) throw new Error("Simulated project delete failure");
      const command = commands.createProjectDelete({ projectId: project.id });
      if (!command) throw new Error("The reversible project deletion service is unavailable.");
      await commands.execute(command);
      commandState.selectProject(project.id);
      workspace.clear(project.id);
      if (session.getProject()?.id === project.id) {
        session.replaceProject(null);
        session.replaceSegments([]);
        navigation.openProjects();
        navigation.clearSelection();
      }
      await projects.load(false);
      status.set("Project moved to Trash. Undo is available.", "saved");
      history.render();
      return true;
    } catch (error) {
      status.set(error.message || "Project delete failed", "dirty");
      return false;
    }
  }

  async function deleteDocument(documentInfo) {
    if (!session.getProject() || !documentInfo) return false;
    const ok = confirmation.ask(`Move file "${text.safe(documentInfo.name)}" to Trash?`);
    if (!ok) return false;
    try {
      await autosave.flush(session.getProject().id);
      if (test.documentDeleteFails(documentInfo)) throw new Error("Simulated file delete failure");
      const command = commands.createDocumentDelete({
        project: session.getProject(),
        documentId: documentInfo.id
      });
      if (!command) throw new Error("The reversible file deletion service is unavailable.");
      const commandResult = await commands.execute(command);
      commandState.selectProject(session.getProject().id);
      session.replaceProject(commandResult.result.project);
      session.replaceProjects(
        session
          .getProjects()
          .map((project) => (project.id === session.getProject().id ? session.getProject() : project))
      );
      session.replaceSegments(histories.prepare(await segments.list(session.getProject().id)));
      navigation.selectDocument({ documentId: "" });
      const activeIndex = session.getSegments().length ? 0 : -1;
      navigation.selectSegment({
        activeIndex,
        segmentId: session.getSegments()[activeIndex]?.id || ""
      });
      workspace.mark();
      let fileDeleteActivityFailed = false;
      try {
        if (test.documentActivityFails(documentInfo)) throw new Error("Simulated file delete activity failure");
        await activity.log("delete-file", "Project file deleted", {
          documentId: documentInfo.id,
          fileName: documentInfo.name
        });
      } catch (activityError) {
        fileDeleteActivityFailed = true;
        logger.warn("File delete activity log failed.", activityError);
        workspace.mark();
      }
      await summaries.refresh();
      home.show();
      status.set(
        fileDeleteActivityFailed
          ? "File moved to Trash; activity log failed"
          : "File moved to Trash. Undo is available.",
        "saved"
      );
      history.render();
      return true;
    } catch (error) {
      status.set(error.message || "File delete failed", "dirty");
      return false;
    }
  }

  return Object.freeze({ deleteProject, deleteDocument });
}
