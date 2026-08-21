/**
 * Owns concurrent resource-catalog reads and Resources-state replacement.
 * Persistence, resource view state, rendering, and DOM lifecycle remain
 * injected owners.
 *
 * @param {{
 *   repository: {
 *     listTmEntries: () => Promise<unknown> | unknown,
 *     listTerms: () => Promise<unknown> | unknown
 *   },
 *   presentation: { setResources: (resources: { tmEntries: unknown, terms: unknown }) => unknown }
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

  async function refresh() {
    const [tmEntries, terms] = await Promise.all([repository.listTmEntries(), repository.listTerms()]);
    return presentation.setResources({ tmEntries, terms }) || { tmEntries, terms };
  }

  return Object.freeze({ refresh });
}
