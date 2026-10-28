export function installSourceTermContextMenu({
  body,
  window,
  contextMenu,
  session,
  navigation,
  capture,
  localization
}) {
  function onContextMenu(event) {
    const cell = event.target?.closest?.(".source-cell");
    if (!cell || !body.contains(cell)) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!cell.contains(range.startContainer) || !cell.contains(range.endContainer)) return;
    if (
      range.startContainer.parentElement?.closest(".tag-chip") ||
      range.endContainer.parentElement?.closest(".tag-chip") ||
      range.cloneContents().querySelector?.(".tag-chip")
    )
      return;
    const sourceText = selection.toString().trim();
    if (!sourceText) return;
    const index = Number(cell.closest("tr")?.dataset.index);
    const projectId = session.getProject()?.id;
    const segmentId = session.getSegments()[index]?.id;
    if (!Number.isInteger(index) || !projectId || !segmentId) return;
    contextMenu.open({
      event,
      anchor: cell,
      items: [
        {
          label: localization.source("Add to active termbase"),
          action: async () => {
            if (session.getProject()?.id !== projectId || session.getSegments()[index]?.id !== segmentId) return;
            await navigation.select(index);
            if (session.getProject()?.id !== projectId || session.getActiveSegment()?.id !== segmentId) return;
            await capture.open({ sourceText, targetText: "", activeOnly: true, projectId, segmentId });
          }
        }
      ]
    });
  }
  body.addEventListener("contextmenu", onContextMenu);
  return () => body.removeEventListener("contextmenu", onContextMenu);
}
