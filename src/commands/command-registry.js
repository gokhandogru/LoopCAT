export function createCommandRegistry() {
  const commands = new Map();
  return Object.freeze({
    register(command) {
      if (!command?.id || typeof command.run !== "function")
        throw new TypeError("Registered commands need an ID and run function.");
      if (commands.has(command.id)) throw new Error(`Duplicate command ID: ${command.id}`);
      commands.set(command.id, Object.freeze({ ...command }));
      return command.id;
    },
    get(id) {
      return commands.get(id) || null;
    },
    list(context = {}) {
      return Array.from(commands.values()).map((command) => ({
        ...command,
        enabled: typeof command.enabled === "function" ? Boolean(command.enabled(context)) : command.enabled !== false
      }));
    }
  });
}
