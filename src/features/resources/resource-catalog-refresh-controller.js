/**
 * Owns concurrent resource-catalog reads and Resources-state replacement.
 * Persistence, resource view state, rendering, and DOM lifecycle remain
 * injected owners.
 *
 * @param {{
 *   repository: {
 *     readCatalog?: () => Promise<any>,
 *     listTmEntries: () => Promise<unknown> | unknown,
 *     listTerms: () => Promise<unknown> | unknown,
 *     listResources?: () => Promise<unknown> | unknown,
 *     listProjects?: () => Promise<unknown> | unknown
 *   },
 *   presentation: { setResources: (resources: { tmEntries: unknown, terms: unknown, resources?: any[] }) => unknown }
 * }} options
 */
export function createResourceCatalogRefreshController(options) {
  const repository = options?.repository;
  const presentation = options?.presentation;

  if (typeof repository?.listTmEntries !== "function" || typeof repository.listTerms !== "function") {
    throw new TypeError("ResourceCatalogRefreshController requires resource repository boundaries.");
  }
  if (typeof presentation?.setResources !== "function") {
    throw new TypeError("ResourceCatalogRefreshController requires a Resources presentation boundary.");
  }

  let pendingCatalog = null;
  let refreshAgain = false;
  function refresh() {
    if (!repository.readCatalog) return read();
    if (pendingCatalog) refreshAgain = true;
    else
      pendingCatalog = (async () => {
        let result;
        do {
          refreshAgain = false;
          result = await read();
        } while (refreshAgain);
        return result;
      })().finally(() => {
        pendingCatalog = null;
      });
    return pendingCatalog;
  }

  async function read() {
    const catalog = repository.readCatalog ? await repository.readCatalog() : null;
    const hasStableResources = typeof repository.listResources === "function";
    /** @type {Array<Promise<unknown> | unknown>} */
    const pending = catalog
      ? [[], [], catalog.resources, catalog.projects]
      : [repository.listTmEntries(), repository.listTerms()];
    if (!catalog && hasStableResources) pending.push(repository.listResources());
    if (!catalog && typeof repository.listProjects === "function") pending.push(repository.listProjects());
    const settled = await Promise.all(pending);
    const [tmEntries, terms] = settled;
    if (!catalog && !hasStableResources) {
      const legacy = { tmEntries, terms };
      return presentation.setResources(legacy) || { ...legacy };
    }
    const resources = Array.isArray(settled[2]) ? settled[2] : [];
    const projects = Array.isArray(settled[3]) ? settled[3] : [];
    const enrichedResources = (resources || []).map((resource) => {
      const links = (projects || []).flatMap((project) =>
        (project.resourceLinks || [])
          .filter((link) => link.resourceId === resource.id)
          .map((link) => ({ ...link, projectId: project.id, projectName: project.name }))
      );
      return {
        ...resource,
        linkedProjects: links.map(({ projectId, projectName }) => ({ id: projectId, name: projectName })),
        usage: {
          main: links.some((link) => link.type === "tm" && link.role === "main"),
          reference: links.some((link) => link.type === "tm" && link.role === "reference"),
          lookup: links.some((link) => link.lookup !== false),
          qa: links.some((link) => link.type === "termbase" && link.qa !== false),
          write: links.some((link) => link.type === "termbase" && link.contribute)
        }
      };
    });
    return (
      presentation.setResources({ tmEntries, terms, resources: enrichedResources }) || {
        tmEntries,
        terms,
        resources: enrichedResources
      }
    );
  }

  return Object.freeze({ refresh });
}
