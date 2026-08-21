/**
 * Owns guarded current-project terminology queries.
 * Session state, terminology persistence, resource-link policy, validation,
 * and presentation remain injected owners.
 *
 * @param {{
 *   session: { getProject: () => { sourceLang: unknown, targetLang: unknown } | null | undefined },
 *   repository: { listTerms: (query: unknown) => Promise<unknown> | unknown },
 *   resources: { termBaseNames: () => unknown }
 * }} options
 */
export function createProjectTermQueryService(options) {
  const session = options?.session;
  const repository = options?.repository;
  const resources = options?.resources;

  if (typeof session?.getProject !== "function") {
    throw new TypeError("ProjectTermQueryService requires a project session boundary.");
  }
  if (typeof repository?.listTerms !== "function" || typeof resources?.termBaseNames !== "function") {
    throw new TypeError("ProjectTermQueryService requires terminology repository and resource boundaries.");
  }

  // Preserve the original async promise-assimilation boundary without adding a rejection-transforming await.
  // eslint-disable-next-line require-await
  async function listForValidation() {
    if (!session.getProject()) return [];
    return repository.listTerms({
      sourceLang: session.getProject().sourceLang,
      targetLang: session.getProject().targetLang,
      termBaseNames: resources.termBaseNames()
    });
  }

  return Object.freeze({ listForValidation });
}
