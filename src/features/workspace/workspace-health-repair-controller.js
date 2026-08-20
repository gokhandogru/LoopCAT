/**
 * Owns workspace manifest-repair and health-report sequencing. Filesystem
 * repair policy, resource repositories, dirty markers, and presentation remain
 * injected application boundaries.
 *
 * @param {{
 *   connection: { isConnected: () => boolean },
 *   storage: { repairManifest: () => Promise<any>, getStatus: () => Promise<any>, buildHealthReport: (input: any) => Promise<any> },
 *   workspace: { setStatus: (status: any) => unknown },
 *   resources: { listTmEntries: () => Promise<any[]>, listTerms: () => Promise<any[]> },
 *   session: { getProjects: () => any[] },
 *   dirty: { ids: () => string[] },
 *   presentation: { renderValidation: (report: any) => unknown, renderWorkspaceStatus: () => unknown },
 *   status: { set: (message: string, mode?: string) => unknown }
 * }} options
 */
export function createWorkspaceHealthRepairController(options) {
  const connection = options?.connection;
  const storage = options?.storage;
  const workspace = options?.workspace;
  const resources = options?.resources;
  const session = options?.session;
  const dirty = options?.dirty;
  const presentation = options?.presentation;
  const status = options?.status;

  if (
    typeof connection?.isConnected !== "function" ||
    typeof storage?.repairManifest !== "function" ||
    typeof storage?.getStatus !== "function" ||
    typeof storage?.buildHealthReport !== "function" ||
    typeof workspace?.setStatus !== "function" ||
    typeof resources?.listTmEntries !== "function" ||
    typeof resources?.listTerms !== "function" ||
    typeof session?.getProjects !== "function" ||
    typeof dirty?.ids !== "function" ||
    typeof presentation?.renderValidation !== "function" ||
    typeof presentation?.renderWorkspaceStatus !== "function" ||
    typeof status?.set !== "function"
  ) {
    throw new TypeError(
      "WorkspaceHealthRepairController requires connection, storage, workspace, resource, session, dirty, presentation, and status boundaries."
    );
  }

  async function repair() {
    if (!connection.isConnected()) return;
    const repairResult = await storage.repairManifest();
    const workspaceStatus = await storage.getStatus();
    workspace.setStatus(workspaceStatus);
    const [tmEntries, terms] = await Promise.all([resources.listTmEntries(), resources.listTerms()]);
    const report = await storage.buildHealthReport({
      projects: session.getProjects(),
      tmEntries,
      terms,
      dirtyProjectIds: dirty.ids()
    });
    report.preserved.unshift(
      `${repairResult.recoveredProjectCount} project package${repairResult.recoveredProjectCount === 1 ? "" : "s"} verified in the workspace folder.`
    );
    presentation.renderValidation(report);
    presentation.renderWorkspaceStatus();
    status.set(report.ok ? "Workspace health checked" : "Workspace needs attention", report.ok ? "saved" : "dirty");
  }

  return Object.freeze({ repair });
}
