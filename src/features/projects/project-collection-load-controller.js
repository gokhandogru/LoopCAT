/**
 * Owns project-collection loading, derived-state pruning, initial presentation,
 * and optional first-project selection. Project records, summaries, workspace
 * dirtiness, Trash, DOM rendering, and project opening remain injected owners.
 *
 * @param {{
 *   preload?: { schedule: (projects: any[]) => void },
 *   repository: { list: () => Promise<any[]> | any[], listCatalog?: () => Promise<any[]>, preview?: () => any[] },
 *   session: {
 *     getProject: () => any,
 *     getProjects: () => any[],
 *     replaceProjects: (projects: any[]) => unknown,
 *     pruneProjectSummaryRevisions: (projectIds: Set<any>) => unknown
 *   },
 *   dirty: { prune: () => unknown },
 *   summaries: { refresh: () => Promise<unknown> | unknown },
 *   presentation: {
 *     renderList: () => unknown,
 *     renderEditor: () => unknown,
 *     renderTrashSummary: () => unknown
 *   },
 *   selection: { open: (projectId: any) => Promise<unknown> | unknown }
 * }} options
 */
export function createProjectCollectionLoadController(options) {
  const repository = options?.repository;
  const session = options?.session;
  const dirty = options?.dirty;
  const summaries = options?.summaries;
  const presentation = options?.presentation;
  const selection = options?.selection;

  if (typeof repository?.list !== "function") {
    throw new TypeError("ProjectCollectionLoadController requires a project-list repository boundary.");
  }
  if (
    typeof session?.getProject !== "function" ||
    typeof session.getProjects !== "function" ||
    typeof session.replaceProjects !== "function" ||
    typeof session.pruneProjectSummaryRevisions !== "function"
  ) {
    throw new TypeError("ProjectCollectionLoadController requires project session boundaries.");
  }
  if (typeof dirty?.prune !== "function" || typeof summaries?.refresh !== "function") {
    throw new TypeError("ProjectCollectionLoadController requires dirty-state and summary boundaries.");
  }
  if (
    typeof presentation?.renderList !== "function" ||
    typeof presentation.renderEditor !== "function" ||
    typeof presentation.renderTrashSummary !== "function" ||
    typeof selection?.open !== "function"
  ) {
    throw new TypeError("ProjectCollectionLoadController requires presentation and selection boundaries.");
  }

  let loadRevision = 0;
  async function preview() {
    const records = repository.preview?.();
    if (!records?.length) return;
    session.replaceProjects(records.map((project) => ({ ...project, catalogUnverified: true })));
    await summaries.refresh();
    presentation.renderList();
  }
  async function load(selectFirst = false, { catalog = false } = {}) {
    const revision = ++loadRevision;
    const records = await (catalog && repository.listCatalog ? repository.listCatalog() : repository.list());
    if (revision !== loadRevision) return;
    session.replaceProjects(records);
    const knownProjectIds = new Set(session.getProjects().map((project) => project.id));
    session.pruneProjectSummaryRevisions(knownProjectIds);
    dirty.prune();
    await summaries.refresh();
    if (revision !== loadRevision) return;
    presentation.renderList();
    presentation.renderEditor();
    void presentation.renderTrashSummary();
    options.preload?.schedule(session.getProjects());
    if (selectFirst && !session.getProject() && session.getProjects()[0]) {
      await selection.open(session.getProjects()[0].id);
    }
  }

  return Object.freeze({ load, preview });
}
