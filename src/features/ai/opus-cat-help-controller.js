function requireElement(value, name) {
  if (!value?.addEventListener) throw new TypeError(`OpusCatHelpController requires ${name}.`);
  return value;
}

/**
 * Owns OPUS-CAT help visibility and dialog intent. Provider configuration,
 * connection testing, and network access remain behind injected services.
 *
 * @param {{
 *   dialogLifecycle: { register: (definition: object) => string, open: (id: string, options?: object) => Promise<boolean>, close: (id: string, returnValue?: string) => boolean },
 *   elements: { dialog: any, opener: any, closer: any, retryButton: any },
 *   retryConnection?: () => Promise<unknown> | unknown,
 *   onError?: (error: unknown, context: { phase: string }) => void
 * }} options
 */
export function createOpusCatHelpController(options) {
  const dialogLifecycle = options?.dialogLifecycle;
  if (typeof dialogLifecycle?.register !== "function" || typeof dialogLifecycle?.open !== "function") {
    throw new TypeError("OpusCatHelpController requires the shared dialog lifecycle controller.");
  }

  const elements = /** @type {any} */ (options?.elements || {});
  const dialog = requireElement(elements.dialog, "the OPUS-CAT help dialog");
  const opener = requireElement(elements.opener, "the OPUS-CAT help opener");
  const closer = requireElement(elements.closer, "the OPUS-CAT help closer");
  const retryButton = requireElement(elements.retryButton, "the OPUS-CAT retry button");
  const retryConnection = typeof options?.retryConnection === "function" ? options.retryConnection : () => {};
  const onError = typeof options?.onError === "function" ? options.onError : () => {};
  let mounted = false;

  function setVisible(visible) {
    opener.classList?.toggle?.("hidden", !visible);
  }

  async function open(openOptions = {}) {
    setVisible(true);
    try {
      return await dialogLifecycle.open("opus-cat-help", {
        returnTarget: openOptions.returnTarget || null
      });
    } catch (error) {
      onError(error, { phase: "open" });
      return false;
    }
  }

  async function retry() {
    dialogLifecycle.close("opus-cat-help", "retry");
    try {
      await retryConnection();
    } catch (error) {
      onError(error, { phase: "retry" });
    }
  }

  const handleRetry = () => void retry();

  function mount() {
    if (mounted) return false;
    retryButton.addEventListener("click", handleRetry);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    retryButton.removeEventListener("click", handleRetry);
    mounted = false;
    return true;
  }

  dialogLifecycle.register({
    id: "opus-cat-help",
    dialog,
    opener,
    closer,
    initialFocus: closer
  });

  return Object.freeze({
    mount,
    unmount,
    open,
    close: () => dialogLifecycle.close("opus-cat-help"),
    retry,
    setVisible,
    isVisible: () => !opener.classList?.contains?.("hidden")
  });
}
