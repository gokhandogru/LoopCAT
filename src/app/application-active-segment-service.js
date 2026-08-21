export function createApplicationActiveSegmentService(dependencies = {}) {
  const { segments, navigation } = dependencies || {};
  if (typeof segments?.getAll !== "function" || typeof navigation?.getActiveIndex !== "function") {
    throw new TypeError("ApplicationActiveSegmentService requires checked segment and navigation boundaries.");
  }

  function get() {
    return segments.getAll()[navigation.getActiveIndex()] || null;
  }

  return Object.freeze({ get });
}
