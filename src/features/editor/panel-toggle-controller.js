export function createPanelToggleController({ documentRoot, selectors, localization, inspector }) {
  if (!documentRoot?.querySelectorAll) {
    throw new TypeError("PanelToggleController requires a checked document query boundary.");
  }
  if (!selectors?.toggles || !selectors?.panel || !selectors?.heading) {
    throw new TypeError("PanelToggleController requires checked panel selectors.");
  }
  if (!localization?.translate) {
    throw new TypeError("PanelToggleController requires a localization boundary.");
  }
  if (!inspector?.setOpen || !inspector?.persistOpen || !inspector?.setContext) {
    throw new TypeError("PanelToggleController requires inspector state, layout, and context boundaries.");
  }

  let mounted = false;
  let listenerEntries = [];

  function render(button) {
    const panel = button?.closest?.(selectors.panel);
    if (!panel) return;
    const collapsed = panel.classList.contains("collapsed");
    const existingLabel = String(button.getAttribute("aria-label") || "").trim();
    const panelLabel =
      button.dataset.panelLabel ||
      existingLabel.replace(/^(?:Expand|Minimize|Collapse)\s+/i, "") ||
      panel.querySelector(selectors.heading)?.textContent ||
      "panel";
    button.dataset.panelLabel = panelLabel;
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", localization.translate(`${collapsed ? "Expand" : "Minimize"} ${panelLabel}`));
  }

  function renderAll() {
    documentRoot.querySelectorAll(selectors.toggles).forEach(render);
  }

  function createClickListener(button) {
    return () => {
      const panel = button.closest(selectors.panel);
      if (!panel) return;
      if (panel.dataset.inspectorSection) {
        inspector.setOpen(true);
        void inspector.persistOpen(true);
        inspector.setContext({ tab: panel.dataset.inspectorSection });
      }
      panel.classList.toggle("collapsed");
      render(button);
    };
  }

  function mount() {
    if (mounted) return false;
    const nextEntries = [];
    documentRoot.querySelectorAll(selectors.toggles).forEach((button) => {
      render(button);
      const listener = createClickListener(button);
      button.addEventListener("click", listener);
      nextEntries.push([button, listener]);
    });
    listenerEntries = nextEntries;
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    listenerEntries.forEach(([button, listener]) => button.removeEventListener("click", listener));
    listenerEntries = [];
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, render, renderAll, unmount });
}
