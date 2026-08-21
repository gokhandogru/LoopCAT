/**
 * Owns Projects language-pair filter mapping, deduplication, sorting, option
 * construction, replacement, and selection retention. Project session state,
 * language key/display policy, localization, DOM construction, and the select
 * root remain injected owners.
 *
 * @param {{
 *   select: any,
 *   projects: { list: () => any[] },
 *   language: {
 *     key: (project: any) => string,
 *     display: (sourceLanguage: string, targetLanguage: string) => unknown
 *   },
 *   localization: { source: (value: string) => unknown },
 *   dom: {
 *     createElement: (tagName: string) => any,
 *     createDocumentFragment: () => any
 *   }
 * }} options
 */
export function createLanguagePairFilterPresentationController(options) {
  const select = options?.select;
  const projects = options?.projects;
  const language = options?.language;
  const localization = options?.localization;
  const dom = options?.dom;

  if (!select || typeof select.replaceChildren !== "function") {
    throw new TypeError("LanguagePairFilterPresentationController requires a language-pair select.");
  }
  if (typeof projects?.list !== "function") {
    throw new TypeError("LanguagePairFilterPresentationController requires a project-list boundary.");
  }
  if (typeof language?.key !== "function" || typeof language.display !== "function") {
    throw new TypeError("LanguagePairFilterPresentationController requires language boundaries.");
  }
  if (typeof localization?.source !== "function") {
    throw new TypeError("LanguagePairFilterPresentationController requires a localization boundary.");
  }
  if (typeof dom?.createElement !== "function" || typeof dom.createDocumentFragment !== "function") {
    throw new TypeError("LanguagePairFilterPresentationController requires DOM creation boundaries.");
  }

  function render() {
    const current = select.value;
    const pairs = Array.from(
      new Set(
        projects
          .list()
          .map((project) => language.key(project))
          .filter((pair) => pair !== "::")
      )
    ).sort();
    const fragment = dom.createDocumentFragment();
    const allOption = dom.createElement("option");
    allOption.value = "";
    allOption.textContent = localization.source("All language pairs");
    fragment.append(allOption);
    pairs.forEach((pair) => {
      const [sourceLanguage, targetLanguage] = pair.split("::");
      const option = dom.createElement("option");
      option.value = pair;
      option.textContent = language.display(sourceLanguage, targetLanguage);
      fragment.append(option);
    });
    select.replaceChildren(fragment);
    select.value = pairs.includes(current) ? current : "";
  }

  return Object.freeze({ render });
}
