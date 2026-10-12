export function createApplicationMenuController({ documentRoot, selectors }) {
  if (
    !documentRoot?.querySelectorAll ||
    !documentRoot?.addEventListener ||
    !documentRoot?.removeEventListener ||
    !selectors?.menus ||
    !selectors?.openMenus ||
    !selectors?.buttons
  ) {
    throw new TypeError("ApplicationMenuController requires a document root and menu selector policy.");
  }

  let mounted = false;
  let documentClickListener = null;
  const menuListeners = [];
  let observer;
  const bound = new Set();
  const reposition = () => documentRoot.querySelectorAll(selectors.openMenus).forEach(position);
  const panelFor = (menu) => (menu.ownerDocument ? menu.querySelector(":scope > .menu-panel") : null);
  function position(menu) {
    const panel = panelFor(menu);
    if (!panel || !menu.open) return;
    const rect = menu.querySelector(":scope > summary").getBoundingClientRect();
    const win = menu.ownerDocument.defaultView;
    if (panel.showPopover) {
      panel.setAttribute("popover", "manual");
      if (!panel.matches(":popover-open")) panel.showPopover();
    }
    panel.style.position = "fixed";
    panel.style.margin = "0";
    panel.style.inset = "auto";
    panel.style.maxHeight = `${Math.max(120, win.innerHeight - 24)}px`;
    const bounds = panel.getBoundingClientRect();
    const rtl = win.getComputedStyle(menu).direction === "rtl";
    panel.style.left = `${Math.max(8, Math.min(rtl ? rect.right - bounds.width : rect.left, win.innerWidth - bounds.width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.bottom + 4, win.innerHeight - bounds.height - 8))}px`;
  }
  function hide(menu) {
    const panel = panelFor(menu);
    if (panel?.matches(":popover-open")) panel.hidePopover();
  }

  function closeOpenMenus(except = null) {
    documentRoot.querySelectorAll(selectors.openMenus).forEach((menu) => {
      if (menu !== except && !menu.contains?.(except)) {
        menu.removeAttribute("open");
        hide(menu);
      }
    });
  }

  function mount() {
    if (mounted) return false;
    const bind = () =>
      documentRoot.querySelectorAll(selectors.menus).forEach((menu) => {
        if (bound.has(menu)) return;
        bound.add(menu);
        const toggleListener = () => {
          if (!menu.open) {
            hide(menu);
            menu.querySelectorAll?.("details[open]").forEach((child) => {
              child.open = false;
              hide(child);
            });
            return;
          }
          closeOpenMenus(menu);
          position(menu);
        };
        const clickListener = (event) => {
          if (event.target.closest(selectors.buttons)) {
            menu.removeAttribute("open");
            hide(menu);
            if (menu.ownerDocument)
              queueMicrotask(() => {
                const active = menu.ownerDocument.activeElement;
                if (active === menu.ownerDocument.body || menu.contains(active))
                  menu.querySelector(":scope > summary")?.focus();
              });
          }
        };
        const keydownListener = (event) => {
          if (menu.ownerDocument && event.target.closest(selectors.menus) !== menu) return;
          if (
            ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
            !event.target.matches?.("input,textarea,select")
          ) {
            event.preventDefault();
            event.stopPropagation();
            menu.open = true;
            position(menu);
            const items = [
              ...menu.querySelectorAll("button:not(:disabled), summary, input:not(:disabled), select:not(:disabled)")
            ].filter((el) => el.getClientRects().length);
            const index = items.indexOf(event.target);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
            items[next]?.focus();
            return;
          }
          if (event.key !== "Escape" || !menu.open) return;
          event.preventDefault();
          event.stopPropagation();
          menu.removeAttribute("open");
          hide(menu);
          menu.querySelector(":scope > summary")?.focus();
        };
        menu.addEventListener("toggle", toggleListener);
        menu.addEventListener("click", clickListener);
        menu.addEventListener("keydown", keydownListener);
        menuListeners.push({ menu, toggleListener, clickListener, keydownListener });
      });
    bind();
    const Observer = documentRoot.defaultView?.MutationObserver;
    if (Observer) {
      observer = new Observer(bind);
      observer.observe(documentRoot.documentElement, { childList: true, subtree: true });
      documentRoot.defaultView.addEventListener("resize", reposition);
    }
    documentClickListener = (event) => {
      if (event.target.closest(selectors.menus)) return;
      closeOpenMenus();
    };
    documentRoot.addEventListener("click", documentClickListener);
    mounted = true;
    return true;
  }

  function closeAll() {
    closeOpenMenus();
  }

  function unmount() {
    if (!mounted) return false;
    for (const { menu, toggleListener, clickListener, keydownListener } of menuListeners) {
      menu.removeEventListener("toggle", toggleListener);
      menu.removeEventListener("click", clickListener);
      menu.removeEventListener("keydown", keydownListener);
    }
    menuListeners.length = 0;
    observer?.disconnect();
    documentRoot.defaultView?.removeEventListener("resize", reposition);
    bound.clear();
    documentRoot.removeEventListener("click", documentClickListener);
    documentClickListener = null;
    mounted = false;
    return true;
  }

  return Object.freeze({ closeAll, mount, unmount });
}
