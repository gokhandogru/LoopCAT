/**
 * Owns project-collection loading, derived-state pruning, initial presentation,
 * and optional first-project selection. Project records, summaries, workspace
 * dirtiness, Trash, DOM rendering, and project opening remain injected owners.
 *
 * @param {{
 *   repository: { list: () => Promise<any[]> | any[] },
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

  async function load(selectFirst = false) {
    session.replaceProjects(await repository.list());
    const knownProjectIds = new Set(session.getProjects().map((project) => project.id));
    session.pruneProjectSummaryRevisions(knownProjectIds);
    dirty.prune();
    await summaries.refresh();
    presentation.renderList();
    presentation.renderEditor();
    void presentation.renderTrashSummary();
    if (selectFirst && !session.getProject() && session.getProjects()[0]) {
      await selection.open(session.getProjects()[0].id);
    }
  }

  return Object.freeze({ load });
}
