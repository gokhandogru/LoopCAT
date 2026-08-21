/**
 * Owns current-project terminology refresh sequencing.
 * Session state, terminology persistence, resource-link policy, filter caches,
 * rendering, and DOM lifecycle remain injected owners.
 *
 * @param {{
 *   session: {
 *     getProject: () => { sourceLang: unknown, targetLang: unknown } | null | undefined,
 *     replaceProjectTerms: (terms: unknown) => unknown
 *   },
 *   repository: { listTerms: (query: unknown) => Promise<unknown> | unknown },
 *   resources: { termBaseNames: () => unknown },
 *   filters: { invalidate: () => unknown },
 *   presentation: {
 *     renderTermbaseSelect: () => unknown,
 *     renderSegments: (options: { preserveScroll: boolean }) => unknown
 *   }
 * }} options
 */
export function createProjectTermRefreshController(options) {
  const session = options?.session;
  const repository = options?.repository;
  const resources = options?.resources;
  const filters = options?.filters;
  const presentation = options?.presentation;

  if (typeof session?.getProject !== "function" || typeof session.replaceProjectTerms !== "function") {
    throw new TypeError("ProjectTermRefreshController requires project session boundaries.");
  }
  if (typeof repository?.listTerms !== "function" || typeof resources?.termBaseNames !== "function") {
    throw new TypeError("ProjectTermRefreshController requires terminology repository and resource boundaries.");
  }
  if (typeof filters?.invalidate !== "function") {
    throw new TypeError("ProjectTermRefreshController requires a segment-filter boundary.");
  }
  if (typeof presentation?.renderTermbaseSelect !== "function" || typeof presentation.renderSegments !== "function") {
    throw new TypeError("ProjectTermRefreshController requires terminology presentation boundaries.");
  }

  async function refresh({ rerender = false } = {}) {
    if (!session.getProject()) {
      session.replaceProjectTerms([]);
      return;
    }
    session.replaceProjectTerms(
      await repository.listTerms({
        sourceLang: session.getProject().sourceLang,
        targetLang: session.getProject().targetLang,
        termBaseNames: resources.termBaseNames()
      })
    );
    filters.invalidate();
    presentation.renderTermbaseSelect();
    if (rerender) presentation.renderSegments({ preserveScroll: true });
  }

  return Object.freeze({ refresh });
}
