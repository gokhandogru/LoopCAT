export function createEditTargetSessionStore({ commandBus, createEditTargetCommand }) {
  if (typeof commandBus?.recordApplied !== "function" || typeof createEditTargetCommand !== "function") {
    throw new TypeError("EditTarget sessions require command recording and command factory boundaries.");
  }

  const sessions = new Map();

  function begin(options) {
    if (!options?.segmentId) throw new TypeError("EditTarget sessions require a segment ID.");
    const current = sessions.get(options.segmentId);
    if (current) return current;
    const command = createEditTargetCommand(options);
    sessions.set(options.segmentId, command);
    return command;
  }

  function capture(segmentId, patch, context = {}) {
    const command = sessions.get(segmentId);
    if (!command) throw new Error(`No EditTarget session exists for ${segmentId}.`);
    command.captureAppliedPatch(patch, context);
    return command;
  }

  function finalize(segmentId) {
    const command = sessions.get(segmentId);
    if (!command) return null;
    sessions.delete(segmentId);
    if (!command.hasAppliedPatch()) return null;
    return commandBus.recordApplied(command, command.appliedResult());
  }

  function finalizeProject(projectId) {
    const recorded = [];
    for (const [segmentId, command] of sessions) {
      if (command.projectId !== projectId) continue;
      const result = finalize(segmentId);
      if (result) recorded.push(result);
    }
    return recorded;
  }

  function finalizeAll() {
    const recorded = [];
    for (const segmentId of [...sessions.keys()]) {
      const result = finalize(segmentId);
      if (result) recorded.push(result);
    }
    return recorded;
  }

  return Object.freeze({
    begin,
    capture,
    finalize,
    finalizeProject,
    finalizeAll,
    has(segmentId) {
      return sessions.has(segmentId);
    },
    size() {
      return sessions.size;
    }
  });
}
