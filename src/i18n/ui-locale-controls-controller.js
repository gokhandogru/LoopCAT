export function createUiLocaleControlsController({ elements, loader, locale, presentation, actions }) {
  if (!loader?.ensure || !locale?.set || !presentation?.refresh || !actions?.importCatalog || !actions?.exportSource) {
    throw new TypeError(
      "UiLocaleControlsController requires loader, locale, presentation, import, and export boundaries."
    );
  }
  for (const element of [elements?.localeSelect, elements?.importInput, elements?.exportButton]) {
    if (element && (!element.addEventListener || !element.removeEventListener)) {
      throw new TypeError("UiLocaleControlsController requires checked optional control elements.");
    }
  }

  const localeSelect = elements?.localeSelect;
  let mounted = false;
  const localeChangeListener = async () => {
    await loader.ensure(localeSelect.value);
    locale.set(localeSelect.value);
    presentation.refresh();
  };

  function mount() {
    if (mounted) return false;
    localeSelect?.addEventListener("change", localeChangeListener);
    elements?.importInput?.addEventListener("change", actions.importCatalog);
    elements?.exportButton?.addEventListener("click", actions.exportSource);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    localeSelect?.removeEventListener("change", localeChangeListener);
    elements?.importInput?.removeEventListener("change", actions.importCatalog);
    elements?.exportButton?.removeEventListener("click", actions.exportSource);
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, unmount });
}
