/**
 * Owns current-project document selection, editor navigation, and initial
 * presentation. Session records, navigation, rendering, and editor context
 * remain injected owners.
 *
 * @param {{
 *   session: { getProject: () => any, getSegments: () => any[] },
 *   navigation: { openEditor: (selection: {
 *     projectId: any,
 *     documentId: any,
 *     segmentId: any,
 *     activeIndex: number
 *   }) => unknown },
 *   presentation: { renderAll: () => unknown },
 *   context: { refreshEditor: () => Promise<unknown> | unknown }
 * }} options
 */
export function createProjectDocumentOpenController(options) {
  const session = options?.session;
  const navigation = options?.navigation;
  const presentation = options?.presentation;
  const context = options?.context;

  if (typeof session?.getProject !== "function" || typeof session.getSegments !== "function") {
    throw new TypeError("ProjectDocumentOpenController requires project session boundaries.");
  }
  if (
    typeof navigation?.openEditor !== "function" ||
    typeof presentation?.renderAll !== "function" ||
    typeof context?.refreshEditor !== "function"
  ) {
    throw new TypeError("ProjectDocumentOpenController requires navigation, presentation, and context boundaries.");
  }

  async function open(documentId) {
    if (!session.getProject()) return;
    const first = session.getSegments().findIndex((segment) => segment.documentId === documentId);
    navigation.openEditor({
      projectId: session.getProject().id,
      documentId,
      segmentId: session.getSegments()[first]?.id || "",
      activeIndex: first
    });
    presentation.renderAll();
    await context.refreshEditor();
  }

  return Object.freeze({ open });
}
