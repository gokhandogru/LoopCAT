/**
 * Owns recent/default project language-pair shortcut selection and rendering.
 * General language normalization and project-dialog event delegation remain
 * behind injected boundaries.
 *
 * @param {{
 *   root?: any,
 *   getProjects: () => any[],
 *   getCurrentValues: () => { sourceLang?: string, targetLang?: string },
 *   normalizeLanguage: (value: unknown) => string,
 *   defaultPairs: Array<[string, string]>,
 *   languagePairDisplay: (sourceLang: string, targetLang: string) => string,
 *   escapeHtml: (value: unknown) => string,
 *   replaceSafeHtml: (element: any, html: string) => void
 * }} options
 */
export function createProjectLanguagePairShortcutsController(options) {
  const root = options?.root || null;
  const getProjects = options?.getProjects;
  const getCurrentValues = options?.getCurrentValues;
  const normalizeLanguage = options?.normalizeLanguage;
  const defaultPairs = options?.defaultPairs;
  const languagePairDisplay = options?.languagePairDisplay;
  const escapeHtml = options?.escapeHtml;
  const replaceSafeHtml = options?.replaceSafeHtml;
  if (
    typeof getProjects !== "function" ||
    typeof getCurrentValues !== "function" ||
    typeof normalizeLanguage !== "function" ||
    !Array.isArray(defaultPairs) ||
    typeof languagePairDisplay !== "function" ||
    typeof escapeHtml !== "function" ||
    typeof replaceSafeHtml !== "function"
  ) {
    throw new TypeError(
      "ProjectLanguagePairShortcutsController requires project, selection, language, default-pair, and safe-presentation boundaries."
    );
  }

  function recent(limit = 4) {
    return [...getProjects()]
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .map((project) => [normalizeLanguage(project.sourceLang), normalizeLanguage(project.targetLang)])
      .filter(([source, target]) => source && target)
      .filter(
        ([source, target], index, pairs) =>
          pairs.findIndex(
            ([candidateSource, candidateTarget]) => candidateSource === source && candidateTarget === target
          ) === index
      )
      .slice(0, limit);
  }

  function render() {
    if (!root) return;
    const pairs = [...recent(), ...defaultPairs]
      .filter(
        ([source, target], index, values) =>
          source &&
          target &&
          values.findIndex(
            ([candidateSource, candidateTarget]) => candidateSource === source && candidateTarget === target
          ) === index
      )
      .slice(0, 6);
    const current = getCurrentValues();
    replaceSafeHtml(
      root,
      pairs
        .map(([source, target]) => {
          const active = source === current.sourceLang && target === current.targetLang;
          return `<button type="button" class="${active ? "active" : ""}" data-source-lang="${escapeHtml(source)}" data-target-lang="${escapeHtml(target)}">${escapeHtml(languagePairDisplay(source, target))}</button>`;
        })
        .join("")
    );
  }

  return Object.freeze({ recent, render });
}
