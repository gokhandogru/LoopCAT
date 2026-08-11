function assertDialogDefinition(definition) {
  if (!definition?.id || !definition.dialog?.addEventListener || typeof definition.dialog.close !== "function") {
    throw new TypeError("Dialog lifecycle registration requires an ID and a native dialog element.");
  }
}

/**
 * @param {{
 *   focusController?: { showModal?: (dialog: HTMLDialogElement, options?: object) => boolean },
 *   getActiveElement?: () => Element | null,
 *   onError?: (error: unknown, context: { id: string, phase: string }) => void
 * }} [options]
 */
export function createDialogController({ focusController, getActiveElement, onError } = {}) {
  if (typeof focusController?.showModal !== "function") {
    throw new TypeError("DialogController requires the shared focus controller.");
  }

  const definitions = new Map();
  const listeners = new Map();
  const pendingOpens = new Map();
  const activeElement =
    typeof getActiveElement === "function" ? getActiveElement : () => globalThis.document?.activeElement || null;
  const reportError = typeof onError === "function" ? onError : () => {};
  let mounted = false;

  function definitionFor(id) {
    return definitions.get(String(id || "")) || null;
  }

  function handleError(error, context) {
    try {
      reportError(error, context);
    } catch {
      // Error reporting must not replace the original dialog failure.
    }
  }

  function attach(definition) {
    if (listeners.has(definition.id)) return;
    const open = () => {
      const returnTarget =
        typeof definition.returnTarget === "function"
          ? definition.returnTarget()
          : definition.returnTarget || definition.opener;
      void openDialog(definition.id, { returnTarget }).catch((error) => {
        handleError(error, { id: definition.id, phase: "open" });
      });
    };
    const close = () => closeDialog(definition.id);
    const cancel = (event) => {
      try {
        definition.onCancel?.(event);
      } catch (error) {
        handleError(error, { id: definition.id, phase: "cancel" });
      }
    };
    const closed = (event) => {
      try {
        definition.onClose?.(event);
      } catch (error) {
        handleError(error, { id: definition.id, phase: "close" });
      }
    };
    definition.opener?.addEventListener?.("click", open);
    definition.closer?.addEventListener?.("click", close);
    definition.dialog.addEventListener("cancel", cancel);
    definition.dialog.addEventListener("close", closed);
    listeners.set(definition.id, { open, close, cancel, closed });
  }

  function detach(definition) {
    const registered = listeners.get(definition.id);
    if (!registered) return;
    definition.opener?.removeEventListener?.("click", registered.open);
    definition.closer?.removeEventListener?.("click", registered.close);
    definition.dialog.removeEventListener("cancel", registered.cancel);
    definition.dialog.removeEventListener("close", registered.closed);
    listeners.delete(definition.id);
  }

  function register(definition) {
    assertDialogDefinition(definition);
    const id = String(definition.id);
    if (definitions.has(id)) throw new Error(`Dialog lifecycle is already registered: ${id}`);
    const normalized = Object.freeze({ ...definition, id });
    definitions.set(id, normalized);
    if (mounted) attach(normalized);
    return id;
  }

  async function openDialog(id, options = {}) {
    const definition = definitionFor(id);
    if (!definition || definition.dialog.open) return false;
    if (pendingOpens.has(definition.id)) return pendingOpens.get(definition.id);

    const task = Promise.resolve().then(async () => {
      if (typeof definition.beforeOpen === "function") await definition.beforeOpen();
      if (definition.dialog.open) return false;
      const returnTarget = options.returnTarget || activeElement() || definition.opener || null;
      const opened = focusController.showModal(definition.dialog, {
        initialFocus: options.initialFocus || definition.initialFocus || definition.closer || null,
        returnTarget
      });
      if (!opened) return false;
      if (typeof definition.afterOpen === "function") await definition.afterOpen();
      return true;
    });
    pendingOpens.set(definition.id, task);
    try {
      return await task;
    } finally {
      pendingOpens.delete(definition.id);
    }
  }

  function closeDialog(id, returnValue = "") {
    const definition = definitionFor(id);
    if (!definition?.dialog.open) return false;
    definition.dialog.close(returnValue);
    return true;
  }

  function mount() {
    if (mounted) return false;
    mounted = true;
    definitions.forEach(attach);
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    definitions.forEach(detach);
    pendingOpens.clear();
    mounted = false;
    return true;
  }

  return Object.freeze({
    register,
    mount,
    unmount,
    open: openDialog,
    close: closeDialog,
    isOpen: (id) => Boolean(definitionFor(id)?.dialog.open)
  });
}
