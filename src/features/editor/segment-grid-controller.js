export function createSegmentGridController({ selectionStore }) {
  if (!selectionStore?.select) throw new TypeError("SegmentGridController requires a SelectionStore.");
  return Object.freeze({
    selectSegment(index, segmentId) {
      return selectionStore.select(index, segmentId);
    }
  });
}
