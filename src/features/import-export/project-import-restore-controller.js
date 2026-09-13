import { validateProjectImportRestoreControllerOptions } from "./project-import-restore-controller-contract.js";

/**
 * Owns project-package import and browser-backup restore orchestration. File
 * task lifecycle, portable parsing/preparation, storage transactions, index
 * implementations, project loading/opening, and generic validation DOM remain
 * behind injected boundaries.
 *
 * @param {{
 *   files: { progress: (phase: string, file?: any, detail?: string) => Promise<unknown>, parseJson: (file: any, label: string) => Promise<any> },
 *   portability: { validate: (pkg: any) => any, prepare: (pkg: any, options: any) => Promise<any> },
 *   backup: { validate: (backup: any) => any },
 *   session: { getProjects: () => any[], replaceProject: (project: any) => unknown, replaceSegments: (segments: any[]) => unknown },
 *   autosave: { flush: (projectId?: string) => Promise<unknown> },
 *   persistence: { importProjectPackageRecords: (records: any) => Promise<unknown>, importAllData: (backup: any) => Promise<unknown>, prepareRestore?: (backup: any, options?: any) => Promise<any>, commitRestore?: (plan: any) => Promise<any> },
 *   indexes: { rebuildTm: () => Promise<unknown>, rebuildTerms: () => Promise<unknown> },
 *   activity: { logForProject: (projectId: string, type: string, summary: string, detail: any, label: string) => Promise<{ ok: boolean }>, appendWarning: (message: string, logged: boolean) => string },
 *   navigation: { openProjects: () => unknown, clearSelection: () => unknown },
 *   projects: { load: (openFirst: boolean) => Promise<unknown>, open: (projectId: string) => Promise<unknown> },
 *   workspace: { isConnected: () => boolean, clearDirty: (projectId: string) => unknown, markDirty: (projectId: string) => unknown, clearDirtyMarkers: () => unknown, markProjectsDirty: (projectIds: string[]) => unknown },
 *   validation: { count: (report: any) => number, alertText: (report: any, fallback: string) => string },
 *   presentation: { renderValidation: (report: any) => unknown, renderWorkspaceStatus: () => unknown },
 *   status: { set: (message: string, mode?: string) => unknown, mode: (preferred: string, activityLogged: boolean) => string },
 *   localization: { alert: (message: string) => unknown, confirm: (message: string) => boolean },
 *   text: { safe: (value: any) => string }
 * }} options
 */
export function createProjectImportRestoreController(options) {
  const files = options?.files;
  const portability = options?.portability;
  const backup = options?.backup;
  const session = options?.session;
  const autosave = options?.autosave;
  const persistence = options?.persistence;
  const indexes = options?.indexes;
  const activity = options?.activity;
  const navigation = options?.navigation;
  const projects = options?.projects;
  const workspace = options?.workspace;
  const validation = options?.validation;
  const presentation = options?.presentation;
  const status = options?.status;
  const localization = options?.localization;
  const text = options?.text;

  validateProjectImportRestoreControllerOptions(options);

  async function importProjectPackageData(pkg, importOptions = {}) {
    const sourceName = importOptions.sourceName || "project package";
    await files.progress("Validating project package", { name: sourceName });
    const packageValidation = portability.validate(pkg);
    if (!packageValidation.ok) {
      if (!importOptions.suppressAlert) {
        localization.alert(validation.alertText(packageValidation, "Project package import failed validation"));
      }
      presentation.renderValidation(packageValidation);
      status.set("Project package import failed validation", "dirty");
      return null;
    }
    const existing = session.getProjects().find((project) => project.id === pkg.project.id);
    let importAsCopy = false;
    if (existing) {
      const replace =
        importOptions.replaceExisting ??
        localization.confirm(
          `A project named "${text.safe(existing.name)}" already exists. Replace it with this package?`
        );
      if (!replace) {
        importAsCopy =
          importOptions.importAsCopy ??
          localization.confirm("Keep the existing project and import this package as a separate copy?");
        if (!importAsCopy) return null;
      }
    }
    const replaceProjectId = existing && !importAsCopy ? existing.id : "";
    if (replaceProjectId) await autosave.flush(replaceProjectId);
    const prepared = await portability.prepare(pkg, {
      replaceProjectId,
      importAsCopy
    });
    await files.progress(
      "Saving project package records",
      { name: sourceName },
      `${(prepared.segments || []).length} segment${(prepared.segments || []).length === 1 ? "" : "s"}`
    );
    const importReport = importAsCopy
      ? {
          ...packageValidation,
          preserved: [
            ...packageValidation.preserved,
            `Imported as a separate project copy named "${text.safe(prepared.project.name)}".`
          ]
        }
      : packageValidation;
    const resourceRecords = prepared.resources || {};
    await persistence.importProjectPackageRecords({
      project: prepared.project,
      segments: prepared.segments || [],
      tmEntries: resourceRecords.tmEntries || [],
      terms: resourceRecords.terms || [],
      ...(Object.hasOwn(resourceRecords, "resources") ? { resources: resourceRecords.resources || [] } : {}),
      ...(Object.hasOwn(resourceRecords, "tmContributions")
        ? { tmContributions: resourceRecords.tmContributions || [] }
        : {}),
      ...(Object.hasOwn(resourceRecords, "termConcepts") ? { termConcepts: resourceRecords.termConcepts || [] } : {}),
      ...(Object.hasOwn(resourceRecords, "termDesignations")
        ? { termDesignations: resourceRecords.termDesignations || [] }
        : {}),
      activityEvents: prepared.activityEvents || [],
      replaceProjectId
    });
    await files.progress("Rebuilding resource indexes", { name: sourceName });
    await indexes.rebuildTm();
    await indexes.rebuildTerms();
    await files.progress("Refreshing projects", { name: sourceName });
    const activityResult = await activity.logForProject(
      prepared.project.id,
      "import",
      "Project package imported",
      {
        fileName: sourceName,
        warningCount: validation.count(importReport),
        importAsCopy
      },
      "Project package import"
    );
    const activityLogged = activityResult.ok;
    session.replaceProject(null);
    session.replaceSegments([]);
    navigation.openProjects();
    navigation.clearSelection();
    await projects.load(false);
    if (importOptions.open !== false) await projects.open(prepared.project.id);
    presentation.renderValidation(importReport);
    const warningCount = validation.count(importReport);
    const successMessage = warningCount
      ? `Imported with ${warningCount} validation note${warningCount === 1 ? "" : "s"}`
      : "Project package imported";
    status.set(
      activity.appendWarning(successMessage, activityLogged),
      status.mode(warningCount ? "dirty" : "saved", activityLogged)
    );
    if (importOptions.sourceIsWorkspace) workspace.clearDirty(prepared.project.id);
    else if (workspace.isConnected()) workspace.markDirty(prepared.project.id);
    return { pkg: prepared, validation: importReport };
  }

  async function importProjectPackage(file) {
    await files.progress("Reading project package", file);
    const pkg = await files.parseJson(file, "Project package");
    return importProjectPackageData(pkg, { sourceName: file.name });
  }

  async function restoreBackupData(backupRecord) {
    await files.progress("Validating backup");
    const backupReport = backupRecord.archiveStagingId ? backupRecord.validation : backup.validate(backupRecord);
    if (!backupReport.ok) {
      presentation.renderValidation(backupReport);
      status.set("Backup restore failed validation", "dirty");
      return null;
    }
    await autosave.flush();
    await files.progress(
      "Restoring backup stores",
      null,
      `${(backupRecord.projects || []).length} project${(backupRecord.projects || []).length === 1 ? "" : "s"}`
    );
    if (persistence.prepareRestore && persistence.commitRestore) {
      const names = (backupRecord.projects || []).map((project) => text.safe(project.name)).join(", ");
      let mode = "copy";
      if (
        !localization.confirm(
          `Import these projects as separate copies, keeping current work? ${names || "(empty backup)"}`
        )
      ) {
        const affected = session
          .getProjects()
          .map((project) => text.safe(project.name))
          .join(", ");
        if (
          !localization.confirm(
            `Replace the entire local workspace, including ${affected || "all local records"}? A verified rollback checkpoint will be kept.`
          )
        )
          return null;
        mode = "replace";
      }
      const plan = await persistence.prepareRestore(backupRecord, { mode });
      await persistence.commitRestore(plan);
    } else await persistence.importAllData(backupRecord);
    session.replaceProject(null);
    session.replaceSegments([]);
    navigation.openProjects();
    navigation.clearSelection();
    await projects.load(false);
    let indexWarning = false;
    try {
      await files.progress("Rebuilding resource indexes");
      await indexes.rebuildTm();
      await indexes.rebuildTerms();
    } catch {
      indexWarning = true;
    }
    const restoredProjectIds = session
      .getProjects()
      .map((project) => project.id)
      .filter(Boolean);
    if (workspace.isConnected()) {
      workspace.clearDirtyMarkers();
      workspace.markProjectsDirty(restoredProjectIds);
      presentation.renderWorkspaceStatus();
    }
    const restoreReport = {
      ok: true,
      errors: [],
      warnings: backupReport.warnings,
      preserved: [
        ...backupReport.preserved,
        `${(backupRecord.projects || []).length} project${
          (backupRecord.projects || []).length === 1 ? "" : "s"
        } restored.`,
        `${backupRecord.counts?.segments ?? (backupRecord.segments || []).length} segment${
          (backupRecord.counts?.segments ?? (backupRecord.segments || []).length) === 1 ? "" : "s"
        } restored.`
      ],
      simplified: [],
      skipped: [],
      risky: [
        ...backupReport.risky,
        ...(workspace.isConnected() && restoredProjectIds.length
          ? [
              `${restoredProjectIds.length} restored project package${
                restoredProjectIds.length === 1 ? "" : "s"
              } must be saved to the workspace folder.`
            ]
          : [])
      ]
    };
    presentation.renderValidation(restoreReport);
    const restoreNotes = validation.count(restoreReport);
    status.set(
      indexWarning
        ? "Restore completed; indexes need repair"
        : restoreNotes
          ? `Backup restored with ${restoreNotes} validation note${restoreNotes === 1 ? "" : "s"}`
          : "Backup restored",
      indexWarning || restoreNotes ? "dirty" : "saved"
    );
    return { backup: backupRecord, report: restoreReport };
  }
  async function restoreBackupFile(file) {
    await files.progress("Reading backup file", file);
    return restoreBackupData(await files.parseJson(file, "Backup file"));
  }

  return Object.freeze({
    importProjectPackage,
    importProjectPackageData,
    restoreBackupData,
    restoreBackupFile
  });
}
