/** An on-demand menu shared by compact match rows.
 * @param {{ document: Document, window: Window, onError?: (error: any) => void }} options
 */
export function createMatchContextMenu({ document, window, onError = () => {} }) {
  let current = null;

  function close({ restoreFocus = false } = {}) {
    if (!current) return;
    const { menu, anchor, outside, keydown, scroll } = current;
    current = null;
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", keydown, true);
    document.removeEventListener("scroll", scroll, true);
    window.removeEventListener("resize", scroll);
    menu.remove();
    if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
  }

  function open({ event, anchor, items }) {
    event.preventDefault();
    close();
    const menu = document.createElement("div");
    menu.className = "match-context-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", anchor.getAttribute("aria-label") || anchor.textContent);
    const buttons = [];
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.tabIndex = -1;
      button.textContent = item.label;
      button.disabled = Boolean(item.disabled);
      button.addEventListener("click", () => {
        if (button.disabled) return;
        close({ restoreFocus: true });
        Promise.resolve().then(item.action).catch(onError);
      });
      menu.append(button);
      if (!button.disabled) buttons.push(button);
    }
    if (!buttons.length) return;
    document.body.append(menu);
    const bounds = anchor.getBoundingClientRect();
    const pointer = event.type === "contextmenu" && (event.clientX || event.clientY);
    const x = pointer ? event.clientX : bounds.left;
    const y = pointer ? event.clientY : bounds.bottom;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8))}px`;
    const outside = (pointerEvent) => {
      if (!menu.contains(pointerEvent.target)) close();
    };
    const keydown = (keyEvent) => {
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        close({ restoreFocus: true });
      } else if (keyEvent.key === "Tab") {
        close({ restoreFocus: true });
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(keyEvent.key)) {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        const index = buttons.indexOf(document.activeElement);
        const next =
          keyEvent.key === "Home"
            ? 0
            : keyEvent.key === "End"
              ? buttons.length - 1
              : (index + (keyEvent.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus({ preventScroll: true });
      }
    };
    const scroll = () => close();
    current = { menu, anchor, outside, keydown, scroll };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    buttons[0].focus({ preventScroll: true });
  }

  return Object.freeze({ open, close });
}
