/**
 * Owns project selection, contextual record loading, filter restoration,
 * navigation, and initial presentation. Session records, persistence, filters,
 * navigation, rendering, and editor context remain injected owners.
 *
 * @param {{
 *   autosave: { flush: () => Promise<unknown> | unknown },
 *   session: {
 *     getProject: () => any,
 *     getProjects: () => any[],
 *     getSegments: () => any[],
 *     replaceProject: (project: any) => unknown,
 *     replaceSegments: (segments: any[]) => unknown,
 *     replaceActivityEvents: (events: any[]) => unknown
 *   },
 *   command: { setProjectId: (projectId: any) => unknown },
 *   repository: {
 *     listSegments: (projectId: any) => Promise<any[]> | any[],
 *     listActivity: (projectId: any) => Promise<any[]> | any[]
 *   },
 *   histories: { prepare: (segments: any[]) => any[] },
 *   terms: { refresh: () => Promise<unknown> | unknown },
 *   filters: {
 *     ready: () => Promise<unknown> | unknown,
 *     restore: (projectId: any) => Promise<unknown> | unknown
 *   },
 *   navigation: { open: (projectId: any, activeIndex: number) => unknown },
 *   presentation: { renderAll: () => unknown },
 *   context: { getView: () => string, refreshEditor: () => Promise<unknown> | unknown }
 * }} options
 */
export function createProjectOpenController(options) {
  const autosave = options?.autosave;
  const session = options?.session;
  const command = options?.command;
  const repository = options?.repository;
  const histories = options?.histories;
  const terms = options?.terms;
  const filters = options?.filters;
  const navigation = options?.navigation;
  const presentation = options?.presentation;
  const context = options?.context;

  if (typeof autosave?.flush !== "function") {
    throw new TypeError("ProjectOpenController requires an autosave boundary.");
  }
  if (
    typeof session?.getProject !== "function" ||
    typeof session.getProjects !== "function" ||
    typeof session.getSegments !== "function" ||
    typeof session.replaceProject !== "function" ||
    typeof session.replaceSegments !== "function" ||
    typeof session.replaceActivityEvents !== "function"
  ) {
    throw new TypeError("ProjectOpenController requires project session boundaries.");
  }
  if (
    typeof command?.setProjectId !== "function" ||
    typeof repository?.listSegments !== "function" ||
    typeof repository.listActivity !== "function" ||
    typeof histories?.prepare !== "function" ||
    typeof terms?.refresh !== "function"
  ) {
    throw new TypeError("ProjectOpenController requires command, repository, history, and term boundaries.");
  }
  if (
    typeof filters?.ready !== "function" ||
    typeof filters.restore !== "function" ||
    typeof navigation?.open !== "function" ||
    typeof presentation?.renderAll !== "function" ||
    typeof context?.getView !== "function" ||
    typeof context.refreshEditor !== "function"
  ) {
    throw new TypeError("ProjectOpenController requires filter, navigation, presentation, and context boundaries.");
  }

  async function open(projectId) {
    await autosave.flush();
    session.replaceProject(session.getProjects().find((project) => project.id === projectId) || null);
    command.setProjectId(session.getProject()?.id || projectId || "");
    session.replaceSegments(histories.prepare(session.getProject() ? await repository.listSegments(projectId) : []));
    session.replaceActivityEvents(session.getProject() ? await repository.listActivity(projectId) : []);
    await terms.refresh();
    const activeIndex = session.getSegments().length ? 0 : -1;
    await filters.ready();
    await filters.restore(session.getProject()?.id || projectId);
    navigation.open(session.getProject()?.id || projectId, activeIndex);
    presentation.renderAll();
    if (context.getView() === "editor") await context.refreshEditor();
  }

  return Object.freeze({ open });
}
