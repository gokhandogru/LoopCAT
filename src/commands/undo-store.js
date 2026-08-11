export function createUndoStore(limit = 100) {
  const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const undoByProject = new Map();
  const redoByProject = new Map();

  function stack(map, projectId) {
    const key = projectId || "workspace";
    if (!map.has(key)) map.set(key, []);
    return map.get(key);
  }

  return Object.freeze({
    push(projectId, item) {
      const undo = stack(undoByProject, projectId);
      undo.push(item);
      if (undo.length > boundedLimit) undo.splice(0, undo.length - boundedLimit);
      redoByProject.set(projectId || "workspace", []);
    },
    popUndo(projectId) {
      return stack(undoByProject, projectId).pop() || null;
    },
    pushRedo(projectId, item) {
      stack(redoByProject, projectId).push(item);
    },
    restoreUndo(projectId, item) {
      const undo = stack(undoByProject, projectId);
      undo.push(item);
      if (undo.length > boundedLimit) undo.splice(0, undo.length - boundedLimit);
    },
    popRedo(projectId) {
      return stack(redoByProject, projectId).pop() || null;
    },
    canUndo(projectId) {
      return stack(undoByProject, projectId).length > 0;
    },
    canRedo(projectId) {
      return stack(redoByProject, projectId).length > 0;
    }
  });
}
