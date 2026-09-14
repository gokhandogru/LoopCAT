const DEFAULT_VIEWS = Object.freeze({
  projects: "card",
  files: "card",
  resources: "card",
  "resource-entries": "list",
  "resource-selection": "list",
  trash: "list"
});

export function createCollectionViewController({ documentRoot, preferencesRepository, onError = () => {} }) {
  if (!documentRoot?.querySelectorAll || !documentRoot.documentElement?.setAttribute || !preferencesRepository?.patch) {
    throw new TypeError("CollectionViewController requires a document and preferences repository.");
  }
  /** @type {Record<string, string>} */
  let views = { ...DEFAULT_VIEWS };
  let initialized = false;
  const listeners = [];
  const groups = () => [...documentRoot.querySelectorAll("[data-collection-scope]")];
  const scopeFor = (group) => group.dataset.collectionScope;
  const buttonsFor = (group) => [...group.querySelectorAll("button[data-view-mode]")];

  function apply() {
    for (const [scope, mode] of Object.entries(views)) {
      documentRoot.documentElement.setAttribute(`data-${scope}-view`, mode);
    }
    for (const group of groups()) {
      for (const button of buttonsFor(group)) {
        button.setAttribute("aria-pressed", String(button.dataset.viewMode === views[scopeFor(group)]));
      }
    }
  }

  async function setView(scope, mode) {
    if (!Object.hasOwn(DEFAULT_VIEWS, scope) || !["card", "list"].includes(mode)) return false;
    if (views[scope] === mode) return true;
    views = { ...views, [scope]: mode };
    apply();
    await preferencesRepository.patch({ collectionViews: { ...views } });
    return true;
  }

  function initialize(preferences = {}) {
    if (initialized) return false;
    views = Object.fromEntries(
      Object.entries(DEFAULT_VIEWS).map(([scope, fallback]) => [
        scope,
        ["card", "list"].includes(preferences.collectionViews?.[scope]) ? preferences.collectionViews[scope] : fallback
      ])
    );
    apply();
    for (const group of groups()) {
      const buttons = buttonsFor(group);
      for (const button of buttons) {
        const click = () => {
          void setView(scopeFor(group), button.dataset.viewMode).catch(onError);
        };
        const keydown = (event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const current = buttons.indexOf(button);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next].focus();
          void setView(scopeFor(group), buttons[next].dataset.viewMode).catch(onError);
        };
        button.addEventListener("click", click);
        button.addEventListener("keydown", keydown);
        listeners.push({ button, click, keydown });
      }
    }
    initialized = true;
    return true;
  }

  async function reset() {
    views = { ...DEFAULT_VIEWS };
    apply();
    await preferencesRepository.patch({ collectionViews: { ...views } });
  }

  function dispose() {
    for (const { button, click, keydown } of listeners) {
      button.removeEventListener("click", click);
      button.removeEventListener("keydown", keydown);
    }
    listeners.length = 0;
    initialized = false;
  }

  return Object.freeze({ initialize, setView, reset, dispose, getState: () => Object.freeze({ ...views }) });
}

export { DEFAULT_VIEWS as DEFAULT_COLLECTION_VIEWS };
