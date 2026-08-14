/**
 * Owns project manifest/segment document reconciliation and current-document
 * selection. Rendering, navigation mutation, imports, deletion, and persistence
 * remain behind injected boundaries.
 *
 * @param {{
 *   getProject: () => any,
 *   getManifest: (project: any) => any[],
 *   getSegments: () => any[],
 *   getSelectedDocumentId: () => string,
 *   normalizeType: (value: unknown) => string
 * }} options
 */
export function createProjectDocumentCatalogService(options) {
  const getProject = options?.getProject;
  const getManifest = options?.getManifest;
  const getSegments = options?.getSegments;
  const getSelectedDocumentId = options?.getSelectedDocumentId;
  const normalizeType = options?.normalizeType;
  if (
    typeof getProject !== "function" ||
    typeof getManifest !== "function" ||
    typeof getSegments !== "function" ||
    typeof getSelectedDocumentId !== "function" ||
    typeof normalizeType !== "function"
  ) {
    throw new TypeError(
      "ProjectDocumentCatalogService requires project, manifest, segment, selection, and type-normalization boundaries."
    );
  }

  function list() {
    const map = new Map();
    getManifest(getProject()).forEach((documentInfo) => {
      const id = documentInfo?.id || "";
      if (!id || map.has(id)) return;
      map.set(id, {
        id,
        name: documentInfo.name || getProject()?.sourceFileName || "Document",
        type: normalizeType(documentInfo.type || "docx") || "docx"
      });
    });
    getSegments().forEach((segment) => {
      const id = segment.documentId || "default-document";
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: segment.documentName || getProject()?.sourceFileName || "Document",
          type: normalizeType(segment.documentType || "docx") || "docx"
        });
        return;
      }
      const current = map.get(id);
      map.set(id, {
        ...current,
        name: current.name || segment.documentName || getProject()?.sourceFileName || "Document",
        type: normalizeType(current.type || segment.documentType || "docx") || "docx"
      });
    });
    return Array.from(map.values());
  }

  function type(documentInfo) {
    return normalizeType(documentInfo?.type || "");
  }

  function segments(documentId) {
    return getSegments().filter((segment) => segment.documentId === documentId);
  }

  function currentSegments() {
    const documentId = getSelectedDocumentId();
    return documentId ? getSegments().filter((segment) => segment.documentId === documentId) : getSegments();
  }

  function selected() {
    const documentId = getSelectedDocumentId();
    if (!documentId) return null;
    return list().find((documentInfo) => documentInfo.id === documentId) || null;
  }

  return Object.freeze({ list, type, segments, currentSegments, selected });
}
