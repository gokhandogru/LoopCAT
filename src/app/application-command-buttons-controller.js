export function createApplicationCommandButtonsController({ elements, actions }) {
  if (!actions?.emptyTrash || !actions?.undo || !actions?.redo) {
    throw new TypeError("ApplicationCommandButtonsController requires Empty Trash, Undo, and Redo actions.");
  }
  for (const element of [elements?.emptyTrashButton, elements?.undoButton, elements?.redoButton]) {
    if (element && (!element.addEventListener || !element.removeEventListener)) {
      throw new TypeError("ApplicationCommandButtonsController requires checked optional button elements.");
    }
  }

  let mounted = false;
  const bindings = [
    [elements?.emptyTrashButton, actions.emptyTrash],
    [elements?.undoButton, actions.undo],
    [elements?.redoButton, actions.redo]
  ];

  function mount() {
    if (mounted) return false;
    for (const [element, action] of bindings) element?.addEventListener("click", action);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    for (const [element, action] of bindings) element?.removeEventListener("click", action);
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, unmount });
}
