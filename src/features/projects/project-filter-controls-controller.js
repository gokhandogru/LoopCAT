export function createProjectFilterControlsController({ elements, presentation }) {
  const searchInput = elements?.searchInput;
  const languagePairFilter = elements?.languagePairFilter;
  if (!searchInput?.addEventListener || !searchInput?.removeEventListener || !searchInput?.focus) {
    throw new TypeError("ProjectFilterControlsController requires a checked search input.");
  }
  if (!languagePairFilter?.addEventListener || !languagePairFilter?.removeEventListener) {
    throw new TypeError("ProjectFilterControlsController requires a checked language-pair filter.");
  }
  if (!presentation?.render) {
    throw new TypeError("ProjectFilterControlsController requires a Projects-view presentation boundary.");
  }

  let mounted = false;
  const renderListener = presentation.render;

  function clear() {
    searchInput.value = "";
    languagePairFilter.value = "";
    presentation.render();
    searchInput.focus();
  }

  function mount() {
    if (mounted) return false;
    searchInput.addEventListener("input", renderListener);
    languagePairFilter.addEventListener("change", renderListener);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    searchInput.removeEventListener("input", renderListener);
    languagePairFilter.removeEventListener("change", renderListener);
    mounted = false;
    return true;
  }

  return Object.freeze({ clear, mount, unmount });
}
