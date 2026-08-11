function commandReceipt(command, result) {
  return Object.freeze({
    id: globalThis.crypto?.randomUUID?.() || `command-${Date.now()}`,
    commandId: command.id,
    projectId: command.projectId || null,
    scope: command.scope || "workspace",
    affectedIds: Object.freeze([...(command.affectedIds || [])]),
    provenance: Object.freeze({ ...(command.provenance || { origin: "user" }) }),
    reversible: typeof command.undo === "function",
    undoLabel: String(command.undoLabel || `Undo ${command.label || command.id}`),
    executedAt: new Date().toISOString(),
    recoveryToken: result?.recoveryToken || null
  });
}

export function createCommandBus({ undoStore }) {
  if (!undoStore?.push) throw new TypeError("CommandBus requires an UndoStore.");

  function recordApplied(command, result = {}) {
    if (!command?.id || typeof command.execute !== "function") {
      throw new TypeError("A previously applied command still requires an ID and redo function.");
    }
    const receipt = commandReceipt(command, result);
    if (receipt.reversible) undoStore.push(command.projectId, { command, receipt });
    return { result, receipt };
  }

  async function execute(command, options = {}) {
    if (!command?.id || typeof command.execute !== "function")
      throw new TypeError("A command ID and execute function are required.");
    const result = await command.execute();
    if (options.record === false) return { result, receipt: commandReceipt(command, result) };
    return recordApplied(command, result);
  }

  return Object.freeze({
    execute,
    recordApplied,
    async undo(projectId) {
      const item = undoStore.popUndo(projectId);
      if (!item) return null;
      try {
        const result = await item.command.undo(item.receipt);
        undoStore.pushRedo(projectId, item);
        return { result, receipt: item.receipt };
      } catch (error) {
        undoStore.restoreUndo(projectId, item);
        throw error;
      }
    },
    async redo(projectId) {
      const item = undoStore.popRedo(projectId);
      if (!item) return null;
      try {
        const result = await item.command.execute();
        const receipt = commandReceipt(item.command, result);
        undoStore.restoreUndo(projectId, { command: item.command, receipt });
        return { result, receipt };
      } catch (error) {
        undoStore.pushRedo(projectId, item);
        throw error;
      }
    },
    canUndo: undoStore.canUndo,
    canRedo: undoStore.canRedo
  });
}
