function requireElement(value, name) {
  if (!value?.addEventListener) throw new TypeError(`ProjectDialogController requires ${name}.`);
  return value;
}

function normalizeMode(mode) {
  return mode === "edit" ? "edit" : "create";
}

/**
 * Owns project-form UI preparation and event lifecycle. Persisted project,
 * resource, workspace, and AI data remain behind injected application services.
 *
 * @param {{
 *   dialogLifecycle: { register: (definition: object) => string, open: (id: string, options?: object) => Promise<boolean>, close: (id: string) => boolean },
 *   elements: Record<string, any>,
 *   openers?: Array<{ element: any, mode?: "create" | "edit", focusAi?: boolean }>,
 *   getProject?: () => any,
 *   refreshResources?: () => Promise<unknown>,
 *   suggestedCreatorName?: () => Promise<string>,
 *   cleanCreatorName?: (value: unknown) => string,
 *   setLanguageValue?: (input: any, value: string) => void,
 *   normalizeLanguageValue?: (input: any) => string,
 *   renderStorageStatus?: () => void,
 *   renderResourcePickers?: (project: any) => void,
 *   renderFrequentPairs?: () => void,
 *   save?: () => Promise<unknown>,
 *   chooseWorkspace?: () => Promise<unknown>,
 *   workspaceSupported?: () => boolean,
 *   translate?: (value: string) => string,
 *   scheduleFrame?: (callback: () => void) => unknown,
 *   onError?: (error: unknown, context: { phase: string }) => void
 * }} options
 */
export function createProjectDialogController(options) {
  const dialogLifecycle = options?.dialogLifecycle;
  if (typeof dialogLifecycle?.register !== "function" || typeof dialogLifecycle?.open !== "function") {
    throw new TypeError("ProjectDialogController requires the shared dialog lifecycle controller.");
  }

  const elements = options?.elements || {};
  const dialog = requireElement(elements.dialog, "the project dialog");
  const form = requireElement(elements.form, "the project form");
  const nameInput = requireElement(elements.nameInput, "the project name input");
  const sourceLanguageInput = requireElement(elements.sourceLanguageInput, "the source language input");
  const targetLanguageInput = requireElement(elements.targetLanguageInput, "the target language input");
  const openers = (options.openers || []).filter((item) => item?.element?.addEventListener);
  const getProject = typeof options.getProject === "function" ? options.getProject : () => null;
  const translate = typeof options.translate === "function" ? options.translate : (value) => value;
  const scheduleFrame = typeof options.scheduleFrame === "function" ? options.scheduleFrame : (callback) => callback();
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  const listeners = [];
  let mode = "create";
  let focusAiAfterOpen = false;
  let mounted = false;

  function listen(target, type, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    listeners.push({ target, type, listener });
  }

  function editingProject() {
    const project = getProject();
    return mode === "edit" && project ? project : null;
  }

  function updateLanguageControls(normalize = false) {
    if (normalize) {
      options.normalizeLanguageValue?.(sourceLanguageInput);
      options.normalizeLanguageValue?.(targetLanguageInput);
    }
    options.renderResourcePickers?.(editingProject());
    options.renderFrequentPairs?.();
  }

  async function prepare() {
    await options.refreshResources?.();
    const project = editingProject();
    const editing = Boolean(project);
    if (elements.title) elements.title.textContent = translate(editing ? "Project settings" : "New project");
    if (elements.saveButton) elements.saveButton.textContent = translate(editing ? "Save settings" : "Create");
    if (elements.creatorInput) {
      elements.creatorInput.value = editing
        ? options.cleanCreatorName?.(project.creatorName) || ""
        : (await options.suggestedCreatorName?.()) || "";
    }
    nameInput.value = editing ? project.name || "" : "";
    if (elements.domainInput) elements.domainInput.value = editing ? project.domain || "" : "";
    options.setLanguageValue?.(sourceLanguageInput, editing ? project.sourceLang : "en");
    options.setLanguageValue?.(targetLanguageInput, editing ? project.targetLang : "tr");
    if (elements.newTmNameInput) elements.newTmNameInput.value = "";
    if (elements.newTermBaseNameInput) elements.newTermBaseNameInput.value = "";
    if (elements.advancedOptions) elements.advancedOptions.open = editing;
    if (elements.saveToFolderInput) {
      elements.saveToFolderInput.checked = Boolean(editing && options.workspaceSupported?.());
    }
    options.renderStorageStatus?.();
    options.renderResourcePickers?.(project);
    options.renderFrequentPairs?.();
  }

  async function open(nextMode = "create", openOptions = {}) {
    mode = normalizeMode(nextMode);
    focusAiAfterOpen = Boolean(openOptions.focusAi && mode === "edit" && getProject());
    try {
      return await dialogLifecycle.open("project", {
        initialFocus: nameInput,
        returnTarget: openOptions.returnTarget || null
      });
    } catch (error) {
      onError(error, { phase: "open" });
      return false;
    }
  }

  function handleFrequentPair(event) {
    const button = event.target?.closest?.("button[data-source-lang][data-target-lang]");
    if (!button || (elements.frequentPairs?.contains && !elements.frequentPairs.contains(button))) return;
    options.setLanguageValue?.(sourceLanguageInput, button.dataset.sourceLang || "");
    options.setLanguageValue?.(targetLanguageInput, button.dataset.targetLang || "");
    updateLanguageControls(false);
  }

  function handleResourceSelection(event) {
    const input = event.target;
    if (!input?.dataset || !elements.tmResourceList) return;
    if (input.dataset.mainTm) {
      const checkbox = Array.from(elements.tmResourceList.querySelectorAll('[data-resource-type="tm"]')).find(
        (candidate) => candidate.dataset.resourceName === input.dataset.mainTm
      );
      if (checkbox) checkbox.checked = true;
      if (elements.newTmNameInput) elements.newTmNameInput.value = "";
      return;
    }
    if (input.dataset.resourceType !== "tm" || input.checked) return;
    const radio = Array.from(elements.tmResourceList.querySelectorAll("[data-main-tm]")).find(
      (candidate) => candidate.dataset.mainTm === input.dataset.resourceName
    );
    if (radio?.checked) radio.checked = false;
  }

  async function handleChooseWorkspace() {
    try {
      await options.chooseWorkspace?.();
      if (elements.saveToFolderInput) elements.saveToFolderInput.checked = true;
      options.renderStorageStatus?.();
    } catch (error) {
      if (error?.name !== "AbortError") onError(error, { phase: "workspace" });
    }
  }

  function mount() {
    if (mounted) return false;
    mounted = true;
    for (const opener of openers) {
      listen(opener.element, "click", () => {
        void open(opener.mode, { focusAi: opener.focusAi, returnTarget: opener.element });
      });
    }
    for (const input of [sourceLanguageInput, targetLanguageInput]) {
      listen(input, "input", () => updateLanguageControls(false));
      listen(input, "change", () => updateLanguageControls(true));
      listen(input, "blur", () => updateLanguageControls(true));
    }
    listen(elements.frequentPairs, "click", handleFrequentPair);
    listen(elements.tmResourceList, "change", handleResourceSelection);
    listen(form, "submit", (event) => {
      event.preventDefault();
      void Promise.resolve(options.save?.()).catch((error) => onError(error, { phase: "save" }));
    });
    listen(elements.chooseWorkspaceButton, "click", () => void handleChooseWorkspace());
    listen(elements.aiSettingsForm, "keydown", (event) => {
      if (event.key === "Enter" && event.target?.tagName === "INPUT") event.preventDefault();
    });
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    for (const { target, type, listener } of listeners.splice(0)) target.removeEventListener(type, listener);
    mounted = false;
    return true;
  }

  dialogLifecycle.register({
    id: "project",
    dialog,
    closer: elements.cancelButton || null,
    initialFocus: nameInput,
    beforeOpen: prepare,
    afterOpen: () => {
      if (!focusAiAfterOpen) return;
      if (elements.advancedOptions) elements.advancedOptions.open = true;
      if (elements.aiOptions) elements.aiOptions.open = true;
      scheduleFrame(() => elements.aiPresetSelect?.focus?.());
      focusAiAfterOpen = false;
    },
    onClose: () => {
      focusAiAfterOpen = false;
    }
  });

  return Object.freeze({
    mount,
    unmount,
    open,
    close: () => dialogLifecycle.close("project"),
    getMode: () => mode,
    isEditing: () => Boolean(editingProject())
  });
}
