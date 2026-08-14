/**
 * Owns current-project language-pair presentation/keys and target-language
 * spellcheck effects. General language-input policy and project records remain
 * behind injected boundaries.
 *
 * @param {{
 *   getProject: () => any,
 *   languageInput: {
 *     normalizeInput: (value: unknown) => string,
 *     pairDisplay: (sourceLang: string, targetLang: string) => string
 *   },
 *   getDesktop: () => any,
 *   warn: (...args: any[]) => void
 * }} options
 */
export function createProjectLanguageContextController(options) {
  const getProject = options?.getProject;
  const languageInput = options?.languageInput;
  const getDesktop = options?.getDesktop;
  const warn = options?.warn;
  if (
    typeof getProject !== "function" ||
    typeof languageInput?.normalizeInput !== "function" ||
    typeof languageInput?.pairDisplay !== "function" ||
    typeof getDesktop !== "function" ||
    typeof warn !== "function"
  ) {
    throw new TypeError(
      "ProjectLanguageContextController requires project, language-input, desktop, and warning boundaries."
    );
  }

  let desktopSpellcheckTargetLang = null;

  function display(project = getProject()) {
    return project ? languageInput.pairDisplay(project.sourceLang, project.targetLang) : "";
  }

  function key(project = getProject()) {
    return project
      ? `${languageInput.normalizeInput(project.sourceLang)}::${languageInput.normalizeInput(project.targetLang)}`
      : "";
  }

  function target(project = getProject()) {
    return languageInput.normalizeInput(project?.targetLang || "");
  }

  async function syncDesktopSpellcheck() {
    const targetLang = target();
    if (desktopSpellcheckTargetLang === targetLang) return null;
    desktopSpellcheckTargetLang = targetLang;
    const desktop = getDesktop();
    if (!desktop?.setSpellCheckerLanguages) return null;
    try {
      return await desktop.setSpellCheckerLanguages(targetLang ? [targetLang] : []);
    } catch (error) {
      warn("Desktop spellcheck language sync failed.", error);
      return null;
    }
  }

  function applyTargetLanguage(element) {
    if (!element) return;
    const targetLang = target();
    if (targetLang) element.lang = targetLang;
    else element.removeAttribute("lang");
  }

  return Object.freeze({ display, key, target, syncDesktopSpellcheck, applyTargetLanguage });
}
