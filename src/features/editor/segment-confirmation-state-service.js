/**
 * Owns the confirmation-specific segment mutation, exact in-place recovery,
 * and persisted rollback revision policy. Confirmation commands, persistence,
 * navigation, rendering, and status remain behind controller boundaries.
 *
 * @param {{
 *   targetState: { recordHistory: (segment: any, target: string, status: string, reason: string) => unknown, touch: (segment: any) => unknown },
 *   now: () => string
 * }} options
 */
export function createSegmentConfirmationStateService(options) {
  const targetState = options?.targetState;
  const now = options?.now;
  if (
    typeof targetState?.recordHistory !== "function" ||
    typeof targetState?.touch !== "function" ||
    typeof now !== "function"
  ) {
    throw new TypeError("SegmentConfirmationStateService requires target-state and clock boundaries.");
  }

  function confirm(segment) {
    targetState.recordHistory(segment, segment.target, "confirmed", "confirm");
    segment.status = "confirmed";
    if (segment.reviewState === "needs-review") segment.reviewState = "";
    targetState.touch(segment);
  }

  function restore(segment, snapshot) {
    Reflect.ownKeys(segment).forEach((key) => delete segment[key]);
    Object.assign(segment, snapshot);
  }

  function preparePersistedRollback(segment, savedConfirmedRevision) {
    segment.revision = Math.max(Number(segment.revision || 0), Number(savedConfirmedRevision || 0)) + 1;
    segment.updatedAt = now();
  }

  return Object.freeze({ confirm, preparePersistedRollback, restore });
}
