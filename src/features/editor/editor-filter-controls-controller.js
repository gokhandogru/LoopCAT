const REQUIRED_ELEMENT_KEYS = [
  "documentFilter",
  "searchInput",
  "searchScope",
  "regexInput",
  "caseInput",
  "statusFilter"
];

export function createEditorFilterControlsController({
  elements,
  navigation,
  store,
  filters,
  presentation,
  preset,
  selection
}) {
  for (const key of REQUIRED_ELEMENT_KEYS) {
    if (!elements?.[key]?.addEventListener || !elements[key].removeEventListener) {
      throw new TypeError(`EditorFilterControlsController requires a checked ${key} element.`);
    }
  }
  for (const key of ["reviewStateFilter", "aiStateFilter"]) {
    const element = elements?.[key];
    if (element && (!element.addEventListener || !element.removeEventListener)) {
      throw new TypeError(`EditorFilterControlsController requires a checked optional ${key} element.`);
    }
  }
  if (!navigation?.selectDocument || !store?.update || !filters?.firstVisible) {
    throw new TypeError("EditorFilterControlsController requires navigation, store, and filter boundaries.");
  }
  if (!presentation?.renderSegments || !presentation?.renderProgress) {
    throw new TypeError("EditorFilterControlsController requires editor presentation boundaries.");
  }
  if (!preset?.markCustom || !selection?.select) {
    throw new TypeError("EditorFilterControlsController requires preset and selection boundaries.");
  }

  let mounted = false;

  async function selectFirstVisible() {
    const first = filters.firstVisible();
    if (first !== -1) await selection.select(first);
  }

  async function applyFilter(patch, { markCustom = false } = {}) {
    if (markCustom) preset.markCustom();
    store.update(patch);
    presentation.renderSegments();
    await selectFirstVisible();
  }

  const listeners = Object.freeze({
    document: async () => {
      navigation.selectDocument({ documentId: elements.documentFilter.value });
      presentation.renderSegments();
      presentation.renderProgress();
      await selectFirstVisible();
    },
    search: () => applyFilter({ query: elements.searchInput.value.trim() }),
    scope: () => applyFilter({ scope: elements.searchScope.value }),
    regex: () => applyFilter({ regex: elements.regexInput.checked }),
    caseSensitive: () => applyFilter({ caseSensitive: elements.caseInput.checked }),
    status: () => applyFilter({ status: elements.statusFilter.value }, { markCustom: true }),
    reviewState: () => applyFilter({ reviewState: elements.reviewStateFilter.value }, { markCustom: true }),
    aiState: () => applyFilter({ aiState: elements.aiStateFilter.value }, { markCustom: true })
  });

  function mount() {
    if (mounted) return false;
    elements.documentFilter.addEventListener("change", listeners.document);
    elements.searchInput.addEventListener("input", listeners.search);
    elements.searchScope.addEventListener("change", listeners.scope);
    elements.regexInput.addEventListener("change", listeners.regex);
    elements.caseInput.addEventListener("change", listeners.caseSensitive);
    elements.statusFilter.addEventListener("change", listeners.status);
    elements.reviewStateFilter?.addEventListener("change", listeners.reviewState);
    elements.aiStateFilter?.addEventListener("change", listeners.aiState);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    elements.documentFilter.removeEventListener("change", listeners.document);
    elements.searchInput.removeEventListener("input", listeners.search);
    elements.searchScope.removeEventListener("change", listeners.scope);
    elements.regexInput.removeEventListener("change", listeners.regex);
    elements.caseInput.removeEventListener("change", listeners.caseSensitive);
    elements.statusFilter.removeEventListener("change", listeners.status);
    elements.reviewStateFilter?.removeEventListener("change", listeners.reviewState);
    elements.aiStateFilter?.removeEventListener("change", listeners.aiState);
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, unmount });
}
