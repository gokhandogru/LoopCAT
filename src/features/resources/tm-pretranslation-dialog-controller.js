function requireElement(value, name) {
  if (!value?.addEventListener) throw new TypeError(`TmPretranslationDialogController requires ${name}.`);
  return value;
}

/**
 * Owns only the threshold-prompt lifecycle. TM lookup, matching, persistence,
 * and command execution remain behind the injected caller.
 *
 * @param {{
 *   dialogLifecycle: { register: (definition: object) => string, open: (id: string, options?: object) => Promise<boolean>, close: (id: string, returnValue?: string) => boolean },
 *   elements: { dialog: any, thresholdInput: any },
 *   defaultThreshold?: string | number,
 *   scheduleFrame?: (callback: () => void) => unknown,
 *   onError?: (error: unknown, context: { phase: string }) => void
 * }} options
 */
export function createTmPretranslationDialogController(options) {
  const dialogLifecycle = options?.dialogLifecycle;
  if (typeof dialogLifecycle?.register !== "function" || typeof dialogLifecycle?.open !== "function") {
    throw new TypeError("TmPretranslationDialogController requires the shared dialog lifecycle controller.");
  }

  const elements = /** @type {any} */ (options?.elements || {});
  const dialog = requireElement(elements.dialog, "the TM pretranslation dialog");
  const thresholdInput = requireElement(elements.thresholdInput, "the TM threshold input");
  const defaultThreshold = String(options?.defaultThreshold ?? 85);
  const scheduleFrame = typeof options?.scheduleFrame === "function" ? options.scheduleFrame : (callback) => callback();
  const onError = typeof options?.onError === "function" ? options.onError : () => {};
  let pendingRequest = null;

  function settle(value) {
    if (!pendingRequest) return false;
    const { resolve } = pendingRequest;
    pendingRequest = null;
    resolve(value);
    return true;
  }

  dialogLifecycle.register({
    id: "tm-pretranslation",
    dialog,
    initialFocus: thresholdInput,
    beforeOpen: () => {
      thresholdInput.value = defaultThreshold;
      dialog.returnValue = "";
    },
    afterOpen: () => {
      scheduleFrame(() => {
        thresholdInput.focus?.({ preventScroll: true });
        thresholdInput.select?.();
      });
    },
    onClose: () => {
      settle(dialog.returnValue === "apply" ? thresholdInput.value : null);
    }
  });

  function request(openOptions = {}) {
    if (pendingRequest) return pendingRequest.promise;

    let resolveRequest;
    const promise = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    pendingRequest = { promise, resolve: resolveRequest };
    void dialogLifecycle
      .open("tm-pretranslation", { returnTarget: openOptions.returnTarget || null })
      .then((opened) => {
        if (!opened && !dialog.open) settle(null);
      })
      .catch((error) => {
        settle(null);
        onError(error, { phase: "open" });
      });
    return promise;
  }

  return Object.freeze({
    request,
    cancel: () => dialogLifecycle.close("tm-pretranslation", "cancel"),
    isOpen: () => Boolean(dialog.open)
  });
}
