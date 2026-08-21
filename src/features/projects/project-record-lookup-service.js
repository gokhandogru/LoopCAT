/**
 * Owns current/list/summary project-record lookup precedence. Project records
 * and their live session storage remain injected boundaries.
 *
 * @param {{
 *   session: {
 *     getProject: () => any,
 *     getProjects: () => any[],
 *     getProjectSummaries: () => any[]
 *   }
 * }} options
 */
export function createProjectRecordLookupService(options) {
  const session = options?.session;

  if (
    typeof session?.getProject !== "function" ||
    typeof session?.getProjects !== "function" ||
    typeof session?.getProjectSummaries !== "function"
  ) {
    throw new TypeError(
      "ProjectRecordLookupService requires current-project, project-list, and project-summary boundaries."
    );
  }

  function findById(projectId) {
    return session.getProject()?.id === projectId
      ? session.getProject()
      : session.getProjects().find((project) => project.id === projectId) ||
          session.getProjectSummaries().find((project) => project.id === projectId) ||
          null;
  }

  return Object.freeze({ findById });
}
