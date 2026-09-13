import { validateProjectExportControllerOptions } from "./project-export-controller-contract.js";

/**
 * Owns manual browser-backup and project-package export actions. Package and
 * backup construction, persistence implementations, activity record policy,
 * generic validation DOM, and ImportExportController lifecycle stay injected.
 *
 * @param {{
 *   build: {
 *     buildBackupExport: (options?: any) => Promise<{ backup: any, validation: any }>,
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
 *     getProject?: (id: string) => Promise<any>,
 *     updateProject: (project: any) => Promise<any>,
 *     bulkPut: (storeName: string, records: any[]) => Promise<unknown>,
 *     listActivityEvents: (projectId: string) => Promise<any[]>
 *   },
 *   activity: {
 *     draft: (project: any, type: string, summary: string, detail?: any) => any,
 *     appendWarning: (message: string, logged: boolean) => string
 *   },
 *   files: { safeName: (value: string) => string, download: (name: string, content: any, mime: string) => any, choose?: (name: string, mime: string) => Promise<any> },
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

  async function exportBrowserBackup({ format = "archive" } = {}) {
    let destination;
    let delivered = false;
    try {
      const archive = format === "archive" && globalThis.window?.CatHan?.archive;
      const filename = `loopcat-backup-${clock.now().slice(0, 10)}${archive ? ".loopcat-backup.zip" : ".json"}`;
      destination = archive && files.choose ? await files.choose(filename, "application/zip") : null;
      const { backup, validation: backupValidation } = await build.buildBackupExport({ format });
      const written = archive ? await archive.writePackage(backup, destination?.writable) : null;
      const content = archive ? written.data : JSON.stringify(backup, null, 2);
      if (!archive && new Blob([content]).size > 50 * 1024 * 1024)
        throw new Error("JSON compatibility exports are limited to 50 MiB. Use the archive format.");
      const delivery = destination
        ? await destination.verify(written.digest)
        : await files.download(filename, content, archive ? "application/zip" : "application/json");
      delivered = true;
      presentation.renderValidation(backupValidation);
      const noteCount = validation.count(backupValidation);
      status.set(
        noteCount
          ? `${delivery?.verified ? "Backup verified" : "Download requested"} with ${noteCount} validation note${noteCount === 1 ? "" : "s"}`
          : delivery?.verified
            ? "Backup verified"
            : "Download requested",
        noteCount ? "dirty" : "saved"
      );
      return true;
    } catch (error) {
      const message = error.message || "Backup export failed.";
      presentation.renderValidation(error.validation || validation.errorReport(message));
      status.set(message, "dirty");
      return false;
    } finally {
      if (destination && !delivered) await destination.abort?.().catch(() => {});
    }
  }

  function reportProjectPackageExportFailure(error, pkg = null) {
    const message = error?.message || "Project package export failed";
    presentation.renderValidation(error?.validation || pkg?.validation || validation.errorReport(message));
    status.set(message, "dirty");
  }

  async function exportProjectPackage({ format = "archive" } = {}) {
    if (!session.getProject()) return;
    const base = files.safeName(session.getProject().name || "project");
    const archive = format === "archive" && globalThis.window?.CatHan?.archive;
    const filename = `${base}${archive ? ".loopcat.zip" : ".loopcat.json"}`;
    let destination;
    try {
      destination = archive && files.choose ? await files.choose(filename, "application/zip") : null;
    } catch (error) {
      status.set(error.message || "Export canceled", "dirty");
      return;
    }
    let previewPackage = null;
    try {
      previewPackage = await build.buildProjectPackage();
      build.assertValidProjectPackageForWrite(previewPackage, "export project package");
    } catch (error) {
      reportProjectPackageExportFailure(error, previewPackage);
      await destination?.abort?.().catch(() => {});
      return;
    }
    const warnings = validation.count(previewPackage.validation);
    const exportHistoryEntry = {
      id: `export-${clock.nowMs()}`,
      type: "project-package",
      verified: false,
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
        exportHistory: pendingProject.exportHistory,
        activityEvents: pendingActivityEvent ? [pendingActivityEvent] : []
      });
      build.assertValidProjectPackageForWrite(pkg, "export project package");
    } catch (error) {
      reportProjectPackageExportFailure(error, pkg);
      await destination?.abort?.().catch(() => {});
      return;
    }
    const finalWarnings = validation.count(pkg.validation);
    try {
      const written = archive ? await archive.writePackage(pkg, destination?.writable) : null;
      const content = archive ? written.data : JSON.stringify(pkg, null, 2);
      if (!archive && new Blob([content]).size > 50 * 1024 * 1024)
        throw new Error("JSON compatibility exports are limited to 50 MiB. Use the archive format.");
      const delivery = destination
        ? await destination.verify(written.digest)
        : await files.download(filename, content, archive ? "application/zip" : "application/json");
      if (!delivery?.verified) {
        presentation.renderValidation(pkg.validation);
        status.set("Download requested; verify the downloaded package before relying on it as a backup", "dirty");
        return;
      }
      exportHistoryEntry.verified = true;
    } catch (error) {
      await destination?.abort?.().catch(() => {});
      status.set(error.message || "Project package export failed", "dirty");
      return;
    }
    try {
      const current = persistence.getProject ? await persistence.getProject(pendingProject.id) : pendingProject;
      if (!current) throw new Error("The exported project was removed while the file was being written.");
      const saved = await persistence.updateProject({
        ...current,
        exportHistory: [
          ...(current.exportHistory || []).filter((entry) => entry.id !== exportHistoryEntry.id),
          exportHistoryEntry
        ].slice(-25)
      });
      if (session.getProject()?.id === saved.id) session.replaceProject(saved);
      session.replaceProjects(session.getProjects().map((project) => (project.id === saved.id ? saved : project)));
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
        if (session.getProject()?.id === pendingProject.id)
          session.replaceActivityEvents(await persistence.listActivityEvents(pendingProject.id));
      }
      workspace.markDirty(pendingProject.id);
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
