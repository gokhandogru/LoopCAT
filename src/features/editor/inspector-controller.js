const VALID_TABS = new Set(["matches", "quality", "review", "ai", "info"]);

export function createInspectorController({ root, preferencesRepository }) {
  if (!root?.classList) throw new TypeError("InspectorController requires a root element.");
  let context = Object.freeze({ tab: "matches", segmentId: "" });

  function renderContext() {
    root.dataset.inspectorTab = context.tab;
    root.dataset.segmentId = context.segmentId;
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
    void preferencesRepository?.patch?.({ inspectorTab: context.tab });
    if (focus) button.focus();
  }

  return Object.freeze({
    async mount() {
      root.querySelector("[role='tablist']")?.addEventListener("click", (event) => {
        activateFromButton(event.target.closest("[data-inspector-tab]"));
      });
      root.querySelector("[role='tablist']")?.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = Array.from(root.querySelectorAll("[data-inspector-tab]"));
        const current = Math.max(0, tabs.indexOf(event.target.closest("[data-inspector-tab]")));
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
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
      if (patch.tab && patch.tab !== context.tab) return context;
      if (patch.tab) void preferencesRepository?.patch?.({ inspectorTab: context.tab });
      return context;
    },
    setVisible(visible) {
      root.classList.toggle("hidden", !visible);
      root.setAttribute("aria-hidden", String(!visible));
    }
  });
}
