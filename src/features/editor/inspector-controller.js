const VALID_TABS = new Set(["matches", "quality", "review", "ai", "info"]);

export function createInspectorController({
  root,
  preferencesRepository,
  getActiveIndex,
  translate = (text) => text,
  refreshInfo = () => {}
}) {
  if (!root?.classList) throw new TypeError("InspectorController requires a root element.");
  /** @type {Readonly<{ tab: string, segmentId: string }>} */
  let context = Object.freeze({ tab: "matches", segmentId: "" });
  const doc = root.ownerDocument;
  const sheet = doc?.getElementById("inspectorSheet");
  const toggle = doc?.getElementById("inspectorToggleBtn");
  const number = doc?.getElementById("inspectorSegmentNumber");
  const narrow = doc?.defaultView?.matchMedia("(max-width: 999px)");
  let desktopVisible = false;
  let returnTarget;

  function renderSegmentNumber() {
    if (!number) return;
    const index = getActiveIndex?.() ?? -1;
    number.parentElement.hidden = index < 0;
    const value = index < 0 ? "" : String(index + 1);
    if (number.textContent !== value) number.textContent = value;
  }

  function isSheetMode() {
    return Boolean(sheet && narrow?.matches);
  }

  function updateVisibility() {
    const visible = isSheetMode() ? sheet.open : desktopVisible;
    root.classList.toggle("hidden", !visible);
    root.setAttribute("aria-hidden", String(!visible));
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(visible));
      const label = translate(visible ? "Hide inspector" : "Show inspector");
      if (toggle.textContent !== label) toggle.textContent = label;
      if (isSheetMode()) toggle.setAttribute("aria-haspopup", "dialog");
      else toggle.removeAttribute("aria-haspopup");
    }
  }

  function closeSheet(restoreFocus = true) {
    if (!sheet?.open) return;
    sheet.close();
    sheet.before(root);
    updateVisibility();
    if (restoreFocus && returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    returnTarget = null;
  }

  function openSheet() {
    if (!isSheetMode() || sheet.open || root.closest(".workspace")?.classList.contains("projects-mode")) return;
    returnTarget = doc.activeElement?.closest("#editorView") ? doc.activeElement : toggle;
    sheet.append(root);
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    sheet.showModal();
    updateVisibility();
    root.querySelector('[role="tab"][aria-selected="true"]')?.focus();
  }

  function renderContext() {
    root.dataset.inspectorTab = context.tab;
    root.dataset.segmentId = context.segmentId;
    renderSegmentNumber();
    root.querySelectorAll("[data-inspector-tab]").forEach((button) => {
      const selected = button.dataset.inspectorTab === context.tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll("[data-inspector-section]").forEach((section) => {
      const visible = section.dataset.inspectorSection === context.tab;
      section.classList.toggle("inspector-section-hidden", !visible);
      section.setAttribute("aria-hidden", String(!visible));
    });
  }

  function activateFromButton(button, focus = false) {
    if (!button?.dataset?.inspectorTab) return;
    context = Object.freeze({ ...context, tab: button.dataset.inspectorTab });
    renderContext();
    if (context.tab === "info") refreshInfo();
    void preferencesRepository?.patch?.({ inspectorTab: context.tab });
    if (focus) button.focus();
  }

  return Object.freeze({
    async mount() {
      sheet?.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeSheet();
      });
      sheet?.addEventListener("click", (event) => {
        if (event.target === sheet) closeSheet();
      });
      narrow?.addEventListener("change", () => {
        const hadFocus = root.contains(doc.activeElement);
        closeSheet(false);
        updateVisibility();
        if (hadFocus && isSheetMode()) toggle?.focus();
      });
      root.querySelector("[role='tablist']")?.addEventListener("click", (event) => {
        activateFromButton(event.target.closest("[data-inspector-tab]"));
      });
      root.querySelector("[role='tablist']")?.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = Array.from(root.querySelectorAll("[data-inspector-tab]"));
        const current = Math.max(0, tabs.indexOf(event.target.closest("[data-inspector-tab]")));
        const rtl = root.ownerDocument?.documentElement?.dir === "rtl";
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : (current + (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1) + tabs.length) % tabs.length;
        event.preventDefault();
        activateFromButton(tabs[next], true);
      });
      if (preferencesRepository) {
        const preferences = await preferencesRepository.read();
        if (VALID_TABS.has(preferences.inspectorTab)) {
          context = Object.freeze({ ...context, tab: preferences.inspectorTab });
        }
      }
      renderContext();
    },
    getContext: () => context,
    setContext(patch = {}) {
      const nextTab = patch.tab === undefined ? context.tab : VALID_TABS.has(patch.tab) ? patch.tab : context.tab;
      context = Object.freeze({ ...context, ...patch, tab: nextTab });
      renderContext();
      if (patch.tab) openSheet();
      if (patch.tab === "info") refreshInfo();
      if (patch.tab && patch.tab !== context.tab) return context;
      if (patch.tab) void preferencesRepository?.patch?.({ inspectorTab: context.tab });
      return context;
    },
    setVisible(visible) {
      desktopVisible = visible;
      if (root.closest?.(".workspace")?.classList.contains("projects-mode")) closeSheet(false);
      updateVisibility();
      renderSegmentNumber();
    },
    isSheetMode,
    closeForNavigation: () => closeSheet(false),
    toggleSheet() {
      if (!isSheetMode()) return false;
      if (sheet.open) closeSheet();
      else openSheet();
      return true;
    }
  });
}
