/**
 * Owns workspace-folder package synchronization sequencing. Pending-save
 * mechanics, package import policy, workspace storage, navigation, redaction,
 * and presentation remain injected application boundaries.
 *
 * @param {{
 *   connection: { isConnected: () => boolean },
 *   autosave: { flush: () => Promise<unknown> },
 *   packages: { list: () => Promise<any[]>, read: (reference: any) => Promise<any> },
 *   dirty: { has: (projectId: string) => boolean },
 *   imports: { importProjectPackageData: (pkg: any, options: any) => Promise<any> },
 *   validation: { count: (report: any) => number },
 *   text: { redact: (value: unknown) => string },
 *   session: { replaceProject: (project: any) => unknown, replaceSegments: (segments: any[]) => unknown },
 *   navigation: { openProjects: () => unknown, clearSelection: () => unknown },
 *   projects: { load: (render?: boolean) => Promise<unknown> },
 *   workspace: { getStatus: () => Promise<any>, setStatus: (status: any) => unknown },
 *   presentation: { renderWorkspaceStatus: () => unknown, renderValidation: (report: any) => unknown },
 *   status: { set: (message: string, mode?: string) => unknown }
 * }} options
 */
export function createWorkspaceSyncController(options) {
  const connection = options?.connection;
  const autosave = options?.autosave;
  const packages = options?.packages;
  const dirty = options?.dirty;
  const imports = options?.imports;
  const validation = options?.validation;
  const text = options?.text;
  const session = options?.session;
  const navigation = options?.navigation;
  const projects = options?.projects;
  const workspace = options?.workspace;
  const presentation = options?.presentation;
  const status = options?.status;

  if (
    typeof connection?.isConnected !== "function" ||
    typeof autosave?.flush !== "function" ||
    typeof packages?.list !== "function" ||
    typeof packages?.read !== "function" ||
    typeof dirty?.has !== "function" ||
    typeof imports?.importProjectPackageData !== "function" ||
    typeof validation?.count !== "function" ||
    typeof text?.redact !== "function" ||
    typeof session?.replaceProject !== "function" ||
    typeof session?.replaceSegments !== "function" ||
    typeof navigation?.openProjects !== "function" ||
    typeof navigation?.clearSelection !== "function" ||
    typeof projects?.load !== "function" ||
    typeof workspace?.getStatus !== "function" ||
    typeof workspace?.setStatus !== "function" ||
    typeof presentation?.renderWorkspaceStatus !== "function" ||
    typeof presentation?.renderValidation !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "WorkspaceSyncController requires connection, autosave, package, dirty, import, validation, text, session, navigation, project, workspace, presentation, and status boundaries."
    );
  }

  async function sync() {
    if (!connection.isConnected()) return;
    await autosave.flush();
    const references = await packages.list();
    const imported = [];
    const warnings = [];
    const addWarning = (message) => {
      const redacted = text.redact(message || "").trim();
      if (redacted) warnings.push(redacted);
    };

    for (const reference of references) {
      if (reference.id && dirty.has(reference.id)) {
        addWarning(
          `${reference.name || reference.id}: local package has unsaved folder changes; save it before syncing from the workspace folder.`
        );
        continue;
      }
      try {
        const pkg = await packages.read(reference);
        const packageProjectId = pkg?.project?.id;
        if (packageProjectId && dirty.has(packageProjectId)) {
          addWarning(
            `${reference.name || packageProjectId}: local package has unsaved folder changes; save it before syncing from the workspace folder.`
          );
          continue;
        }
        const result = await imports.importProjectPackageData(pkg, {
          sourceName: reference.packagePath,
          replaceExisting: true,
          open: false,
          sourceIsWorkspace: true,
          suppressAlert: true
        });
        if (result) {
          const importedName = result.pkg.project.name || result.pkg.project.id;
          imported.push(importedName);
          const noteCount = validation.count(result.validation);
          if (noteCount) {
            addWarning(`${importedName}: imported with ${noteCount} validation note${noteCount === 1 ? "" : "s"}.`);
          }
        } else {
          addWarning(`${reference.name || reference.id}: package failed validation and was skipped.`);
        }
      } catch (error) {
        addWarning(`${reference.name || reference.id}: ${error.message}`);
      }
    }

    session.replaceProject(null);
    session.replaceSegments([]);
    navigation.openProjects();
    navigation.clearSelection();
    await projects.load(false);
    const workspaceStatus = await workspace.getStatus();
    workspace.setStatus(workspaceStatus);
    const finalWarnings = Array.from(
      new Set(
        [...(workspaceStatus.warnings || []), ...warnings]
          .map((warning) => text.redact(warning || "").trim())
          .filter(Boolean)
      )
    );
    presentation.renderWorkspaceStatus();
    presentation.renderValidation({
      ok: finalWarnings.length === 0,
      errors: [],
      warnings: finalWarnings,
      preserved: [
        `${imported.length} project package${imported.length === 1 ? "" : "s"} synced from the workspace folder.`
      ],
      simplified: [],
      skipped: [],
      risky: []
    });
    status.set(
      finalWarnings.length ? "Workspace sync completed with warnings" : "Workspace synced",
      finalWarnings.length ? "dirty" : "saved"
    );
  }

  return Object.freeze({ sync });
}
