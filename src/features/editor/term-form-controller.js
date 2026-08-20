/**
 * Owns term-form submit lifecycle and save orchestration. Project records,
 * repository persistence, resource dirtiness, presentation, status, logging,
 * and test-only failure policy remain behind injected boundaries.
 *
 * @param {{
 *   elements: {
 *     form: any,
 *     source: any,
 *     target: any,
 *     notes: any,
 *     termbase: any,
 *     forbidden?: any
 *   },
 *   session: { getProject: () => any },
 *   resources: {
 *     primaryName: () => string,
 *     markProjectsUsingDirty: (type: string, name: string, sourceLang: string, targetLang: string) => unknown
 *   },
 *   repository: { save: (term: object) => Promise<any> },
 *   presentation: {
 *     renderTermbaseSelect: () => unknown,
 *     refreshProjectTerms: (options: object) => Promise<unknown> | unknown,
 *     refreshSuggestions: () => Promise<unknown> | unknown
 *   },
 *   status: { set: (message: string, mode: string) => unknown },
 *   logger: { warn: (message: string, error: unknown) => unknown },
 *   testHooks: { beforeSave: () => unknown }
 * }} options
 */
export function createTermFormController(options) {
  const elements = options?.elements;
  const session = options?.session;
  const resources = options?.resources;
  const repository = options?.repository;
  const presentation = options?.presentation;
  const status = options?.status;
  const logger = options?.logger;
  const testHooks = options?.testHooks;
  if (
    typeof elements?.form?.addEventListener !== "function" ||
    typeof elements.form.removeEventListener !== "function" ||
    typeof elements.form.reset !== "function" ||
    !elements?.source ||
    !elements?.target ||
    !elements?.notes ||
    !elements?.termbase ||
    typeof session?.getProject !== "function"
  ) {
    throw new TypeError("TermFormController requires form elements and a project session boundary.");
  }
  if (
    typeof resources?.primaryName !== "function" ||
    typeof resources?.markProjectsUsingDirty !== "function" ||
    typeof repository?.save !== "function"
  ) {
    throw new TypeError("TermFormController requires termbase resource and repository boundaries.");
  }
  if (
    typeof presentation?.renderTermbaseSelect !== "function" ||
    typeof presentation?.refreshProjectTerms !== "function" ||
    typeof presentation?.refreshSuggestions !== "function" ||
    typeof status?.set !== "function" ||
    typeof logger?.warn !== "function" ||
    typeof testHooks?.beforeSave !== "function"
  ) {
    throw new TypeError("TermFormController requires presentation, status, logger, and test-hook boundaries.");
  }

  let mounted = false;

  async function save() {
    if (!session.getProject() || !elements.source.value.trim() || !elements.target.value.trim()) return null;
    const termBaseName = elements.termbase.value || resources.primaryName();
    try {
      testHooks.beforeSave();
      const term = await repository.save({
        sourceTerm: elements.source.value,
        targetTerm: elements.target.value,
        notes: elements.notes.value,
        sourceLang: session.getProject().sourceLang,
        targetLang: session.getProject().targetLang,
        termBaseName,
        isForbidden: elements.forbidden?.checked
      });
      resources.markProjectsUsingDirty(
        "termbase",
        termBaseName,
        session.getProject().sourceLang,
        session.getProject().targetLang
      );
      elements.form.reset();
      presentation.renderTermbaseSelect();
      try {
        await presentation.refreshProjectTerms({ rerender: true });
        await presentation.refreshSuggestions();
      } catch (refreshError) {
        logger.warn("Term refresh failed after save.", refreshError);
      }
      status.set("Term saved", "saved");
      return term;
    } catch (error) {
      status.set(error.message || "Term save failed", "dirty");
      return null;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await save();
  }

  function mount() {
    if (mounted) return;
    elements.form.addEventListener("submit", handleSubmit);
    mounted = true;
  }

  function unmount() {
    if (!mounted) return;
    elements.form.removeEventListener("submit", handleSubmit);
    mounted = false;
  }

  return Object.freeze({ mount, save, unmount });
}
