/**
 * Owns workspace-folder full-backup export sequencing. Backup construction,
 * validation, filesystem writes, workspace status, and presentation remain
 * injected application boundaries.
 *
 * @param {{
 *   connection: { isConnected: () => boolean },
 *   build: { buildBackupExport: () => Promise<{ backup: any, validation: any }> },
 *   storage: { exportFullBackup: (backup: any) => Promise<any>, getStatus: () => Promise<any> },
 *   workspace: { setStatus: (status: any) => unknown },
 *   validation: { count: (report: any) => number, errorReport: (message: string) => any },
 *   presentation: { renderWorkspaceStatus: () => unknown, renderValidation: (report: any) => unknown },
 *   status: { set: (message: string, mode?: string) => unknown }
 * }} options
 */
export function createWorkspaceBackupExportController(options) {
  const connection = options?.connection;
  const build = options?.build;
  const storage = options?.storage;
  const workspace = options?.workspace;
  const validation = options?.validation;
  const presentation = options?.presentation;
  const status = options?.status;

  if (
    typeof connection?.isConnected !== "function" ||
    typeof build?.buildBackupExport !== "function" ||
    typeof storage?.exportFullBackup !== "function" ||
    typeof storage?.getStatus !== "function" ||
    typeof workspace?.setStatus !== "function" ||
    typeof validation?.count !== "function" ||
    typeof validation?.errorReport !== "function" ||
    typeof presentation?.renderWorkspaceStatus !== "function" ||
    typeof presentation?.renderValidation !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "WorkspaceBackupExportController requires connection, build, storage, workspace, validation, presentation, and status boundaries."
    );
  }

  async function exportBackup() {
    if (!connection.isConnected()) return;
    try {
      const { backup, validation: validationReport } = await build.buildBackupExport();
      const reference = await storage.exportFullBackup(backup);
      const workspaceStatus = await storage.getStatus();
      workspace.setStatus(workspaceStatus);
      presentation.renderWorkspaceStatus();
      presentation.renderValidation(validationReport);
      const manifestWarning = reference.manifestSaved === false ? "; manifest update failed" : "";
      status.set(
        `Workspace backup saved: ${reference.path}${manifestWarning}`,
        reference.manifestSaved === false || validation.count(validationReport) ? "dirty" : "saved"
      );
    } catch (error) {
      const message = error.message || "Workspace backup failed.";
      presentation.renderValidation(error.validation || validation.errorReport(message));
      status.set(message, "dirty");
      throw error;
    }
  }

  return Object.freeze({ exportBackup });
}
