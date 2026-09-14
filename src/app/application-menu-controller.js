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

  function closeOpenMenus(except = null) {
    documentRoot.querySelectorAll(selectors.openMenus).forEach((menu) => {
      if (menu !== except) menu.removeAttribute("open");
    });
  }

  function mount() {
    if (mounted) return false;
    documentRoot.querySelectorAll(selectors.menus).forEach((menu) => {
      const toggleListener = () => {
        if (!menu.open) return;
        closeOpenMenus(menu);
      };
      const clickListener = (event) => {
        if (event.target.closest(selectors.buttons)) menu.removeAttribute("open");
      };
      const keydownListener = (event) => {
        if (event.key !== "Escape" || !menu.open) return;
        event.preventDefault();
        event.stopPropagation();
        menu.removeAttribute("open");
        menu.querySelector(":scope > summary")?.focus();
      };
      menu.addEventListener("toggle", toggleListener);
      menu.addEventListener("click", clickListener);
      menu.addEventListener("keydown", keydownListener);
      menuListeners.push({ menu, toggleListener, clickListener, keydownListener });
    });
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
    documentRoot.removeEventListener("click", documentClickListener);
    documentClickListener = null;
    mounted = false;
    return true;
  }

  return Object.freeze({ closeAll, mount, unmount });
}
