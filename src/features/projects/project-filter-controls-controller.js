export function createProjectFilterControlsController({ elements, presentation }) {
  const searchInput = elements?.searchInput;
  const languagePairFilter = elements?.languagePairFilter;
  const sortOrder = elements?.sortOrder;
  if (!searchInput?.addEventListener || !searchInput?.removeEventListener || !searchInput?.focus) {
    throw new TypeError("ProjectFilterControlsController requires a checked search input.");
  }
  if (!languagePairFilter?.addEventListener || !languagePairFilter?.removeEventListener) {
    throw new TypeError("ProjectFilterControlsController requires a checked language-pair filter.");
  }
  if (!sortOrder?.addEventListener || !sortOrder?.removeEventListener) {
    throw new TypeError("ProjectFilterControlsController requires a checked sort-order select.");
  }
  if (!presentation?.render || !presentation.renderSortedProjects) {
    throw new TypeError("ProjectFilterControlsController requires a Projects-view presentation boundary.");
  }

  let mounted = false;
  const renderListener = presentation.render;
  const sortListener = presentation.renderSortedProjects;

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
    sortOrder.addEventListener("change", sortListener);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    searchInput.removeEventListener("input", renderListener);
    languagePairFilter.removeEventListener("change", renderListener);
    sortOrder.removeEventListener("change", sortListener);
    mounted = false;
    return true;
  }

  return Object.freeze({ clear, mount, unmount });
}
