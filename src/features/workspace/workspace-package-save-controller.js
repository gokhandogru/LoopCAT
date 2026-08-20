/**
 * Owns workspace connection plus manual, background, recovery, and settings-
 * initiated project-package saves. Filesystem access, package construction,
 * project storage, dirty-marker persistence, and presentation stay injected.
 *
 * @param {{
 *   storage: { isSupported: () => boolean, chooseFolder: (options: any) => Promise<any>, getStatus: () => Promise<any>, saveProjectPackage: (pkg: any) => Promise<any> },
 *   session: { getProject: () => any, replaceActivityEvents: (events: any[]) => unknown },
 *   autosave: { flush: (projectId?: string) => Promise<unknown> },
 *   build: { buildProjectPackage: (project?: any, segments?: any[] | null, options?: any) => Promise<any>, assertValidProjectPackageForWrite: (pkg: any, action: string) => unknown },
 *   projects: { knownById: (projectId: string) => any, list: () => Promise<any[]> },
 *   activity: { draft: (project: any, type: string, summary: string, detail?: any) => any, bulkPut: (storeName: string, records: any[]) => Promise<unknown>, list: (projectId: string) => Promise<any[]> },
 *   workspace: { isConnected: () => boolean, setStatus: (status: any) => unknown, markMissingLocalDirty: () => Promise<number>, clearDirty: (projectId: string) => unknown, markDirty: (projectId?: string) => unknown, hasDirty: () => boolean, dirtyIds: () => string[], recoveryIds: () => string[], isAutosaving: () => boolean, setAutosaving: (value: boolean) => unknown, getAutosaveTimer: () => any, setAutosaveTimer: (timer: any) => unknown },
 *   validation: { count: (report: any) => number },
 *   presentation: { renderWorkspaceStatus: () => unknown, renderValidation: (report: any) => unknown, renderBackupReminder: () => unknown, renderRecovery: () => unknown },
 *   status: { set: (message: string, mode?: string) => unknown },
 *   preferences: { saveToFolder: () => boolean },
 *   timers: { clear: (timer: any) => unknown, set: (callback: () => unknown, delayMs: number) => any },
 *   test: { shouldFailActivity: () => boolean },
 *   logger: { warn: (...args: any[]) => unknown }
 * }} options
 */
export function createWorkspacePackageSaveController(options) {
  const storage = options?.storage;
  const session = options?.session;
  const autosave = options?.autosave;
  const build = options?.build;
  const projects = options?.projects;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const validation = options?.validation;
  const presentation = options?.presentation;
  const status = options?.status;
  const preferences = options?.preferences;
  const timers = options?.timers;
  const test = options?.test;
  const logger = options?.logger;

  if (
    typeof storage?.isSupported !== "function" ||
    typeof storage?.chooseFolder !== "function" ||
    typeof storage?.getStatus !== "function" ||
    typeof storage?.saveProjectPackage !== "function" ||
    typeof session?.getProject !== "function" ||
    typeof session?.replaceActivityEvents !== "function" ||
    typeof autosave?.flush !== "function" ||
    typeof build?.buildProjectPackage !== "function" ||
    typeof build?.assertValidProjectPackageForWrite !== "function" ||
    typeof projects?.knownById !== "function" ||
    typeof projects?.list !== "function" ||
    typeof activity?.draft !== "function" ||
    typeof activity?.bulkPut !== "function" ||
    typeof activity?.list !== "function" ||
    typeof workspace?.isConnected !== "function" ||
    typeof workspace?.setStatus !== "function" ||
    typeof workspace?.markMissingLocalDirty !== "function" ||
    typeof workspace?.clearDirty !== "function" ||
    typeof workspace?.markDirty !== "function" ||
    typeof workspace?.hasDirty !== "function" ||
    typeof workspace?.dirtyIds !== "function" ||
    typeof workspace?.recoveryIds !== "function" ||
    typeof workspace?.isAutosaving !== "function" ||
    typeof workspace?.setAutosaving !== "function" ||
    typeof workspace?.getAutosaveTimer !== "function" ||
    typeof workspace?.setAutosaveTimer !== "function" ||
    typeof validation?.count !== "function" ||
    typeof presentation?.renderWorkspaceStatus !== "function" ||
    typeof presentation?.renderValidation !== "function" ||
    typeof presentation?.renderBackupReminder !== "function" ||
    typeof presentation?.renderRecovery !== "function" ||
    typeof status?.set !== "function" ||
    typeof preferences?.saveToFolder !== "function" ||
    typeof timers?.clear !== "function" ||
    typeof timers?.set !== "function" ||
    typeof test?.shouldFailActivity !== "function" ||
    typeof logger?.warn !== "function"
  ) {
    throw new TypeError(
      "WorkspacePackageSaveController requires storage, session, autosave, build, project, activity, workspace, validation, presentation, status, preference, timer, test, and logger boundaries."
    );
  }

  async function chooseFolder() {
    if (!storage.isSupported()) {
      status.set("Folder storage is unavailable in this browser", "dirty");
      return;
    }
    workspace.setStatus(await storage.chooseFolder({ startIn: "documents" }));
    const missingPackageCount = await workspace.markMissingLocalDirty();
    presentation.renderWorkspaceStatus();
    status.set(
      missingPackageCount
        ? `Workspace folder connected; ${missingPackageCount} local project package${
            missingPackageCount === 1 ? "" : "s"
          } need${missingPackageCount === 1 ? "s" : ""} to be saved`
        : "Workspace folder connected",
      missingPackageCount ? "dirty" : "saved"
    );
  }

  async function saveById(projectId, saveOptions = {}) {
    const project = projects.knownById(projectId) || (await projects.list()).find((item) => item.id === projectId);
    if (!project) throw new Error("Project package could not be found.");
    try {
      await autosave.flush(projectId);
      const pkg = await build.buildProjectPackage(project, null, saveOptions);
      build.assertValidProjectPackageForWrite(pkg, "save project package to workspace");
      const result = await storage.saveProjectPackage(pkg);
      if (session.getProject()?.id === projectId) workspace.setStatus(await storage.getStatus());
      workspace.clearDirty(projectId);
      return { pkg, result };
    } catch (error) {
      workspace.markDirty(projectId);
      throw error;
    }
  }

  async function saveCurrent() {
    if (!session.getProject()) return;
    await autosave.flush();
    if (!workspace.isConnected()) await chooseFolder();
    if (!workspace.isConnected()) return;
    const previewPackage = await build.buildProjectPackage(session.getProject());
    build.assertValidProjectPackageForWrite(previewPackage, "save project package to workspace");
    const shouldSimulateActivityFailure = test.shouldFailActivity();
    const pendingActivityEvent = shouldSimulateActivityFailure
      ? null
      : activity.draft(session.getProject(), "workspace-save", "Project package saved to workspace folder");
    const { pkg, result } = await saveById(session.getProject().id, {
      activityEvents: pendingActivityEvent ? [pendingActivityEvent] : []
    });
    let activityLogged = true;
    try {
      if (shouldSimulateActivityFailure) throw new Error("Simulated workspace save activity failure");
      if (pendingActivityEvent) {
        await activity.bulkPut("activityEvents", [pendingActivityEvent]);
        session.replaceActivityEvents(await activity.list(session.getProject().id));
      }
      presentation.renderBackupReminder();
    } catch (activityError) {
      activityLogged = false;
      logger.warn("Workspace save activity log failed.", activityError);
    }
    if (!activityLogged) workspace.markDirty(session.getProject().id);
    workspace.setStatus(await storage.getStatus());
    presentation.renderValidation(pkg.validation);
    const validationReportWarning = result.validationReportSaved === false ? "; validation report sidecar failed" : "";
    status.set(
      activityLogged
        ? `Saved to ${result.packagePath}${validationReportWarning}`
        : `Saved to ${result.packagePath}; activity log failed${validationReportWarning}`,
      !activityLogged || result.validationReportSaved === false || validation.count(pkg.validation) ? "dirty" : "saved"
    );
  }

  async function autosaveDirty() {
    if (workspace.isAutosaving()) return;
    if (!workspace.isConnected() || !workspace.hasDirty()) return;
    workspace.setAutosaving(true);
    try {
      const dirtyIds = workspace.dirtyIds();
      const failures = [];
      for (const projectId of dirtyIds) {
        try {
          await saveById(projectId);
        } catch (error) {
          logger.warn(error);
          failures.push(error);
        }
      }
      workspace.setStatus(await storage.getStatus());
      if (failures.length) {
        status.set(
          `${failures.length} background workspace save${
            failures.length === 1 ? "" : "s"
          } failed; other dirty packages were still attempted.`,
          "dirty"
        );
      }
    } catch (error) {
      logger.warn(error);
      status.set(error.message || "Background workspace save failed", "dirty");
    } finally {
      workspace.setAutosaving(false);
    }
  }

  async function saveRecovery() {
    if (!workspace.recoveryIds().length) return;
    if (!workspace.isConnected()) await chooseFolder();
    if (!workspace.isConnected()) return;
    status.set("Saving recovered workspace packages...");
    await autosaveDirty();
    presentation.renderRecovery();
  }

  function startAutosave() {
    if (workspace.getAutosaveTimer()) timers.clear(workspace.getAutosaveTimer());
    workspace.setAutosaveTimer(timers.set(autosaveDirty, 5 * 60 * 1000));
  }

  async function maybeSaveFromSettings(shouldSaveToFolder = preferences.saveToFolder()) {
    if (!shouldSaveToFolder || !session.getProject()) return false;
    if (!storage.isSupported()) return false;
    try {
      if (!workspace.isConnected()) await chooseFolder();
      if (!workspace.isConnected()) return false;
      await saveCurrent();
      return true;
    } catch (error) {
      if (error.name === "AbortError") {
        status.set("Project kept in browser cache", "saved");
        return false;
      }
      throw error;
    }
  }

  return Object.freeze({
    autosaveDirty,
    chooseFolder,
    maybeSaveFromSettings,
    saveById,
    saveCurrent,
    saveRecovery,
    startAutosave
  });
}
