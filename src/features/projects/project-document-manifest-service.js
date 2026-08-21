/**
 * Owns project document-manifest cleanup and stable first-ID deduplication.
 * The live project, shared name cleanup, and locale-stable type normalization
 * remain injected boundaries.
 *
 * @param {{
 *   session: { getProject: () => any },
 *   names: { clean: (value: unknown, fallback?: any) => any },
 *   text: { lower: (value: unknown) => string }
 * }} options
 */
export function createProjectDocumentManifestService(options) {
  const session = options?.session;
  const names = options?.names;
  const text = options?.text;

  if (typeof session?.getProject !== "function") {
    throw new TypeError("ProjectDocumentManifestService requires a current-project boundary.");
  }
  if (typeof names?.clean !== "function") {
    throw new TypeError("ProjectDocumentManifestService requires a project-name cleanup boundary.");
  }
  if (typeof text?.lower !== "function") {
    throw new TypeError("ProjectDocumentManifestService requires a stable text-normalization boundary.");
  }

  function manifest(project = session.getProject()) {
    const seen = new Set();
    return (Array.isArray(project?.documents) ? project.documents : [])
      .map((documentInfo) => {
        if (!documentInfo || typeof documentInfo !== "object" || Array.isArray(documentInfo)) return null;
        const id = names.clean(documentInfo.id);
        if (!id || seen.has(id)) return null;
        seen.add(id);
        return {
          ...documentInfo,
          id,
          name: names.clean(documentInfo.name, project?.sourceFileName || "Document"),
          type: text.lower(names.clean(documentInfo.type, "file")) || "file"
        };
      })
      .filter(Boolean);
  }

  return Object.freeze({ manifest });
}
