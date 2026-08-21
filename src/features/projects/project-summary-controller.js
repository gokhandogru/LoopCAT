/**
 * Owns project-summary construction, cache reuse, segment lookup, replacement,
 * and Projects presentation sequencing. Project records, segments, summary
 * revisions, derivation policy, and DOM rendering remain injected boundaries.
 *
 * @param {{
 *   session: {
 *     getProject: () => any,
 *     getProjects: () => any[],
 *     getProjectSummaries: () => any[],
 *     getProjectSummaryRevision: (projectId: string) => number,
 *     getSegments: () => any[],
 *     replaceProjectSummaries: (summaries: any[]) => unknown
 *   },
 *   segments: { list: (projectId: string) => Promise<any[]> | any[] },
 *   progress: { project: (segments: any[]) => any },
 *   search: { build: (project: any) => string },
 *   language: { key: (project: any) => string },
 *   presentation: { renderLanguageFilter: () => unknown, renderProjects: () => unknown }
 * }} options
 */
export function createProjectSummaryController(options) {
  const session = options?.session;
  const segments = options?.segments;
  const progress = options?.progress;
  const search = options?.search;
  const language = options?.language;
  const presentation = options?.presentation;

  if (
    typeof session?.getProject !== "function" ||
    typeof session.getProjects !== "function" ||
    typeof session.getProjectSummaries !== "function" ||
    typeof session.getProjectSummaryRevision !== "function" ||
    typeof session.getSegments !== "function" ||
    typeof session.replaceProjectSummaries !== "function"
  ) {
    throw new TypeError("ProjectSummaryController requires project-summary session boundaries.");
  }
  if (
    typeof segments?.list !== "function" ||
    typeof progress?.project !== "function" ||
    typeof search?.build !== "function" ||
    typeof language?.key !== "function"
  ) {
    throw new TypeError("ProjectSummaryController requires segment, progress, search, and language boundaries.");
  }
  if (typeof presentation?.renderLanguageFilter !== "function" || typeof presentation.renderProjects !== "function") {
    throw new TypeError("ProjectSummaryController requires Projects presentation boundaries.");
  }

  function build(project, projectSegments, summaryRevision = session.getProjectSummaryRevision(project.id)) {
    const projectProgress = progress.project(projectSegments);
    const projectSearchText = search.build(project);
    return {
      ...project,
      progress: projectProgress,
      wordCount: projectProgress.words,
      searchText: projectSearchText,
      languagePairKey: language.key(project),
      summaryRevision
    };
  }

  async function summarize(
    project,
    projectSegments = null,
    summaryRevision = session.getProjectSummaryRevision(project.id)
  ) {
    const resolvedSegments = Array.isArray(projectSegments) ? projectSegments : await segments.list(project.id);
    return build(project, resolvedSegments, summaryRevision);
  }

  async function refresh() {
    const cachedById = new Map(session.getProjectSummaries().map((summary) => [summary.id, summary]));
    const projectSummaries = await Promise.all(
      session.getProjects().map((project) => {
        const revision = session.getProjectSummaryRevision(project.id);
        const cached = cachedById.get(project.id);
        if (cached && cached.updatedAt === project.updatedAt && cached.summaryRevision === revision) {
          return {
            ...cached,
            ...project,
            progress: cached.progress,
            wordCount: cached.wordCount,
            searchText: search.build(project),
            languagePairKey: language.key(project),
            summaryRevision: revision
          };
        }
        const inMemorySegments = session.getProject()?.id === project.id ? session.getSegments() : null;
        return summarize(project, inMemorySegments, revision);
      })
    );
    session.replaceProjectSummaries(projectSummaries);
    presentation.renderLanguageFilter();
    presentation.renderProjects();
  }

  return Object.freeze({ build, summarize, refresh });
}
