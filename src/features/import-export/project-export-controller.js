import { validateProjectExportControllerOptions } from "./project-export-controller-contract.js";

/**
 * Owns manual browser-backup and project-package export actions. Package and
 * backup construction, persistence implementations, activity record policy,
 * generic validation DOM, and ImportExportController lifecycle stay injected.
 *
 * @param {{
 *   build: {
 *     buildBackupExport: () => Promise<{ backup: any, validation: any }>,
 *     buildProjectPackage: (project?: any, segments?: any[] | null, options?: any) => Promise<any>,
 *     assertValidProjectPackageForWrite: (pkg: any, actionLabel: string) => any
 *   },
 *   session: {
 *     getProject: () => any,
 *     getProjects: () => any[],
 *     replaceProject: (project: any) => unknown,
 *     replaceProjects: (projects: any[]) => unknown,
 *     replaceActivityEvents: (events: any[]) => unknown
 *   },
 *   persistence: {
 *     updateProject: (project: any) => Promise<any>,
 *     bulkPut: (storeName: string, records: any[]) => Promise<unknown>,
 *     listActivityEvents: (projectId: string) => Promise<any[]>
 *   },
 *   activity: {
 *     draft: (project: any, type: string, summary: string, detail?: any) => any,
 *     appendWarning: (message: string, logged: boolean) => string
 *   },
 *   files: { safeName: (value: string) => string, download: (name: string, content: any, mime: string) => unknown },
 *   validation: { count: (report: any) => number, errorReport: (message: string) => any },
 *   presentation: { renderValidation: (report: any) => unknown, renderEditor: () => unknown, renderBackupReminder: () => unknown },
 *   workspace: { markDirty: (projectId?: string) => unknown },
 *   status: { set: (message: string, mode?: string) => unknown, mode: (preferred: string, activityLogged: boolean) => string },
 *   clock: { now: () => string, nowMs: () => number },
 *   test: { shouldFailActivity: () => boolean },
 *   logger: { warn: (...args: any[]) => unknown }
 * }} options
 */
export function createProjectExportController(options) {
  const build = options?.build;
  const session = options?.session;
  const persistence = options?.persistence;
  const activity = options?.activity;
  const files = options?.files;
  const validation = options?.validation;
  const presentation = options?.presentation;
  const workspace = options?.workspace;
  const status = options?.status;
  const clock = options?.clock;
  const test = options?.test;
  const logger = options?.logger;

  validateProjectExportControllerOptions(options);

  async function exportBrowserBackup() {
    try {
      const { backup, validation: backupValidation } = await build.buildBackupExport();
      files.download(
        `loopcat-backup-${clock.now().slice(0, 10)}.json`,
        JSON.stringify(backup, null, 2),
        "application/json"
      );
      presentation.renderValidation(backupValidation);
      const noteCount = validation.count(backupValidation);
      status.set(
        noteCount
          ? `Backup exported with ${noteCount} validation note${noteCount === 1 ? "" : "s"}`
          : "Backup exported",
        noteCount ? "dirty" : "saved"
      );
      return true;
    } catch (error) {
      const message = error.message || "Backup export failed.";
      presentation.renderValidation(error.validation || validation.errorReport(message));
      status.set(message, "dirty");
      return false;
    }
  }

  function reportProjectPackageExportFailure(error, pkg = null) {
    const message = error?.message || "Project package export failed";
    presentation.renderValidation(error?.validation || pkg?.validation || validation.errorReport(message));
    status.set(message, "dirty");
  }

  async function exportProjectPackage() {
    if (!session.getProject()) return;
    const base = files.safeName(session.getProject().name || "project");
    const filename = `${base}.loopcat.json`;
    let previewPackage = null;
    try {
      previewPackage = await build.buildProjectPackage();
      build.assertValidProjectPackageForWrite(previewPackage, "export project package");
    } catch (error) {
      reportProjectPackageExportFailure(error, previewPackage);
      return;
    }
    const warnings = validation.count(previewPackage.validation);
    const exportHistoryEntry = {
      id: `export-${clock.nowMs()}`,
      type: "project-package",
      filename,
      warningCount: warnings,
      createdAt: clock.now()
    };
    const pendingProject = {
      ...session.getProject(),
      exportHistory: [...(session.getProject().exportHistory || []), exportHistoryEntry].slice(-25)
    };
    const activityDetail = { filename, warningCount: warnings };
    const shouldSimulateActivityFailure = test.shouldFailActivity();
    const pendingActivityEvent = shouldSimulateActivityFailure
      ? null
      : activity.draft(session.getProject(), "export", "Project package exported", activityDetail);
    let pkg = null;
    try {
      pkg = await build.buildProjectPackage(pendingProject, null, {
        activityEvents: pendingActivityEvent ? [pendingActivityEvent] : []
      });
      build.assertValidProjectPackageForWrite(pkg, "export project package");
    } catch (error) {
      reportProjectPackageExportFailure(error, pkg);
      return;
    }
    const finalWarnings = validation.count(pkg.validation);
    try {
      files.download(filename, JSON.stringify(pkg, null, 2), "application/json");
    } catch (error) {
      status.set(error.message || "Project package export failed", "dirty");
      return;
    }
    try {
      session.replaceProject(await persistence.updateProject(pendingProject));
      session.replaceProjects(
        session
          .getProjects()
          .map((project) => (project.id === session.getProject().id ? session.getProject() : project))
      );
    } catch (error) {
      logger.warn("Project package export history update failed.", error);
      workspace.markDirty(session.getProject()?.id);
      presentation.renderValidation(pkg.validation);
      presentation.renderEditor();
      status.set("Project package exported; local export history failed", "dirty");
      return;
    }
    let activityLogged = true;
    try {
      if (shouldSimulateActivityFailure) throw new Error("Simulated export activity log failure");
      if (pendingActivityEvent) {
        await persistence.bulkPut("activityEvents", [pendingActivityEvent]);
        session.replaceActivityEvents(await persistence.listActivityEvents(session.getProject().id));
      }
      workspace.markDirty(session.getProject().id);
      presentation.renderBackupReminder();
    } catch (activityError) {
      activityLogged = false;
      logger.warn("Project package export activity log failed.", activityError);
      if (session.getProject()?.id) workspace.markDirty(session.getProject().id);
    }
    presentation.renderValidation(pkg.validation);
    presentation.renderEditor();
    const successMessage = finalWarnings
      ? `Project exported with ${finalWarnings} validation warning${finalWarnings === 1 ? "" : "s"}`
      : "Project package exported";
    status.set(
      activity.appendWarning(successMessage, activityLogged),
      status.mode(finalWarnings ? "dirty" : "saved", activityLogged)
    );
  }

  return Object.freeze({
    exportBrowserBackup,
    exportProjectPackage
  });
}
