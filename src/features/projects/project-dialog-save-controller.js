/**
 * Owns delegated project-dialog create/edit save orchestration. Dialog event
 * lifecycle, resource selection policy, repository implementations, workspace
 * package writing, and rendering remain behind injected boundaries.
 *
 * @param {{
 *   form: { hasValidityCheck: () => boolean, checkValidity: () => boolean, reportValidity: () => unknown, name: () => string, creator: () => string, domain: () => string, saveToFolder: () => boolean, setSaveToFolder: (value: boolean) => unknown, reset: () => unknown, clearNewTmName: () => unknown, clearNewTermBaseName: () => unknown, close: () => unknown },
 *   mode: { get: () => string | null },
 *   resources: { collect: (project: any) => any, mainTmName: () => string, tmNames: () => string[], termBaseNames: () => string[] },
 *   session: { getProject: () => any, getProjects: () => any[], replaceProject: (project: any) => unknown, replaceProjects: (projects: any[]) => unknown },
 *   projects: { update: (project: any) => Promise<any>, create: (project: any) => Promise<any>, load: (selectFirst: boolean) => Promise<unknown>, open: (projectId: string) => Promise<unknown> },
 *   creator: { remember: (name: string) => string },
 *   language: { setSource: (value: string) => unknown, setTarget: (value: string) => unknown },
 *   refresh: { terms: (options: any) => Promise<unknown>, summaries: () => Promise<unknown>, editorContext: () => Promise<unknown> },
 *   presentation: { renderAll: () => unknown, renderStorageStatus: () => unknown },
 *   activity: { logProject: (type: string, summary: string, detail: any) => Promise<unknown>, record: (event: any) => Promise<unknown> },
 *   workspace: { isSupported: () => boolean, isConnected: () => boolean, chooseFolder: () => Promise<unknown>, markDirty: (projectId?: string) => unknown, maybeSaveFromSettings: (shouldSave: boolean) => Promise<boolean> },
 *   status: { set: (message: string, mode?: string) => unknown },
 *   test: { shouldFailSettingsActivity: () => boolean, shouldFailCreationActivity: () => boolean },
 *   logger: { warn: (...args: any[]) => unknown }
 * }} options
 */
export function createProjectDialogSaveController(options) {
  const form = options?.form;
  const mode = options?.mode;
  const resources = options?.resources;
  const session = options?.session;
  const projects = options?.projects;
  const creator = options?.creator;
  const language = options?.language;
  const refresh = options?.refresh;
  const presentation = options?.presentation;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const status = options?.status;
  const test = options?.test;
  const logger = options?.logger;

  if (
    typeof form?.hasValidityCheck !== "function" ||
    typeof form?.checkValidity !== "function" ||
    typeof form?.reportValidity !== "function" ||
    typeof form?.name !== "function" ||
    typeof form?.creator !== "function" ||
    typeof form?.domain !== "function" ||
    typeof form?.saveToFolder !== "function" ||
    typeof form?.setSaveToFolder !== "function" ||
    typeof form?.reset !== "function" ||
    typeof form?.clearNewTmName !== "function" ||
    typeof form?.clearNewTermBaseName !== "function" ||
    typeof form?.close !== "function" ||
    typeof mode?.get !== "function" ||
    typeof resources?.collect !== "function" ||
    typeof resources?.mainTmName !== "function" ||
    typeof resources?.tmNames !== "function" ||
    typeof resources?.termBaseNames !== "function" ||
    typeof session?.getProject !== "function" ||
    typeof session?.getProjects !== "function" ||
    typeof session?.replaceProject !== "function" ||
    typeof session?.replaceProjects !== "function" ||
    typeof projects?.update !== "function" ||
    typeof projects?.create !== "function" ||
    typeof projects?.load !== "function" ||
    typeof projects?.open !== "function" ||
    typeof creator?.remember !== "function" ||
    typeof language?.setSource !== "function" ||
    typeof language?.setTarget !== "function" ||
    typeof refresh?.terms !== "function" ||
    typeof refresh?.summaries !== "function" ||
    typeof refresh?.editorContext !== "function" ||
    typeof presentation?.renderAll !== "function" ||
    typeof presentation?.renderStorageStatus !== "function" ||
    typeof activity?.logProject !== "function" ||
    typeof activity?.record !== "function" ||
    typeof workspace?.isSupported !== "function" ||
    typeof workspace?.isConnected !== "function" ||
    typeof workspace?.chooseFolder !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof workspace?.maybeSaveFromSettings !== "function" ||
    typeof status?.set !== "function" ||
    typeof test?.shouldFailSettingsActivity !== "function" ||
    typeof test?.shouldFailCreationActivity !== "function" ||
    typeof logger?.warn !== "function"
  ) {
    throw new TypeError(
      "ProjectDialogSaveController requires form, mode, resource, session, project, creator, language, refresh, presentation, activity, workspace, status, test, and logger boundaries."
    );
  }

  async function save() {
    if (form.hasValidityCheck() && !form.checkValidity()) {
      form.reportValidity();
      status.set("Complete required project fields.", "dirty");
      return false;
    }
    const editing = mode.get() === "edit" && Boolean(session.getProject());
    const settings = resources.collect(editing ? session.getProject() : null);
    const shouldSaveToFolder = form.saveToFolder();
    if (shouldSaveToFolder && workspace.isSupported() && !workspace.isConnected()) {
      try {
        await workspace.chooseFolder();
      } catch (error) {
        if (error.name !== "AbortError") throw error;
        form.setSaveToFolder(false);
        presentation.renderStorageStatus();
      }
    }
    if (editing && session.getProject()) {
      const creatorName = creator.remember(form.creator() || "");
      session.replaceProject(
        await projects.update({
          ...session.getProject(),
          name: form.name().trim(),
          creatorName,
          creatorOrigin: session.getProject().creatorOrigin || "manual",
          domain: form.domain().trim(),
          ...settings
        })
      );
      session.replaceProjects(
        session
          .getProjects()
          .map((project) => (project.id === session.getProject().id ? session.getProject() : project))
      );
      await refresh.terms({ rerender: true });
      await refresh.summaries();
      presentation.renderAll();
      await refresh.editorContext();
      form.close();
      workspace.markDirty();
      let activityLogged = true;
      try {
        if (test.shouldFailSettingsActivity()) throw new Error("Simulated project settings activity failure");
        await activity.logProject("project-settings", "Project resource settings updated", {
          mainTmName: resources.mainTmName(),
          creatorName,
          tmCount: resources.tmNames().length,
          termbaseCount: resources.termBaseNames().length
        });
      } catch (activityError) {
        activityLogged = false;
        logger.warn("Project settings activity log failed.", activityError);
        workspace.markDirty();
      }
      const savedToFolder = await workspace.maybeSaveFromSettings(shouldSaveToFolder);
      if (!savedToFolder) {
        status.set(
          activityLogged ? "Project settings saved" : "Project settings saved; activity log failed",
          activityLogged ? "saved" : "dirty"
        );
      }
      return session.getProject();
    }

    const creatorName = creator.remember(form.creator() || "");
    const project = await projects.create({
      name: form.name(),
      creatorName,
      creatorOrigin: "manual",
      domain: form.domain(),
      ...settings
    });
    form.reset();
    language.setSource("en");
    language.setTarget("tr");
    form.clearNewTmName();
    form.clearNewTermBaseName();
    form.close();
    let activityLogged = true;
    try {
      if (test.shouldFailCreationActivity()) throw new Error("Simulated project creation activity failure");
      await activity.record({ projectId: project.id, type: "create-project", summary: "Project created" });
    } catch (activityError) {
      activityLogged = false;
      logger.warn("Project creation activity log failed.", activityError);
    }
    workspace.markDirty(project.id);
    await projects.load(false);
    await projects.open(project.id);
    const savedToFolder = await workspace.maybeSaveFromSettings(shouldSaveToFolder);
    if (!savedToFolder) {
      status.set(
        activityLogged ? "Project created" : "Project created; activity log failed",
        activityLogged ? "saved" : "dirty"
      );
    }
    return project;
  }

  return Object.freeze({ save });
}
