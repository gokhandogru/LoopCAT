export function createSegmentGridController({ navigation }) {
  if (!navigation?.selectSegment) throw new TypeError("SegmentGridController requires application navigation.");
  return Object.freeze({
    selectSegment(index, segmentId) {
      return navigation.selectSegment({ activeIndex: index, segmentId });
    }
  });
}
