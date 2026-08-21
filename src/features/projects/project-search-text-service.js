/**
 * Owns normalized project search-text composition. Project records, resource
 * context policy, summary caching, filters, and presentation remain injected or
 * external owners.
 *
 * @param {{
 *   resources: { summary: (project: any) => { tmNames: any[], tbNames: any[] } },
 *   text: { stableLower: (value: unknown) => any }
 * }} options
 */
export function createProjectSearchTextService(options) {
  const resources = options?.resources;
  const text = options?.text;
  if (typeof resources?.summary !== "function") {
    throw new TypeError("ProjectSearchTextService requires a project-resource summary boundary.");
  }
  if (typeof text?.stableLower !== "function") {
    throw new TypeError("ProjectSearchTextService requires a locale-stable text boundary.");
  }

  function resourceNames(project) {
    const summary = resources.summary(project);
    return [...summary.tmNames, ...summary.tbNames].join(" ");
  }

  function build(project) {
    return text.stableLower(
      `${project.name} ${project.domain || ""} ${project.sourceFileName || ""} ${resourceNames(project)}`
    );
  }

  return Object.freeze({ build });
}
