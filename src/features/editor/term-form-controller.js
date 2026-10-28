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
 *     forbidden?: any,
 *     submit?: any,
 *     cancel?: any
 *   },
 *   session: { getProject: () => any },
 *   resources: {
 *     primaryName: () => string,
 *     markProjectsUsingDirty: (type: string, name: string, sourceLang: string, targetLang: string) => unknown
 *   },
 *   repository: { save: (term: object) => Promise<any>, update?: (term: any, values: any) => Promise<boolean> },
 *   presentation: {
 *     renderTermbaseSelect: () => unknown,
 *     refreshProjectTerms: (options: object) => Promise<unknown> | unknown,
 *     refreshSuggestions: () => Promise<unknown> | unknown,
 *     openEditor?: (term: any) => unknown,
 *     closeEditor?: () => unknown
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
  let busy = false;
  let editingTerm = null;
  let editingProjectId = "";

  function clearEditor() {
    editingTerm = null;
    editingProjectId = "";
    elements.termbase.disabled = false;
    elements.form.reset();
    presentation.renderTermbaseSelect();
  }

  function edit(term) {
    const project = session.getProject();
    if (!project || !term?.id || typeof repository.update !== "function" || busy) return false;
    editingTerm = { ...term };
    editingProjectId = project.id;
    presentation.renderTermbaseSelect();
    elements.source.value = term.sourceTerm || "";
    elements.target.value = term.targetTerm || "";
    elements.notes.value = term.notes || "";
    elements.termbase.value = term.termBaseName || resources.primaryName();
    elements.termbase.disabled = true;
    if (elements.forbidden) elements.forbidden.checked = Boolean(term.isForbidden || term.status === "forbidden");
    presentation.openEditor?.(term);
    elements.source.focus?.();
    return true;
  }

  function cancel() {
    if (busy) return false;
    clearEditor();
    presentation.closeEditor?.();
    return true;
  }

  async function refreshAfterSave() {
    try {
      await presentation.refreshProjectTerms({ rerender: true });
      await presentation.refreshSuggestions();
    } catch (refreshError) {
      logger.warn("Term refresh failed after save.", refreshError);
    }
  }

  async function saveEdit() {
    const original = editingTerm;
    if (session.getProject()?.id !== editingProjectId) {
      status.set("The active project changed. Reopen the term to edit it.", "dirty");
      return null;
    }
    const values = {
      sourceTerm: elements.source.value,
      targetTerm: elements.target.value,
      notes: elements.notes.value,
      isForbidden: elements.forbidden ? Boolean(elements.forbidden.checked) : Boolean(original.isForbidden)
    };
    testHooks.beforeSave();
    const updated = await repository.update(original, values);
    if (!updated) return null;
    clearEditor();
    presentation.closeEditor?.();
    await refreshAfterSave();
    status.set("Term saved", "saved");
    return { ...original, ...values };
  }

  async function save() {
    if (busy || !session.getProject() || !elements.source.value.trim() || !elements.target.value.trim()) return null;
    const termBaseName = elements.termbase.value || resources.primaryName();
    busy = true;
    if (elements.submit) elements.submit.disabled = true;
    try {
      if (editingTerm) return await saveEdit();
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
      clearEditor();
      await refreshAfterSave();
      status.set("Term saved", "saved");
      return term;
    } catch (error) {
      status.set(error.message || "Term save failed", "dirty");
      return null;
    } finally {
      busy = false;
      if (elements.submit) elements.submit.disabled = false;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await save();
  }

  function mount() {
    if (mounted) return;
    elements.form.addEventListener("submit", handleSubmit);
    elements.cancel?.addEventListener?.("click", cancel);
    mounted = true;
  }

  function unmount() {
    if (!mounted) return;
    elements.form.removeEventListener("submit", handleSubmit);
    elements.cancel?.removeEventListener?.("click", cancel);
    mounted = false;
  }

  return Object.freeze({ mount, save, edit, cancel, unmount });
}
