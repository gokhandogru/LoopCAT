(function publishLoopCatFocusController() {
  window.CatHan = window.CatHan || {};

  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "details > summary:first-of-type",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  function visibleFocusableElements(container) {
    if (!container?.querySelectorAll) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (element) =>
        !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0
    );
  }

  function createFocusController() {
    const returnTargets = new WeakMap();
    const keydownHandlers = new WeakMap();

    function open(surface, options = {}) {
      if (!surface) return;
      const active = options.returnTarget || document.activeElement;
      if (active && active !== document.body && typeof active.focus === "function") {
        returnTargets.set(surface, active);
      }
      const handler = (event) => {
        if (event.key !== "Tab") return;
        const focusable = visibleFocusableElements(surface);
        if (!focusable.length) {
          event.preventDefault();
          surface.focus?.();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !surface.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      surface.addEventListener("keydown", handler);
      keydownHandlers.set(surface, handler);
      queueMicrotask(() => {
        const requested = typeof options.initialFocus === "function" ? options.initialFocus() : options.initialFocus;
        const target = requested || visibleFocusableElements(surface)[0] || surface;
        if (target === surface && !surface.hasAttribute("tabindex")) surface.setAttribute("tabindex", "-1");
        target?.focus?.({ preventScroll: true });
      });
    }

    function close(surface, options = {}) {
      if (!surface) return;
      const handler = keydownHandlers.get(surface);
      if (handler) surface.removeEventListener("keydown", handler);
      keydownHandlers.delete(surface);
      const returnTarget = returnTargets.get(surface);
      returnTargets.delete(surface);
      if (options.restore === false) return;
      if (returnTarget?.isConnected && typeof returnTarget.focus === "function") {
        returnTarget.focus({ preventScroll: true });
        queueMicrotask(() => {
          if (document.activeElement !== returnTarget && returnTarget.isConnected) {
            returnTarget.focus({ preventScroll: true });
          }
        });
      }
    }

    function showModal(dialog, options = {}) {
      if (!dialog || dialog.open || typeof dialog.showModal !== "function") return false;
      dialog.showModal();
      open(dialog, options);
      dialog.addEventListener("close", () => close(dialog), { once: true });
      return true;
    }

    return Object.freeze({ open, close, showModal, visibleFocusableElements });
  }

  window.CatHan.focusController = Object.freeze({ createFocusController, visibleFocusableElements });
})();
