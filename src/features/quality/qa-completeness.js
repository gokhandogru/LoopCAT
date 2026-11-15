// Run completeness is not an issue attached to a translation segment.
const incomplete = new WeakSet();
export function markQaIncomplete(checks, isIncomplete) {
  if (isIncomplete) incomplete.add(checks);
  else incomplete.delete(checks);
  return checks;
}
export function qaIsIncomplete(checks) {
  return incomplete.has(checks);
}
